"""
Utilities for extracting a document table of contents from Docling markdown.
"""
from __future__ import annotations

import html
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session


HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
NUMBERED_TITLE_RE = re.compile(r"^(?P<number>\d+(?:\.\d+)*)\.?\s+(?P<title>.+)$")
DOT_LEADER_RE = re.compile(r"(?:\s*\.\s*){2,}")
WHITESPACE_RE = re.compile(r"\s+")
IMAGE_HEADING_RE = re.compile(r"^<image>", re.IGNORECASE)
KNOWN_NON_NUMBERED = {"abstract", "contents", "discussion", "conclusion", "references"}


def slugify(text_value: str) -> str:
    normalized = text_value.lower()
    normalized = re.sub(r"[^a-z0-9]+", "-", normalized)
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    return normalized or "section"


def sanitize_heading(raw_heading: str) -> str:
    heading = html.unescape(raw_heading or "").strip()
    heading = heading.replace("\\n", " ").strip()
    heading = DOT_LEADER_RE.sub(" ", heading)
    heading = WHITESPACE_RE.sub(" ", heading)
    return heading.strip()


def split_numbered_title(heading: str) -> Tuple[Optional[str], str]:
    match = NUMBERED_TITLE_RE.match(heading)
    if not match:
        return None, heading
    return match.group("number"), match.group("title").strip()


def infer_level(number: Optional[str], heading: str) -> int:
    if number:
        return number.count(".") + 1
    if heading.lower() in KNOWN_NON_NUMBERED:
        return 1
    return 2


def _dedupe_preserve_order(values: List[str]) -> List[str]:
    seen = set()
    deduped: List[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            deduped.append(value)
    return deduped


def _parse_contents_rows(markdown_text: str) -> List[Dict[str, Any]]:
    lines = markdown_text.splitlines()
    in_contents = False
    table_lines: List[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped == "## Contents":
            in_contents = True
            continue
        if in_contents and stripped.startswith("## "):
            break
        if in_contents and "|" in line:
            table_lines.append(line)

    entries: List[Dict[str, Any]] = []
    for line in table_lines:
        stripped = line.strip()
        if not stripped or set(stripped.replace("|", "").replace("-", "").replace(":", "").strip()) == set():
            continue

        raw_cells = [sanitize_heading(cell) for cell in stripped.strip("|").split("|")]
        cells = [cell for cell in raw_cells if cell]
        if len(cells) < 2:
            continue

        page_cell = cells[-1]
        if not page_cell.isdigit():
            continue

        page = int(page_cell)
        title_parts = _dedupe_preserve_order(cells[:-1])
        title = sanitize_heading(" ".join(title_parts))
        if not title:
            continue

        number, clean_title = split_numbered_title(title)
        entries.append(
            {
                "number": number,
                "title": clean_title,
                "label": title,
                "level": infer_level(number, clean_title),
                "page_start": page,
            }
        )

    return entries


def _extract_heading_entries(markdown_text: str) -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    for line in markdown_text.splitlines():
        match = HEADING_RE.match(line.strip())
        if not match:
            continue

        raw_level = len(match.group(1))
        heading = sanitize_heading(match.group(2))
        if not heading:
            continue
        if IMAGE_HEADING_RE.match(heading):
            continue

        number, title = split_numbered_title(heading)
        if title.lower() == "contents":
            continue
        entries.append(
            {
                "number": number,
                "title": title,
                "label": heading,
                "level": infer_level(number, title) if number else max(1, raw_level),
                "page_start": None,
            }
        )

    return entries


def _find_heading_page(db: Session, document_id: str, label: str) -> Optional[int]:
    heading = sanitize_heading(label)
    if not heading:
        return None

    rows = db.execute(
        text(
            """
            SELECT metadata
            FROM chunks
            WHERE document_id = CAST(:document_id AS uuid)
              AND lower(content) LIKE :needle
            ORDER BY chunk_index
            LIMIT 5
            """
        ),
        {
            "document_id": document_id,
            "needle": f"%{heading.lower()}%",
        },
    ).fetchall()

    for row in rows:
        metadata = row.metadata if isinstance(row.metadata, dict) else {}
        pages = metadata.get("page_numbers") or []
        if pages:
            return min(int(page) for page in pages if str(page).isdigit())
        page_number = metadata.get("page_number")
        if page_number is not None and str(page_number).isdigit():
            return int(page_number)
    return None


def _get_document_page_count(db: Session, document_id: str) -> int:
    rows = db.execute(
        text(
            """
            SELECT metadata
            FROM chunks
            WHERE document_id = CAST(:document_id AS uuid)
            """
        ),
        {"document_id": document_id},
    ).fetchall()

    max_page = 1
    for row in rows:
        metadata = row.metadata if isinstance(row.metadata, dict) else {}
        pages = metadata.get("page_numbers") or []
        numeric_pages = [int(page) for page in pages if str(page).isdigit()]
        if numeric_pages:
            max_page = max(max_page, max(numeric_pages))
        page_number = metadata.get("page_number")
        if page_number is not None and str(page_number).isdigit():
            max_page = max(max_page, int(page_number))
    return max_page


def _merge_heading_pages(
    db: Session,
    document_id: str,
    toc_entries: List[Dict[str, Any]],
    heading_entries: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    existing_labels = {
        (entry.get("number"), entry.get("title", "").lower()): entry
        for entry in toc_entries
    }

    for heading_entry in heading_entries:
        key = (heading_entry.get("number"), heading_entry.get("title", "").lower())
        if key in existing_labels:
            entry = existing_labels[key]
            if entry.get("page_start") is None:
                entry["page_start"] = _find_heading_page(db, document_id, heading_entry["label"])
            continue

        heading_entry["page_start"] = _find_heading_page(db, document_id, heading_entry["label"])
        toc_entries.append(heading_entry)

    return toc_entries


def _assign_page_ranges(entries: List[Dict[str, Any]], total_pages: int) -> List[Dict[str, Any]]:
    if not entries:
        return []

    for index, entry in enumerate(entries):
        current_page = entry.get("page_start")
        if current_page is None:
            current_page = 1 if index == 0 else entries[index - 1].get("page_start") or 1
            entry["page_start"] = current_page

        next_page = total_pages
        for next_index in range(index + 1, len(entries)):
            candidate_page = entries[next_index].get("page_start")
            if candidate_page is None:
                continue
            if candidate_page > current_page:
                next_page = max(current_page, candidate_page - 1)
                break

        entry["page_end"] = max(current_page, next_page)
        entry["pages"] = list(range(current_page, entry["page_end"] + 1))

    return entries


def _build_tree(entries: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    tree: List[Dict[str, Any]] = []
    stack: List[Dict[str, Any]] = []
    flat: List[Dict[str, Any]] = []

    for entry in entries:
        node = {
            "id": "",
            "number": entry.get("number"),
            "title": entry["title"],
            "label": entry["label"],
            "level": entry["level"],
            "page_start": entry["page_start"],
            "page_end": entry["page_end"],
            "pages": entry["pages"],
            "path": [],
            "children": [],
        }

        while stack and stack[-1]["level"] >= node["level"]:
            stack.pop()

        if stack:
            stack[-1]["children"].append(node)
            node["path"] = [*stack[-1]["path"], node["label"]]
        else:
            tree.append(node)
            node["path"] = [node["label"]]

        node["id"] = slugify("--".join(node["path"]))
        stack.append(node)
        flat.append(node)

    return tree, flat


def _build_page_fallback_entries(total_pages: int) -> List[Dict[str, Any]]:
    if total_pages <= 0:
        total_pages = 1

    return [
        {
            "number": None,
            "title": f"Page {page_number}",
            "label": f"Page {page_number}",
            "level": 1,
            "page_start": page_number,
            "page_end": page_number,
            "pages": [page_number],
        }
        for page_number in range(1, total_pages + 1)
    ]


def build_table_of_contents(
    markdown_text: str,
    document_id: str,
    db: Session,
) -> Dict[str, Any]:
    markdown_text = markdown_text or ""
    toc_entries = _parse_contents_rows(markdown_text)
    native_toc_found = bool(toc_entries)
    heading_entries = _extract_heading_entries(markdown_text)
    toc_entries = _merge_heading_pages(db, document_id, toc_entries, heading_entries)
    total_pages = _get_document_page_count(db, document_id)
    source = "contents" if native_toc_found else "headings"

    if not toc_entries:
        toc_entries = _build_page_fallback_entries(total_pages)
        source = "pages"

    toc_entries.sort(
        key=lambda item: (
            item.get("page_start") if item.get("page_start") is not None else 10_000,
            item.get("number") or item["label"],
        )
    )

    toc_entries = _assign_page_ranges(toc_entries, total_pages)
    tree, flat = _build_tree(toc_entries)

    return {
        "items": tree,
        "count": len(flat),
        "total_pages": total_pages,
        "source": source,
        "fallback": source != "contents",
    }


def build_table_of_contents_from_path(
    markdown_path: Optional[str],
    document_id: str,
    db: Session,
) -> Dict[str, Any]:
    if not markdown_path:
        return build_table_of_contents(markdown_text="", document_id=document_id, db=db)

    path = Path(markdown_path)
    if not path.exists():
        return build_table_of_contents(markdown_text="", document_id=document_id, db=db)

    markdown_text = path.read_text(encoding="utf-8")
    return build_table_of_contents(markdown_text=markdown_text, document_id=document_id, db=db)

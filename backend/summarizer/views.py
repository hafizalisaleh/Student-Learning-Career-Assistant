"""
Summary API endpoints
"""
from pathlib import Path
import re
from typing import Any, Dict, List, Sequence, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from config.database import get_db
from summarizer.models import Summary
from summarizer.schemas import SummaryCreate, SummaryResponse
from documents.models import Document
from documents.table_of_contents import (
    build_table_of_contents_from_path,
    flatten_table_of_contents_items,
    infer_level,
    sanitize_heading,
    split_numbered_title,
)
from users.auth import get_current_user
from users.models import User
from summarizer.summarizer import summarizer
from core.generation_thresholds import MIN_GENERATION_CONTENT_CHARS
from core.rag_retriever import rag_retriever
from core.vector_store import vector_store
from utils.logger import logger

router = APIRouter(prefix="/api/summaries", tags=["summaries"])

SCOPE_TEXT_RE = re.compile(r"[^a-z0-9]+")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
IMAGE_LINE_RE = re.compile(r"^!\[.*\]\(.+\)$")
TABLE_LINE_RE = re.compile(r"^\|.*\|$")
SUMMARY_SECTION_LIMIT = 6
MIN_SECTION_CONTENT_CHARS = 120
IGNORED_TOC_LABELS = {"contents", "references", "appendix"}
SUMMARY_BUCKET_ORDER: Tuple[Tuple[str, int], ...] = (
    ("summary", 1),
    ("methods", 2),
    ("data_training", 1),
    ("evaluation", 1),
    ("closing", 1),
    ("framing", 1),
    ("background", 1),
    ("other", 1),
)
SUMMARY_NOISY_SCOPE_TOKENS = {
    "ocr 1 0 data",
    "ocr 2 0 data",
    "general vision data",
    "text only data",
    "multilingual recognition",
    "general vision understanding",
    "qualitative study",
    "result",
    "results",
}


def _normalize_scope_text(value: str) -> str:
    cleaned = sanitize_heading(value or "").lower()
    cleaned = SCOPE_TEXT_RE.sub(" ", cleaned)
    return " ".join(cleaned.split())


def _dedupe_scope_titles(values: Sequence[str]) -> List[str]:
    seen = set()
    deduped: List[str] = []
    for value in values:
        normalized = _normalize_scope_text(value)
        if normalized and normalized not in seen:
            seen.add(normalized)
            deduped.append(value.strip())
    return deduped


def _build_summary_focus_context(summary_data: SummaryCreate) -> str | None:
    blocks: List[str] = []

    if summary_data.selected_topics:
        blocks.append(
            "FOCUS TOPICS:\n- "
            + "\n- ".join(topic.strip() for topic in summary_data.selected_topics if topic.strip())
        )

    if summary_data.selected_subtopics:
        blocks.append(
            "FOCUS SUBTOPICS:\n- "
            + "\n- ".join(subtopic.strip() for subtopic in summary_data.selected_subtopics if subtopic.strip())
        )

    if summary_data.selected_sections:
        section_lines: List[str] = []
        for section in summary_data.selected_sections:
            title = (section.title or "").strip()
            if not title:
                continue
            pages = [int(page) for page in section.pages if isinstance(page, int) and page > 0]
            if pages:
                section_lines.append(f"- {title} (pages {', '.join(str(page) for page in pages)})")
            else:
                section_lines.append(f"- {title}")
        if section_lines:
            blocks.append("FOCUS SECTIONS:\n" + "\n".join(section_lines))

    if not blocks:
        return None

    return (
        "If focus topics or sections are selected, keep the summary inside that scope. "
        "Only mention broader document context when it is required to understand the selected scope.\n\n"
        + "\n\n".join(blocks)
    )


def _get_document_toc(document: Document, db: Session) -> Dict[str, Any]:
    metadata = document.doc_metadata or {}
    toc_items = metadata.get("table_of_contents")
    if isinstance(toc_items, list):
        return {
            "items": toc_items,
            "count": metadata.get("table_of_contents_count", len(flatten_table_of_contents_items(toc_items))),
            "total_pages": metadata.get("table_of_contents_total_pages", 0),
            "source": metadata.get("table_of_contents_source", "contents"),
            "fallback": metadata.get("table_of_contents_source", "contents") != "contents",
        }

    toc = build_table_of_contents_from_path(
        document.file_path,
        document_id=str(document.id),
        db=db,
    )
    document.doc_metadata = {
        **metadata,
        "table_of_contents": toc.get("items", []),
        "table_of_contents_count": toc.get("count", 0),
        "table_of_contents_total_pages": toc.get("total_pages", 0),
        "table_of_contents_source": toc.get("source", "pages"),
    }
    db.flush()
    return toc


def _pick_evenly_spaced(items: Sequence[Any], limit: int) -> List[Any]:
    items = list(items)
    if limit <= 0 or not items:
        return []
    if len(items) <= limit:
        return items

    positions: List[int] = []
    for index in range(limit):
        position = round(index * (len(items) - 1) / (limit - 1))
        if position not in positions:
            positions.append(position)
    return [items[position] for position in positions]


def _build_page_window_sections(total_pages: int, limit: int = SUMMARY_SECTION_LIMIT) -> List[Dict[str, Any]]:
    if total_pages <= 0:
        return []

    anchors = _pick_evenly_spaced(list(range(1, total_pages + 1)), min(limit, total_pages))
    sections: List[Dict[str, Any]] = []
    seen_ranges = set()
    for anchor in anchors:
        start = max(1, anchor - 1)
        end = min(total_pages, anchor + 1)
        key = (start, end)
        if key in seen_ranges:
            continue
        seen_ranges.add(key)
        label = f"Pages {start}-{end}" if start != end else f"Page {start}"
        sections.append(
            {
                "id": f"pages-{start}-{end}",
                "title": label,
                "label": label,
                "level": 1,
                "page_start": start,
                "page_end": end,
                "pages": list(range(start, end + 1)),
                "path": [label],
                "children": [],
            }
        )
    return sections


def _match_toc_items_by_label(
    toc_items: Sequence[Dict[str, Any]],
    labels: Sequence[str],
) -> Tuple[List[Dict[str, Any]], List[str]]:
    matched: List[Dict[str, Any]] = []
    unmatched: List[str] = []
    used_keys = set()

    for label in labels:
        normalized_label = _normalize_scope_text(label)
        found_match = None
        for item in toc_items:
            item_label = item.get("label") or item.get("title") or ""
            _, stripped_title = split_numbered_title(sanitize_heading(item_label))
            candidate_keys = {
                _normalize_scope_text(item_label),
                _normalize_scope_text(item.get("title") or ""),
                _normalize_scope_text(stripped_title),
            }
            if normalized_label in candidate_keys:
                item_key = (
                    item.get("id"),
                    item.get("page_start"),
                    item.get("page_end"),
                    _normalize_scope_text(item_label),
                )
                if item_key in used_keys:
                    continue
                used_keys.add(item_key)
                found_match = item
                break
        if found_match:
            matched.append(found_match)
        else:
            unmatched.append(label)

    return matched, unmatched


def _extract_pages_from_chunks(chunks: Sequence[Dict[str, Any]]) -> List[int]:
    pages = set()
    for chunk in chunks:
        metadata = chunk.get("metadata") or {}
        raw_pages = metadata.get("page_numbers") or metadata.get("pages") or []
        if not raw_pages and metadata.get("page_number") is not None:
            raw_pages = [metadata.get("page_number")]
        for raw_page in raw_pages:
            try:
                page = int(raw_page)
            except (TypeError, ValueError):
                continue
            if page > 0:
                pages.add(page)
    return sorted(pages)


def _load_document_markdown(document: Document) -> str:
    metadata = document.doc_metadata or {}
    markdown_path = metadata.get("docling_markdown_path")
    if isinstance(markdown_path, str) and markdown_path.strip():
        try:
            return Path(markdown_path).read_text(encoding="utf-8")
        except OSError as exc:
            logger.warning("Failed to read docling markdown from %s: %s", markdown_path, exc)
        except UnicodeDecodeError:
            try:
                return Path(markdown_path).read_text(encoding="utf-8", errors="ignore")
            except OSError as exc:
                logger.warning("Failed to read docling markdown from %s: %s", markdown_path, exc)
    return document.extracted_text or ""


def _heading_level(match: re.Match[str]) -> int:
    heading = sanitize_heading(match.group(2))
    number, title = split_numbered_title(heading)
    if number:
        return infer_level(number, title)
    return max(1, len(match.group(1)))


def _looks_noisy_summary_line(stripped: str) -> bool:
    if not stripped:
        return False
    if IMAGE_LINE_RE.match(stripped) or TABLE_LINE_RE.match(stripped):
        return True
    if stripped.lower().startswith("<image"):
        return True

    alpha_count = sum(char.isalpha() for char in stripped)
    digit_count = sum(char.isdigit() for char in stripped)
    symbol_count = sum(not char.isalnum() and not char.isspace() for char in stripped)

    if alpha_count == 0 and digit_count > 0:
        return True
    if alpha_count < 5 and symbol_count > alpha_count + 2:
        return True
    if len(stripped) > 20 and alpha_count / max(len(stripped), 1) < 0.18 and digit_count >= alpha_count:
        return True
    return False


def _clean_summary_source_text(raw_text: str) -> str:
    if not raw_text:
        return ""

    cleaned_lines: List[str] = []
    seen_blocks = set()

    for raw_line in raw_text.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            if cleaned_lines and cleaned_lines[-1] != "":
                cleaned_lines.append("")
            continue

        if _looks_noisy_summary_line(stripped):
            continue

        normalized = re.sub(r"\s+", " ", stripped)
        if normalized in seen_blocks and not HEADING_RE.match(stripped):
            continue

        if HEADING_RE.match(stripped):
            cleaned_lines.append(stripped)
            continue

        seen_blocks.add(normalized)
        cleaned_lines.append(stripped)

    cleaned_text = "\n".join(cleaned_lines)
    cleaned_text = re.sub(r"\n{3,}", "\n\n", cleaned_text)
    return cleaned_text.strip()


def _extract_section_content_from_markdown(
    extracted_text: str,
    section_label: str,
    *,
    stop_at_first_child: bool = False,
) -> str:
    if not extracted_text or not section_label:
        return ""

    target_heading = sanitize_heading(section_label)
    _, target_title = split_numbered_title(target_heading)
    targets = {
        _normalize_scope_text(target_heading),
        _normalize_scope_text(target_title),
    }

    lines = extracted_text.splitlines()
    start_index = None
    start_level = None

    for index, line in enumerate(lines):
        match = HEADING_RE.match(line.strip())
        if not match:
            continue
        heading = sanitize_heading(match.group(2))
        _, heading_title = split_numbered_title(heading)
        heading_keys = {
            _normalize_scope_text(heading),
            _normalize_scope_text(heading_title),
        }
        if targets & heading_keys:
            start_index = index
            start_level = _heading_level(match)
            break

    if start_index is None or start_level is None:
        return ""

    collected: List[str] = []
    for index in range(start_index, len(lines)):
        line = lines[index]
        match = HEADING_RE.match(line.strip())
        if index > start_index and match:
            current_level = _heading_level(match)
            if current_level <= start_level:
                break
            if stop_at_first_child and current_level > start_level:
                break
        collected.append(line)

    return _clean_summary_source_text("\n".join(collected).strip())


def _dedupe_summary_toc_items(items: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    deduped: List[Dict[str, Any]] = []
    for item in items:
        label = item.get("label") or item.get("title") or ""
        normalized = _normalize_scope_text(label)
        if not normalized or normalized in IGNORED_TOC_LABELS:
            continue
        key = (normalized, item.get("page_start"), item.get("page_end"))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def _summary_bucket(title: str) -> str:
    normalized = _normalize_scope_text(title)

    if any(token in normalized for token in ("abstract", "executive summary")):
        return "summary"
    if any(token in normalized for token in ("introduction", "overview", "motivation")):
        return "framing"
    if any(token in normalized for token in ("related work", "related works", "background")):
        return "background"
    if any(token in normalized for token in ("conclusion", "limitations", "future work", "closing remarks")):
        return "closing"
    if any(token in normalized for token in ("evaluation", "performance", "benchmark", "compression study", "analysis", "experiment")):
        return "evaluation"
    if any(token in normalized for token in ("data engine", "dataset", "data", "training", "pipeline", "pretrain", "fine tune", "finetune")):
        return "data_training"
    if any(token in normalized for token in ("deepencoder", "encoder", "decoder", "architecture", "methodology", "approach", "framework", "system", "model")):
        return "methods"
    return "other"


def _summary_item_score(item: Dict[str, Any]) -> int:
    title = item.get("label") or item.get("title") or ""
    normalized = _normalize_scope_text(title)
    level = int(item.get("level") or 99)
    bucket = _summary_bucket(title)

    base_scores = {
        "summary": 140,
        "framing": 100,
        "methods": 96,
        "data_training": 88,
        "evaluation": 92,
        "closing": 90,
        "background": 50,
        "other": 40,
    }
    score = base_scores.get(bucket, 40)

    if level == 1:
        score += 12
    elif level == 2:
        score += 6
    elif level == 3:
        score += 1
    else:
        score -= 4

    if "deepencoder" in normalized or "decoder" in normalized:
        score += 8
    if "performance" in normalized or "compression study" in normalized or "benchmark" in normalized:
        score += 6
    if "training pipeline" in normalized or "training pipelines" in normalized:
        score += 4

    if normalized == "methodology":
        score -= 14
    if normalized == "evaluation":
        score -= 10
    if normalized == "discussion":
        score -= 8
    if normalized in SUMMARY_NOISY_SCOPE_TOKENS:
        score -= 18
    if any(token in normalized for token in SUMMARY_NOISY_SCOPE_TOKENS):
        score -= 10

    return score


def _choose_default_summary_sections(items: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped_items = _dedupe_summary_toc_items(items)
    if not deduped_items:
        return []

    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for item in deduped_items:
        bucket = _summary_bucket(item.get("label") or item.get("title") or "")
        grouped.setdefault(bucket, []).append(item)

    for bucket_items in grouped.values():
        bucket_items.sort(
            key=lambda item: (
                -_summary_item_score(item),
                int(item.get("level") or 99),
                item.get("page_start") or 9999,
                _normalize_scope_text(item.get("label") or item.get("title") or ""),
            )
        )

    selected: List[Dict[str, Any]] = []
    selected_keys = set()

    for bucket, limit in SUMMARY_BUCKET_ORDER:
        if bucket == "framing" and any(_summary_bucket(item.get("label") or item.get("title") or "") == "summary" for item in selected):
            continue

        count = 0
        for item in grouped.get(bucket, []):
            if count >= limit or len(selected) >= SUMMARY_SECTION_LIMIT:
                break
            key = (
                _normalize_scope_text(item.get("label") or item.get("title") or ""),
                item.get("page_start"),
                item.get("page_end"),
            )
            if key in selected_keys:
                continue
            selected.append(item)
            selected_keys.add(key)
            count += 1

        if len(selected) >= SUMMARY_SECTION_LIMIT:
            break

    if not selected:
        return _pick_evenly_spaced(deduped_items, SUMMARY_SECTION_LIMIT)

    selected.sort(
        key=lambda item: (
            item.get("page_start") or 9999,
            int(item.get("level") or 99),
            _normalize_scope_text(item.get("label") or item.get("title") or ""),
        )
    )
    return selected[:SUMMARY_SECTION_LIMIT]


def _should_capture_section_lead(section_item: Dict[str, Any]) -> bool:
    if not section_item.get("children"):
        return False

    bucket = _summary_bucket(section_item.get("label") or section_item.get("title") or "")
    return bucket in {"summary", "framing", "data_training", "evaluation", "background"}


def _select_summary_sections(
    document: Document,
    db: Session,
    summary_data: SummaryCreate,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    toc = _get_document_toc(document, db)
    flat_items = flatten_table_of_contents_items(toc.get("items", []))
    filtered_items = [
        item
        for item in flat_items
        if _normalize_scope_text(item.get("label") or item.get("title") or "") not in IGNORED_TOC_LABELS
    ]

    explicit_section_titles = _dedupe_scope_titles(
        [section.title for section in summary_data.selected_sections if (section.title or "").strip()]
    )
    explicit_subtopics = _dedupe_scope_titles(
        [subtopic for subtopic in summary_data.selected_subtopics if subtopic.strip()]
    )

    explicit_titles = explicit_section_titles or explicit_subtopics
    if explicit_titles:
        matched_items, unmatched_titles = _match_toc_items_by_label(filtered_items, explicit_titles)
        synthetic_items = [
            {
                "id": f"synthetic-{_normalize_scope_text(title)}",
                "title": title,
                "label": title,
                "level": 1,
                "page_start": None,
                "page_end": None,
                "pages": [],
                "path": [title],
                "children": [],
            }
            for title in unmatched_titles
        ]
        return toc, [*matched_items, *synthetic_items]

    if summary_data.selected_topics:
        return toc, []

    if toc.get("source") == "pages":
        return toc, _build_page_window_sections(int(toc.get("total_pages") or 0))

    return toc, _choose_default_summary_sections(filtered_items)


def _build_section_packet(
    document: Document,
    current_user: User,
    section_item: Dict[str, Any],
    markdown_text: str,
) -> Dict[str, Any] | None:
    title = (section_item.get("label") or section_item.get("title") or "").strip()
    raw_pages = section_item.get("pages") or []
    pages = []
    for raw_page in raw_pages:
        try:
            page = int(raw_page)
        except (TypeError, ValueError):
            continue
        if page > 0:
            pages.append(page)

    content = ""
    results: List[Dict[str, Any]] = []
    use_section_lead = _should_capture_section_lead(section_item)

    if markdown_text and title:
        content = _extract_section_content_from_markdown(
            markdown_text,
            title,
            stop_at_first_child=use_section_lead,
        )

    if len(content) < MIN_SECTION_CONTENT_CHARS and markdown_text and title and use_section_lead:
        content = _extract_section_content_from_markdown(
            markdown_text,
            title,
            stop_at_first_child=False,
        )

    query_text = f"Section overview main ideas definitions methods findings examples {title}".strip()

    if len(content) < MIN_SECTION_CONTENT_CHARS:
        vector_result = vector_store.query(
            query_text=query_text,
            n_results=5,
            document_id=str(document.id),
            user_id=str(current_user.id),
            section_title=title or None,
            section_pages=pages or None,
        )

        if vector_result.get("success") and vector_result.get("results"):
            results = vector_result.get("results", [])
            content = _clean_summary_source_text(
                "\n\n".join(
                    chunk.get("text", "").strip()
                    for chunk in results
                    if chunk.get("text")
                ).strip()
            )
            if not pages:
                pages = _extract_pages_from_chunks(results)

    if len(content) < MIN_SECTION_CONTENT_CHARS and isinstance(document.extracted_text, str) and title:
        fallback_content = _extract_section_content_from_markdown(document.extracted_text, title)
        if len(fallback_content) >= MIN_SECTION_CONTENT_CHARS:
            content = fallback_content

    if len(content) < MIN_SECTION_CONTENT_CHARS:
        return None

    return {
        "title": title or "Section",
        "pages": pages,
        "content": content,
        "chunks": results,
    }


def _build_topic_packet(
    document: Document,
    current_user: User,
    topic: str,
) -> Dict[str, Any] | None:
    title = topic.strip()
    if not title:
        return None

    vector_result = vector_store.query(
        query_text=f"Summarize the topic {title}. Include the main ideas, definitions, methods, findings, and examples.",
        n_results=6,
        document_id=str(document.id),
        user_id=str(current_user.id),
    )

    if not vector_result.get("success") or not vector_result.get("results"):
        return None

    results = vector_result.get("results", [])
    content = _clean_summary_source_text(
        "\n\n".join(
            chunk.get("text", "").strip()
            for chunk in results
            if chunk.get("text")
        ).strip()
    )

    if len(content) < MIN_SECTION_CONTENT_CHARS:
        return None

    return {
        "title": title,
        "pages": _extract_pages_from_chunks(results),
        "content": content,
        "chunks": results,
    }


def _build_summary_context(
    document: Document,
    current_user: User,
    db: Session,
    summary_data: SummaryCreate,
) -> Dict[str, Any]:
    toc, selected_sections = _select_summary_sections(document, db, summary_data)
    focus_context = _build_summary_focus_context(summary_data)
    section_packets: List[Dict[str, Any]] = []
    markdown_text = _load_document_markdown(document)

    for section_item in selected_sections:
        packet = _build_section_packet(document, current_user, section_item, markdown_text)
        if packet:
            section_packets.append(packet)

    if not section_packets and summary_data.selected_topics:
        for topic in _dedupe_scope_titles(summary_data.selected_topics)[:4]:
            packet = _build_topic_packet(document, current_user, topic)
            if packet:
                section_packets.append(packet)

    if section_packets:
        content = "\n\n".join(packet["content"] for packet in section_packets if packet.get("content")).strip()
        return {
            "content": content,
            "source": "hierarchical_sections",
            "focus_context": focus_context,
            "section_packets": section_packets,
            "toc_source": toc.get("source"),
        }

    retrieval_result = rag_retriever.get_content_for_generation(
        document=document,
        task_type="summary",
        chunk_count=10,
    )
    return {
        "content": _clean_summary_source_text(retrieval_result.get("content") or ""),
        "source": retrieval_result.get("source"),
        "focus_context": focus_context,
        "section_packets": [],
        "error": retrieval_result.get("error"),
        "chunks_used": retrieval_result.get("chunks_used", 0),
        "toc_source": toc.get("source"),
    }

@router.post("/generate", response_model=SummaryResponse, status_code=status.HTTP_201_CREATED)
async def generate_summary(
    summary_data: SummaryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate summary from document using RAG when available.
    Uses vector similarity search to retrieve relevant chunks,
    falls back to full text extraction if embeddings not available.

    Args:
        summary_data: Summary creation data
        current_user: Current authenticated user
        db: Database session

    Returns:
        Generated summary
    """
    try:
        # Check if document exists and belongs to user
        document = db.query(Document).filter(
            Document.id == summary_data.document_id,
            Document.user_id == current_user.id
        ).first()

        if not document:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )

        logger.info(f"Generating summary for document {document.id} by user {current_user.email}")
        logger.info(f"Summary type: {summary_data.summary_length.value}")

        summary_context = _build_summary_context(
            document=document,
            current_user=current_user,
            db=db,
            summary_data=summary_data,
        )

        content = summary_context.get("content")
        content_source = summary_context.get("source")

        logger.info(
            "Summary context retrieved via %s (section_packets=%s, toc_source=%s)",
            content_source,
            len(summary_context.get("section_packets", [])),
            summary_context.get("toc_source"),
        )

        if not content or content_source == "error":
            error_msg = summary_context.get("error", "Could not extract content from document")
            logger.error(f"Content retrieval failed: {error_msg}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error_msg
            )
        
        logger.info(f"Content extracted successfully, length: {len(content)} characters")
        
        # Check minimum content length
        if len(content) < MIN_GENERATION_CONTENT_CHARS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Document content is too short for summarization "
                    f"(minimum {MIN_GENERATION_CONTENT_CHARS} characters required)"
                )
            )
        
        # Generate summary using the active provider-aware LLM client
        try:
            logger.info(f"Starting AI summary generation...")
            summary_text = summarizer.generate_summary(
                content=content,
                length=summary_data.summary_length.value,
                document_title=document.title,
                focus_context=summary_context.get("focus_context"),
                section_packets=summary_context.get("section_packets") or None,
            )
            logger.info(f"Summary generated successfully, length: {len(summary_text)} characters")
        except Exception as gen_error:
            logger.error(f"Summary generation error: {gen_error}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate summary: {str(gen_error)}"
            )
        
        # Save summary to database
        new_summary = Summary(
            user_id=current_user.id,
            document_id=summary_data.document_id,
            summary_text=summary_text,
            summary_length=summary_data.summary_length
        )
        
        db.add(new_summary)
        db.commit()
        db.refresh(new_summary)
        
        logger.info(f"Summary saved to database with ID: {new_summary.id}")
        
        return SummaryResponse.from_orm(new_summary)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in summary generation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}"
        )

@router.get("/", response_model=list[SummaryResponse])
def get_all_summaries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all summaries for the current user
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        List of all user's summaries
    """
    summaries = db.query(Summary).filter(
        Summary.user_id == current_user.id
    ).order_by(Summary.generated_at.desc()).all()
    
    return [SummaryResponse.from_orm(summary) for summary in summaries]

@router.get("/document/{document_id}", response_model=list[SummaryResponse])
def get_summaries_by_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all summaries for a document
    
    Args:
        document_id: Document ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        List of summaries
    """
    summaries = db.query(Summary).filter(
        Summary.document_id == document_id,
        Summary.user_id == current_user.id
    ).all()
    
    return [SummaryResponse.from_orm(summary) for summary in summaries]

@router.delete("/{summary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_summary(
    summary_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a summary
    
    Args:
        summary_id: Summary ID (UUID string)
        current_user: Current authenticated user
        db: Database session
    """
    try:
        # Validate UUID format
        import uuid
        try:
            uuid_obj = uuid.UUID(summary_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid summary ID format"
            )
        
        summary = db.query(Summary).filter(
            Summary.id == uuid_obj,
            Summary.user_id == current_user.id
        ).first()
        
        if not summary:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Summary not found"
            )
        
        db.delete(summary)
        db.commit()
        logger.info(f"Summary {summary_id} deleted successfully by user {current_user.email}")
        return {"message": "Summary deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting summary {summary_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete summary: {str(e)}"
        )

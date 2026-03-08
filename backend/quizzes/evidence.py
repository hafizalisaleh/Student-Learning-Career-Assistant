"""
Helpers for storing and recovering quiz evidence without a schema migration.
"""

from __future__ import annotations

import json
import re
from decimal import Decimal
from typing import Any, Dict, Optional, Tuple

EVIDENCE_PREFIX = "<!-- slca-quiz-evidence:"
EVIDENCE_SUFFIX = "-->"


def _coerce_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _coerce_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        if isinstance(value, Decimal):
            return float(value)
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_excerpt(text: str, max_chars: int = 320) -> str:
    cleaned = " ".join((text or "").split())
    if len(cleaned) <= max_chars:
        return cleaned
    return f"{cleaned[: max_chars - 1].rstrip()}..."


def build_evidence_payload(chunk: Dict[str, Any], source_index: int) -> Dict[str, Any]:
    metadata = dict(chunk.get("metadata") or {})
    page_numbers = metadata.get("page_numbers") or metadata.get("pages") or []
    normalized_pages = [_coerce_int(page) for page in page_numbers]
    normalized_pages = [page for page in normalized_pages if page is not None]

    page_number = _coerce_int(metadata.get("page_number"))
    if page_number is not None and page_number not in normalized_pages:
        normalized_pages.append(page_number)

    similarity = _coerce_float(chunk.get("similarity"))

    return {
        "source_index": int(source_index),
        "document_id": metadata.get("document_id"),
        "document_title": metadata.get("document_title") or "Source",
        "document_source": metadata.get("document_source"),
        "page": normalized_pages[0] if normalized_pages else None,
        "pages": normalized_pages,
        "excerpt": _normalize_excerpt(chunk.get("text", "")),
        "modality": metadata.get("source_modality") or metadata.get("chunk_method") or "text",
        "chunk_index": _coerce_int(metadata.get("chunk_index")),
        "similarity": similarity,
    }


def encode_explanation(explanation: str, evidence: Optional[Dict[str, Any]]) -> str:
    cleaned_explanation = (explanation or "").strip()
    if not evidence:
        return cleaned_explanation

    encoded = json.dumps(evidence, separators=(",", ":"), ensure_ascii=True)
    if cleaned_explanation:
        return f"{EVIDENCE_PREFIX}{encoded}{EVIDENCE_SUFFIX}\n{cleaned_explanation}"
    return f"{EVIDENCE_PREFIX}{encoded}{EVIDENCE_SUFFIX}"


def parse_explanation(value: Optional[str]) -> Tuple[str, Optional[Dict[str, Any]]]:
    raw = (value or "").strip()
    if not raw.startswith(EVIDENCE_PREFIX):
        return raw, None

    end_index = raw.find(EVIDENCE_SUFFIX)
    if end_index == -1:
        return raw, None

    payload_text = raw[len(EVIDENCE_PREFIX):end_index].strip()
    explanation = raw[end_index + len(EVIDENCE_SUFFIX):].strip()
    try:
        evidence = json.loads(payload_text)
        return explanation, evidence if isinstance(evidence, dict) else None
    except json.JSONDecodeError:
        return raw, None


def strip_explanation_metadata(value: Optional[str]) -> str:
    explanation, _ = parse_explanation(value)
    return explanation


def inject_evidence_in_text(text: str, evidence: Optional[Dict[str, Any]]) -> str:
    explanation = strip_explanation_metadata(text)
    if not evidence:
        return explanation

    title = evidence.get("document_title") or "Source"
    pages = evidence.get("pages") or []
    page_label = ", ".join(str(page) for page in pages) if pages else "Unknown"
    excerpt = evidence.get("excerpt") or ""
    excerpt_line = f' Evidence: "{excerpt}"' if excerpt else ""
    return f"{explanation} Supported by {title} (page {page_label}).{excerpt_line}".strip()

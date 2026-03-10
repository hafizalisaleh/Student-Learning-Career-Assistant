"""
Provider-aware summarizer for grounded study summaries.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Optional, Sequence

from utils.logger import logger
from utils.rag_llm_client import RAGLLMClient


def _normalize_whitespace(text: str) -> str:
    cleaned = (text or "").replace("\r\n", "\n")
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip()


def _build_summary_excerpt(content: str, max_chars: int = 16000) -> str:
    cleaned = _normalize_whitespace(content)
    if len(cleaned) <= max_chars:
        return cleaned

    sections = [segment.strip() for segment in cleaned.split("\n\n") if segment.strip()]
    if not sections:
        return cleaned[:max_chars]

    selected = []
    total = 0
    front_index = 0
    back_index = len(sections) - 1
    take_from_front = True

    while front_index <= back_index and total < max_chars:
        segment = sections[front_index] if take_from_front else sections[back_index]
        candidate = f"{segment}\n\n"
        if total + len(candidate) > max_chars and selected:
            break
        selected.append(segment)
        total += len(candidate)
        if take_from_front:
            front_index += 1
        else:
            back_index -= 1
        take_from_front = not take_from_front

    return "\n\n".join(selected).strip()[:max_chars]


def _format_page_label(pages: Sequence[int] | None) -> str:
    valid_pages = sorted({int(page) for page in (pages or []) if isinstance(page, int) and page > 0})
    if not valid_pages:
        return ""
    if len(valid_pages) == 1:
        return f"Page {valid_pages[0]}"
    if valid_pages == list(range(valid_pages[0], valid_pages[-1] + 1)):
        return f"Pages {valid_pages[0]}-{valid_pages[-1]}"
    return "Pages " + ", ".join(str(page) for page in valid_pages)


class Summarizer:
    """Generate concise, grounded summaries from retrieved document content."""

    def __init__(self):
        self.client = RAGLLMClient()

    def generate_summary(
        self,
        content: str,
        length: str = "medium",
        custom_prompt: str = None,
        document_title: Optional[str] = None,
        focus_context: Optional[str] = None,
        section_packets: Optional[Sequence[Dict[str, Any]]] = None,
    ) -> str:
        combined_focus = "\n\n".join(
            part.strip()
            for part in [focus_context, custom_prompt]
            if part and part.strip()
        ) or None

        if section_packets:
            return self._generate_hierarchical_summary(
                section_packets=section_packets,
                length=length,
                document_title=document_title,
                focus_context=combined_focus,
            )

        return self._generate_flat_summary(
            content=content,
            length=length,
            focus_context=combined_focus,
        )

    def _generate_flat_summary(
        self,
        content: str,
        length: str = "medium",
        focus_context: Optional[str] = None,
    ) -> str:
        length_configs = {
            "short": {
                "instruction": (
                    "Write a compact high-signal summary in 3-4 bullet points. "
                    "Prioritize the document's main objective, core findings, and the single most important takeaway."
                ),
                "format": "Use markdown bullet points only. Keep each bullet tight and non-redundant.",
                "max_tokens": 700,
            },
            "medium": {
                "instruction": (
                    "Write a balanced study summary that helps someone review the document quickly. "
                    "Cover the purpose, major concepts, important findings or claims, and any practical implications."
                ),
                "format": (
                    "Use markdown with short section headers and bullets. "
                    "Include a closing `Key takeaway` section."
                ),
                "max_tokens": 1200,
            },
            "detailed": {
                "instruction": (
                    "Write a comprehensive study summary that preserves the document's structure and important nuance. "
                    "Cover definitions, methods, findings, examples, and implications without drifting into unsupported claims."
                ),
                "format": (
                    "Use markdown with section headers, bullets, and short explanatory paragraphs where useful. "
                    "Include a final `Revision focus` section listing what the learner should revisit."
                ),
                "max_tokens": 1800,
            },
        }

        config = length_configs.get(length, length_configs["medium"])
        excerpt = _build_summary_excerpt(content)
        custom_section = f"\nADDITIONAL INSTRUCTIONS:\n{focus_context.strip()}\n" if focus_context else ""

        system_prompt = (
            "You are writing a grounded study summary from source material. "
            "Use only the provided source, preserve factual accuracy, and do not invent details."
        )

        prompt = f"""
Create a {length} summary of the source below.

OBJECTIVE:
{config['instruction']}

OUTPUT FORMAT:
{config['format']}
{custom_section}
QUALITY RULES:
- Stay faithful to the source.
- Avoid filler and repeated points.
- Prefer useful study phrasing over generic prose.
- If the source contains technical methods or results, preserve them clearly.
- Keep the summary focused on the document's central contributions, methods, and results.
- Ignore incidental OCR snippets, narrow sample examples, and noisy formula fragments unless they are central to the document.
- Do not mention missing context or page numbers unless the source itself makes them central.

SOURCE:
{excerpt}
""".strip()

        logger.info("Generating %s summary from %s characters of grounded content", length, len(excerpt))
        summary = self.client.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.2,
            max_tokens=config["max_tokens"],
        ).strip()

        if not summary:
            raise RuntimeError("Summary provider returned an empty summary")

        logger.info("Summary generated successfully: %s characters", len(summary))
        return summary

    def _generate_section_note(
        self,
        title: str,
        content: str,
        length: str,
        pages: Optional[Sequence[int]] = None,
        focus_context: Optional[str] = None,
    ) -> str:
        per_length_limits = {
            "short": {"max_tokens": 320, "bullet_range": "2-3"},
            "medium": {"max_tokens": 420, "bullet_range": "3-4"},
            "detailed": {"max_tokens": 540, "bullet_range": "4-5"},
        }
        config = per_length_limits.get(length, per_length_limits["medium"])
        page_label = _format_page_label(pages)
        prompt = f"""
Summarize this document section for study revision.

SECTION:
{title}{f" ({page_label})" if page_label else ""}

RULES:
- Stay strictly inside this section.
- Write {config['bullet_range']} markdown bullets.
- Preserve the section's central definitions, methods, findings, and only the examples that are core to the section.
- Do not add a heading or intro sentence.
- Avoid repeating the section title inside every bullet.
- Ignore incidental OCR snippets, long tables, and sample fragments unless they are necessary for the section's main point.
{f"- Respect this focus: {focus_context}" if focus_context else ""}

SOURCE:
{_build_summary_excerpt(content, max_chars=4200)}
""".strip()

        note = self.client.generate_text(
            prompt=prompt,
            system_prompt=(
                "You produce concise section notes grounded only in the provided source. "
                "Do not invent details."
            ),
            temperature=0.15,
            max_tokens=config["max_tokens"],
        ).strip()

        return note

    def _generate_hierarchical_summary(
        self,
        section_packets: Sequence[Dict[str, Any]],
        length: str,
        document_title: Optional[str] = None,
        focus_context: Optional[str] = None,
    ) -> str:
        if not section_packets:
            raise RuntimeError("No section packets provided for hierarchical summary generation")

        synthesis_configs = {
            "short": {
                "instruction": (
                    "Write a concise study summary with a one-paragraph overview, 3-5 bullets of the most important ideas, "
                    "and a final key takeaway."
                ),
                "format": (
                    "Use markdown headings `Overview`, `Key Points`, and `Key Takeaway`."
                ),
                "max_tokens": 900,
            },
            "medium": {
                "instruction": (
                    "Write a balanced study summary that captures the core flow of the document and the most important technical points."
                ),
                "format": (
                    "Use markdown headings `Overview`, `Section Highlights`, `Key Takeaways`, and `Revision Focus`."
                ),
                "max_tokens": 1400,
            },
            "detailed": {
                "instruction": (
                    "Write a comprehensive study summary that preserves structure, nuance, and the most important methods, findings, and implications."
                ),
                "format": (
                    "Use markdown headings `Overview`, `Section Highlights`, `Key Takeaways`, and `Revision Focus`. "
                    "Under `Section Highlights`, use one subsection per covered section."
                ),
                "max_tokens": 2200,
            },
        }

        config = synthesis_configs.get(length, synthesis_configs["medium"])
        section_notes = []
        for packet in section_packets:
            title = _normalize_whitespace(str(packet.get("title", "") or "Section"))
            content = str(packet.get("content", "") or "")
            pages = packet.get("pages") or []
            if not content.strip():
                continue
            note = self._generate_section_note(
                title=title,
                content=content,
                length=length,
                pages=pages,
                focus_context=focus_context,
            )
            section_notes.append(
                f"## {title}{f' ({_format_page_label(pages)})' if _format_page_label(pages) else ''}\n{note}"
            )

        if not section_notes:
            raise RuntimeError("Section note generation returned no usable content")

        prompt = f"""
Create a {length} study summary from the section notes below.

DOCUMENT:
{document_title or "Selected document"}

OBJECTIVE:
{config['instruction']}

OUTPUT FORMAT:
{config['format']}

QUALITY RULES:
- Use only the information present in the section notes.
- Keep the final summary coherent across sections instead of repeating section bullets verbatim.
- Preserve terminology, methods, and results that matter for revision.
- If a focus scope is provided, keep the summary inside that scope.
- Emphasize central contributions, architecture, training setup, and evaluation outcomes over incidental examples.
- Do not elevate noisy OCR samples, isolated equations, or narrow dataset examples into document-level takeaways unless multiple sections make them central.
- Do not mention page numbers inside the prose unless they help disambiguate section coverage.
{f"- Focus scope: {focus_context}" if focus_context else ""}

SECTION NOTES:
{'\n\n'.join(section_notes)}
""".strip()

        summary = self.client.generate_text(
            prompt=prompt,
            system_prompt=(
                "You write grounded, well-structured study summaries from section notes only. "
                "Do not invent sections or claims."
            ),
            temperature=0.18,
            max_tokens=config["max_tokens"],
        ).strip()

        if not summary:
            raise RuntimeError("Summary provider returned an empty hierarchical summary")

        logger.info(
            "Hierarchical summary generated successfully from %s section packets: %s characters",
            len(section_packets),
            len(summary),
        )
        return summary


summarizer = Summarizer()

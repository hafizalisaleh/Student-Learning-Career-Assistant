"""
Provider-aware notes generator using the unified RAG LLM client.
"""

from __future__ import annotations

import re
from typing import Optional

from utils.logger import logger
from utils.rag_llm_client import RAGLLMClient


def _normalize_whitespace(text: str) -> str:
    cleaned = (text or "").replace("\r\n", "\n")
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    return cleaned.strip()


def _build_source_excerpt(content: str, max_chars: int = 18000) -> str:
    """
    Preserve useful coverage across the source instead of over-weighting the
    first section of the document.
    """
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


class NotesGenerator:
    """Generate grounded study notes from retrieved document content."""

    NOTE_TYPE_CONFIGS = {
        "structured": {
            "instruction": (
                "Create professional study notes with strong hierarchy and clear topic grouping. "
                "Cover the most important concepts, definitions, explanations, and examples."
            ),
            "format": (
                "Use markdown with #, ##, and ### headings. "
                "Use bullets and numbered lists where helpful. "
                "Add tables only when comparison is genuinely useful."
            ),
            "max_tokens": 2200,
        },
        "bullet": {
            "instruction": (
                "Create concise, high-signal revision notes optimized for quick review and memorization."
            ),
            "format": (
                "Use markdown section headers and tight bullet points. "
                "Prefer short bullets over long paragraphs."
            ),
            "max_tokens": 1600,
        },
        "detailed": {
            "instruction": (
                "Create comprehensive explanatory notes for deeper understanding. "
                "Preserve important nuance, methods, comparisons, and practical implications."
            ),
            "format": (
                "Use markdown with section headers, bullets, and short explanatory paragraphs. "
                "End with a `Revision focus` section."
            ),
            "max_tokens": 2600,
        },
    }

    def __init__(self):
        self.client = RAGLLMClient()

    def generate_notes(
        self,
        content: str,
        title: str,
        note_type: str = "structured",
        additional_context: Optional[str] = None,
    ) -> str:
        config = self.NOTE_TYPE_CONFIGS.get(note_type, self.NOTE_TYPE_CONFIGS["structured"])
        excerpt = _build_source_excerpt(content)

        context_block = (
            f"\nADDITIONAL CONTEXT FROM USER:\n{additional_context.strip()}\n"
            if additional_context and additional_context.strip()
            else ""
        )

        system_prompt = (
            "You write grounded study notes from source material. "
            "Use only the provided source, preserve factual accuracy, and do not invent facts."
        )

        prompt = f"""
Create {note_type} study notes for the document below.

TITLE:
{title}

OBJECTIVE:
{config['instruction']}

OUTPUT FORMAT:
{config['format']}
{context_block}
QUALITY RULES:
- Stay faithful to the source material.
- Cover the most important ideas without drifting into unsupported claims.
- Highlight important terms with **bold** where useful.
- Include definitions, examples, comparisons, or applications when supported by the source.
- Preserve meaningful figures, tables, formulas, and structured data in prose when they matter.
- Use LaTeX for mathematical expressions when needed:
  - inline: $E = mc^2$
  - block:
    $$\\int_a^b f(x)dx = F(b) - F(a)$$
- Do not mention missing context or page numbers unless central to the source.
- Avoid filler and repeated points.

SOURCE:
{excerpt}
""".strip()

        logger.info("Generating %s notes from %s characters of grounded content", note_type, len(excerpt))
        notes = self.client.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            temperature=0.2,
            max_tokens=config["max_tokens"],
        ).strip()

        if not notes or len(notes) < 100:
            raise RuntimeError("Notes provider returned empty or low-quality notes")

        logger.info("Notes generated successfully: %s characters", len(notes))
        return notes


notes_generator = NotesGenerator()

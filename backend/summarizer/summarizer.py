"""
Provider-aware summarizer for grounded study summaries.
"""

from __future__ import annotations

import re

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


class Summarizer:
    """Generate concise, grounded summaries from retrieved document content."""

    def __init__(self):
        self.client = RAGLLMClient()

    def generate_summary(self, content: str, length: str = "medium", custom_prompt: str = None) -> str:
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
        custom_section = f"\nADDITIONAL INSTRUCTIONS:\n{custom_prompt.strip()}\n" if custom_prompt else ""

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


summarizer = Summarizer()

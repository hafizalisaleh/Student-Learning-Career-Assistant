"""
Content revision engine - revises AI-generated outputs based on user prompts.
Supports: mindmaps, diagrams, summaries, notes
"""
from typing import Dict, Any, Literal
from utils.gemini_client import gemini_client
from utils.logger import logger

ContentType = Literal["mindmap", "diagram", "summary", "note"]


def revise_content(
    current_content: str,
    revision_prompt: str,
    content_type: ContentType,
    document_title: str = "",
) -> Dict[str, Any]:
    """
    Revise AI-generated content based on a user's natural language instruction.

    Args:
        current_content: The current output (mermaid code, summary text, etc.)
        revision_prompt: What the user wants changed
        content_type: Type of content being revised
        document_title: Original document title for context

    Returns:
        Dict with revised content and metadata
    """
    try:
        logger.info(
            f"Revising {content_type} for '{document_title}': {revision_prompt[:80]}"
        )

        type_instructions = _get_type_instructions(content_type)

        prompt = f"""You are revising an existing {content_type} based on user feedback.

ORIGINAL {content_type.upper()}:
```
{current_content}
```

DOCUMENT TITLE: {document_title}

USER'S REVISION REQUEST:
"{revision_prompt}"

{type_instructions}

IMPORTANT:
- Apply ONLY the requested change. Keep everything else intact.
- Return ONLY the revised output. No explanations, no markdown code blocks, no preamble.
- The output must be the same format as the original."""

        revised = gemini_client.generate_text(prompt, temperature=0.3)
        revised = _clean_output(revised, content_type)

        logger.info(f"Revision complete, output length: {len(revised)}")

        return {
            "success": True,
            "revised_content": revised,
            "content_type": content_type,
        }

    except Exception as e:
        logger.error(f"Revision failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "revised_content": current_content,
            "content_type": content_type,
        }


def _get_type_instructions(content_type: ContentType) -> str:
    """Return format-specific instructions for the revision prompt."""
    if content_type == "mindmap":
        return """FORMAT RULES:
- Output must be valid Mermaid mindmap syntax
- Start with: mindmap
- Root node: root(("Title"))
- Use 2-space indentation for hierarchy
- Keep node text short (max 5-6 words)
- No special characters in node text"""

    elif content_type == "diagram":
        return """FORMAT RULES:
- Output must be valid Mermaid diagram syntax
- Preserve the diagram type (flowchart/sequence/erDiagram/stateDiagram-v2/classDiagram)
- Keep all valid Mermaid syntax rules
- Use proper node IDs (alphanumeric only)
- Keep labels in quotes where needed"""

    elif content_type == "summary":
        return """FORMAT RULES:
- Output must be formatted text (bullet points with • and ○)
- Maintain clear structure and readability
- Use markdown formatting where appropriate"""

    elif content_type == "note":
        return """FORMAT RULES:
- Output must be well-structured markdown
- Maintain headings, bullet points, and formatting
- Keep the educational tone"""

    return ""


def _clean_output(text: str, content_type: ContentType) -> str:
    """Clean the revision output based on content type."""
    text = text.strip()

    # Remove markdown code blocks
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.startswith("```")]
        text = "\n".join(lines)

    if content_type == "mindmap" and not text.startswith("mindmap"):
        text = "mindmap\n" + text

    return text

"""
Mind Map Generator - Creates Mermaid diagrams from document content
"""
from typing import Dict, Any
from utils.gemini_client import gemini_client
from utils.logger import logger


class MindMapGenerator:
    """Generate Mermaid mind map diagrams from document content"""

    def __init__(self):
        self.gemini_client = gemini_client

    def generate_mindmap(
        self,
        content: str,
        title: str = "Document",
        style: str = "default"
    ) -> Dict[str, Any]:
        """
        Generate a Mermaid mind map diagram from document content.

        Args:
            content: Document text content
            title: Document title for the root node
            style: Mind map style (default, detailed, simple)

        Returns:
            Dict with mermaid code and metadata
        """
        try:
            logger.info(f"Generating mind map for: {title}, content length: {len(content)}")

            # Truncate content if too long (to fit in context)
            max_content = 15000
            if len(content) > max_content:
                content = content[:max_content] + "..."
                logger.info(f"Content truncated to {max_content} characters")

            # Define style-specific instructions
            style_configs = {
                "simple": {
                    "instruction": "Create a SIMPLE mind map with only 3-5 main branches, each with 1-2 sub-points maximum.",
                    "depth": "Keep it shallow - maximum 2 levels deep."
                },
                "default": {
                    "instruction": "Create a BALANCED mind map with 4-7 main branches, each with 2-4 relevant sub-topics.",
                    "depth": "Use 2-3 levels of depth for good detail."
                },
                "detailed": {
                    "instruction": "Create a COMPREHENSIVE mind map with 5-8 main branches, each with multiple sub-topics and examples.",
                    "depth": "Use 3-4 levels of depth to capture all important details."
                }
            }

            config = style_configs.get(style, style_configs["default"])

            prompt = f"""Analyze this document and create a Mermaid mind map diagram.

DOCUMENT TITLE: {title}

REQUIREMENTS:
{config['instruction']}
{config['depth']}

MERMAID SYNTAX RULES (IMPORTANT):
1. Start with: mindmap
2. Use indentation (2 spaces) to show hierarchy
3. Root node format: root(("{title}"))
4. Main branches: just text, indented 2 spaces
5. Sub-branches: indented 4 spaces, and so on
6. Use simple text only - NO special characters like quotes, colons, or brackets in node text
7. Keep node text SHORT (max 5-6 words per node)
8. Replace any special characters with spaces or remove them

EXAMPLE FORMAT:
mindmap
  root(("Machine Learning"))
    Supervised Learning
      Classification
      Regression
    Unsupervised Learning
      Clustering
      Dimensionality Reduction
    Deep Learning
      Neural Networks
      CNNs

DOCUMENT CONTENT:
{content}

Generate ONLY the Mermaid mindmap code, nothing else. No explanations, no markdown code blocks, just the raw mermaid code starting with "mindmap"."""

            # Generate using Gemini
            mermaid_code = self.gemini_client.generate_text(prompt, temperature=0.3)

            # Clean up the response
            mermaid_code = self._clean_mermaid_code(mermaid_code, title)

            logger.info(f"Mind map generated successfully, code length: {len(mermaid_code)}")

            return {
                "success": True,
                "mermaid_code": mermaid_code,
                "title": title,
                "style": style
            }

        except Exception as e:
            logger.error(f"Mind map generation error: {e}")
            return {
                "success": False,
                "error": str(e),
                "mermaid_code": self._get_fallback_mindmap(title)
            }

    def _clean_mermaid_code(self, code: str, title: str) -> str:
        """Clean and validate Mermaid code"""
        # Remove markdown code blocks if present
        code = code.strip()
        if code.startswith("```"):
            lines = code.split("\n")
            # Remove first and last lines (```mermaid and ```)
            lines = [l for l in lines if not l.startswith("```")]
            code = "\n".join(lines)

        # Ensure it starts with mindmap
        if not code.strip().startswith("mindmap"):
            code = "mindmap\n" + code

        # Clean up any problematic characters in node text
        lines = code.split("\n")
        cleaned_lines = []
        for line in lines:
            # Remove quotes around regular nodes (but keep root format)
            if "root((" not in line and '("' in line:
                line = line.replace('("', '(').replace('")', ')')
            # Remove standalone quotes
            if '::' in line:  # Remove any styling that might cause issues
                line = line.split('::')[0]
            cleaned_lines.append(line)

        return "\n".join(cleaned_lines)

    def _get_fallback_mindmap(self, title: str) -> str:
        """Return a fallback mind map if generation fails"""
        safe_title = title.replace('"', '').replace("'", "")[:30]
        return f"""mindmap
  root(("{safe_title}"))
    Main Topics
      Topic 1
      Topic 2
    Key Concepts
      Concept 1
      Concept 2
    Summary
      Overview
      Conclusion"""


# Global instance
mindmap_generator = MindMapGenerator()

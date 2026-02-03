"""
Summarizer using RAG and Gemini
"""
from utils.gemini_client import gemini_client
from utils.logger import logger

class Summarizer:
    """Generate summaries from content"""
    
    def __init__(self):
        self.gemini_client = gemini_client
    
    def generate_summary(self, content: str, length: str = "medium", custom_prompt: str = None) -> str:
        """
        Generate summary from content
        
        Args:
            content: Document content
            length: Summary length (short, medium, detailed)
            custom_prompt: Optional custom instructions
            
        Returns:
            Generated summary
        """
        # Define summary styles based on length
        length_configs = {
            "short": {
                "instruction": "Create a BRIEF summary in 2-3 concise bullet points covering only the most critical information.",
                "format": "Use bullet points (•) for each main point. Keep it very concise."
            },
            "medium": {
                "instruction": "Create a BALANCED summary in 5-7 bullet points covering all key points, main ideas, and important details.",
                "format": "Use bullet points (•) for each key point. Include context and explanation."
            },
            "detailed": {
                "instruction": "Create a COMPREHENSIVE summary with detailed bullet points covering all important information, concepts, examples, and supporting details.",
                "format": "Use bullet points (•) with sub-points (○) where needed. Include explanations, examples, and context."
            }
        }
        
        config = length_configs.get(length, length_configs["medium"])
        
        # Add custom prompt if provided
        custom_section = ""
        if custom_prompt:
            custom_section = f"\n\nADDITIONAL INSTRUCTIONS:\n{custom_prompt}\n"
        
        prompt = f"""You are an expert at creating clear, well-structured summaries for students and professionals.

TASK: Generate a {length} summary of the following content.

REQUIREMENTS:
{config['instruction']}

FORMAT:
{config['format']}
{custom_section}
CONTENT TO SUMMARIZE:
{content}

SUMMARY:"""
        
        try:
            logger.info(f"Generating {length} summary, content length: {len(content)} characters")
            summary = self.gemini_client.generate_text(prompt, temperature=0.3)
            logger.info(f"Summary generated: {len(summary)} characters")
            return summary
        except Exception as e:
            logger.error(f"Error generating summary: {str(e)}")
            raise Exception(f"Error generating summary: {str(e)}")

# Global summarizer instance
summarizer = Summarizer()


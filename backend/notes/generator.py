"""
Notes generator using Gemini AI - BEST NOTES GENERATOR
"""
from typing import Dict, Any, Optional
from utils.gemini_client import gemini_client
from utils.logger import logger

class NotesGenerator:
    """Generate professional, structured notes from content using Gemini AI"""
    
    def __init__(self):
        self.gemini_client = gemini_client
    
    def generate_notes(
        self, 
        content: str, 
        title: str,
        note_type: str = "structured",
        additional_context: Optional[str] = None
    ) -> str:
        """
        Generate comprehensive notes from document content
        
        Args:
            content: Full document content
            title: Title for the notes
            note_type: Type of notes (structured, bullet, detailed)
            additional_context: Additional user-provided context
            
        Returns:
            Generated notes in markdown format
        """
        # Build context-aware prompt
        context_section = ""
        if additional_context:
            context_section = f"""
            
            ADDITIONAL CONTEXT PROVIDED BY USER:
            {additional_context}
            
            IMPORTANT: Ensure the notes incorporate and are relevant to this additional context.
            The additional context should complement and enhance the understanding of the main content.
            """
        
        prompts = {
            "structured": f"""
                You are an expert educational content creator and note-taker. Create EXCEPTIONAL, 
                professionally structured study notes from the following content.
                
                TITLE: {title}
                
                REQUIREMENTS:
                1. Use clear hierarchical structure with # headings, ## subheadings, ### sub-sections
                2. Create well-organized sections covering all major topics
                3. Include key concepts, definitions, and explanations
                4. Add tables when comparing multiple items or listing structured data
                5. Use bullet points and numbered lists where appropriate
                6. Highlight important terms with **bold** text
                7. Include examples and practical applications
                8. Make notes comprehensive yet easy to understand
                9. Ensure all figures, charts, and tables mentioned in content are properly referenced
                10. Structure for easy review and retention
                {context_section}
                
                DOCUMENT CONTENT:
                {content}
                
                Generate comprehensive, well-structured notes in markdown format:
            """,
            
            "bullet": f"""
                You are an expert at creating concise, actionable study materials. Create 
                EXCELLENT bullet-point notes from the following content.
                
                TITLE: {title}
                
                REQUIREMENTS:
                1. Use ## for main sections
                2. Use clear, concise bullet points (• and ○ for sub-points)
                3. Focus on key takeaways and essential information
                4. Each point should be actionable and clear
                5. Organize by topics and subtopics
                6. Include important definitions and concepts
                7. Highlight critical information with **bold**
                8. Keep it concise but comprehensive
                9. Perfect for quick review and memorization
                {context_section}
                
                DOCUMENT CONTENT:
                {content}
                
                Generate concise, well-organized bullet-point notes in markdown format:
            """,
            
            "detailed": f"""
                You are a university professor creating detailed lecture notes. Create 
                COMPREHENSIVE, in-depth explanatory notes from the following content.
                
                TITLE: {title}
                
                REQUIREMENTS:
                1. Use clear hierarchical structure (# ## ### headings)
                2. Provide detailed explanations for all concepts
                3. Include background information and context
                4. Add examples, case studies, and real-world applications
                5. Explain complex topics in simple terms
                6. Include all relevant figures, tables, charts, and diagrams
                7. Add cross-references between related topics
                8. Include practice questions or discussion points
                9. Make connections between different concepts
                10. Perfect for deep understanding and exam preparation
                {context_section}
                
                DOCUMENT CONTENT:
                {content}
                
                Generate detailed, comprehensive explanatory notes in markdown format:
            """
        }
        
        prompt = prompts.get(note_type, prompts["structured"])
        
        try:
            logger.info(f"Starting AI note generation for: {title} (type: {note_type})")
            logger.info(f"Content length: {len(content)} characters")
            
            # Generate notes using Gemini
            logger.info("Calling Gemini API to generate notes...")
            notes_content = self.gemini_client.generate_text(prompt, temperature=0.3)
            
            logger.info(f"Gemini API returned {len(notes_content)} characters")
            
            # Ensure quality and structure
            if not notes_content or len(notes_content) < 100:
                raise ValueError("Generated notes are too short or empty")
            
            logger.info("Note generation completed successfully")
            return notes_content
            
        except Exception as e:
            logger.error(f"Note generation failed: {str(e)}")
            raise Exception(f"Failed to generate notes: {str(e)}")

# Global instance
notes_generator = NotesGenerator()

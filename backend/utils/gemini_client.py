"""
Gemini API client for AI operations
"""
import os
from typing import Optional, List, Dict, Any
from pathlib import Path
import google.generativeai as genai
from langdetect import detect, LangDetectException
from config.settings import settings
from PIL import Image

class GeminiClient:
    """Client for interacting with Google Gemini API"""
    
    def __init__(self):
        """Initialize Gemini client"""
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        self.model = genai.GenerativeModel(settings.GEMINI_MODEL)
        self.embedding_model_name = settings.GEMINI_EMBEDDING_MODEL
    
    def generate_text(self, prompt: str, temperature: float = 0.3, image_path: Optional[str] = None) -> str:
        """
        Generate text using Gemini (with optional image input for Vision API)
        
        Args:
            prompt: Input prompt
            temperature: Sampling temperature
            image_path: Optional path to image file for vision analysis
            
        Returns:
            Generated text
        """
        try:
            generation_config = genai.GenerationConfig(
                temperature=temperature,
                max_output_tokens=8000,  # Increase token limit for long notes
            )
            
            # Configure safety settings to be more lenient for educational content
            safety_settings = [
                {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_ONLY_HIGH"},
                {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_ONLY_HIGH"},
                {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
                {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
            ]
            
            # Prepare content for API call
            content = []
            
            # If image path is provided, use Gemini Vision
            if image_path:
                try:
                    # Load image
                    image = Image.open(image_path)
                    content.append(prompt)
                    content.append(image)
                    print(f"Processing image with Gemini Vision: {image_path}")
                except Exception as img_error:
                    print(f"Error loading image: {img_error}")
                    raise Exception(f"Failed to load image for Gemini Vision: {str(img_error)}")
            else:
                content = prompt
            
            response = self.model.generate_content(
                content, 
                generation_config=generation_config,
                safety_settings=safety_settings
            )
            
            # Check if response was blocked
            if not response.text:
                # Try to get the reason if blocked
                if hasattr(response, 'prompt_feedback'):
                    raise Exception(f"Content generation blocked: {response.prompt_feedback}")
                raise Exception("Content generation returned empty response")
            
            return response.text
        except Exception as e:
            raise Exception(f"Error generating text: {str(e)}")
    
    def generate_embeddings(self, text: str) -> List[float]:
        """
        Generate embeddings for text
        
        Args:
            text: Input text
            
        Returns:
            List of embedding values
        """
        try:
            result = genai.embed_content(
                model=self.embedding_model_name,
                content=text,
                task_type="retrieval_document"
            )
            return result['embedding']
        except Exception as e:
            raise Exception(f"Error generating embeddings: {str(e)}")
    
    def detect_language(self, text: str) -> str:
        """
        Detect language of text
        
        Args:
            text: Input text
            
        Returns:
            Language code (e.g., 'en', 'es')
        """
        try:
            return detect(text)
        except LangDetectException:
            return "unknown"
    
    def translate_to_english(self, text: str) -> str:
        """
        Translate text to English using Gemini
        
        Args:
            text: Text to translate
            
        Returns:
            Translated text
        """
        try:
            prompt = f"Translate the following text to English. Only return the translation, nothing else:\n\n{text}"
            return self.generate_text(prompt, temperature=0.1)
        except Exception as e:
            print(f"Translation error: {e}")
            return text
    
    def ensure_english(self, text: str) -> str:
        """
        Ensure text is in English, translate if needed
        Handles special image markers for Gemini Vision processing
        
        Args:
            text: Input text (or image marker)
            
        Returns:
            Text in English (or image marker unchanged)
        """
        # Check if this is an image marker - don't translate
        if text and text.startswith("__GEMINI_IMAGE__"):
            return text
        
        lang = self.detect_language(text)
        if lang != "en" and lang != "unknown":
            return self.translate_to_english(text)
        return text
    
    def process_image_content(self, image_path: str, prompt: str = None) -> str:
        """
        Process image directly with Gemini Vision API
        Extracts text and understands content from images
        
        Args:
            image_path: Path to image file
            prompt: Optional custom prompt (default: extract all text and describe content)
            
        Returns:
            Extracted text and image description
        """
        try:
            if prompt is None:
                prompt = """Please analyze this image carefully and extract all text content.
                
Provide:
1. All visible text in the image (transcribe exactly as shown)
2. A brief description of any diagrams, charts, or visual elements
3. Any mathematical formulas or equations
4. The overall context and subject matter

Format your response in a clear, structured way that can be used for study notes."""
            
            return self.generate_text(prompt, temperature=0.1, image_path=image_path)
        except Exception as e:
            raise Exception(f"Error processing image with Gemini Vision: {str(e)}")

# Global client instance
gemini_client = GeminiClient()

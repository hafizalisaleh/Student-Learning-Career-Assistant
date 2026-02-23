from typing import Optional, List, Dict, Any, Union
from pathlib import Path
from google import genai
from google.genai import types
from langdetect import detect, LangDetectException
from config.settings import settings
from PIL import Image

class GeminiClient:
    """Client for interacting with Google Gemini API"""
    
    def __init__(self):
        """Initialize Gemini client"""
        self.api_key = settings.GOOGLE_API_KEY
        if self.api_key:
            self.client = genai.Client(api_key=self.api_key)
        else:
            self.client = None
            
        self.model_id = settings.GEMINI_MODEL
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
        if not self.client:
            raise Exception("Google API Key not configured")

        try:
            # Configure generation and safety
            config = types.GenerateContentConfig(
                temperature=temperature,
                max_output_tokens=8000,
                safety_settings=[
                    types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_ONLY_HIGH"),
                    types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="BLOCK_ONLY_HIGH"),
                    types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="BLOCK_ONLY_HIGH"),
                    types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="BLOCK_ONLY_HIGH"),
                ]
            )
            
            # Prepare contents for API call
            contents: List[Union[str, types.Part]] = []
            
            # If image path is provided, use multimodal features
            if image_path:
                try:
                    # Load and pass image via PIL
                    image = Image.open(image_path)
                    contents.append(prompt)
                    contents.append(image)
                    print(f"Processing image with Gemini: {image_path}")
                except Exception as img_error:
                    print(f"Error loading image: {img_error}")
                    raise Exception(f"Failed to load image for Gemini: {str(img_error)}")
            else:
                contents = [prompt]
            
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=contents,
                config=config
            )
            
            if not response or not response.text:
                raise Exception("Content generation returned empty response or was blocked")
            
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
        if not self.client:
            raise Exception("Google API Key not configured")

        try:
            result = self.client.models.embed_content(
                model=self.embedding_model_name,
                contents=text,
                config=types.EmbedContentConfig(
                    task_type="RETRIEVAL_DOCUMENT",
                    output_dimensionality=768
                )
            )
            return result.embeddings[0].values
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

import os
from groq import Groq
from typing import Optional, List, Dict, Any
from config.settings import settings
from utils.logger import logger

class GroqClient:
    """Client for interacting with Groq API as a fallback for Gemini"""
    
    def __init__(self):
        """Initialize Groq client"""
        self.api_key = settings.GROQ_API_KEY
        self.model_id = settings.GROQ_MODEL
        
        if self.api_key:
            self.client = Groq(api_key=self.api_key)
        else:
            self.client = None
            logger.warning("Groq API Key not configured. Fallback will not be available.")
    
    def generate_text(self, prompt: str, system_prompt: Optional[str] = None, temperature: float = 0.3, use_json: bool = False) -> str:
        """
        Generate text using Groq
        
        Args:
            prompt: User prompt
            system_prompt: Optional system instructions
            temperature: Sampling temperature
            use_json: Whether to force JSON output
            
        Returns:
            Generated text
        """
        if not self.client:
            raise Exception("Groq API Key not configured and Gemini fallback triggered")

        try:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            
            messages.append({"role": "user", "content": prompt})
            
            kwargs = {
                "model": self.model_id,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": 4096,
            }
            
            if use_json:
                kwargs["response_format"] = {"type": "json_object"}
                if "JSON" not in prompt.upper():
                    prompt += "\n\nIMPORTANT: Your response MUST be a valid JSON object."
                    messages[-1]["content"] = prompt
            
            completion = self.client.chat.completions.create(**kwargs)
            
            if not completion or not completion.choices:
                raise Exception("Groq generation returned empty response")
            
            content = completion.choices[0].message.content
            
            # Basic cleanup - strip markdown blocks if model ignored instructions and added them
            if content.startswith("```json"):
                content = content.replace("```json", "", 1).replace("```", "", 1).strip()
            elif content.startswith("```"):
                content = content.replace("```", "", 1).replace("```", "", 1).strip()
                
            return content
        except Exception as e:
            logger.error(f"Error generating text with Groq: {str(e)}")
            raise Exception(f"Groq error: {str(e)}")

# Global client instance
groq_client = GroqClient()

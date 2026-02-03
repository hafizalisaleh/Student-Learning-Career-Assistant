"""
Web content extractor using ExtractorAPI
"""
import requests
from typing import Dict, Any, Optional
from config.settings import settings

class WebExtractor:
    """Extract content from web pages"""
    
    def __init__(self):
        self.api_key = settings.extractor_key  # Use property with fallback
        self.base_url = "https://extractorapi.com/api/v1/extractor/"
    
    def fetch_content(self, url: str) -> Dict[str, Any]:
        """
        Fetch webpage content using ExtractorAPI
        
        Args:
            url: Webpage URL
            
        Returns:
            Content data dictionary
        """
        params = {
            "apikey": self.api_key,
            "url": url
        }
        
        try:
            response = requests.get(self.base_url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            return data
        except Exception as e:
            raise RuntimeError(f"ExtractorAPI error: {e}")
    
    def extract_text(self, url: str, max_length: int = 15000) -> Optional[str]:
        """
        Extract text content from webpage
        
        Args:
            url: Webpage URL
            max_length: Maximum text length to extract
            
        Returns:
            Extracted text content or None if API key not configured
        """
        try:
            # Check if API key is configured
            if not self.api_key or self.api_key == "":
                print("Warning: ExtractorAPI key not configured - skipping web extraction")
                return None
            
            webpage_data = self.fetch_content(url)
            
            if "text" in webpage_data and webpage_data["text"]:
                text_content = webpage_data["text"]
                
                # Truncate if too long
                if len(text_content) > max_length:
                    text_content = text_content[:max_length] + "... [content truncated]"
                
                return text_content
            else:
                print("No text content found in API response")
                return None
                
        except Exception as e:
            print(f"Error fetching webpage content: {e}")
            return None
    
    def get_metadata(self, url: str) -> Dict[str, Any]:
        """
        Get webpage metadata
        
        Args:
            url: Webpage URL
            
        Returns:
            Metadata dictionary
        """
        try:
            data = self.fetch_content(url)
            return {
                "title": data.get("title", ""),
                "domain": data.get("domain", ""),
                "date_published": data.get("date_published", ""),
                "url": url
            }
        except Exception as e:
            print(f"Error fetching metadata: {e}")
            return {}

"""
YouTube content extractor using Supadata API
"""
import requests
from typing import Dict, Any, Optional
from config.settings import settings
import logging

# Setup logger
logger = logging.getLogger(__name__)

class YouTubeExtractor:
    """Extract transcripts from YouTube videos"""
    
    def __init__(self):
        self.api_key = settings.supadata_key  # Use property with fallback
        self.base_url = "https://api.supadata.ai/v1/transcript"
        logger.info(f"YouTubeExtractor initialized with API key: {self.api_key[:15]}..." if self.api_key else "No API key")
    
    def fetch_transcript(self, youtube_url: str, prefer_lang: str = "en") -> Dict[str, Any]:
        """
        Fetch transcript using Supadata API
        
        Args:
            youtube_url: YouTube video URL
            prefer_lang: Preferred language code (default: "en")
            
        Returns:
            Transcript data dictionary
        """
        headers = {"x-api-key": self.api_key}
        params = {"url": youtube_url, "lang": prefer_lang}
        
        logger.info(f"Fetching transcript for: {youtube_url} (lang: {prefer_lang})")
        
        try:
            response = requests.get(
                self.base_url, 
                params=params, 
                headers=headers, 
                timeout=30
            )
            
            logger.info(f"API Response Status: {response.status_code}")
            
            response.raise_for_status()
            data = response.json()
            
            logger.info(f"API Response Keys: {list(data.keys())}")
            
            # Check if content is available
            if "content" in data and data["content"]:
                logger.info(f"Transcript content found: {len(data['content'])} entries")
                return data
            
            # Check if preferred language is available
            available = data.get("availableLangs") or data.get("available_languages") or []
            logger.info(f"Available languages: {available}")
            
            if prefer_lang and (isinstance(available, list) and prefer_lang in available):
                return data
            
            # Check if content already has English
            if data.get("content") and any(c.get("lang") == prefer_lang for c in data.get("content", [])):
                return data
            
            # Fallback: request without lang param
            logger.info("Retrying without language parameter...")
            response2 = requests.get(
                self.base_url, 
                params={"url": youtube_url}, 
                headers=headers, 
                timeout=30
            )
            response2.raise_for_status()
            data2 = response2.json()
            logger.info(f"Fallback response keys: {list(data2.keys())}")
            return data2
            
        except requests.exceptions.HTTPError as e:
            logger.error(f"HTTP Error: {e} - Response: {response.text if 'response' in locals() else 'N/A'}")
            raise RuntimeError(f"Supadata API HTTP error: {e}")
        except requests.exceptions.Timeout as e:
            logger.error(f"Timeout Error: {e}")
            raise RuntimeError(f"Supadata API timeout: {e}")
        except requests.exceptions.RequestException as e:
            logger.error(f"Request Error: {e}")
            raise RuntimeError(f"Supadata API request error: {e}")
        except Exception as e:
            logger.error(f"Unexpected Error: {e}")
            raise RuntimeError(f"Supadata API error: {e}")
    
    def extract_text(self, youtube_url: str) -> Optional[str]:
        """
        Extract transcript text from YouTube video
        
        Args:
            youtube_url: YouTube video URL
            
        Returns:
            Extracted transcript text or None if API key not configured
        """
        try:
            # Check if API key is configured
            if not self.api_key or self.api_key == "":
                logger.warning("Supadata API key not configured - cannot extract YouTube transcript")
                return None
            
            logger.info(f"Starting transcript extraction for: {youtube_url}")
            
            transcript_data = self.fetch_transcript(youtube_url, prefer_lang="en")
            
            if "content" in transcript_data and transcript_data["content"]:
                # Combine all text segments into a single transcript
                transcript_segments = []
                
                for entry in transcript_data["content"]:
                    text = entry.get("text", "")
                    if text:
                        transcript_segments.append(text)
                
                transcript_text = " ".join(transcript_segments)
                
                logger.info(f"Transcript extracted successfully:")
                logger.info(f"  - Total segments: {len(transcript_segments)}")
                logger.info(f"  - Total characters: {len(transcript_text)}")
                logger.info(f"  - Total words: ~{len(transcript_text.split())}")
                logger.info(f"  - Preview: {transcript_text[:200]}...")
                
                return transcript_text
            else:
                logger.error("No transcript content found in API response")
                logger.error(f"Response data: {transcript_data}")
                return None
                
        except Exception as e:
            logger.error(f"Error extracting transcript: {e}", exc_info=True)
            return None
    
    def get_metadata(self, youtube_url: str) -> Dict[str, Any]:
        """
        Get video metadata from transcript API
        
        Args:
            youtube_url: YouTube video URL
            
        Returns:
            Metadata dictionary
        """
        try:
            data = self.fetch_transcript(youtube_url)
            return {
                "available_languages": data.get("availableLangs", []),
                "video_url": youtube_url
            }
        except Exception as e:
            print(f"Error fetching metadata: {e}")
            return {}

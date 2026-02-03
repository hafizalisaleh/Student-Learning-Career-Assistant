"""
Validation utilities
"""
from typing import List, Optional
import re
from pathlib import Path

class FileValidator:
    """Validator for file uploads"""
    
    ALLOWED_EXTENSIONS = {
        'pdf', 'docx', 'pptx', 'txt', 
        'csv', 'xlsx', 'xls',
        'jpg', 'jpeg', 'png'
    }
    
    MAX_FILE_SIZE_MB = 50
    
    @staticmethod
    def validate_file_extension(filename: str, allowed_extensions: Optional[List[str]] = None) -> bool:
        """
        Validate file extension
        
        Args:
            filename: Name of the file
            allowed_extensions: List of allowed extensions (optional)
            
        Returns:
            True if valid, False otherwise
        """
        if allowed_extensions is None:
            allowed_extensions = FileValidator.ALLOWED_EXTENSIONS
        
        extension = Path(filename).suffix.lower().lstrip('.')
        return extension in allowed_extensions
    
    @staticmethod
    def validate_file_size(file_size_bytes: int, max_size_mb: Optional[int] = None) -> bool:
        """
        Validate file size
        
        Args:
            file_size_bytes: File size in bytes
            max_size_mb: Maximum allowed size in MB (optional)
            
        Returns:
            True if valid, False otherwise
        """
        if max_size_mb is None:
            max_size_mb = FileValidator.MAX_FILE_SIZE_MB
        
        max_size_bytes = max_size_mb * 1024 * 1024
        return file_size_bytes <= max_size_bytes
    
    @staticmethod
    def get_file_extension(filename: str) -> str:
        """Get file extension without dot"""
        return Path(filename).suffix.lower().lstrip('.')


class URLValidator:
    """Validator for URLs"""
    
    @staticmethod
    def validate_youtube_url(url: str) -> bool:
        """
        Validate YouTube URL
        
        Args:
            url: YouTube URL
            
        Returns:
            True if valid YouTube URL
        """
        youtube_patterns = [
            r'(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[\w-]+',
            r'(https?://)?(www\.)?youtube\.com/embed/[\w-]+'
        ]
        
        return any(re.match(pattern, url) for pattern in youtube_patterns)
    
    @staticmethod
    def extract_youtube_id(url: str) -> Optional[str]:
        """
        Extract YouTube video ID from URL
        
        Args:
            url: YouTube URL
            
        Returns:
            Video ID or None
        """
        patterns = [
            r'(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)',
            r'youtube\.com\/embed\/([\w-]+)'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        
        return None
    
    @staticmethod
    def validate_web_url(url: str) -> bool:
        """
        Validate web URL
        
        Args:
            url: Web URL
            
        Returns:
            True if valid web URL
        """
        url_pattern = r'^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$'
        return re.match(url_pattern, url) is not None


class EmailValidator:
    """Validator for email addresses"""
    
    @staticmethod
    def validate_email(email: str) -> bool:
        """
        Validate email address
        
        Args:
            email: Email address
            
        Returns:
            True if valid email
        """
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return re.match(email_pattern, email) is not None


class TextValidator:
    """Validator for text content"""
    
    @staticmethod
    def validate_min_length(text: str, min_length: int) -> bool:
        """
        Validate minimum text length
        
        Args:
            text: Text to validate
            min_length: Minimum required length
            
        Returns:
            True if meets minimum length
        """
        return len(text.strip()) >= min_length
    
    @staticmethod
    def validate_max_length(text: str, max_length: int) -> bool:
        """
        Validate maximum text length
        
        Args:
            text: Text to validate
            max_length: Maximum allowed length
            
        Returns:
            True if within maximum length
        """
        return len(text) <= max_length
    
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """
        Sanitize filename by removing special characters
        
        Args:
            filename: Original filename
            
        Returns:
            Sanitized filename
        """
        # Remove special characters except dots, dashes, and underscores
        sanitized = re.sub(r'[^\w\s.-]', '', filename)
        # Replace spaces with underscores
        sanitized = sanitized.replace(' ', '_')
        # Remove multiple consecutive underscores
        sanitized = re.sub(r'_+', '_', sanitized)
        return sanitized
    
    @staticmethod
    def count_words(text: str) -> int:
        """
        Count words in text
        
        Args:
            text: Text to count words
            
        Returns:
            Number of words
        """
        return len(text.split())


# Global validator instances
file_validator = FileValidator()
url_validator = URLValidator()
email_validator = EmailValidator()
text_validator = TextValidator()

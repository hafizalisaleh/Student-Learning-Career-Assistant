"""
Helper utility functions
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import hashlib
import secrets
import uuid

def generate_unique_id() -> str:
    """
    Generate unique identifier
    
    Returns:
        Unique UUID string
    """
    return str(uuid.uuid4())

def generate_random_token(length: int = 32) -> str:
    """
    Generate random secure token
    
    Args:
        length: Length of token
        
    Returns:
        Random token
    """
    return secrets.token_urlsafe(length)

def hash_string(text: str) -> str:
    """
    Generate SHA256 hash of string
    
    Args:
        text: String to hash
        
    Returns:
        Hexadecimal hash
    """
    return hashlib.sha256(text.encode()).hexdigest()

def calculate_file_hash(file_path: str) -> str:
    """
    Calculate file hash for duplicate detection
    
    Args:
        file_path: Path to file
        
    Returns:
        File hash
    """
    hasher = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b''):
            hasher.update(chunk)
    return hasher.hexdigest()

def chunk_text(
    text: str, 
    chunk_size: int = 1000, 
    overlap: int = 200
) -> List[str]:
    """
    Split text into overlapping chunks
    
    Args:
        text: Text to chunk
        chunk_size: Size of each chunk in characters
        overlap: Overlap between chunks
        
    Returns:
        List of text chunks
    """
    chunks = []
    start = 0
    text_length = len(text)
    
    while start < text_length:
        end = start + chunk_size
        chunk = text[start:end]
        chunks.append(chunk)
        start += chunk_size - overlap
    
    return chunks

def format_file_size(size_bytes: int) -> str:
    """
    Format file size in human readable format
    
    Args:
        size_bytes: Size in bytes
        
    Returns:
        Formatted string (e.g., "2.5 MB")
    """
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} PB"

def calculate_percentage(part: float, total: float) -> float:
    """
    Calculate percentage
    
    Args:
        part: Part value
        total: Total value
        
    Returns:
        Percentage (0-100)
    """
    if total == 0:
        return 0.0
    return round((part / total) * 100, 2)

def format_duration(seconds: int) -> str:
    """
    Format duration in human readable format
    
    Args:
        seconds: Duration in seconds
        
    Returns:
        Formatted string (e.g., "2h 30m")
    """
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    
    parts = []
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0:
        parts.append(f"{minutes}m")
    if seconds > 0 or not parts:
        parts.append(f"{seconds}s")
    
    return " ".join(parts)

def truncate_text(text: str, max_length: int = 100, suffix: str = "...") -> str:
    """
    Truncate text to maximum length
    
    Args:
        text: Text to truncate
        max_length: Maximum length
        suffix: Suffix to add if truncated
        
    Returns:
        Truncated text
    """
    if len(text) <= max_length:
        return text
    return text[:max_length - len(suffix)] + suffix

def merge_dicts(*dicts: Dict[str, Any]) -> Dict[str, Any]:
    """
    Merge multiple dictionaries
    
    Args:
        *dicts: Dictionaries to merge
        
    Returns:
        Merged dictionary
    """
    result = {}
    for d in dicts:
        result.update(d)
    return result

def remove_duplicates(items: List[Any]) -> List[Any]:
    """
    Remove duplicates while preserving order
    
    Args:
        items: List with potential duplicates
        
    Returns:
        List without duplicates
    """
    seen = set()
    result = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result

def calculate_days_between(date1: datetime, date2: datetime) -> int:
    """
    Calculate days between two dates
    
    Args:
        date1: First date
        date2: Second date
        
    Returns:
        Number of days
    """
    delta = abs(date2 - date1)
    return delta.days

def is_recent(timestamp: datetime, hours: int = 24) -> bool:
    """
    Check if timestamp is recent
    
    Args:
        timestamp: Timestamp to check
        hours: Number of hours to consider recent
        
    Returns:
        True if recent
    """
    now = datetime.now()
    diff = now - timestamp
    return diff < timedelta(hours=hours)

def get_date_range(days: int = 7) -> tuple[datetime, datetime]:
    """
    Get date range for last N days
    
    Args:
        days: Number of days
        
    Returns:
        Tuple of (start_date, end_date)
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    return start_date, end_date

def safe_divide(numerator: float, denominator: float, default: float = 0.0) -> float:
    """
    Safe division avoiding division by zero
    
    Args:
        numerator: Numerator
        denominator: Denominator
        default: Default value if denominator is zero
        
    Returns:
        Division result or default
    """
    if denominator == 0:
        return default
    return numerator / denominator

def extract_keywords(text: str, max_keywords: int = 10) -> List[str]:
    """
    Extract potential keywords from text (simple implementation)
    
    Args:
        text: Text to extract keywords from
        max_keywords: Maximum number of keywords
        
    Returns:
        List of keywords
    """
    # Simple word frequency-based extraction
    words = text.lower().split()
    
    # Remove common stop words
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
        'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'would', 'should', 'could', 'may', 'might', 'can', 'this', 'that',
        'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
    }
    
    # Filter and count words
    filtered_words = [w for w in words if w not in stop_words and len(w) > 3]
    word_freq = {}
    for word in filtered_words:
        word_freq[word] = word_freq.get(word, 0) + 1
    
    # Sort by frequency
    sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
    
    return [word for word, _ in sorted_words[:max_keywords]]

def paginate(items: List[Any], page: int = 1, page_size: int = 10) -> Dict[str, Any]:
    """
    Paginate list of items
    
    Args:
        items: List to paginate
        page: Page number (1-indexed)
        page_size: Items per page
        
    Returns:
        Dictionary with paginated data
    """
    total_items = len(items)
    total_pages = (total_items + page_size - 1) // page_size
    
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    
    return {
        'items': items[start_idx:end_idx],
        'page': page,
        'page_size': page_size,
        'total_items': total_items,
        'total_pages': total_pages,
        'has_next': page < total_pages,
        'has_prev': page > 1
    }

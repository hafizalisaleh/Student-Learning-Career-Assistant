"""
Document validation utilities
"""
import os
from pathlib import Path
from typing import Optional
from fastapi import UploadFile, HTTPException, status
from config.settings import settings

class DocumentValidator:
    """Validate document uploads"""
    
    @staticmethod
    def validate_file_size(file: UploadFile) -> bool:
        """
        Validate file size
        
        Args:
            file: Uploaded file
            
        Returns:
            True if valid
            
        Raises:
            HTTPException if invalid
        """
        # Get file size
        file.file.seek(0, 2)  # Seek to end
        file_size = file.file.tell()
        file.file.seek(0)  # Reset to beginning
        
        max_size = settings.MAX_FILE_SIZE_MB * 1024 * 1024  # Convert to bytes
        
        if file_size > max_size:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File size exceeds maximum limit of {settings.MAX_FILE_SIZE_MB}MB"
            )
        
        return True
    
    @staticmethod
    def validate_file_extension(filename: str) -> bool:
        """
        Validate file extension
        
        Args:
            filename: Name of file
            
        Returns:
            True if valid
            
        Raises:
            HTTPException if invalid
        """
        ext = Path(filename).suffix.lower().lstrip('.')
        
        if ext not in settings.allowed_extensions_list:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file format. Allowed formats: {', '.join(settings.allowed_extensions_list)}"
            )
        
        return True
    
    @staticmethod
    def validate_upload(file: UploadFile) -> bool:
        """
        Validate file upload
        
        Args:
            file: Uploaded file
            
        Returns:
            True if valid
        """
        DocumentValidator.validate_file_extension(file.filename)
        DocumentValidator.validate_file_size(file)
        return True
    
    @staticmethod
    def get_content_type(filename: str) -> str:
        """
        Determine content type from filename
        
        Args:
            filename: Name of file
            
        Returns:
            Content type string
        """
        ext = Path(filename).suffix.lower()
        
        type_mapping = {
            '.pdf': 'pdf',
            '.docx': 'docx',
            '.doc': 'docx',
            '.pptx': 'ppt',
            '.ppt': 'ppt',
            '.xlsx': 'excel',
            '.xls': 'excel',
            '.csv': 'excel',
            '.txt': 'text',
            '.md': 'text',
            '.jpg': 'image',
            '.jpeg': 'image',
            '.png': 'image',
            '.bmp': 'image',
            '.tiff': 'image',
            '.tif': 'image',
        }
        
        return type_mapping.get(ext, 'text')

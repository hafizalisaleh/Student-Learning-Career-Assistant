"""
Document validation utilities
"""
from pathlib import Path
from typing import Dict, List
from fastapi import UploadFile, HTTPException, status
from config.settings import settings

class DocumentValidator:
    """Validate document uploads"""

    SUPPORTED_EXTENSION_TYPES: Dict[str, str] = {
        "pdf": "pdf",
        "docx": "docx",
        "doc": "docx",
        "pptx": "ppt",
        "ppt": "ppt",
        "xlsx": "excel",
        "xls": "excel",
        "csv": "excel",
        "txt": "text",
        "md": "text",
        "json": "text",
        "jpg": "image",
        "jpeg": "image",
        "png": "image",
        "bmp": "image",
        "tiff": "image",
        "tif": "image",
    }

    @classmethod
    def get_enabled_extensions(cls) -> List[str]:
        """
        Return the currently enabled upload extensions.
        Uses app config when present, but always stays inside the
        formats the pipeline can actually classify.
        """
        configured = {
            ext.strip().lower().lstrip(".")
            for ext in settings.allowed_extensions_list
            if ext.strip()
        }
        supported = list(cls.SUPPORTED_EXTENSION_TYPES.keys())
        if not configured:
            return supported

        enabled = [ext for ext in supported if ext in configured]
        return enabled or supported

    @classmethod
    def get_upload_constraints(cls) -> Dict[str, object]:
        """Return frontend-safe upload capabilities."""
        allowed_extensions = cls.get_enabled_extensions()
        return {
            "allowed_extensions": allowed_extensions,
            "accept": ",".join(f".{ext}" for ext in allowed_extensions),
            "max_file_size_mb": settings.MAX_FILE_SIZE_MB,
        }
    
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

        allowed_extensions = DocumentValidator.get_enabled_extensions()

        if ext not in allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file format. Allowed formats: {', '.join(allowed_extensions)}"
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

        return DocumentValidator.SUPPORTED_EXTENSION_TYPES.get(ext.lstrip("."), 'text')

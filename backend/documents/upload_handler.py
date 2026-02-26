"""
Document upload handler
"""
import os
import shutil
from pathlib import Path
from typing import Optional
from fastapi import UploadFile
import uuid
from config.settings import settings

class UploadHandler:
    """Handle file uploads"""

    def __init__(self):
        """Initialize upload handler"""
        self.upload_folder = settings.upload_folder_path
        self.upload_folder.mkdir(parents=True, exist_ok=True)
        self.thumbnails_folder = self.upload_folder / "thumbnails"
        self.thumbnails_folder.mkdir(parents=True, exist_ok=True)

    def generate_thumbnail(self, file_path: str, document_id: str) -> Optional[str]:
        """
        Generate a thumbnail image from page 1 of a PDF.

        Args:
            file_path: Path to the PDF file
            document_id: Document ID for naming

        Returns:
            Path to generated thumbnail, or None on failure
        """
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(file_path)
            if len(doc) == 0:
                doc.close()
                return None

            page = doc[0]
            # Render at 1.5x zoom for decent quality thumbnails
            mat = fitz.Matrix(1.5, 1.5)
            pix = page.get_pixmap(matrix=mat)

            thumbnail_path = self.thumbnails_folder / f"{document_id}.png"
            pix.save(str(thumbnail_path))

            doc.close()
            return str(thumbnail_path)
        except Exception as e:
            print(f"Thumbnail generation failed for {file_path}: {e}")
            return None

    def save_file(self, file: UploadFile, user_id: uuid.UUID) -> dict:
        """
        Save uploaded file
        
        Args:
            file: Uploaded file
            user_id: User ID
            
        Returns:
            Dictionary with file info
        """
        # Create user directory
        user_folder = self.upload_folder / str(user_id)
        user_folder.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename
        file_ext = Path(file.filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = user_folder / unique_filename
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Get file size
        file_size = os.path.getsize(file_path)
        
        return {
            "file_path": str(file_path),
            "original_filename": file.filename,
            "file_size": file_size,
            "unique_filename": unique_filename
        }
    
    def delete_file(self, file_path: str) -> bool:
        """
        Delete file
        
        Args:
            file_path: Path to file
            
        Returns:
            True if deleted successfully
        """
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
            return False
        except Exception as e:
            print(f"Error deleting file: {e}")
            return False
    
    def extract_content_on_demand(self, file_path: str, content_type: str) -> dict:
        """
        Extract content from file only when needed (on-demand)
        This is called only when generating summaries, notes, or quizzes
        NOT during upload - saves database storage and processing time
        
        Args:
            file_path: Path to file
            content_type: Type of content
            
        Returns:
            Dictionary with extracted text and metadata
        """
        try:
            from core.rag_pipeline import rag_pipeline
            
            # Extract based on content type
            if content_type in ['youtube', 'article']:
                # For URLs, we'd need the URL not file path
                return {"success": False, "error": "URL content requires URL not file path"}
            else:
                # Extract from file
                result = rag_pipeline.process_document(file_path)
                return result
        except Exception as e:
            return {"success": False, "error": str(e)}

# Global upload handler instance
upload_handler = UploadHandler()


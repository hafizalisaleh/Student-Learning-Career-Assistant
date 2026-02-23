"""
Document model for file uploads and content management
"""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum as SQLEnum, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
import enum
from typing import Optional
from config.database import Base

class ContentType(str, enum.Enum):
    YOUTUBE = "youtube"
    ARTICLE = "article"
    PDF = "pdf"
    PPT = "ppt"
    IMAGE = "image"
    DOCX = "docx"
    EXCEL = "excel"
    TEXT = "text"

class ProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500))
    content_type = Column(SQLEnum(ContentType), nullable=False)
    original_filename = Column(String(500))
    file_url = Column(String(1000))
    file_path = Column(String(1000))
    upload_date = Column(DateTime(timezone=True), server_default=func.now())
    file_size = Column(Integer)  # in bytes
    processing_status = Column(SQLEnum(ProcessingStatus), default=ProcessingStatus.PENDING)
    vector_db_reference_id = Column(String(255))
    doc_metadata = Column(JSONB)  # Renamed from metadata to avoid SQLAlchemy conflict
    extracted_text = Column(Text)  # Store extracted content
    
    # Topic and domain tracking for career recommendations
    topics = Column(JSONB)  # List of extracted topics/subjects
    domains = Column(JSONB)  # List of domains/fields (e.g., AI, Web Dev, Data Science)
    keywords = Column(JSONB)  # Important keywords and technical terms
    difficulty_level = Column(String(50))  # beginner, intermediate, advanced
    subject_area = Column(String(200))  # Primary subject (e.g., Computer Science, Mathematics)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    @property
    def unique_filename(self) -> Optional[str]:
        """Extract unique filename from file_path"""
        if self.file_path:
            from pathlib import Path
            return Path(self.file_path).name
        return None

    def __repr__(self):
        return f"<Document {self.title} - {self.content_type}>"

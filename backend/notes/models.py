"""
Notes model for AI-generated notes
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.sql import func
import uuid
from config.database import Base

class Note(Base):
    __tablename__ = "notes"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500), nullable=False)
    note_type = Column(String(50))  # structured, bullet, detailed, study
    content = Column(Text, nullable=False)
    content_format = Column(String(20), default='markdown')  # 'markdown' or 'blocknote'
    tags = Column(ARRAY(String), nullable=True)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<Note {self.title} - {self.note_type}>"

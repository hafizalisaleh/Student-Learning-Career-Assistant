"""
Summary model for document summarization
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
import enum
from config.database import Base

class SummaryLength(str, enum.Enum):
    SHORT = "short"
    MEDIUM = "medium"
    DETAILED = "detailed"

class Summary(Base):
    __tablename__ = "summaries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    summary_text = Column(Text, nullable=False)
    summary_length = Column(SQLEnum(SummaryLength), default=SummaryLength.MEDIUM)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<Summary {self.id} - {self.summary_length}>"

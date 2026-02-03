"""
Progress tracking models
"""
from sqlalchemy import Column, Integer, Float, DateTime, ForeignKey, String, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
import enum
from config.database import Base

class ActivityType(str, enum.Enum):
    UPLOAD = "upload"
    NOTE = "note"
    SUMMARY = "summary"
    QUIZ = "quiz"
    QUIZ_ATTEMPT = "quiz_attempt"
    RESUME_UPLOADED = "resume_uploaded"
    RESUME_ANALYZED = "resume_analyzed"

class UserProgress(Base):
    __tablename__ = "user_progress"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    total_documents = Column(Integer, default=0)
    total_notes = Column(Integer, default=0)
    total_summaries = Column(Integer, default=0)
    total_quizzes_generated = Column(Integer, default=0)
    total_quizzes_attempted = Column(Integer, default=0)
    average_quiz_score = Column(Float, default=0.0)
    study_streak_days = Column(Integer, default=0)
    last_activity_date = Column(DateTime(timezone=True))
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<UserProgress {self.user_id}>"

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    activity_type = Column(SQLEnum(ActivityType), nullable=False)
    activity_details = Column(JSONB)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    def __repr__(self):
        return f"<ActivityLog {self.activity_type} - {self.timestamp}>"

"""
Learning path models for personalized, lesson-based study journeys.
"""
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum as SQLEnum, Text, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
import enum

from config.database import Base


class GoalDepth(str, enum.Enum):
    BASICS = "basics"
    DEEP = "deep"
    PRACTICAL = "practical"


class SourceMode(str, enum.Enum):
    WEB = "web"
    PDF = "pdf"
    HYBRID = "hybrid"


class PathStatus(str, enum.Enum):
    READY = "ready"
    FAILED = "failed"


class LessonProgressStatus(str, enum.Enum):
    NOT_STARTED = "not_started"
    COMPLETED = "completed"
    REVIEW_DUE = "review_due"


class LearningPath(Base):
    __tablename__ = "learning_paths"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    topic = Column(String(500), nullable=False)
    background = Column(Text, nullable=False)
    custom_instructions = Column(Text)
    goal_depth = Column(SQLEnum(GoalDepth), nullable=False)
    daily_minutes = Column(Integer, nullable=False, default=15)
    teaching_style = Column(JSONB, nullable=False, default=list)
    focus_areas = Column(JSONB, nullable=False, default=list)
    source_mode = Column(SQLEnum(SourceMode), nullable=False)
    source_document_ids = Column(JSONB, nullable=False, default=list)
    tagline = Column(Text, nullable=False)
    rationale = Column(Text, nullable=False)
    estimated_days = Column(Integer, nullable=False, default=14)
    total_lessons = Column(Integer, nullable=False, default=0)
    status = Column(SQLEnum(PathStatus), nullable=False, default=PathStatus.READY)
    path_metadata = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PathUnit(Base):
    __tablename__ = "path_units"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    path_id = Column(UUID(as_uuid=True), ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    objective = Column(Text, nullable=False)
    sequence_reason = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PathLesson(Base):
    __tablename__ = "path_lessons"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    path_id = Column(UUID(as_uuid=True), ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False, index=True)
    unit_id = Column(UUID(as_uuid=True), ForeignKey("path_units.id", ondelete="CASCADE"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    objective = Column(Text, nullable=False)
    duration_minutes = Column(Integer, nullable=False, default=5)
    difficulty = Column(Integer, nullable=False, default=1)
    unlock_hint = Column(Text, nullable=False)
    exercise_type = Column(String(50), nullable=False, default="multiple_choice")
    key_terms = Column(JSONB, nullable=False, default=list)
    source_refs = Column(JSONB, nullable=False, default=list)
    lesson_content = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LessonProgress(Base):
    __tablename__ = "lesson_progress"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    path_id = Column(UUID(as_uuid=True), ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False, index=True)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("path_lessons.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(SQLEnum(LessonProgressStatus), nullable=False, default=LessonProgressStatus.NOT_STARTED)
    attempts = Column(Integer, nullable=False, default=0)
    mastery_score = Column(Float, nullable=False, default=0.0)
    xp_earned = Column(Integer, nullable=False, default=0)
    last_submission = Column(JSONB, nullable=False, default=dict)
    is_completed = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

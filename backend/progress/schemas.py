"""
Progress tracking schemas
"""
from pydantic import BaseModel
from typing import Dict, Any, List
from datetime import datetime
import uuid

class UserProgressResponse(BaseModel):
    """Schema for user progress response"""
    id: uuid.UUID
    user_id: uuid.UUID
    total_documents: int = 0
    total_notes: int = 0
    total_summaries: int = 0
    total_quizzes_generated: int = 0
    total_quizzes_attempted: int = 0
    average_quiz_score: float = 0.0
    study_streak_days: int = 0
    last_activity_date: datetime | None = None

    class Config:
        from_attributes = True

class ActivityLogResponse(BaseModel):
    """Schema for activity log response"""
    id: uuid.UUID
    user_id: uuid.UUID
    activity_type: str
    activity_details: Dict[str, Any] = {}
    timestamp: datetime

    class Config:
        from_attributes = True

    @classmethod
    def from_orm(cls, obj):
        return cls(
            id=obj.id,
            user_id=obj.user_id,
            activity_type=obj.activity_type.value if hasattr(obj.activity_type, 'value') else str(obj.activity_type),
            activity_details=obj.activity_details or {},
            timestamp=obj.timestamp
        )

class DashboardStats(BaseModel):
    """Schema for dashboard statistics"""
    total_documents: int
    total_notes: int
    total_summaries: int
    total_quizzes_generated: int
    total_quizzes_attempted: int
    average_quiz_score: float
    study_streak_days: int
    recent_activities: List[ActivityLogResponse]
    quiz_performance_trend: List[Dict[str, Any]]
    document_types_breakdown: Dict[str, int]
    weekly_activity: Dict[str, int]

class PerformanceMetrics(BaseModel):
    """Schema for performance metrics"""
    best_score: float
    worst_score: float
    average_score: float
    total_attempts: int
    improvement_rate: float
    strong_topics: List[str]
    weak_topics: List[str]

class AIInsight(BaseModel):
    """Schema for AI-powered insights"""
    category: str
    message: str
    priority: str  # 'high', 'medium', 'low'
    recommendation: str
    icon: str  # Icon identifier for frontend

class TopicPerformance(BaseModel):
    """Schema for topic-specific performance"""
    topic: str
    avg_score: float
    attempts: int
    last_attempt: str  # ISO format datetime string
    trend: str  # 'improving', 'declining', 'stable'

class ActivitySummary(BaseModel):
    """Schema for daily activity summary"""
    date: str
    documents: int
    notes: int
    quizzes: int
    study_time: int  # minutes

class DetailedAnalytics(BaseModel):
    """Schema for comprehensive analytics"""
    total_documents: int
    total_notes: int
    total_summaries: int
    total_quizzes: int
    total_quiz_attempts: int
    average_quiz_score: float
    total_study_time: int  # in minutes
    documents_by_type: Dict[str, int]
    quiz_performance_by_topic: List[TopicPerformance]
    recent_activity: List[ActivitySummary]
    study_streak: int
    improvement_rate: float
    best_score: float
    consistency_score: float  # 0-100, based on regular activity
    learning_velocity: float  # content consumed per week

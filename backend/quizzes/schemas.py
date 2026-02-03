"""
Quiz schemas for request/response validation
"""
from pydantic import BaseModel, Field, computed_field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
import uuid

class QuestionTypeEnum(str, Enum):
    MCQ = "mcq"
    SHORT_ANSWER = "short"
    TRUE_FALSE = "true_false"
    FILL_BLANK = "fill_blank"
    MIXED = "mixed"

class DifficultyLevelEnum(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"

class QuizCreate(BaseModel):
    """Schema for quiz creation"""
    document_ids: List[uuid.UUID]
    question_type: QuestionTypeEnum = QuestionTypeEnum.MIXED
    difficulty: DifficultyLevelEnum = DifficultyLevelEnum.MEDIUM
    num_questions: int = Field(default=10, ge=1, le=50)
    title: Optional[str] = None

class QuestionResponse(BaseModel):
    """Schema for quiz question response"""
    id: uuid.UUID
    quiz_id: uuid.UUID
    question_text: str
    question_type: QuestionTypeEnum
    options: Optional[List[str]]
    difficulty: DifficultyLevelEnum
    
    class Config:
        from_attributes = True

class QuizResponse(BaseModel):
    """Schema for quiz response"""
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    difficulty_level: DifficultyLevelEnum
    question_type: str
    created_at: datetime
    questions: List[QuestionResponse] = []
    
    # Computed fields for frontend compatibility
    @computed_field
    @property
    def difficulty(self) -> str:
        """Return difficulty as string for frontend"""
        return self.difficulty_level.value if self.difficulty_level else 'medium'
    
    @computed_field
    @property
    def topic(self) -> str:
        """Return title as topic for frontend"""
        return self.title or 'General'
    
    class Config:
        from_attributes = True

class AnswerSubmission(BaseModel):
    """Schema for single answer submission"""
    question_id: uuid.UUID
    answer: str

class QuizSubmission(BaseModel):
    """Schema for quiz submission"""
    answers: List[AnswerSubmission]

class QuestionFeedback(BaseModel):
    """Schema for question feedback"""
    question_id: uuid.UUID
    question_text: str
    user_answer: str
    correct_answer: str
    is_correct: bool
    explanation: str
    points_earned: float
    points_possible: float

class QuizResultResponse(BaseModel):
    """Schema for quiz result"""
    attempt_id: uuid.UUID
    quiz_id: uuid.UUID
    score: float
    total_questions: int
    correct_answers: int
    time_taken: Optional[int]
    completed_at: datetime
    feedback: List[QuestionFeedback]
    
    class Config:
        from_attributes = True

class TopicPerformance(BaseModel):
    """Schema for topic performance"""
    topic: str
    count: int
    average_score: float

class QuizAnalytics(BaseModel):
    """Schema for quiz analytics"""
    total_quizzes: int
    total_attempts: int
    average_score: float
    best_score: float
    topics: List[TopicPerformance] = []

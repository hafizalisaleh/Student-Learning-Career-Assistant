"""
Quiz models for quiz generation and evaluation
"""
from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
import uuid
import enum
from config.database import Base

class QuestionType(str, enum.Enum):
    MCQ = "mcq"
    SHORT_ANSWER = "short"
    TRUE_FALSE = "true_false"
    FILL_BLANK = "fill_blank"

class DifficultyLevel(str, enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"

class Quiz(Base):
    __tablename__ = "quizzes"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(500))
    difficulty_level = Column(SQLEnum(DifficultyLevel), default=DifficultyLevel.MEDIUM)
    question_type = Column(String(50))  # Can be mixed or specific
    document_references = Column(JSONB)  # Array of document IDs
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<Quiz {self.title}>"

class QuizQuestion(Base):
    __tablename__ = "quiz_questions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quiz_id = Column(UUID(as_uuid=True), ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    question_text = Column(Text, nullable=False)
    question_type = Column(SQLEnum(QuestionType), nullable=False)
    options = Column(JSONB)  # For MCQs: ["option1", "option2", ...]
    correct_answer = Column(Text, nullable=False)
    explanation = Column(Text)
    difficulty = Column(SQLEnum(DifficultyLevel), default=DifficultyLevel.MEDIUM)
    
    def __repr__(self):
        return f"<QuizQuestion {self.id} - {self.question_type}>"

class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    quiz_id = Column(UUID(as_uuid=True), ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    score = Column(Float)
    total_questions = Column(Integer)
    correct_answers = Column(Integer)  # Number of correct answers
    answers = Column(JSONB)  # User's answers with evaluation details
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True))
    time_taken = Column(Integer)  # in seconds
    
    def __repr__(self):
        return f"<QuizAttempt {self.id} - Score: {self.score}>"

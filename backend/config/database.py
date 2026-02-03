"""
Database configuration and session management
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator
from config.settings import settings

# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=settings.DEBUG
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

def get_db() -> Generator[Session, None, None]:
    """
    Dependency function to get database session
    
    Yields:
        Session: Database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize database tables"""
    # Import all models to ensure they are registered with Base
    from users.models import User
    from documents.models import Document
    from notes.models import Note
    from summarizer.models import Summary
    from quizzes.models import Quiz, QuizQuestion, QuizAttempt
    from progress.models import UserProgress, ActivityLog
    from career.models import Resume, ResumeAnalysis, CareerRecommendation
    
    # Create all tables
    Base.metadata.create_all(bind=engine)

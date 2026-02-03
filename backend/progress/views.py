"""
Progress tracking API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from config.database import get_db
from progress.models import UserProgress, ActivityLog
from progress.schemas import (
    UserProgressResponse, ActivityLogResponse, 
    DashboardStats, PerformanceMetrics,
    AIInsight, DetailedAnalytics
)
from users.auth import get_current_user
from users.models import User
from progress.analytics import progress_analytics

router = APIRouter(prefix="/api/progress", tags=["progress"])

@router.get("/", response_model=UserProgressResponse)
def get_user_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current user's progress
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        User progress data
    """
    progress = progress_analytics.get_or_create_progress(db, current_user.id)
    progress_analytics.update_progress(db, current_user.id)
    
    return UserProgressResponse.from_orm(progress)

@router.get("/dashboard", response_model=DashboardStats)
def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive dashboard statistics
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Dashboard statistics
    """
    # Update progress first
    progress = progress_analytics.update_progress(db, current_user.id)
    
    # Get recent activities
    recent_activities = progress_analytics.get_recent_activities(db, current_user.id, limit=10)
    
    # Get quiz performance trend
    quiz_trend = progress_analytics.get_quiz_performance_trend(db, current_user.id)
    
    # Get document types breakdown
    doc_breakdown = progress_analytics.get_document_types_breakdown(db, current_user.id)
    
    # Get weekly activity
    weekly_activity = progress_analytics.get_weekly_activity(db, current_user.id)
    
    return DashboardStats(
        total_documents=progress.total_documents,
        total_notes=progress.total_notes,
        total_summaries=progress.total_summaries,
        total_quizzes_generated=progress.total_quizzes_generated,
        total_quizzes_attempted=progress.total_quizzes_attempted,
        average_quiz_score=progress.average_quiz_score,
        study_streak_days=progress.study_streak_days,
        recent_activities=[ActivityLogResponse.from_orm(act) for act in recent_activities],
        quiz_performance_trend=quiz_trend,
        document_types_breakdown=doc_breakdown,
        weekly_activity=weekly_activity
    )

@router.get("/activities", response_model=List[ActivityLogResponse])
def get_activity_history(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get activity history
    
    Args:
        limit: Maximum number of activities to return
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        List of activities
    """
    activities = progress_analytics.get_recent_activities(db, current_user.id, limit)
    return [ActivityLogResponse.from_orm(act) for act in activities]

@router.get("/performance", response_model=PerformanceMetrics)
def get_performance_metrics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get detailed performance metrics
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Performance metrics
    """
    metrics = progress_analytics.get_performance_metrics(db, current_user.id)
    
    return PerformanceMetrics(
        best_score=metrics['best_score'],
        worst_score=metrics['worst_score'],
        average_score=metrics['average_score'],
        total_attempts=metrics['total_attempts'],
        improvement_rate=metrics['improvement_rate'],
        strong_topics=metrics['strong_topics'],
        weak_topics=metrics['weak_topics']
    )

@router.post("/refresh")
def refresh_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually refresh progress statistics
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Success message
    """
    progress_analytics.update_progress(db, current_user.id)
    return {"message": "Progress statistics updated successfully"}

@router.get("/analytics/detailed", response_model=DetailedAnalytics)
def get_detailed_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive analytics for progress dashboard
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Detailed analytics including performance trends, activity, and insights
    """
    analytics = progress_analytics.get_detailed_analytics(db, current_user.id)
    return analytics

@router.get("/insights/ai", response_model=List[AIInsight])
def get_ai_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get AI-powered personalized learning insights
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        List of AI-generated insights and recommendations
    """
    insights = progress_analytics.generate_ai_insights(db, current_user.id)
    return insights

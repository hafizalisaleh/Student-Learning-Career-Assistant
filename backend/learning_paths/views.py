"""
API endpoints for personalized learning paths.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List

from config.database import get_db
from learning_paths.schemas import (
    LearningPathChatRequest,
    LearningPathChatResponse,
    LearningPathCardResponse,
    LearningPathGenerateRequest,
    LearningPathLessonDetailResponse,
    LearningPathResponse,
    LessonCompletionRequest,
    LessonCompletionResponse,
)
from learning_paths.service import learning_path_service
from users.auth import get_current_user
from users.models import User

router = APIRouter(prefix="/api/learning-paths", tags=["learning-paths"])


@router.get("/", response_model=List[LearningPathCardResponse])
def list_learning_paths(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return learning_path_service.get_paths(db, current_user)


@router.post("/generate", response_model=LearningPathResponse)
def generate_learning_path(
    request: LearningPathGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return learning_path_service.generate_path(db, current_user, request)


@router.get("/{path_id}", response_model=LearningPathResponse)
def get_learning_path(
    path_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return learning_path_service.get_path(db, current_user, path_id)


@router.post("/{path_id}/chat", response_model=LearningPathChatResponse)
def chat_learning_path(
    path_id: str,
    request: LearningPathChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return learning_path_service.chat(db, current_user, path_id, request)


@router.get("/{path_id}/lessons/{lesson_id}", response_model=LearningPathLessonDetailResponse)
def get_learning_lesson(
    path_id: str,
    lesson_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return learning_path_service.get_lesson(db, current_user, path_id, lesson_id)


@router.post("/{path_id}/lessons/{lesson_id}/generate", response_model=LearningPathLessonDetailResponse)
def generate_learning_lesson(
    path_id: str,
    lesson_id: str,
    regenerate: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return learning_path_service.generate_lesson(db, current_user, path_id, lesson_id, regenerate=regenerate)


@router.post("/{path_id}/lessons/{lesson_id}/complete", response_model=LessonCompletionResponse)
def complete_learning_lesson(
    path_id: str,
    lesson_id: str,
    request: LessonCompletionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return learning_path_service.complete_lesson(
        db=db,
        current_user=current_user,
        path_id=path_id,
        lesson_id=lesson_id,
        selected_option_index=request.selected_option_index,
        text_answer=request.text_answer,
        ordered_steps=request.ordered_steps,
    )

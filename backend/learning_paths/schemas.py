"""
Schemas for personalized learning paths and lessons.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Literal, Optional
import uuid

from pydantic import BaseModel, Field, HttpUrl


class GoalDepthEnum(str, Enum):
    BASICS = "basics"
    DEEP = "deep"
    PRACTICAL = "practical"


class SourceModeEnum(str, Enum):
    WEB = "web"
    PDF = "pdf"
    HYBRID = "hybrid"


class PathStatusEnum(str, Enum):
    READY = "ready"
    FAILED = "failed"


class LessonProgressStatusEnum(str, Enum):
    NOT_STARTED = "not_started"
    COMPLETED = "completed"
    REVIEW_DUE = "review_due"


class LearningPathGenerateRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=500)
    background: str = Field(min_length=3, max_length=2000)
    goal_depth: GoalDepthEnum
    daily_minutes: int = Field(ge=5, le=120)
    teaching_style: list[str] = Field(default_factory=list)
    focus_areas: list[str] = Field(default_factory=list)
    source_mode: SourceModeEnum
    document_ids: list[uuid.UUID] = Field(default_factory=list)
    seed_urls: list[HttpUrl] = Field(default_factory=list)
    custom_instructions: Optional[str] = Field(default=None, max_length=2000)


class SourceReferenceResponse(BaseModel):
    label: str
    source_type: str
    locator: str
    excerpt: str


class LearningPathLessonProgressResponse(BaseModel):
    status: LessonProgressStatusEnum
    attempts: int
    mastery_score: float
    xp_earned: int
    is_completed: bool
    completed_at: Optional[datetime] = None
    last_submission: dict[str, Any] = Field(default_factory=dict)


class LearningPathLessonSummaryResponse(BaseModel):
    id: uuid.UUID
    unit_id: uuid.UUID
    title: str
    objective: str
    duration_minutes: int
    difficulty: int
    unlock_hint: str
    exercise_type: str
    key_terms: list[str] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)
    is_available: bool
    is_locked: bool
    is_completed: bool
    progress: LearningPathLessonProgressResponse


class LearningPathUnitResponse(BaseModel):
    id: uuid.UUID
    path_id: uuid.UUID
    order_index: int
    title: str
    objective: str
    sequence_reason: str
    lessons: list[LearningPathLessonSummaryResponse] = Field(default_factory=list)


class LearningPathCardResponse(BaseModel):
    id: uuid.UUID
    title: str
    topic: str
    tagline: str
    goal_depth: GoalDepthEnum
    source_mode: SourceModeEnum
    estimated_days: int
    total_lessons: int
    completed_lessons: int
    completion_percentage: int
    daily_minutes: int
    teaching_style: list[str] = Field(default_factory=list)
    focus_areas: list[str] = Field(default_factory=list)
    next_lesson_id: Optional[uuid.UUID] = None
    next_lesson_title: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class LearningPathDocumentResponse(BaseModel):
    id: uuid.UUID
    title: str
    content_type: str


class LearningPathResponse(BaseModel):
    id: uuid.UUID
    title: str
    topic: str
    background: str
    custom_instructions: Optional[str] = None
    tagline: str
    rationale: str
    goal_depth: GoalDepthEnum
    source_mode: SourceModeEnum
    status: PathStatusEnum
    daily_minutes: int
    estimated_days: int
    total_lessons: int
    completed_lessons: int
    completion_percentage: int
    teaching_style: list[str] = Field(default_factory=list)
    focus_areas: list[str] = Field(default_factory=list)
    source_documents: list[LearningPathDocumentResponse] = Field(default_factory=list)
    next_lesson_id: Optional[uuid.UUID] = None
    next_lesson_title: Optional[str] = None
    units: list[LearningPathUnitResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: Optional[datetime] = None


class LessonSectionResponse(BaseModel):
    title: str
    content: str


class LessonDiagramResponse(BaseModel):
    title: str
    mermaid: str
    caption: str


class LessonExerciseResponse(BaseModel):
    type: str
    prompt: str
    options: list[str] = Field(default_factory=list)
    correct_option_index: int
    acceptable_answers: list[str] = Field(default_factory=list)
    correct_sequence: list[str] = Field(default_factory=list)
    explanation: str


class LessonMasteryCheckResponse(BaseModel):
    prompt: str
    success_criteria: str


class LessonContentResponse(BaseModel):
    hook: str
    tldr: str
    sections: list[LessonSectionResponse] = Field(default_factory=list)
    personalized_analogy: str
    diagram: LessonDiagramResponse
    exercise: LessonExerciseResponse
    mastery_check: LessonMasteryCheckResponse
    source_refs: list[SourceReferenceResponse] = Field(default_factory=list)


class LearningPathLessonDetailResponse(BaseModel):
    id: uuid.UUID
    path_id: uuid.UUID
    unit_id: uuid.UUID
    title: str
    objective: str
    duration_minutes: int
    difficulty: int
    unlock_hint: str
    exercise_type: str
    key_terms: list[str] = Field(default_factory=list)
    source_refs: list[str] = Field(default_factory=list)
    is_available: bool
    is_locked: bool
    is_completed: bool
    progress: LearningPathLessonProgressResponse
    previous_lesson_id: Optional[uuid.UUID] = None
    next_lesson_id: Optional[uuid.UUID] = None
    content: Optional[LessonContentResponse] = None


class LearningPathChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class LearningPathChatRequest(BaseModel):
    messages: list[LearningPathChatMessage] = Field(min_length=1, max_length=24)
    model: Optional[str] = Field(default=None, max_length=120)
    lesson_id: Optional[uuid.UUID] = None
    unit_id: Optional[uuid.UUID] = None


class LearningPathChatSourceResponse(BaseModel):
    label: str
    detail: str
    url: Optional[str] = None


class LearningPathChatResponse(BaseModel):
    answer: str
    model: str
    call_count: int
    remembers_via_history: bool
    used_live_tools: bool
    history_turns_used: int
    sources: list[LearningPathChatSourceResponse] = Field(default_factory=list)


class LessonCompletionRequest(BaseModel):
    selected_option_index: Optional[int] = None
    text_answer: Optional[str] = None
    ordered_steps: list[str] = Field(default_factory=list)


class LessonCompletionResponse(BaseModel):
    correct: bool
    xp_earned: int
    status: LessonProgressStatusEnum
    feedback: str
    progress: LearningPathLessonProgressResponse

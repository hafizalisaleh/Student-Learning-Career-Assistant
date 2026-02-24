"""
Notes schemas for request/response validation
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import uuid

class NoteCreate(BaseModel):
    """Schema for note creation/generation"""
    title: str = Field(..., min_length=1, max_length=500)
    document_id: uuid.UUID
    additional_context: Optional[str] = Field(None, max_length=5000)
    tags: Optional[list[str]] = None
    note_type: str = Field(default="structured", pattern="^(structured|bullet|detailed|study)$")

class StudyNoteCreate(BaseModel):
    """Schema for creating a manual study note"""
    title: str = Field(..., min_length=1, max_length=500)
    document_id: uuid.UUID
    content: str = Field(default="[]")
    tags: Optional[list[str]] = None

class NoteUpdate(BaseModel):
    """Schema for note update"""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    content: Optional[str] = None
    tags: Optional[list[str]] = None
    content_format: Optional[str] = None

class NoteResponse(BaseModel):
    """Schema for note response"""
    id: uuid.UUID
    user_id: uuid.UUID
    document_id: uuid.UUID
    title: str
    note_type: str
    content: str
    content_format: Optional[str] = 'markdown'
    tags: Optional[list[str]]
    generated_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

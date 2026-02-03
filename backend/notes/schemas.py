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
    note_type: str = Field(default="structured", pattern="^(structured|bullet|detailed)$")

class NoteResponse(BaseModel):
    """Schema for note response"""
    id: uuid.UUID
    user_id: uuid.UUID
    document_id: uuid.UUID
    title: str
    note_type: str
    content: str
    tags: Optional[list[str]]
    generated_at: datetime
    
    class Config:
        from_attributes = True

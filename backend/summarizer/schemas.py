"""
Summary schemas for request/response validation
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum
import uuid

class SummaryLengthEnum(str, Enum):
    SHORT = "short"
    MEDIUM = "medium"
    DETAILED = "detailed"

class SummaryCreate(BaseModel):
    """Schema for summary creation"""
    document_id: uuid.UUID
    summary_length: SummaryLengthEnum = SummaryLengthEnum.MEDIUM

class SummaryResponse(BaseModel):
    """Schema for summary response"""
    id: uuid.UUID
    user_id: uuid.UUID
    document_id: uuid.UUID
    summary_text: str
    summary_length: SummaryLengthEnum
    generated_at: datetime
    
    class Config:
        from_attributes = True

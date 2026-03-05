"""
Knowledge Evolution Timeline - Pydantic Schemas
"""
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime
from uuid import UUID


class SignalBreakdown(BaseModel):
    exposure: float = 0.0
    depth: float = 0.0
    notes: float = 0.0
    quiz: float = 0.0
    breadth: float = 0.0
    recency: float = 0.0


class TimelinePoint(BaseModel):
    date: datetime
    level: int
    score: float
    trigger: Optional[str] = None
    signals: SignalBreakdown


class ConceptResponse(BaseModel):
    id: UUID
    canonical_name: str
    aliases: List[str] = []
    domain: Optional[str] = None
    current_level: int = 1
    current_score: float = 0.0
    signal_breakdown: Optional[SignalBreakdown] = None
    document_count: int = 0
    note_count: int = 0
    quiz_accuracy: Optional[float] = None
    first_seen: Optional[datetime] = None
    last_updated: Optional[datetime] = None
    recommendation: Optional[str] = None


class ConceptTimelineResponse(BaseModel):
    concept: ConceptResponse
    timeline: List[TimelinePoint] = []


class ConceptListResponse(BaseModel):
    concepts: List[ConceptResponse]
    total: int


class TimelineResponse(BaseModel):
    concepts: List[ConceptTimelineResponse]
    total_concepts: int
    domain_summary: Dict[str, dict] = {}


class DomainSummary(BaseModel):
    domain: str
    avg_level: float
    concept_count: int
    top_concept: Optional[str] = None


class DomainSummaryResponse(BaseModel):
    domains: List[DomainSummary]
    total_concepts: int
    overall_avg_level: float


class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    level: Optional[int] = None
    domain: Optional[str] = None
    size: int = 8


class GraphLink(BaseModel):
    source: str
    target: str
    type: str
    strength: float = 0.5


class GraphResponse(BaseModel):
    nodes: List[GraphNode]
    links: List[GraphLink]
    stats: Dict[str, int] = {}

"""
Knowledge Evolution Timeline - Database Models
Tracks personal conceptual growth over time using multi-signal scoring.
"""
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from config.database import Base


class Concept(Base):
    """Canonical concept registry"""
    __tablename__ = "concepts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    canonical_name = Column(String(200), nullable=False)
    aliases = Column(JSONB, default=[])
    embedding_id = Column(String(255))
    domain = Column(String(200))
    parent_concept_id = Column(UUID(as_uuid=True), ForeignKey("concepts.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    document_links = relationship("DocumentConceptLink", back_populates="concept", cascade="all, delete-orphan")
    snapshots = relationship("ConceptSnapshot", back_populates="concept", cascade="all, delete-orphan")
    user_states = relationship("UserConceptState", back_populates="concept", cascade="all, delete-orphan")


class DocumentConceptLink(Base):
    """Links documents to concepts with similarity and depth scores"""
    __tablename__ = "document_concept_links"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    concept_id = Column(UUID(as_uuid=True), ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    similarity_score = Column(Float)
    depth_score = Column(Float)
    raw_concept_text = Column(String(200))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    concept = relationship("Concept", back_populates="document_links")


class ConceptSnapshot(Base):
    """Timeline data points recording concept level changes"""
    __tablename__ = "concept_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    concept_id = Column(UUID(as_uuid=True), ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False)
    level = Column(Integer, nullable=False)
    raw_score = Column(Float, nullable=False)
    signal_breakdown = Column(JSONB, nullable=False)
    document_count = Column(Integer, default=0)
    note_count = Column(Integer, default=0)
    quiz_accuracy = Column(Float)
    snapshot_trigger = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint('level >= 1 AND level <= 5', name='check_level_range'),
    )

    # Relationships
    concept = relationship("Concept", back_populates="snapshots")


class ConceptRelationship(Base):
    """Hierarchy and connections between concepts"""
    __tablename__ = "concept_relationships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parent_concept_id = Column(UUID(as_uuid=True), ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False)
    child_concept_id = Column(UUID(as_uuid=True), ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False)
    relationship_type = Column(String(50), nullable=False, default="parent_child")
    strength = Column(Float, default=0.5)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserConceptState(Base):
    """Denormalized current concept state per user for fast reads"""
    __tablename__ = "user_concept_state"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    concept_id = Column(UUID(as_uuid=True), ForeignKey("concepts.id", ondelete="CASCADE"), nullable=False)
    current_level = Column(Integer, nullable=False, default=1)
    current_raw_score = Column(Float, nullable=False, default=0.0)
    current_signals = Column(JSONB)
    first_seen_at = Column(DateTime(timezone=True))
    last_updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    pending_snapshot = Column(Boolean, default=False)

    # Relationships
    concept = relationship("Concept", back_populates="user_states")

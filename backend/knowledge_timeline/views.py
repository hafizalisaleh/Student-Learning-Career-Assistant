"""
Knowledge Evolution Timeline - API Endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func, desc
from typing import Optional, List, Dict
from datetime import datetime, timedelta, timezone
from config.database import get_db
from users.auth import get_current_user
from users.models import User
from knowledge_timeline.models import (
    Concept, DocumentConceptLink, ConceptSnapshot,
    ConceptRelationship, UserConceptState
)
from knowledge_timeline.schemas import (
    ConceptResponse, ConceptTimelineResponse, TimelineResponse,
    TimelinePoint, SignalBreakdown, ConceptListResponse,
    DomainSummary, DomainSummaryResponse,
    GraphNode, GraphLink, GraphResponse
)
from knowledge_timeline.snapshot_service import snapshot_service
from utils.logger import logger

router = APIRouter(prefix="/api/evolution", tags=["knowledge-evolution"])


@router.get("/timeline")
def get_timeline(
    concept_id: Optional[str] = None,
    since: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get timeline of concept level changes for the current user"""
    # Get all user concept states
    states_query = db.query(UserConceptState).filter(
        UserConceptState.user_id == current_user.id
    )
    if concept_id:
        states_query = states_query.filter(UserConceptState.concept_id == concept_id)

    states = states_query.all()

    if not states:
        return {
            "concepts": [],
            "total_concepts": 0,
            "domain_summary": {}
        }

    concept_ids = [str(s.concept_id) for s in states]

    # Get snapshots
    snap_query = db.query(ConceptSnapshot).filter(
        ConceptSnapshot.user_id == current_user.id,
        ConceptSnapshot.concept_id.in_(concept_ids)
    )
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            snap_query = snap_query.filter(ConceptSnapshot.created_at >= since_dt)
        except ValueError:
            pass

    snapshots = snap_query.order_by(ConceptSnapshot.created_at).limit(limit).all()

    # Group snapshots by concept
    concept_snapshots = {}
    for snap in snapshots:
        cid = str(snap.concept_id)
        if cid not in concept_snapshots:
            concept_snapshots[cid] = []
        concept_snapshots[cid].append(snap)

    # Build response
    concepts_data = []
    for state in states:
        concept = db.query(Concept).filter(Concept.id == state.concept_id).first()
        if not concept:
            continue

        timeline_points = []
        for snap in concept_snapshots.get(str(concept.id), []):
            signals = snap.signal_breakdown or {}
            timeline_points.append({
                "date": snap.created_at.isoformat() if snap.created_at else None,
                "level": snap.level,
                "score": snap.raw_score,
                "trigger": snap.snapshot_trigger,
                "signals": signals
            })

        # Generate recommendation based on missing signals
        recommendation = _get_recommendation(state.current_signals or {})

        concepts_data.append({
            "concept": {
                "id": str(concept.id),
                "canonical_name": concept.canonical_name,
                "aliases": concept.aliases or [],
                "domain": concept.domain,
                "current_level": state.current_level,
                "current_score": state.current_raw_score,
                "signal_breakdown": state.current_signals,
                "document_count": 0,
                "note_count": 0,
                "first_seen": state.first_seen_at.isoformat() if state.first_seen_at else None,
                "last_updated": state.last_updated_at.isoformat() if state.last_updated_at else None,
                "recommendation": recommendation
            },
            "timeline": timeline_points
        })

    # Domain summary
    domain_map = {}
    for cd in concepts_data:
        d = cd["concept"].get("domain") or "General"
        if d not in domain_map:
            domain_map[d] = {"levels": [], "count": 0}
        domain_map[d]["levels"].append(cd["concept"]["current_level"])
        domain_map[d]["count"] += 1

    domain_summary = {}
    for d, info in domain_map.items():
        domain_summary[d] = {
            "avg_level": round(sum(info["levels"]) / len(info["levels"]), 1),
            "concept_count": info["count"]
        }

    return {
        "concepts": concepts_data,
        "total_concepts": len(concepts_data),
        "domain_summary": domain_summary
    }


@router.get("/concepts")
def get_concepts(
    domain: Optional[str] = None,
    min_level: Optional[int] = None,
    sort_by: str = Query(default="level", pattern="^(level|name|recent)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all concepts with current levels"""
    query = db.query(UserConceptState).filter(
        UserConceptState.user_id == current_user.id
    )

    if min_level:
        query = query.filter(UserConceptState.current_level >= min_level)

    states = query.all()

    concepts = []
    for state in states:
        concept = db.query(Concept).filter(Concept.id == state.concept_id).first()
        if not concept:
            continue

        if domain and concept.domain and concept.domain.lower() != domain.lower():
            continue

        # Count documents
        doc_count = db.query(DocumentConceptLink).filter(
            DocumentConceptLink.concept_id == concept.id,
            DocumentConceptLink.user_id == current_user.id
        ).count()

        recommendation = _get_recommendation(state.current_signals or {})

        concepts.append({
            "id": str(concept.id),
            "canonical_name": concept.canonical_name,
            "aliases": concept.aliases or [],
            "domain": concept.domain,
            "current_level": state.current_level,
            "current_score": state.current_raw_score,
            "signal_breakdown": state.current_signals,
            "document_count": doc_count,
            "note_count": 0,
            "first_seen": state.first_seen_at.isoformat() if state.first_seen_at else None,
            "last_updated": state.last_updated_at.isoformat() if state.last_updated_at else None,
            "recommendation": recommendation
        })

    # Sort
    if sort_by == "level":
        concepts.sort(key=lambda c: c["current_level"], reverse=True)
    elif sort_by == "name":
        concepts.sort(key=lambda c: c["canonical_name"].lower())
    elif sort_by == "recent":
        concepts.sort(key=lambda c: c["last_updated"] or "", reverse=True)

    return {
        "concepts": concepts,
        "total": len(concepts)
    }


@router.get("/concepts/{concept_id}")
def get_concept_detail(
    concept_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed data for a single concept"""
    concept = db.query(Concept).filter(Concept.id == concept_id).first()
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    state = db.query(UserConceptState).filter(
        UserConceptState.user_id == current_user.id,
        UserConceptState.concept_id == concept_id
    ).first()

    if not state:
        raise HTTPException(status_code=404, detail="No data for this concept")

    # Get all snapshots for this concept
    snapshots = db.query(ConceptSnapshot).filter(
        ConceptSnapshot.user_id == current_user.id,
        ConceptSnapshot.concept_id == concept_id
    ).order_by(ConceptSnapshot.created_at).all()

    # Get linked documents
    from documents.models import Document
    links = db.query(DocumentConceptLink).filter(
        DocumentConceptLink.concept_id == concept_id,
        DocumentConceptLink.user_id == current_user.id
    ).all()

    documents = []
    for link in links:
        doc = db.query(Document).filter(Document.id == link.document_id).first()
        if doc:
            documents.append({
                "id": str(doc.id),
                "title": doc.original_filename,
                "depth_score": link.depth_score,
                "linked_at": link.created_at.isoformat() if link.created_at else None
            })

    # Get related concepts
    from knowledge_timeline.models import ConceptRelationship
    relationships = db.query(ConceptRelationship).filter(
        (ConceptRelationship.parent_concept_id == concept_id) |
        (ConceptRelationship.child_concept_id == concept_id)
    ).all()

    related = []
    for rel in relationships:
        other_id = str(rel.child_concept_id) if str(rel.parent_concept_id) == concept_id else str(rel.parent_concept_id)
        other = db.query(Concept).filter(Concept.id == other_id).first()
        if other:
            related.append({
                "id": str(other.id),
                "name": other.canonical_name,
                "relationship_type": rel.relationship_type,
                "strength": rel.strength
            })

    timeline = []
    for snap in snapshots:
        timeline.append({
            "date": snap.created_at.isoformat() if snap.created_at else None,
            "level": snap.level,
            "score": snap.raw_score,
            "trigger": snap.snapshot_trigger,
            "signals": snap.signal_breakdown or {}
        })

    return {
        "concept": {
            "id": str(concept.id),
            "canonical_name": concept.canonical_name,
            "aliases": concept.aliases or [],
            "domain": concept.domain,
            "current_level": state.current_level,
            "current_score": state.current_raw_score,
            "signal_breakdown": state.current_signals,
            "first_seen": state.first_seen_at.isoformat() if state.first_seen_at else None,
            "last_updated": state.last_updated_at.isoformat() if state.last_updated_at else None,
            "recommendation": _get_recommendation(state.current_signals or {})
        },
        "timeline": timeline,
        "documents": documents,
        "related_concepts": related
    }


@router.post("/recalculate")
def recalculate_all(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Force recalculation of all concept levels for the current user"""
    states = db.query(UserConceptState).filter(
        UserConceptState.user_id == current_user.id
    ).all()

    updated = 0
    for state in states:
        try:
            snapshot_service.record_snapshot(
                db, str(current_user.id), str(state.concept_id), "manual_recalculate"
            )
            updated += 1
        except Exception as e:
            logger.warning(f"Recalculate failed for concept {state.concept_id}: {e}")

    db.commit()
    return {"message": f"Recalculated {updated} concepts", "updated": updated}


@router.get("/graph")
def get_evolution_graph(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get concept relationship graph for visualization"""
    states = db.query(UserConceptState).filter(
        UserConceptState.user_id == current_user.id
    ).all()

    if not states:
        return {"nodes": [], "links": [], "stats": {}}

    concept_ids = [str(s.concept_id) for s in states]
    state_map = {str(s.concept_id): s for s in states}

    nodes = []
    for state in states:
        concept = db.query(Concept).filter(Concept.id == state.concept_id).first()
        if not concept:
            continue
        nodes.append({
            "id": str(concept.id),
            "label": concept.canonical_name,
            "type": "concept",
            "level": state.current_level,
            "domain": concept.domain,
            "size": 6 + (state.current_level * 2)
        })

    # Get relationships between user's concepts
    relationships = db.query(ConceptRelationship).filter(
        ConceptRelationship.parent_concept_id.in_(concept_ids),
        ConceptRelationship.child_concept_id.in_(concept_ids)
    ).all()

    links = []
    for rel in relationships:
        links.append({
            "source": str(rel.parent_concept_id),
            "target": str(rel.child_concept_id),
            "type": rel.relationship_type,
            "strength": rel.strength or 0.5
        })

    return {
        "nodes": nodes,
        "links": links,
        "stats": {
            "total_concepts": len(nodes),
            "total_relationships": len(links)
        }
    }


@router.get("/domain-summary")
def get_domain_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get aggregate concept levels by domain"""
    states = db.query(UserConceptState).filter(
        UserConceptState.user_id == current_user.id
    ).all()

    if not states:
        return {
            "domains": [],
            "total_concepts": 0,
            "overall_avg_level": 0
        }

    domain_data = {}
    all_levels = []

    for state in states:
        concept = db.query(Concept).filter(Concept.id == state.concept_id).first()
        if not concept:
            continue

        domain = concept.domain or "General"
        if domain not in domain_data:
            domain_data[domain] = {"levels": [], "top_concept": None, "top_level": 0}

        domain_data[domain]["levels"].append(state.current_level)
        all_levels.append(state.current_level)

        if state.current_level > domain_data[domain]["top_level"]:
            domain_data[domain]["top_level"] = state.current_level
            domain_data[domain]["top_concept"] = concept.canonical_name

    domains = []
    for d, info in sorted(domain_data.items(), key=lambda x: sum(x[1]["levels"]) / len(x[1]["levels"]), reverse=True):
        domains.append({
            "domain": d,
            "avg_level": round(sum(info["levels"]) / len(info["levels"]), 1),
            "concept_count": len(info["levels"]),
            "top_concept": info["top_concept"]
        })

    return {
        "domains": domains,
        "total_concepts": len(all_levels),
        "overall_avg_level": round(sum(all_levels) / len(all_levels), 1) if all_levels else 0
    }


def _get_recommendation(signals: Dict) -> Optional[str]:
    """Generate a recommendation based on missing signals"""
    if not signals:
        return "Upload documents to start tracking this concept."

    quiz = signals.get("quiz", 0)
    notes = signals.get("notes", 0)
    exposure = signals.get("exposure", 0)

    if quiz == 0 and notes == 0:
        return "Take a quiz or write notes to deepen your understanding."
    if quiz == 0:
        return "Take a quiz to verify your understanding."
    if notes == 0:
        return "Write study notes to reinforce this concept."
    if exposure < 0.7:
        return "Explore more materials on this topic."
    return None

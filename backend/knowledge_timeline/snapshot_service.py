"""
Snapshot Service
Calculates concept levels using 6 signals and records timeline snapshots.
"""
import math
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func as sql_func
from utils.logger import logger

# Signal weights
WEIGHTS = {
    "exposure": 0.15,
    "depth": 0.25,
    "notes": 0.20,
    "quiz": 0.25,
    "breadth": 0.10,
    "recency": 0.05,
}


class SnapshotService:
    """Calculates concept levels and records timeline snapshots"""

    def calculate_concept_level(
        self,
        db: Session,
        user_id: str,
        concept_id: str
    ) -> Dict:
        """
        Compute all 6 signals for a concept and return level + breakdown.

        Returns:
            {
                "level": int (1-5),
                "raw_score": float (0-1),
                "signals": {"exposure": float, ...},
                "document_count": int,
                "note_count": int,
                "quiz_accuracy": float or None
            }
        """
        from knowledge_timeline.models import DocumentConceptLink, Concept
        from documents.models import Document
        from notes.models import Note
        from quizzes.models import Quiz, QuizAttempt

        # Signal 1: Exposure — number of documents containing this concept
        doc_links = db.query(DocumentConceptLink).filter(
            DocumentConceptLink.concept_id == concept_id,
            DocumentConceptLink.user_id == user_id
        ).all()
        doc_count = len(doc_links)

        if doc_count == 0:
            exposure = 0.0
        elif doc_count == 1:
            exposure = 0.4
        elif doc_count == 2:
            exposure = 0.7
        else:
            exposure = 1.0

        # Signal 2: Depth — average depth_score across linked documents
        if doc_links:
            depth_scores = [l.depth_score for l in doc_links if l.depth_score is not None]
            avg_depth = sum(depth_scores) / len(depth_scores) if depth_scores else 0.3
            if avg_depth < 0.05:
                depth = 0.2
            elif avg_depth < 0.15:
                depth = 0.5
            elif avg_depth < 0.30:
                depth = 0.8
            else:
                depth = 1.0
        else:
            depth = 0.0

        # Signal 3: Notes — count notes related to this concept's documents
        doc_ids = [str(l.document_id) for l in doc_links]
        note_count = 0
        if doc_ids:
            note_count = db.query(Note).filter(
                Note.user_id == user_id,
                Note.document_id.in_(doc_ids)
            ).count()

        if note_count == 0:
            notes_signal = 0.0
        elif note_count == 1:
            notes_signal = 0.5
        elif note_count == 2:
            notes_signal = 0.8
        else:
            notes_signal = 1.0

        # Signal 4: Quiz — accuracy on quizzes from related documents
        quiz_accuracy = None
        quiz_signal = 0.0
        if doc_ids:
            attempts = db.query(QuizAttempt).join(Quiz).filter(
                QuizAttempt.user_id == user_id,
                Quiz.document_references.isnot(None)
            ).all()

            related_scores = []
            for attempt in attempts:
                quiz = db.query(Quiz).filter(Quiz.id == attempt.quiz_id).first()
                if quiz and quiz.document_references:
                    # Check if quiz references any of our concept's documents
                    quiz_doc_ids = [str(d) for d in quiz.document_references]
                    if any(did in quiz_doc_ids for did in doc_ids):
                        if attempt.score is not None:
                            related_scores.append(attempt.score)

            if related_scores:
                quiz_accuracy = sum(related_scores) / len(related_scores)
                quiz_signal = quiz_accuracy / 100.0  # Normalize from 0-100 to 0-1
                quiz_signal = min(quiz_signal, 1.0)

        # Signal 5: Breadth — distinct domains across linked documents
        if doc_ids:
            documents = db.query(Document).filter(
                Document.id.in_(doc_ids)
            ).all()
            all_domains = set()
            for doc in documents:
                if doc.domains:
                    for d in doc.domains:
                        all_domains.add(d.lower())
            domain_count = len(all_domains)
        else:
            domain_count = 0

        if domain_count <= 1:
            breadth = 0.3
        elif domain_count == 2:
            breadth = 0.6
        else:
            breadth = 1.0

        if doc_count == 0:
            breadth = 0.0

        # Signal 6: Recency — how recently user engaged with this concept
        now = datetime.now(timezone.utc)
        most_recent = None

        if doc_links:
            for link in doc_links:
                if link.created_at:
                    ts = link.created_at if link.created_at.tzinfo else link.created_at.replace(tzinfo=timezone.utc)
                    if most_recent is None or ts > most_recent:
                        most_recent = ts

        if most_recent is None:
            recency = 0.1
        else:
            days_ago = (now - most_recent).days
            if days_ago <= 7:
                recency = 1.0
            elif days_ago <= 30:
                recency = 0.7
            elif days_ago <= 90:
                recency = 0.4
            else:
                recency = 0.1

        # Calculate raw score and level
        raw_score = (
            exposure * WEIGHTS["exposure"]
            + depth * WEIGHTS["depth"]
            + notes_signal * WEIGHTS["notes"]
            + quiz_signal * WEIGHTS["quiz"]
            + breadth * WEIGHTS["breadth"]
            + recency * WEIGHTS["recency"]
        )

        level = max(1, min(5, math.ceil(raw_score * 5)))

        return {
            "level": level,
            "raw_score": round(raw_score, 4),
            "signals": {
                "exposure": round(exposure, 3),
                "depth": round(depth, 3),
                "notes": round(notes_signal, 3),
                "quiz": round(quiz_signal, 3),
                "breadth": round(breadth, 3),
                "recency": round(recency, 3),
            },
            "document_count": doc_count,
            "note_count": note_count,
            "quiz_accuracy": round(quiz_accuracy, 1) if quiz_accuracy is not None else None,
        }

    def record_snapshot(
        self,
        db: Session,
        user_id: str,
        concept_id: str,
        trigger: str
    ) -> Optional[Dict]:
        """Calculate level and save a snapshot + update user_concept_state"""
        from knowledge_timeline.models import ConceptSnapshot, UserConceptState

        result = self.calculate_concept_level(db, user_id, concept_id)

        # Create snapshot
        snapshot = ConceptSnapshot(
            user_id=user_id,
            concept_id=concept_id,
            level=result["level"],
            raw_score=result["raw_score"],
            signal_breakdown=result["signals"],
            document_count=result["document_count"],
            note_count=result["note_count"],
            quiz_accuracy=result["quiz_accuracy"],
            snapshot_trigger=trigger,
        )
        db.add(snapshot)

        # Upsert user_concept_state
        state = db.query(UserConceptState).filter(
            UserConceptState.user_id == user_id,
            UserConceptState.concept_id == concept_id,
        ).first()

        if state:
            state.current_level = result["level"]
            state.current_raw_score = result["raw_score"]
            state.current_signals = result["signals"]
            state.pending_snapshot = False
        else:
            state = UserConceptState(
                user_id=user_id,
                concept_id=concept_id,
                current_level=result["level"],
                current_raw_score=result["raw_score"],
                current_signals=result["signals"],
                first_seen_at=datetime.now(timezone.utc),
                pending_snapshot=False,
            )
            db.add(state)

        db.flush()
        return result

    def record_document_upload_snapshots(
        self,
        db: Session,
        user_id: str,
        document_id: str
    ):
        """Record snapshots for all concepts linked to a newly uploaded document"""
        from knowledge_timeline.models import DocumentConceptLink

        links = db.query(DocumentConceptLink).filter(
            DocumentConceptLink.document_id == document_id,
            DocumentConceptLink.user_id == user_id,
        ).all()

        for link in links:
            try:
                self.record_snapshot(db, user_id, str(link.concept_id), "document_upload")
            except Exception as e:
                logger.warning(f"Snapshot failed for concept {link.concept_id}: {e}")

        logger.info(f"Recorded {len(links)} snapshots for document upload {document_id}")

    def record_quiz_snapshot(
        self,
        db: Session,
        user_id: str,
        document_ids: List[str]
    ):
        """Record snapshots for concepts related to quiz documents"""
        from knowledge_timeline.models import DocumentConceptLink

        if not document_ids:
            return

        links = db.query(DocumentConceptLink).filter(
            DocumentConceptLink.document_id.in_(document_ids),
            DocumentConceptLink.user_id == user_id,
        ).all()

        seen_concepts = set()
        for link in links:
            cid = str(link.concept_id)
            if cid not in seen_concepts:
                seen_concepts.add(cid)
                try:
                    self.record_snapshot(db, user_id, cid, "quiz_attempt")
                except Exception as e:
                    logger.warning(f"Quiz snapshot failed for concept {cid}: {e}")

        logger.info(f"Recorded {len(seen_concepts)} snapshots for quiz submission")

    def record_note_snapshot(
        self,
        db: Session,
        user_id: str,
        document_id: str
    ):
        """Record snapshots for concepts related to a note's document"""
        from knowledge_timeline.models import DocumentConceptLink

        if not document_id:
            return

        links = db.query(DocumentConceptLink).filter(
            DocumentConceptLink.document_id == document_id,
            DocumentConceptLink.user_id == user_id,
        ).all()

        for link in links:
            try:
                self.record_snapshot(db, user_id, str(link.concept_id), "note_update")
            except Exception as e:
                logger.warning(f"Note snapshot failed for concept {link.concept_id}: {e}")

        logger.info(f"Recorded {len(links)} snapshots for note on document {document_id}")


# Singleton
snapshot_service = SnapshotService()

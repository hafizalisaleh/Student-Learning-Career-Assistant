"""
Concept Matcher Service
Embeds concepts, matches against existing canonical concepts using two-tier similarity,
and creates document-concept links with depth scores.
"""
import uuid
from typing import Dict, List, Any, Optional, Tuple
from sqlalchemy.orm import Session
from utils.logger import logger

# Similarity thresholds
MERGE_THRESHOLD = 0.92       # Above this: merge as alias
RELATED_THRESHOLD = 0.82     # Above this (but below merge): link as related
DEPTH_SIMILARITY_THRESHOLD = 0.7  # Chunk-to-concept similarity for depth score


class ConceptMatcher:
    """Matches extracted concepts against canonical concepts using embeddings"""

    def __init__(self):
        self._vector_store = None

    @property
    def vector_store(self):
        if self._vector_store is None:
            from core.vector_store import vector_store
            self._vector_store = vector_store
        return self._vector_store

    def process_document_concepts(
        self,
        db: Session,
        document_id: str,
        user_id: str,
        topic_data: Dict[str, Any]
    ) -> List[str]:
        """
        Main entry point: process all concepts from a document upload.

        1. Gathers raw concepts from topic_data
        2. Embeds and matches each against slca_concepts
        3. Creates/merges canonical concepts
        4. Creates DocumentConceptLink entries with depth scores
        5. Returns list of concept IDs that were linked
        """
        from knowledge_timeline.models import (
            Concept, DocumentConceptLink, ConceptRelationship
        )

        # Gather raw concepts from multiple extraction fields
        raw_concepts = set()
        for field in ['topics', 'concepts', 'technical_skills']:
            for item in topic_data.get(field, []):
                cleaned = item.strip()
                if cleaned and len(cleaned) > 2:
                    raw_concepts.add(cleaned)

        if not raw_concepts:
            logger.info(f"No concepts extracted for document {document_id}")
            return []

        logger.info(f"Processing {len(raw_concepts)} raw concepts for document {document_id}")

        linked_concept_ids = []

        for raw_text in raw_concepts:
            try:
                concept_id, match_type = self._match_or_create_concept(
                    db, raw_text, topic_data.get('domains', [])
                )

                if concept_id is None:
                    continue

                # Check if link already exists
                existing_link = db.query(DocumentConceptLink).filter(
                    DocumentConceptLink.document_id == document_id,
                    DocumentConceptLink.concept_id == concept_id
                ).first()

                if existing_link:
                    linked_concept_ids.append(str(concept_id))
                    continue

                # Compute depth score
                depth = self._compute_depth_score(document_id, raw_text)

                # Create document-concept link
                link = DocumentConceptLink(
                    document_id=document_id,
                    concept_id=concept_id,
                    user_id=user_id,
                    similarity_score=1.0 if match_type == "new" else None,
                    depth_score=depth,
                    raw_concept_text=raw_text[:200]
                )
                db.add(link)
                linked_concept_ids.append(str(concept_id))

            except Exception as e:
                logger.warning(f"Failed to process concept '{raw_text}': {e}")
                continue

        db.flush()
        logger.info(f"Linked {len(linked_concept_ids)} concepts to document {document_id}")
        return linked_concept_ids

    def _match_or_create_concept(
        self,
        db: Session,
        raw_text: str,
        domains: List[str]
    ) -> Tuple[Optional[uuid.UUID], str]:
        """
        Match a raw concept string against existing canonical concepts.

        Returns:
            (concept_id, match_type) where match_type is "merged", "related", or "new"
        """
        from knowledge_timeline.models import Concept, ConceptRelationship

        # Generate embedding for the raw concept
        try:
            embedding = self.vector_store._generate_embedding(raw_text)
        except Exception as e:
            logger.warning(f"Failed to embed concept '{raw_text}': {e}")
            return None, "error"

        # Query slca_concepts collection for similar concepts
        similar = self.vector_store.find_similar_concepts(raw_text, n_results=3)

        best_match = None
        best_similarity = 0.0

        for match in similar:
            sim = match.get("similarity", 0)
            if sim > best_similarity:
                best_similarity = sim
                best_match = match

        domain = domains[0] if domains else None

        # Tier 1: Merge (similarity > 0.92)
        if best_match and best_similarity > MERGE_THRESHOLD:
            concept_id_str = best_match["metadata"].get("concept_id")
            if concept_id_str:
                concept = db.query(Concept).filter(
                    Concept.id == concept_id_str
                ).first()
                if concept:
                    # Add as alias if not already present
                    aliases = concept.aliases or []
                    lower_aliases = [a.lower() for a in aliases]
                    if raw_text.lower() not in lower_aliases and raw_text.lower() != concept.canonical_name.lower():
                        aliases.append(raw_text)
                        concept.aliases = aliases
                    logger.info(f"Merged '{raw_text}' into existing concept '{concept.canonical_name}' (sim={best_similarity:.3f})")
                    return concept.id, "merged"

        # Tier 2: Link as related (0.82 - 0.92)
        if best_match and best_similarity > RELATED_THRESHOLD:
            related_concept_id_str = best_match["metadata"].get("concept_id")

            # Create new concept
            new_concept = Concept(
                canonical_name=raw_text,
                aliases=[],
                domain=domain
            )
            db.add(new_concept)
            db.flush()

            self._store_concept_embedding(new_concept, embedding)

            # Create relationship link
            if related_concept_id_str:
                try:
                    rel = ConceptRelationship(
                        parent_concept_id=related_concept_id_str,
                        child_concept_id=new_concept.id,
                        relationship_type="related",
                        strength=best_similarity
                    )
                    db.add(rel)
                except Exception:
                    pass  # Duplicate relationship is fine

            logger.info(f"Created concept '{raw_text}' linked to '{best_match['text']}' (sim={best_similarity:.3f})")
            return new_concept.id, "related"

        # Tier 3: New concept (< 0.82 or no matches)
        new_concept = Concept(
            canonical_name=raw_text,
            aliases=[],
            domain=domain
        )
        db.add(new_concept)
        db.flush()

        # Store embedding
        self._store_concept_embedding(new_concept, embedding)

        logger.info(f"Created new concept '{raw_text}' (no similar concepts found)")
        return new_concept.id, "new"

    def _store_concept_embedding(self, concept, embedding: List[float]):
        """Store a concept's embedding in PGVector chunks table as a special concept chunk."""
        try:
            import json
            from sqlalchemy import text as sql_text
            from config.database import SessionLocal

            concept_id_str = str(concept.id)
            embedding_str = '[' + ','.join(map(str, embedding)) + ']'

            db = SessionLocal()
            try:
                # Store as a concept chunk with special metadata
                db.execute(sql_text("""
                    INSERT INTO chunks (document_id, content, embedding, chunk_index, metadata, token_count)
                    VALUES (CAST(:doc_id AS uuid), :content, CAST(:embedding AS vector), 0, CAST(:metadata AS jsonb), :token_count)
                    ON CONFLICT DO NOTHING
                """), {
                    "doc_id": concept_id_str,
                    "content": concept.canonical_name,
                    "embedding": embedding_str,
                    "metadata": json.dumps({
                        "concept_id": concept_id_str,
                        "canonical_name": concept.canonical_name,
                        "domain": concept.domain or "",
                        "type": "concept"
                    }),
                    "token_count": len(concept.canonical_name.split())
                })
                db.commit()
                concept.embedding_id = concept_id_str
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"Failed to store concept embedding: {e}")

    def _compute_depth_score(self, document_id: str, concept_text: str) -> float:
        """
        Compute how deeply a document covers a concept.
        Ratio of document chunks semantically related to the concept.
        """
        try:
            return self.vector_store.get_chunk_concept_depth(
                document_id, concept_text, threshold=DEPTH_SIMILARITY_THRESHOLD
            )
        except Exception as e:
            logger.warning(f"Depth score computation failed: {e}")
            return 0.3  # Default moderate depth


# Singleton
concept_matcher = ConceptMatcher()

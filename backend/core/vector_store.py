"""
Vector store operations using PGVector for PostgreSQL-native vector search.
Replaces ChromaDB with pgvector for embedding storage and similarity search.
"""
import json
import uuid
from typing import List, Dict, Any, Optional, Literal
from sqlalchemy import text
from config.settings import settings
from config.database import SessionLocal
from core.ingestion.embedder import get_embedder
from utils.logger import logger
from utils.rag_llm_client import RAGLLMClient, safe_load_json

RAGMode = Literal["structured_output", "file_search", "nli_verification"]


def _coerce_answer_text(value: Any) -> str:
    """Normalize provider output into a displayable text answer."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = []
        for item in value:
            text = _coerce_answer_text(item)
            if text:
                parts.append(text)
        return "\n".join(parts)
    if isinstance(value, dict):
        for key in ("answer", "content", "text", "message"):
            if key in value:
                return _coerce_answer_text(value[key])
        try:
            return json.dumps(value, ensure_ascii=False)
        except Exception:
            return str(value)
    return str(value)


def _scope_query_text(query_text: str, section_title: Optional[str] = None) -> str:
    if not section_title:
        return query_text
    return f"Section: {section_title}\nQuestion: {query_text}"


def _normalize_section_pages(section_pages: Optional[List[int]]) -> List[int]:
    if not section_pages:
        return []
    normalized = []
    for page in section_pages:
        try:
            page_number = int(page)
        except (TypeError, ValueError):
            continue
        if page_number > 0 and page_number not in normalized:
            normalized.append(page_number)
    return normalized


def _extract_chunk_pages(metadata: Dict[str, Any]) -> List[int]:
    pages: List[int] = []
    for page in metadata.get("page_numbers") or []:
        try:
            page_number = int(page)
        except (TypeError, ValueError):
            continue
        if page_number > 0 and page_number not in pages:
            pages.append(page_number)

    page_number = metadata.get("page_number")
    try:
        single_page = int(page_number)
    except (TypeError, ValueError):
        single_page = None
    if single_page and single_page not in pages:
        pages.append(single_page)

    return pages


def _result_matches_section_pages(result: Dict[str, Any], section_pages: List[int]) -> bool:
    if not section_pages:
        return True
    result_pages = _extract_chunk_pages(result.get("metadata") or {})
    return any(page in section_pages for page in result_pages)


def _build_section_scope_label(section_title: Optional[str], section_pages: Optional[List[int]]) -> Optional[str]:
    pages = _normalize_section_pages(section_pages)
    if not section_title and not pages:
        return None
    if section_title and pages:
        return f'"{section_title}" (pages {", ".join(str(page) for page in pages)})'
    if section_title:
        return f'"{section_title}"'
    return f'pages {", ".join(str(page) for page in pages)}'


class VectorStore:
    """Manage vector storage and retrieval with PGVector and local HuggingFace embeddings"""

    def __init__(self):
        """Initialize vector store with PGVector and local embeddings"""
        self.embedder = get_embedder()
        self.answer_client = RAGLLMClient()
        logger.info(f"VectorStore initialized with PGVector (embedding dim={settings.EMBEDDING_DIMENSION})")

    def _get_db(self):
        """Get a database session"""
        return SessionLocal()

    def _generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for a document text using local HuggingFace model"""
        return self.embedder.generate_embedding(text)

    def _generate_query_embedding(self, text: str) -> List[float]:
        """Generate embedding for a query (with query instruction prefix)"""
        return self.embedder.generate_query_embedding(text)

    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """
        Chunk text into smaller pieces with overlap.
        Simple character-based chunking for backward compatibility.
        For Docling-aware chunking, use the ingestion pipeline instead.
        """
        chunks = []
        start = 0
        text_len = len(text)

        while start < text_len:
            end = min(start + chunk_size, text_len)

            if end < text_len:
                for sep in ['. ', '.\n', '! ', '!\n', '? ', '?\n']:
                    last_sep = text[start:end].rfind(sep)
                    if last_sep > chunk_size * 0.5:
                        end = start + last_sep + len(sep)
                        break

            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)

            start = end - overlap if end < text_len else text_len

        return chunks

    def add_document(
        self,
        document_id: str,
        text: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Add a single document to the vector store (chunks and embeds automatically).
        Stores chunks in PGVector chunks table.
        """
        try:
            chunks = self.chunk_text(text)
            if not chunks:
                return {"success": False, "error": "No valid chunks extracted from text"}

            logger.info(f"VectorStore: Created {len(chunks)} chunks for {document_id}")

            # Generate embeddings in batch
            embeddings = self.embedder.generate_embeddings_batch(chunks)
            logger.info(f"VectorStore: Generated {len(embeddings)} embeddings for {document_id}")

            db = self._get_db()
            try:
                for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                    chunk_meta = {
                        "document_id": document_id,
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                        "chunk_length": len(chunk)
                    }
                    if metadata:
                        chunk_meta.update({
                            k: str(v) if not isinstance(v, (str, int, float, bool)) else v
                            for k, v in metadata.items()
                        })

                    embedding_str = '[' + ','.join(map(str, embedding)) + ']'

                    db.execute(text("""
                        INSERT INTO chunks (document_id, content, embedding, chunk_index, metadata, token_count)
                        VALUES (CAST(:doc_id AS uuid), :content, CAST(:embedding AS vector), :chunk_index, CAST(:metadata AS jsonb), :token_count)
                    """), {
                        "doc_id": document_id,
                        "content": chunk,
                        "embedding": embedding_str,
                        "chunk_index": i,
                        "metadata": json.dumps(chunk_meta),
                        "token_count": len(chunk.split())
                    })

                db.commit()
                logger.info(f"VectorStore: Added document {document_id} with {len(chunks)} chunks")

                return {
                    "success": True,
                    "document_id": document_id,
                    "chunk_count": len(chunks),
                    "chunk_ids": [f"{document_id}_chunk_{i}" for i in range(len(chunks))]
                }
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error adding document {document_id}: {e}")
            return {"success": False, "error": str(e)}

    def query(
        self,
        query_text: str,
        n_results: int = 5,
        document_id: Optional[str] = None,
        user_id: Optional[str] = None,
        section_title: Optional[str] = None,
        section_pages: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Query PGVector for similar chunks using cosine similarity.
        """
        try:
            scoped_query_text = _scope_query_text(query_text, section_title)
            normalized_section_pages = _normalize_section_pages(section_pages)
            query_embedding = self._generate_query_embedding(scoped_query_text)
            embedding_str = '[' + ','.join(map(str, query_embedding)) + ']'
            fetch_count = n_results if not normalized_section_pages else max(n_results * 8, 40)

            db = self._get_db()
            try:
                result = db.execute(text("""
                    SELECT
                        c.id AS chunk_id,
                        c.document_id,
                        c.content,
                        c.metadata,
                        c.chunk_index,
                        c.token_count,
                        d.title AS document_title,
                        d.original_filename,
                        d.file_path,
                        1 - (c.embedding <=> CAST(:query_embedding AS vector)) AS similarity
                    FROM chunks c
                    JOIN documents d ON d.id = c.document_id
                    WHERE c.embedding IS NOT NULL
                      AND (:filter_user_id IS NULL OR d.user_id = CAST(:filter_user_id AS uuid))
                      AND (:filter_doc_id IS NULL OR c.document_id = CAST(:filter_doc_id AS uuid))
                    ORDER BY c.embedding <=> CAST(:query_embedding AS vector)
                    LIMIT :match_count
                """), {
                    "query_embedding": embedding_str,
                    "match_count": fetch_count,
                    "filter_doc_id": document_id,
                    "filter_user_id": user_id,
                })

                formatted_results = []
                for row in result:
                    meta = row.metadata if isinstance(row.metadata, dict) else json.loads(row.metadata or '{}')
                    meta = {
                        **meta,
                        "chunk_index": row.chunk_index,
                        "document_id": str(row.document_id),
                        "document_title": row.document_title,
                        "document_source": row.file_path or row.original_filename or row.document_title,
                    }
                    formatted_results.append({
                        "text": row.content,
                        "metadata": meta,
                        "distance": 1 - row.similarity,
                        "similarity": row.similarity
                    })

                if normalized_section_pages:
                    formatted_results = [
                        result_item
                        for result_item in formatted_results
                        if _result_matches_section_pages(result_item, normalized_section_pages)
                    ]

                formatted_results = formatted_results[:n_results]

                logger.info(f"Query returned {len(formatted_results)} results")
                return {
                    "success": True,
                    "query": query_text,
                    "results": formatted_results,
                    "count": len(formatted_results)
                }
            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error querying vector store: {e}")
            return {"success": False, "error": str(e), "results": []}

    def query_with_context(
        self,
        query_text: str,
        n_results: int = 5,
        document_id: Optional[str] = None,
        user_id: Optional[str] = None,
        section_title: Optional[str] = None,
        section_pages: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """Query and return combined context string for RAG."""
        results = self.query(
            query_text,
            n_results,
            document_id,
            user_id,
            section_title,
            section_pages,
        )

        if not results.get("success") or not results.get("results"):
            return {"context": "", "results": []}

        context_parts = []
        for i, result in enumerate(results["results"]):
            meta = result.get("metadata", {})
            pages = meta.get("page_numbers") or []
            page_label = ", ".join(str(page) for page in pages) if pages else meta.get("page_number", "Unknown")
            title = meta.get("document_title", f"Source {i+1}")
            modality = meta.get("source_modality") or meta.get("chunk_method") or "text"
            context_parts.append(
                f"[Source {i+1} | {title} | pages={page_label} | modality={modality}]\n{result['text']}"
            )

        return {"context": "\n\n".join(context_parts), "results": results["results"]}

    def rag_query(
        self,
        question: str,
        n_results: int = 5,
        document_id: Optional[str] = None,
        mode: RAGMode = "structured_output",
        user_id: Optional[str] = None,
        section_title: Optional[str] = None,
        section_pages: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Full RAG query: retrieves context from PGVector, generates answer with Groq.
        """
        logger.info(f"RAG query mode={mode}, question={question[:80]}")

        if mode == "file_search":
            return self._rag_file_search(question, document_id, user_id, section_title, section_pages)
        elif mode == "nli_verification":
            return self._rag_nli_verified(question, n_results, document_id, user_id, section_title, section_pages)
        else:
            return self._rag_structured_output(question, n_results, document_id, user_id, section_title, section_pages)

    def _rag_structured_output(
        self,
        question: str,
        n_results: int = 5,
        document_id: Optional[str] = None,
        user_id: Optional[str] = None,
        section_title: Optional[str] = None,
        section_pages: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """Structured output mode with provider-aware answer generation."""
        try:
            retrieval = self.query_with_context(
                question,
                n_results,
                document_id,
                user_id,
                section_title,
                section_pages,
            )
            context = retrieval.get("context", "")
            sources = retrieval.get("results", [])
            scope_label = _build_section_scope_label(section_title, section_pages)

            if not context:
                return {
                    "success": False,
                    "error": "No relevant context found",
                    "answer": "I couldn't find relevant information in your documents to answer this question.",
                    "mode": "structured_output"
                }

            citation_schema = {
                "type": "object",
                "properties": {
                    "answer": {
                        "type": "string",
                        "description": "The full answer in Markdown format with inline [N] citations matching source numbers"
                    },
                    "citations": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "source_index": {"type": "integer"},
                                "claim": {"type": "string"},
                                "source_quote": {"type": "string"}
                            },
                            "required": ["source_index", "claim", "source_quote"]
                        }
                    }
                },
                "required": ["answer", "citations"]
            }

            scope_line = f"\nSection scope: {scope_label}\n" if scope_label else "\n"
            prompt = f"""You are a helpful study assistant. Using ONLY the provided context, answer the user's question accurately.

CITATION RULES (MANDATORY):
- You MUST cite sources using numbered references [1], [2], [3] etc. that match the source numbers in the context below.
- Place citations INLINE immediately after the claim they support, e.g. "The cell membrane is semi-permeable [1]."
- If multiple sources support one claim, cite them all together: [1][3].
- Every factual statement MUST have at least one citation.
- Use Markdown formatting for your answer (bold, headers, lists).
- If the answer is not in the context, clearly state that.
- In the citations array, list every citation you used with the exact source quote that supports it.
{scope_line}
Context:
{context}

Question: {question}"""

            mode = "structured_output"
            response_text = self.answer_client.generate_json(
                prompt=prompt,
                temperature=0.2,
                max_tokens=1500,
                schema=citation_schema,
            )

            # Parse structured response
            try:
                structured = safe_load_json(response_text)
                if isinstance(structured, dict):
                    answer = _coerce_answer_text(structured.get("answer", ""))
                    raw_citations = structured.get("citations", [])
                    citations = raw_citations if isinstance(raw_citations, list) else []
                else:
                    answer = _coerce_answer_text(structured)
                    citations = []
            except Exception:
                answer = _coerce_answer_text(response_text)
                citations = []

            if not answer.strip():
                logger.warning(
                    "Structured output provider returned an empty answer; falling back to plain-text synthesis"
                )
                fallback_prompt = f"""You are a helpful study assistant. Using ONLY the provided context, answer the user's question accurately.

CITATION RULES (MANDATORY):
- You MUST cite sources using numbered references [1], [2], [3] etc. that match the source numbers in the context below.
- Place citations INLINE immediately after the claim they support, e.g. "The cell membrane is semi-permeable [1]."
- If multiple sources support one claim, cite them all together: [1][3].
- Every factual statement MUST have at least one citation.
- Use Markdown formatting for your answer (bold, headers, lists).
- If the answer is not in the context, clearly state that.
- Return only the final answer in Markdown, not JSON.
{scope_line}
Context:
{context}

Question: {question}"""
                answer = _coerce_answer_text(self.answer_client.generate_text(
                    prompt=fallback_prompt,
                    temperature=0.2,
                    max_tokens=1500,
                )).strip()

            if not answer.strip():
                answer = "I found relevant source material, but the answer generator returned an empty response. Please try again."

            return {
                "success": True,
                "answer": answer,
                "sources": sources,
                "citations_metadata": citations,
                "context_used": context[:500] + "..." if len(context) > 500 else context,
                "mode": mode
            }

        except Exception as e:
            error_str = str(e)
            user_msg = f"Error generating answer: {error_str}"
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                user_msg = "API quota exceeded. Please wait a few seconds or try again later."
            logger.error(f"Error in structured output RAG: {error_str}")
            return {
                "success": False,
                "error": error_str,
                "answer": user_msg,
                "mode": "structured_output"
            }

    def _rag_file_search(
        self,
        question: str,
        document_id: Optional[str] = None,
        user_id: Optional[str] = None,
        section_title: Optional[str] = None,
        section_pages: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """File Search mode placeholder - uses standard retrieval."""
        return self._rag_structured_output(question, 5, document_id, user_id, section_title, section_pages)

    def _rag_nli_verified(
        self,
        question: str,
        n_results: int = 5,
        document_id: Optional[str] = None,
        user_id: Optional[str] = None,
        section_title: Optional[str] = None,
        section_pages: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """NLI Verification mode: structured output + second verification pass."""
        try:
            structured_result = self._rag_structured_output(
                question,
                n_results,
                document_id,
                user_id,
                section_title,
                section_pages,
            )

            if not structured_result.get("success"):
                return {**structured_result, "mode": "nli_verification"}

            citations = structured_result.get("citations_metadata", [])
            sources = structured_result.get("sources", [])

            if not citations:
                return {**structured_result, "verified_citations": [], "mode": "nli_verification"}

            verified_citations = []
            for citation in citations:
                source_idx = citation.get("source_index", 0) - 1
                claim = citation.get("claim", "")
                source_quote = citation.get("source_quote", "")
                source_text = source_quote

                if 0 <= source_idx < len(sources):
                    source_text = sources[source_idx].get("text", source_quote)

                if not claim or not source_text:
                    continue

                try:
                    nli_prompt = f"""Determine if the source passage supports the claim. Return JSON with: is_supported (bool), confidence (0-1), reasoning (string).

Claim: "{claim}"
Source passage: "{source_text}"
"""
                    nli_response = self.answer_client.generate_json(
                        prompt=nli_prompt,
                        temperature=0.0,
                        max_tokens=400,
                        schema={
                            "type": "object",
                            "properties": {
                                "is_supported": {"type": "boolean"},
                                "confidence": {"type": "number"},
                                "reasoning": {"type": "string"},
                            },
                            "required": ["is_supported", "confidence", "reasoning"],
                        },
                    )
                    nli_result = safe_load_json(nli_response)
                    verified_citations.append({
                        "source_index": citation.get("source_index"),
                        "claim": claim,
                        "source_quote": source_quote,
                        "is_supported": nli_result.get("is_supported", False),
                        "confidence": nli_result.get("confidence", 0.0),
                        "reasoning": nli_result.get("reasoning", "")
                    })
                except Exception as nli_err:
                    logger.warning(f"NLI verification failed: {nli_err}")
                    verified_citations.append({
                        "source_index": citation.get("source_index"),
                        "claim": claim,
                        "source_quote": source_quote,
                        "is_supported": None,
                        "confidence": 0.0,
                        "reasoning": f"Verification failed: {str(nli_err)}"
                    })

            import re
            answer = structured_result.get("answer", "")
            failed_indices = {
                vc.get("source_index")
                for vc in verified_citations
                if vc.get("is_supported") is False and vc.get("confidence", 0) < 0.5
            }
            if failed_indices:
                for idx in failed_indices:
                    answer = answer.replace(f"[{idx}]", f"[~~{idx}~~]")

            verified_count = sum(1 for vc in verified_citations if vc.get("is_supported"))
            total_count = len(verified_citations)

            return {
                "success": True,
                "answer": answer,
                "sources": sources,
                "citations_metadata": citations,
                "verified_citations": verified_citations,
                "verification_summary": {
                    "total": total_count,
                    "verified": verified_count,
                    "failed": total_count - verified_count,
                    "score": round(verified_count / max(total_count, 1), 2)
                },
                "context_used": structured_result.get("context_used"),
                "mode": "nli_verification"
            }

        except Exception as e:
            logger.error(f"Error in NLI verified RAG: {e}")
            return {
                "success": False,
                "error": str(e),
                "answer": f"Error generating answer: {str(e)}",
                "mode": "nli_verification"
            }

    def get_document_chunks(self, document_id: str) -> Dict[str, Any]:
        """Get all chunks for a specific document from PGVector."""
        try:
            db = self._get_db()
            try:
                result = db.execute(text("""
                    SELECT id, content, chunk_index, metadata, token_count
                    FROM chunks
                    WHERE document_id = CAST(:doc_id AS uuid)
                    ORDER BY chunk_index
                """), {"doc_id": document_id})

                chunks = []
                for row in result:
                    meta = row.metadata if isinstance(row.metadata, dict) else json.loads(row.metadata or '{}')
                    chunks.append({
                        "id": str(row.id),
                        "text": row.content,
                        "metadata": meta
                    })

                return {
                    "success": True,
                    "document_id": document_id,
                    "chunk_count": len(chunks),
                    "chunks": chunks
                }
            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error getting document chunks: {e}")
            return {"success": False, "error": str(e)}

    def get_collection_stats(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get statistics about the PGVector store."""
        try:
            db = self._get_db()
            try:
                chunk_count = db.execute(text("""
                    SELECT COUNT(*)
                    FROM chunks c
                    JOIN documents d ON d.id = c.document_id
                    WHERE (:filter_user_id IS NULL OR d.user_id = CAST(:filter_user_id AS uuid))
                """), {"filter_user_id": user_id}).scalar()
                doc_count = db.execute(text("""
                    SELECT COUNT(DISTINCT c.document_id)
                    FROM chunks c
                    JOIN documents d ON d.id = c.document_id
                    WHERE (:filter_user_id IS NULL OR d.user_id = CAST(:filter_user_id AS uuid))
                """), {"filter_user_id": user_id}).scalar()
                doc_ids_result = db.execute(text("""
                    SELECT DISTINCT c.document_id::text
                    FROM chunks c
                    JOIN documents d ON d.id = c.document_id
                    WHERE (:filter_user_id IS NULL OR d.user_id = CAST(:filter_user_id AS uuid))
                    LIMIT 100
                """), {"filter_user_id": user_id})
                doc_ids = [row[0] for row in doc_ids_result]

                return {
                    "success": True,
                    "collection_name": "pgvector_chunks",
                    "total_chunks": chunk_count or 0,
                    "unique_documents": doc_count or 0,
                    "document_ids": doc_ids,
                    "sample_ids": doc_ids[:5]
                }
            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error getting collection stats: {e}")
            return {"success": False, "error": str(e)}

    def delete_document(self, document_id: str) -> Dict[str, Any]:
        """Delete all chunks for a document from PGVector."""
        try:
            db = self._get_db()
            try:
                result = db.execute(text("""
                    DELETE FROM chunks WHERE document_id = CAST(:doc_id AS uuid)
                """), {"doc_id": document_id})
                db.commit()
                deleted = result.rowcount

                logger.info(f"Deleted {deleted} chunks for document {document_id}")
                return {"success": True, "deleted_chunks": deleted}
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()

        except Exception as e:
            logger.error(f"Error deleting document {document_id}: {e}")
            return {"success": False, "error": str(e)}

    def clear_collection(self) -> Dict[str, Any]:
        """Clear all chunks from the PGVector store."""
        try:
            db = self._get_db()
            try:
                db.execute(text("DELETE FROM chunks"))
                db.commit()
                logger.info("PGVector chunks cleared")
                return {"success": True, "message": "Collection cleared"}
            except Exception:
                db.rollback()
                raise
            finally:
                db.close()
        except Exception as e:
            logger.error(f"Error clearing collection: {e}")
            return {"success": False, "error": str(e)}

    def find_similar_concepts(self, text_query: str, n_results: int = 5) -> List[Dict[str, Any]]:
        """
        Find similar concepts using PGVector similarity search.
        Used by knowledge_timeline/concept_matcher.py.
        """
        try:
            query_embedding = self._generate_query_embedding(text_query)
            embedding_str = '[' + ','.join(map(str, query_embedding)) + ']'

            db = self._get_db()
            try:
                result = db.execute(text("""
                    SELECT id, content, 1 - (embedding <=> CAST(:query AS vector)) AS similarity, metadata
                    FROM chunks
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> CAST(:query AS vector)
                    LIMIT :limit
                """), {"query": embedding_str, "limit": n_results})

                matches = []
                for row in result:
                    meta = row.metadata if isinstance(row.metadata, dict) else json.loads(row.metadata or '{}')
                    matches.append({
                        "text": row.content,
                        "metadata": meta,
                        "distance": 1 - row.similarity,
                        "similarity": row.similarity
                    })
                return matches
            finally:
                db.close()

        except Exception as e:
            logger.warning(f"Concept similarity search failed: {e}")
            return []

    def get_chunk_concept_depth(self, document_id: str, concept_text: str, threshold: float = 0.7) -> float:
        """Compute depth score: ratio of document chunks related to a concept."""
        try:
            db = self._get_db()
            try:
                total_chunks = db.execute(text("""
                    SELECT COUNT(*) FROM chunks WHERE document_id = CAST(:doc_id AS uuid)
                """), {"doc_id": document_id}).scalar()

                if not total_chunks:
                    return 0.3

                query_embedding = self._generate_query_embedding(concept_text)
                embedding_str = '[' + ','.join(map(str, query_embedding)) + ']'

                result = db.execute(text("""
                    SELECT COUNT(*) FROM chunks
                    WHERE document_id = CAST(:doc_id AS uuid)
                      AND embedding IS NOT NULL
                      AND 1 - (embedding <=> CAST(:query AS vector)) >= :threshold
                """), {"doc_id": document_id, "query": embedding_str, "threshold": threshold})

                related_count = result.scalar()
                return related_count / total_chunks
            finally:
                db.close()

        except Exception as e:
            logger.warning(f"Depth score computation failed: {e}")
            return 0.3

    # Legacy compatibility
    def add_documents(self, texts: List[str], metadata=None, document_id=None) -> str:
        doc_id = document_id or str(uuid.uuid4())
        full_text = "\n\n".join(texts)
        self.add_document(doc_id, full_text, metadata[0] if metadata else None)
        return doc_id

    def create_index(self, texts: List[str], collection_name: str = "documents") -> Dict[str, Any]:
        doc_id = str(uuid.uuid4())
        self.add_documents(texts, document_id=doc_id)
        return {"status": "success", "doc_id": doc_id, "chunk_count": len(texts)}


# Global vector store instance
vector_store = VectorStore()

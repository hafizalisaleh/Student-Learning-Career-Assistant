"""
RAG Retriever - Unified content retrieval for generators
Uses embeddings when available, falls back to full text extraction
"""
from typing import Dict, Any, Optional
from core.vector_store import vector_store
from core.rag_pipeline import rag_pipeline
from documents.upload_handler import upload_handler
from utils.logger import logger


class RAGRetriever:
    """
    Unified content retrieval for Summary, Notes, and Quiz generators.
    Implements hybrid approach: RAG chunks + fallback to full text.
    """

    def __init__(self):
        self.vector_store = vector_store
        self.rag_pipeline = rag_pipeline
        self.default_chunk_count = 5
        self.min_content_length = 500  # Minimum chars for valid content

    def get_content_for_generation(
        self,
        document,
        task_type: str = "general",
        chunk_count: int = 5
    ) -> Dict[str, Any]:
        """
        Get content for generation tasks using RAG when available.

        Args:
            document: Document ORM object with all fields
            task_type: Type of task (summary, notes, quiz) - used for query context
            chunk_count: Number of chunks to retrieve for RAG

        Returns:
            Dict with:
                - content: The text content to use
                - source: "rag" or "full_text"
                - chunks_used: Number of RAG chunks (if RAG)
                - metadata: Additional info
        """
        document_id = str(document.id)

        # Check if document has embeddings stored
        has_embeddings = bool(document.vector_db_reference_id)

        logger.info(f"RAGRetriever: Getting content for {document_id}, has_embeddings={has_embeddings}, task={task_type}")

        if has_embeddings:
            # Try RAG-based retrieval
            rag_result = self._get_rag_content(document_id, task_type, chunk_count)

            if rag_result.get("success") and len(rag_result.get("content", "")) >= self.min_content_length:
                logger.info(f"RAGRetriever: Using RAG content ({rag_result['chunks_used']} chunks, {len(rag_result['content'])} chars)")
                return {
                    "content": rag_result["content"],
                    "source": "rag",
                    "chunks_used": rag_result["chunks_used"],
                    "metadata": {
                        "retrieval_method": "vector_similarity",
                        "task_context": task_type
                    }
                }
            else:
                logger.warning(f"RAGRetriever: RAG content insufficient, falling back to full text")

        # Fallback to full text extraction
        full_text_result = self._get_full_text_content(document)

        if full_text_result.get("success"):
            logger.info(f"RAGRetriever: Using full text ({len(full_text_result['content'])} chars)")
            return {
                "content": full_text_result["content"],
                "source": "full_text",
                "chunks_used": 0,
                "metadata": {
                    "retrieval_method": "on_demand_extraction",
                    "content_type": document.content_type.value
                }
            }

        # If both fail, return error
        logger.error(f"RAGRetriever: Failed to get content for {document_id}")
        return {
            "content": "",
            "source": "error",
            "chunks_used": 0,
            "error": full_text_result.get("error", "Failed to retrieve content"),
            "metadata": {}
        }

    def _get_rag_content(
        self,
        document_id: str,
        task_type: str,
        chunk_count: int
    ) -> Dict[str, Any]:
        """
        Retrieve content using RAG (vector similarity search).

        Args:
            document_id: Document ID to query
            task_type: Task type for query context
            chunk_count: Number of chunks to retrieve

        Returns:
            Dict with content and metadata
        """
        try:
            # Create a query based on task type
            task_queries = {
                "summary": "main points key concepts important information overview",
                "notes": "detailed information concepts explanations examples definitions",
                "quiz": "facts definitions concepts terms important details testable information"
            }

            query = task_queries.get(task_type, "key information important content")

            # Query vector store for this specific document
            results = self.vector_store.query(
                query_text=query,
                n_results=chunk_count,
                document_id=document_id
            )

            if not results.get("success") or not results.get("results"):
                return {"success": False, "error": "No chunks retrieved"}

            # Combine chunks into content
            chunks = results["results"]
            content_parts = []

            for i, chunk in enumerate(chunks):
                text = chunk.get("text", "")
                if text:
                    content_parts.append(text)

            combined_content = "\n\n".join(content_parts)

            return {
                "success": True,
                "content": combined_content,
                "chunks_used": len(chunks),
                "similarity_scores": [c.get("similarity") for c in chunks]
            }

        except Exception as e:
            logger.error(f"RAGRetriever: RAG retrieval error: {e}")
            return {"success": False, "error": str(e)}

    def _get_full_text_content(self, document) -> Dict[str, Any]:
        """
        Extract full text content from document (on-demand extraction).

        Args:
            document: Document ORM object

        Returns:
            Dict with content and metadata
        """
        try:
            content = None

            if document.content_type.value == "youtube":
                logger.info(f"RAGRetriever: Extracting YouTube content from {document.file_url}")
                result = self.rag_pipeline.process_youtube(document.file_url, store_embeddings=False)
                if result.get("success"):
                    content = result.get("text")
                else:
                    return {"success": False, "error": result.get("error", "YouTube extraction failed")}

            elif document.content_type.value == "article":
                logger.info(f"RAGRetriever: Extracting web article from {document.file_url}")
                result = self.rag_pipeline.process_webpage(document.file_url, store_embeddings=False)
                if result.get("success"):
                    content = result.get("text")
                else:
                    return {"success": False, "error": result.get("error", "Article extraction failed")}

            elif document.file_path:
                logger.info(f"RAGRetriever: Extracting file content from {document.file_path}")
                result = upload_handler.extract_content_on_demand(
                    document.file_path,
                    document.content_type.value
                )
                if result.get("success"):
                    content = result.get("text")
                else:
                    return {"success": False, "error": result.get("error", "File extraction failed")}
            else:
                return {"success": False, "error": "No file path or URL available"}

            if content:
                return {"success": True, "content": content}
            else:
                return {"success": False, "error": "No content extracted"}

        except Exception as e:
            logger.error(f"RAGRetriever: Full text extraction error: {e}")
            return {"success": False, "error": str(e)}


# Global instance
rag_retriever = RAGRetriever()

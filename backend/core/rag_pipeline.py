"""
RAG Pipeline for content processing and retrieval.
Uses Docling for document conversion, local HuggingFace embeddings, and PGVector storage.
"""
import json
from typing import List, Dict, Any, Optional
from sqlalchemy import text as sql_text
from config.settings import settings
from core.content_extractors.youtube_extractor import YouTubeExtractor
from core.content_extractors.web_extractor import WebExtractor
from core.content_extractors.document_extractor import DocumentExtractor
from core.vector_store import vector_store
from core.ingestion.chunker import ChunkingConfig, DocumentChunk, create_chunker
from core.ingestion.embedder import get_embedder
from config.database import SessionLocal
from utils.gemini_client import gemini_client
from utils.logger import logger


class RAGPipeline:
    """Complete RAG pipeline using Docling + PGVector"""

    def __init__(self):
        self.youtube_extractor = YouTubeExtractor()
        self.web_extractor = WebExtractor()
        self.document_extractor = DocumentExtractor()
        self.vector_store = vector_store
        self.gemini_client = gemini_client
        self.embedder = get_embedder()
        self.chunker = create_chunker(
            ChunkingConfig(
                max_tokens=settings.DOCLING_HYBRID_MAX_TOKENS,
                merge_peers=settings.DOCLING_HYBRID_MERGE_PEERS,
                tokenizer_model=settings.DOCLING_HYBRID_TOKENIZER,
            )
        )

    def process_youtube(
        self,
        url: str,
        document_id: Optional[str] = None,
        store_embeddings: bool = True
    ) -> Dict[str, Any]:
        """Process YouTube video - extracts transcript and creates embeddings."""
        try:
            logger.info(f"RAG Pipeline: Processing YouTube URL: {url}")

            text = self.youtube_extractor.extract_text(url)
            if not text:
                return {"success": False, "error": "Could not extract transcript."}

            logger.info(f"RAG Pipeline: Transcript extracted - {len(text)} characters")

            try:
                metadata = self.youtube_extractor.get_metadata(url)
            except Exception:
                metadata = {"video_url": url, "source": "youtube"}

            try:
                text = self.gemini_client.ensure_english(text)
            except Exception as e:
                logger.warning(f"Could not translate to English: {e}")

            chunks = self.vector_store.chunk_text(text)
            doc_id = None
            chunk_count = len(chunks)

            if store_embeddings and document_id:
                try:
                    result = self.vector_store.add_document(
                        document_id=document_id,
                        text=text,
                        metadata={"source": "youtube", "url": url, **metadata}
                    )
                    if result.get("success"):
                        doc_id = document_id
                        chunk_count = result.get("chunk_count", len(chunks))
                except Exception as e:
                    logger.warning(f"Could not store embeddings: {e}")

            return {
                "text": text,
                "chunks": chunks,
                "chunk_count": chunk_count,
                "metadata": metadata,
                "doc_id": doc_id,
                "embeddings_stored": doc_id is not None,
                "success": True
            }
        except Exception as e:
            logger.error(f"RAG Pipeline: YouTube error: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    def process_webpage(
        self,
        url: str,
        document_id: Optional[str] = None,
        store_embeddings: bool = True
    ) -> Dict[str, Any]:
        """Process web article - extracts content and creates embeddings."""
        try:
            logger.info(f"RAG Pipeline: Processing webpage: {url}")

            text = self.web_extractor.extract_text(url)
            if not text:
                return {"success": False, "error": "Could not extract webpage content."}

            metadata = self.web_extractor.get_metadata(url)
            metadata["source"] = "web"
            metadata["url"] = url

            try:
                text = self.gemini_client.ensure_english(text)
            except Exception as e:
                logger.warning(f"Could not translate to English: {e}")

            chunks = self.vector_store.chunk_text(text)
            doc_id = None
            chunk_count = len(chunks)

            if store_embeddings and document_id:
                try:
                    result = self.vector_store.add_document(
                        document_id=document_id,
                        text=text,
                        metadata=metadata
                    )
                    if result.get("success"):
                        doc_id = document_id
                        chunk_count = result.get("chunk_count", len(chunks))
                except Exception as e:
                    logger.warning(f"Could not store embeddings: {e}")

            return {
                "text": text,
                "chunks": chunks,
                "chunk_count": chunk_count,
                "metadata": metadata,
                "doc_id": doc_id,
                "embeddings_stored": doc_id is not None,
                "success": True
            }
        except Exception as e:
            logger.error(f"RAG Pipeline: Webpage error: {e}")
            return {"success": False, "error": str(e)}

    def process_document(
        self,
        file_path: str,
        document_id: Optional[str] = None,
        store_embeddings: bool = True
    ) -> Dict[str, Any]:
        """
        Process document file using Docling for structured extraction.
        Uses HybridChunker for structure-aware chunking and local embeddings.
        """
        try:
            logger.info(f"RAG Pipeline: Processing document with Docling: {file_path}")

            # Extract with Docling (returns markdown + DoclingDocument)
            markdown_content, docling_doc, markdown_path = self.document_extractor.extract_with_docling(
                file_path,
                formula_enrichment=settings.DOCLING_FORMULA_ENRICHMENT,
            )

            if not markdown_content or markdown_content.startswith("[Error:"):
                ext = file_path.split('.')[-1].lower() if '.' in file_path else 'unknown'
                raise ValueError(f"Could not extract text from document {ext.upper()}.")

            # Handle vision image markers
            if markdown_content.startswith("__VISION_IMAGE__"):
                image_path = markdown_content.replace("__VISION_IMAGE__", "").replace("__", "")
                markdown_content = self.gemini_client.process_image_content(image_path)

            logger.info(f"RAG Pipeline: Extracted {len(markdown_content)} chars from document")

            # Chunk using Docling HybridChunker if we have a DoclingDocument
            doc_chunks = self.chunker.chunk_document(
                content=markdown_content,
                title=self.document_extractor.extract_title(markdown_content, file_path),
                source=file_path,
                metadata={"file_path": file_path, "source": "file"},
                docling_doc=docling_doc
            )

            ocr_pages = []
            if settings.DOCLING_ENABLE_PDF_PAGE_OCR and file_path.lower().endswith(".pdf"):
                ocr_pages = self.document_extractor.extract_pdf_page_ocr(
                    file_path=file_path,
                    dpi=settings.DOCLING_PDF_OCR_DPI,
                    min_chars=settings.DOCLING_PDF_OCR_MIN_CHARS,
                )

            if ocr_pages:
                logger.info("RAG Pipeline: Adding %s OCR-backed page chunks", len(ocr_pages))
                next_index = len(doc_chunks)
                current_pos = doc_chunks[-1].end_char + 2 if doc_chunks else 0
                ocr_chunks: List[DocumentChunk] = []
                document_title = self.document_extractor.extract_title(markdown_content, file_path)

                for offset, page in enumerate(ocr_pages):
                    page_text = (page.get("text") or "").strip()
                    if not page_text:
                        continue

                    page_metadata = {
                        "title": document_title,
                        "source": file_path,
                        "file_path": file_path,
                        "source_modality": "ocr_page",
                        "chunk_method": "pdf_page_ocr",
                        **(page.get("metadata") or {}),
                    }
                    end_char = current_pos + len(page_text)
                    ocr_chunks.append(
                        DocumentChunk(
                            content=page_text,
                            index=next_index + len(ocr_chunks),
                            start_char=current_pos,
                            end_char=end_char,
                            metadata=page_metadata,
                            token_count=len(page_text.split()),
                        )
                    )
                    current_pos = end_char + 2

                doc_chunks.extend(ocr_chunks)

            if doc_chunks:
                total_chunks = len(doc_chunks)
                for chunk in doc_chunks:
                    chunk.metadata["total_chunks"] = total_chunks

            logger.info(f"RAG Pipeline: Created {len(doc_chunks)} structured chunks")

            # Generate embeddings and store in PGVector
            chunk_count = 0
            if store_embeddings and document_id and doc_chunks:
                # Embed all chunks. The embedder returns new DocumentChunk objects,
                # so we must keep the returned list before inserting rows.
                doc_chunks = self.embedder.embed_chunks(doc_chunks)
                embedded_chunk_count = sum(1 for chunk in doc_chunks if chunk.embedding)
                if embedded_chunk_count == 0:
                    raise ValueError("Embedding generation produced no usable chunk vectors")

                # Store in PGVector
                db = SessionLocal()
                try:
                    for chunk in doc_chunks:
                        embedding_str = None
                        if chunk.embedding:
                            embedding_str = '[' + ','.join(map(str, chunk.embedding)) + ']'

                        chunk_meta = chunk.metadata.copy()
                        chunk_meta["document_id"] = document_id
                        chunk_meta["source"] = "file"
                        chunk_meta["file_path"] = file_path

                        db.execute(sql_text("""
                            INSERT INTO chunks (document_id, content, embedding, chunk_index, metadata, token_count)
                            VALUES (CAST(:doc_id AS uuid), :content, CAST(:embedding AS vector), :chunk_index, CAST(:metadata AS jsonb), :token_count)
                        """), {
                            "doc_id": document_id,
                            "content": chunk.content,
                            "embedding": embedding_str,
                            "chunk_index": chunk.index,
                            "metadata": json.dumps(chunk_meta),
                            "token_count": chunk.token_count
                        })

                    db.commit()
                    chunk_count = len(doc_chunks)
                    logger.info(
                        "RAG Pipeline: Indexed %s chunks for document %s (%s with embeddings)",
                        chunk_count,
                        document_id,
                        embedded_chunk_count,
                    )
                except Exception:
                    db.rollback()
                    raise
                finally:
                    db.close()
            else:
                chunk_count = len(doc_chunks)

            return {
                "text": markdown_content,
                "chunk_count": chunk_count,
                "metadata": {"file_path": file_path, "docling_markdown_path": markdown_path},
                "markdown_path": markdown_path,
                "doc_id": document_id if chunk_count > 0 else None,
                "embeddings_stored": chunk_count > 0 and store_embeddings,
                "success": True
            }

        except Exception as e:
            logger.error(f"RAG Pipeline: Document processing error: {e}")
            return {"success": False, "error": str(e)}

    def query_documents(
        self,
        question: str,
        document_id: Optional[str] = None,
        n_results: int = 5,
        mode: str = "structured_output",
        user_id: Optional[str] = None,
        section_title: Optional[str] = None,
        section_pages: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """Query documents using RAG."""
        return self.vector_store.rag_query(
            question=question,
            n_results=n_results,
            document_id=document_id,
            mode=mode,
            user_id=user_id,
            section_title=section_title,
            section_pages=section_pages,
        )

    def search_similar(
        self,
        query: str,
        document_id: Optional[str] = None,
        n_results: int = 5,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Search for similar chunks without generating an answer."""
        return self.vector_store.query(
            query_text=query,
            n_results=n_results,
            document_id=document_id,
            user_id=user_id,
        )

    def get_document_embeddings(self, document_id: str) -> Dict[str, Any]:
        return self.vector_store.get_document_chunks(document_id)

    def get_vector_store_stats(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        return self.vector_store.get_collection_stats(user_id=user_id)

    def delete_document_embeddings(self, document_id: str) -> Dict[str, Any]:
        return self.vector_store.delete_document(document_id)

    # Legacy compatibility
    def create_rag_assistant(self, texts: List[str]):
        return self.vector_store.create_index(texts)

    def query(self, query_engine, question: str) -> str:
        try:
            question = self.gemini_client.ensure_english(question)
            result = self.vector_store.rag_query(question)
            return result.get("answer", "Could not generate answer")
        except Exception as e:
            raise Exception(f"Error querying: {str(e)}")


# Global pipeline instance
rag_pipeline = RAGPipeline()

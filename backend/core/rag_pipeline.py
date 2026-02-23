"""
RAG Pipeline for content processing and retrieval
"""
from typing import List, Dict, Any, Optional
from core.content_extractors.youtube_extractor import YouTubeExtractor
from core.content_extractors.web_extractor import WebExtractor
from core.content_extractors.document_extractor import DocumentExtractor
from core.vector_store import vector_store
from utils.gemini_client import gemini_client
from utils.logger import logger


class RAGPipeline:
    """Complete RAG pipeline for content processing with real embeddings"""

    def __init__(self):
        """Initialize RAG pipeline"""
        self.youtube_extractor = YouTubeExtractor()
        self.web_extractor = WebExtractor()
        self.document_extractor = DocumentExtractor()
        self.vector_store = vector_store
        self.gemini_client = gemini_client

    def process_youtube(
        self,
        url: str,
        document_id: Optional[str] = None,
        store_embeddings: bool = True
    ) -> Dict[str, Any]:
        """
        Process YouTube video - extracts transcript and creates embeddings

        Args:
            url: YouTube video URL
            document_id: Optional document ID for storage
            store_embeddings: Whether to store in vector DB

        Returns:
            Processed data dictionary
        """
        try:
            logger.info(f"RAG Pipeline: Processing YouTube URL: {url}")

            # Extract transcript
            text = self.youtube_extractor.extract_text(url)

            if not text:
                error_msg = "Could not extract transcript. Possible reasons: API key not configured, video has no captions, or API request failed."
                logger.error(f"RAG Pipeline Error: {error_msg}")
                return {
                    "success": False,
                    "error": error_msg
                }

            logger.info(f"RAG Pipeline: Transcript extracted - {len(text)} characters, ~{len(text.split())} words")

            # Get metadata
            try:
                metadata = self.youtube_extractor.get_metadata(url)
                logger.info(f"RAG Pipeline: Metadata extracted - {metadata}")
            except Exception as meta_error:
                logger.warning(f"RAG Pipeline: Metadata extraction failed: {meta_error}")
                metadata = {"video_url": url, "source": "youtube"}

            # Ensure English
            try:
                logger.info("RAG Pipeline: Checking/translating to English...")
                text = self.gemini_client.ensure_english(text)
                logger.info(f"RAG Pipeline: Text processed - {len(text)} characters")
            except Exception as e:
                logger.warning(f"RAG Pipeline: Could not translate to English: {e}")

            # Chunk text
            logger.info("RAG Pipeline: Chunking text...")
            chunks = self.vector_store.chunk_text(text)
            logger.info(f"RAG Pipeline: Created {len(chunks)} chunks")

            # Store embeddings if requested and document_id provided
            doc_id = None
            chunk_count = len(chunks)

            if store_embeddings and document_id:
                try:
                    logger.info(f"RAG Pipeline: Creating embeddings for document {document_id}...")
                    result = self.vector_store.add_document(
                        document_id=document_id,
                        text=text,
                        metadata={"source": "youtube", "url": url, **metadata}
                    )
                    if result.get("success"):
                        doc_id = document_id
                        chunk_count = result.get("chunk_count", len(chunks))
                        logger.info(f"RAG Pipeline: Embeddings created - {chunk_count} chunks indexed")
                    else:
                        logger.warning(f"RAG Pipeline: Embedding storage failed: {result.get('error')}")
                except Exception as e:
                    logger.warning(f"RAG Pipeline: Could not store embeddings: {e}")

            result = {
                "text": text,
                "chunks": chunks,
                "chunk_count": chunk_count,
                "metadata": metadata,
                "doc_id": doc_id,
                "embeddings_stored": doc_id is not None,
                "success": True
            }

            logger.info(f"RAG Pipeline: YouTube processing completed - embeddings_stored={doc_id is not None}")
            return result

        except Exception as e:
            error_msg = f"RAG Pipeline Exception: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return {
                "success": False,
                "error": error_msg
            }

    def process_webpage(
        self,
        url: str,
        document_id: Optional[str] = None,
        store_embeddings: bool = True
    ) -> Dict[str, Any]:
        """
        Process web article - extracts content and creates embeddings

        Args:
            url: Webpage URL
            document_id: Optional document ID for storage
            store_embeddings: Whether to store in vector DB

        Returns:
            Processed data dictionary
        """
        try:
            logger.info(f"RAG Pipeline: Processing webpage: {url}")

            # Extract content
            text = self.web_extractor.extract_text(url)
            if not text:
                return {
                    "success": False,
                    "error": "Could not extract webpage content."
                }

            # Get metadata
            metadata = self.web_extractor.get_metadata(url)
            metadata["source"] = "web"
            metadata["url"] = url

            # Ensure English
            try:
                text = self.gemini_client.ensure_english(text)
            except Exception as e:
                logger.warning(f"Could not translate to English: {e}")

            # Chunk text
            chunks = self.vector_store.chunk_text(text)
            logger.info(f"RAG Pipeline: Created {len(chunks)} chunks from webpage")

            # Store embeddings
            doc_id = None
            chunk_count = len(chunks)

            if store_embeddings and document_id:
                try:
                    logger.info(f"RAG Pipeline: Creating embeddings for document {document_id}...")
                    result = self.vector_store.add_document(
                        document_id=document_id,
                        text=text,
                        metadata=metadata
                    )
                    if result.get("success"):
                        doc_id = document_id
                        chunk_count = result.get("chunk_count", len(chunks))
                        logger.info(f"RAG Pipeline: Embeddings created - {chunk_count} chunks indexed")
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
            logger.error(f"RAG Pipeline: Webpage processing error: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def process_document(
        self,
        file_path: str,
        document_id: Optional[str] = None,
        store_embeddings: bool = True
    ) -> Dict[str, Any]:
        """
        Process document file - extracts text segments and creates embeddings with metadata
        """
        try:
            logger.info(f"RAG Pipeline: Processing document: {file_path}")

            # Extract segments
            segments = self.document_extractor.extract_text(file_path)
            if not segments:
                ext = file_path.split('.')[-1].lower() if '.' in file_path else 'unknown'
                raise ValueError(f"Could not extract text from document {ext.upper()}.")

            all_text = ""
            all_chunks = []
            all_embeddings = []
            all_metadatas = []
            
            # Process each segment (e.g., page)
            for i, segment in enumerate(segments):
                text = segment.get("text", "")
                metadata = segment.get("metadata", {})
                
                # If segment is image, process with Vision
                if text.startswith("__GEMINI_IMAGE__"):
                    image_path = text.replace("__GEMINI_IMAGE__", "").replace("__", "")
                    text = self.gemini_client.process_image_content(image_path)
                    metadata["processed_by"] = "gemini_vision"

                all_text += text + "\n\n"
                
                # Chunk this segment
                segment_chunks = self.vector_store.chunk_text(text)
                
                if store_embeddings and document_id and segment_chunks:
                    for j, chunk in enumerate(segment_chunks):
                        # Generate embedding for this chunk
                        embedding = self.vector_store._generate_embedding(chunk)
                        
                        # Prepare metadata for this chunk
                        chunk_meta = metadata.copy()
                        chunk_meta.update({
                            "document_id": document_id,
                            "file_path": file_path,
                            "source": "file",
                            "chunk_index": len(all_chunks)
                        })
                        
                        all_chunks.append(chunk)
                        all_embeddings.append(embedding)
                        all_metadatas.append(chunk_meta)

            # Bulk add to vector store if we have chunks
            if all_chunks and store_embeddings and document_id:
                chunk_ids = [f"{document_id}_chunk_{i}" for i in range(len(all_chunks))]
                self.vector_store.collection.add(
                    ids=chunk_ids,
                    embeddings=all_embeddings,
                    documents=all_chunks,
                    metadatas=all_metadatas
                )
                logger.info(f"RAG Pipeline: Indexed {len(all_chunks)} total chunks for document {document_id}")

            total_chunks = len(all_chunks)
            return {
                "text": all_text,
                "chunk_count": total_chunks,
                "metadata": {"file_path": file_path},
                "doc_id": document_id if total_chunks > 0 else None,
                "embeddings_stored": total_chunks > 0 and store_embeddings,
                "success": True
            }

        except Exception as e:
            logger.error(f"RAG Pipeline: Document processing error: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def query_documents(
        self,
        question: str,
        document_id: Optional[str] = None,
        n_results: int = 5
    ) -> Dict[str, Any]:
        """
        Query documents using RAG - retrieves relevant chunks and generates answer

        Args:
            question: User question
            document_id: Optional - filter to specific document
            n_results: Number of chunks to retrieve

        Returns:
            Dict with answer and sources
        """
        return self.vector_store.rag_query(
            question=question,
            n_results=n_results,
            document_id=document_id
        )

    def search_similar(
        self,
        query: str,
        document_id: Optional[str] = None,
        n_results: int = 5
    ) -> Dict[str, Any]:
        """
        Search for similar chunks without generating an answer

        Args:
            query: Search query
            document_id: Optional - filter to specific document
            n_results: Number of results

        Returns:
            Similar chunks with similarity scores
        """
        return self.vector_store.query(
            query_text=query,
            n_results=n_results,
            document_id=document_id
        )

    def get_document_embeddings(self, document_id: str) -> Dict[str, Any]:
        """
        Get embeddings and chunks for a specific document

        Args:
            document_id: Document ID

        Returns:
            Document chunks with embedding info
        """
        return self.vector_store.get_document_chunks(document_id)

    def get_vector_store_stats(self) -> Dict[str, Any]:
        """
        Get vector store statistics

        Returns:
            Collection statistics
        """
        return self.vector_store.get_collection_stats()

    def delete_document_embeddings(self, document_id: str) -> Dict[str, Any]:
        """
        Delete embeddings for a document

        Args:
            document_id: Document ID

        Returns:
            Deletion result
        """
        return self.vector_store.delete_document(document_id)

    # Legacy methods for backward compatibility
    def create_rag_assistant(self, texts: List[str]):
        """Legacy method - creates index from texts"""
        return self.vector_store.create_index(texts)

    def query(self, query_engine, question: str) -> str:
        """Legacy method - queries using the engine"""
        try:
            question = self.gemini_client.ensure_english(question)
            result = self.vector_store.rag_query(question)
            return result.get("answer", "Could not generate answer")
        except Exception as e:
            raise Exception(f"Error querying: {str(e)}")


# Global pipeline instance
rag_pipeline = RAGPipeline()

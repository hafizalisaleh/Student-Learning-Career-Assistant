"""
Vector store operations using ChromaDB - Full RAG Implementation
"""
import os
import uuid
from typing import List, Dict, Any, Optional
import google.generativeai as genai
import chromadb
from chromadb.config import Settings
from config.settings import settings
from utils.logger import logger


class VectorStore:
    """Manage vector storage and retrieval with real embeddings"""

    def __init__(self):
        """Initialize vector store with ChromaDB and Google Embeddings"""
        # Configure Gemini
        self.api_key = os.getenv('GOOGLE_API_KEY')
        if self.api_key:
            genai.configure(api_key=self.api_key)

        self.model = genai.GenerativeModel(settings.GEMINI_MODEL)
        self.embedding_model = "models/text-embedding-004"

        # Initialize ChromaDB persistent client
        self.chroma_client = chromadb.PersistentClient(
            path=settings.VECTOR_DB_PATH,
            settings=Settings(anonymized_telemetry=False)
        )

        # Default collection for documents
        self.default_collection_name = "slca_documents"
        self._ensure_collection()

        logger.info(f"VectorStore initialized with ChromaDB at {settings.VECTOR_DB_PATH}")

    def _ensure_collection(self):
        """Ensure default collection exists"""
        try:
            self.collection = self.chroma_client.get_or_create_collection(
                name=self.default_collection_name,
                metadata={"description": "SLCA document embeddings"}
            )
            logger.info(f"Collection '{self.default_collection_name}' ready with {self.collection.count()} documents")
        except Exception as e:
            logger.error(f"Error creating collection: {e}")
            raise

    def _generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for a single text using Google's embedding model

        Args:
            text: Text to embed

        Returns:
            Embedding vector as list of floats
        """
        try:
            result = genai.embed_content(
                model=self.embedding_model,
                content=text,
                task_type="retrieval_document"
            )
            return result['embedding']
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise

    def _generate_query_embedding(self, text: str) -> List[float]:
        """
        Generate embedding for a query (uses different task type for better retrieval)

        Args:
            text: Query text to embed

        Returns:
            Embedding vector as list of floats
        """
        try:
            result = genai.embed_content(
                model=self.embedding_model,
                content=text,
                task_type="retrieval_query"
            )
            return result['embedding']
        except Exception as e:
            logger.error(f"Error generating query embedding: {e}")
            raise

    def chunk_text(
        self,
        text: str,
        chunk_size: int = 1000,
        overlap: int = 200
    ) -> List[str]:
        """
        Chunk text into smaller pieces with overlap

        Args:
            text: Input text
            chunk_size: Size of each chunk in characters
            overlap: Overlap between chunks

        Returns:
            List of text chunks
        """
        chunks = []
        start = 0
        text_len = len(text)

        while start < text_len:
            end = min(start + chunk_size, text_len)

            # Try to break at sentence boundary if possible
            if end < text_len:
                # Look for sentence endings
                for sep in ['. ', '.\n', '! ', '!\n', '? ', '?\n']:
                    last_sep = text[start:end].rfind(sep)
                    if last_sep > chunk_size * 0.5:  # At least 50% of chunk
                        end = start + last_sep + len(sep)
                        break

            chunk = text[start:end].strip()
            if chunk:  # Only add non-empty chunks
                chunks.append(chunk)

            start = end - overlap if end < text_len else text_len

        logger.info(f"Text chunked into {len(chunks)} pieces")
        return chunks

    def add_document(
        self,
        document_id: str,
        text: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Add a single document to the vector store (chunks and embeds automatically)

        Args:
            document_id: Unique document identifier
            text: Full document text
            metadata: Optional metadata for the document

        Returns:
            Dict with indexing results
        """
        try:
            logger.info(f"VectorStore: Adding document {document_id}, text length: {len(text)}")

            # Chunk the text
            chunks = self.chunk_text(text)

            if not chunks:
                logger.error(f"VectorStore: No valid chunks extracted from text for {document_id}")
                return {
                    "success": False,
                    "error": "No valid chunks extracted from text"
                }

            logger.info(f"VectorStore: Created {len(chunks)} chunks for {document_id}")

            # Generate embeddings for all chunks
            embeddings = []
            for i, chunk in enumerate(chunks):
                try:
                    embedding = self._generate_embedding(chunk)
                    embeddings.append(embedding)
                    if i == 0:
                        logger.info(f"VectorStore: First embedding generated, dimension: {len(embedding)}")
                except Exception as embed_error:
                    logger.error(f"VectorStore: Failed to generate embedding for chunk {i}: {embed_error}")
                    raise

            logger.info(f"VectorStore: Generated {len(embeddings)} embeddings for {document_id}")

            # Prepare IDs and metadata for each chunk
            chunk_ids = [f"{document_id}_chunk_{i}" for i in range(len(chunks))]
            chunk_metadata = []
            for i, chunk in enumerate(chunks):
                meta = {
                    "document_id": document_id,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "chunk_length": len(chunk)
                }
                if metadata:
                    meta.update({k: str(v) if not isinstance(v, (str, int, float, bool)) else v
                                for k, v in metadata.items()})
                chunk_metadata.append(meta)

            # Add to ChromaDB
            logger.info(f"VectorStore: Adding to ChromaDB collection: {len(chunk_ids)} chunks")
            self.collection.add(
                ids=chunk_ids,
                embeddings=embeddings,
                documents=chunks,
                metadatas=chunk_metadata
            )

            # Verify the data was stored
            stored_count = self.collection.count()
            logger.info(f"VectorStore: ChromaDB collection now has {stored_count} total chunks")
            logger.info(f"VectorStore: Added document {document_id} with {len(chunks)} chunks to vector store")

            return {
                "success": True,
                "document_id": document_id,
                "chunk_count": len(chunks),
                "chunk_ids": chunk_ids
            }

        except Exception as e:
            logger.error(f"Error adding document {document_id}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def add_documents(
        self,
        texts: List[str],
        metadata: Optional[List[Dict[str, Any]]] = None,
        document_id: Optional[str] = None
    ) -> str:
        """
        Add multiple text chunks to vector store (legacy compatibility)

        Args:
            texts: List of text chunks
            metadata: Optional metadata for each text
            document_id: Optional document ID

        Returns:
            Collection ID / Document ID
        """
        try:
            doc_id = document_id or str(uuid.uuid4())

            # Generate embeddings
            embeddings = [self._generate_embedding(text) for text in texts]

            # Prepare chunk IDs
            chunk_ids = [f"{doc_id}_chunk_{i}" for i in range(len(texts))]

            # Prepare metadata
            if metadata is None:
                metadata = [{"document_id": doc_id, "chunk_index": i} for i in range(len(texts))]
            else:
                for i, meta in enumerate(metadata):
                    meta["document_id"] = doc_id
                    meta["chunk_index"] = i

            # Add to collection
            self.collection.add(
                ids=chunk_ids,
                embeddings=embeddings,
                documents=texts,
                metadatas=metadata
            )

            logger.info(f"Added {len(texts)} chunks for document {doc_id}")
            return doc_id

        except Exception as e:
            logger.error(f"Error adding documents: {e}")
            raise

    def query(
        self,
        query_text: str,
        n_results: int = 5,
        document_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Query the vector store for similar documents

        Args:
            query_text: Query text
            n_results: Number of results to return
            document_id: Optional - filter to specific document

        Returns:
            Query results with similar chunks
        """
        try:
            # Generate query embedding
            query_embedding = self._generate_query_embedding(query_text)

            # Build where filter if document_id specified
            where_filter = None
            if document_id:
                where_filter = {"document_id": document_id}

            # Query ChromaDB
            results = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                where=where_filter,
                include=["documents", "metadatas", "distances"]
            )

            # Format results
            formatted_results = []
            if results['documents'] and results['documents'][0]:
                for i, doc in enumerate(results['documents'][0]):
                    formatted_results.append({
                        "text": doc,
                        "metadata": results['metadatas'][0][i] if results['metadatas'] else {},
                        "distance": results['distances'][0][i] if results['distances'] else None,
                        "similarity": 1 - results['distances'][0][i] if results['distances'] else None
                    })

            logger.info(f"Query returned {len(formatted_results)} results")

            return {
                "success": True,
                "query": query_text,
                "results": formatted_results,
                "count": len(formatted_results)
            }

        except Exception as e:
            logger.error(f"Error querying vector store: {e}")
            return {
                "success": False,
                "error": str(e),
                "results": []
            }

    def query_with_context(
        self,
        query_text: str,
        n_results: int = 5,
        document_id: Optional[str] = None
    ) -> str:
        """
        Query and return combined context for RAG

        Args:
            query_text: Query text
            n_results: Number of chunks to retrieve
            document_id: Optional - filter to specific document

        Returns:
            Combined context string from relevant chunks
        """
        results = self.query(query_text, n_results, document_id)

        if not results.get("success") or not results.get("results"):
            return ""

        # Combine relevant chunks
        context_parts = []
        for i, result in enumerate(results["results"]):
            context_parts.append(f"[Chunk {i+1}]: {result['text']}")

        return "\n\n".join(context_parts)

    def rag_query(
        self,
        question: str,
        n_results: int = 5,
        document_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Full RAG query: retrieve relevant chunks and generate answer

        Args:
            question: User question
            n_results: Number of chunks to retrieve
            document_id: Optional - filter to specific document

        Returns:
            Dict with answer and source chunks
        """
        try:
            # Get relevant context
            context = self.query_with_context(question, n_results, document_id)

            if not context:
                return {
                    "success": False,
                    "error": "No relevant context found",
                    "answer": "I couldn't find relevant information to answer your question."
                }

            # Generate answer using Gemini with context
            prompt = f"""Based on the following context, answer the question.
If the answer cannot be found in the context, say so.

Context:
{context}

Question: {question}

Answer:"""

            response = self.model.generate_content(prompt)

            # Get the chunks used
            query_results = self.query(question, n_results, document_id)

            return {
                "success": True,
                "answer": response.text,
                "sources": query_results.get("results", []),
                "context_used": context[:500] + "..." if len(context) > 500 else context
            }

        except Exception as e:
            logger.error(f"Error in RAG query: {e}")
            return {
                "success": False,
                "error": str(e),
                "answer": f"Error generating answer: {str(e)}"
            }

    def get_document_chunks(self, document_id: str) -> Dict[str, Any]:
        """
        Get all chunks for a specific document

        Args:
            document_id: Document ID

        Returns:
            Dict with all chunks and their metadata
        """
        try:
            results = self.collection.get(
                where={"document_id": document_id},
                include=["documents", "metadatas", "embeddings"]
            )

            chunks = []
            if results['ids']:
                for i, chunk_id in enumerate(results['ids']):
                    chunk_data = {
                        "id": chunk_id,
                        "text": results['documents'][i] if results['documents'] else None,
                        "metadata": results['metadatas'][i] if results['metadatas'] else {},
                    }
                    # Include embedding preview (first 10 dimensions)
                    if results['embeddings']:
                        chunk_data["embedding_preview"] = results['embeddings'][i][:10]
                        chunk_data["embedding_dimensions"] = len(results['embeddings'][i])
                    chunks.append(chunk_data)

            return {
                "success": True,
                "document_id": document_id,
                "chunk_count": len(chunks),
                "chunks": chunks
            }

        except Exception as e:
            logger.error(f"Error getting document chunks: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def get_collection_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the vector store collection

        Returns:
            Dict with collection statistics
        """
        try:
            count = self.collection.count()

            # Get sample to understand structure
            sample = self.collection.peek(limit=5)

            # Get unique document IDs
            all_data = self.collection.get(include=["metadatas"])
            unique_docs = set()
            if all_data['metadatas']:
                for meta in all_data['metadatas']:
                    if meta and 'document_id' in meta:
                        unique_docs.add(meta['document_id'])

            return {
                "success": True,
                "collection_name": self.default_collection_name,
                "total_chunks": count,
                "unique_documents": len(unique_docs),
                "document_ids": list(unique_docs),
                "sample_ids": sample['ids'][:5] if sample['ids'] else []
            }

        except Exception as e:
            logger.error(f"Error getting collection stats: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def delete_document(self, document_id: str) -> Dict[str, Any]:
        """
        Delete all chunks for a document from the vector store

        Args:
            document_id: Document ID to delete

        Returns:
            Dict with deletion result
        """
        try:
            # Get all chunk IDs for this document
            results = self.collection.get(
                where={"document_id": document_id}
            )

            if results['ids']:
                self.collection.delete(ids=results['ids'])
                logger.info(f"Deleted {len(results['ids'])} chunks for document {document_id}")
                return {
                    "success": True,
                    "deleted_chunks": len(results['ids'])
                }
            else:
                return {
                    "success": True,
                    "deleted_chunks": 0,
                    "message": "No chunks found for document"
                }

        except Exception as e:
            logger.error(f"Error deleting document {document_id}: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    def clear_collection(self) -> Dict[str, Any]:
        """
        Clear all documents from the collection (use with caution!)

        Returns:
            Dict with result
        """
        try:
            # Delete and recreate collection
            self.chroma_client.delete_collection(self.default_collection_name)
            self._ensure_collection()

            logger.info("Collection cleared")
            return {"success": True, "message": "Collection cleared"}

        except Exception as e:
            logger.error(f"Error clearing collection: {e}")
            return {"success": False, "error": str(e)}

    # Legacy compatibility methods
    def create_index(
        self,
        texts: List[str],
        collection_name: str = "documents"
    ) -> Dict[str, Any]:
        """Legacy method - now adds documents to vector store"""
        doc_id = str(uuid.uuid4())
        result = self.add_documents(texts, document_id=doc_id)
        return {
            "status": "success",
            "doc_id": doc_id,
            "chunk_count": len(texts)
        }

    def create_query_engine(
        self,
        index: Any,
        similarity_top_k: int = 3
    ):
        """Legacy method - returns config for querying"""
        return {
            "index": index,
            "k": similarity_top_k,
            "collection": self.collection
        }


# Global vector store instance
vector_store = VectorStore()

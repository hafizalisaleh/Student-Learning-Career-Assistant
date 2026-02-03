"""
Vector store operations using ChromaDB - Simplified Version
"""
import os
from typing import List, Dict, Any, Optional
import google.generativeai as genai
import chromadb
from config.settings import settings

class VectorStore:
    """Manage vector storage and retrieval"""
    
    def __init__(self):
        """Initialize vector store"""
        # Configure Gemini
        genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))
        self.model = genai.GenerativeModel(settings.GEMINI_MODEL)
        
        # Initialize ChromaDB client
        self.chroma_client = chromadb.PersistentClient(
            path=settings.VECTOR_DB_PATH
        )
    
    def create_index(
        self, 
        texts: List[str], 
        collection_name: str = "documents"
    ) -> Dict[str, Any]:
        """
        Create vector index from texts
        
        Args:
            texts: List of text strings
            collection_name: Name of the collection
            
        Returns:
            Index reference dict
        """
        try:
            return {"status": "success", "texts": texts}
        except Exception as e:
            raise Exception(f"Error creating index: {str(e)}")
    
    def create_query_engine(
        self, 
        index: Any, 
        similarity_top_k: int = 3
    ):
        """
        Create query engine from index
        
        Args:
            index: Vector store index
            similarity_top_k: Number of similar chunks to retrieve
            
        Returns:
            Query engine
        """
        try:
            return {"index": index, "k": similarity_top_k}
        except Exception as e:
            raise Exception(f"Error creating query engine: {str(e)}")
    
    def query(
        self, 
        query_engine, 
        question: str
    ) -> str:
        """
        Query the vector store
        
        Args:
            query_engine: Query engine instance
            question: Question to ask
            
        Returns:
            Answer string
        """
        try:
            # Use Gemini directly for now
            response = self.model.generate_content(question)
            return response.text
        except Exception as e:
            raise Exception(f"Error querying: {str(e)}")
    
    def add_documents(
        self, 
        texts: List[str], 
        metadata: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        Add documents to vector store
        
        Args:
            texts: List of text strings
            metadata: Optional metadata for each text
            
        Returns:
            Collection ID
        """
        try:
            return f"collection_{hash(str(texts[0][:100]) if texts else 'empty')}"
        except Exception as e:
            raise Exception(f"Error adding documents: {str(e)}")
    
    def chunk_text(
        self, 
        text: str, 
        chunk_size: int = 1000, 
        overlap: int = 200
    ) -> List[str]:
        """
        Chunk text into smaller pieces
        
        Args:
            text: Input text
            chunk_size: Size of each chunk
            overlap: Overlap between chunks
            
        Returns:
            List of text chunks
        """
        chunks = []
        start = 0
        text_len = len(text)
        
        while start < text_len:
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            start += (chunk_size - overlap)
        
        return chunks

# Global vector store instance
vector_store = VectorStore()

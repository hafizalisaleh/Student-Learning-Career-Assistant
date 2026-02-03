"""
RAG Pipeline for content processing and retrieval
"""
from typing import List, Dict, Any, Optional
from core.content_extractors.youtube_extractor import YouTubeExtractor
from core.content_extractors.web_extractor import WebExtractor
from core.content_extractors.document_extractor import DocumentExtractor
from core.vector_store import vector_store
from utils.gemini_client import gemini_client

class RAGPipeline:
    """Complete RAG pipeline for content processing"""
    
    def __init__(self):
        """Initialize RAG pipeline"""
        self.youtube_extractor = YouTubeExtractor()
        self.web_extractor = WebExtractor()
        self.document_extractor = DocumentExtractor()
        self.vector_store = vector_store
        self.gemini_client = gemini_client
    
    def process_youtube(self, url: str) -> Dict[str, Any]:
        """
        Process YouTube video - extracts transcript on-demand
        
        Args:
            url: YouTube video URL
            
        Returns:
            Processed data dictionary
        """
        try:
            print(f"RAG Pipeline: Processing YouTube URL: {url}")
            
            # Extract transcript
            text = self.youtube_extractor.extract_text(url)
            
            if not text:
                error_msg = "Could not extract transcript. Possible reasons: API key not configured, video has no captions, or API request failed."
                print(f"RAG Pipeline Error: {error_msg}")
                return {
                    "success": False,
                    "error": error_msg
                }
            
            print(f"RAG Pipeline: Transcript extracted - {len(text)} characters, ~{len(text.split())} words")
            
            # Get metadata
            try:
                metadata = self.youtube_extractor.get_metadata(url)
                print(f"RAG Pipeline: Metadata extracted - {metadata}")
            except Exception as meta_error:
                print(f"RAG Pipeline: Metadata extraction failed: {meta_error}")
                metadata = {"video_url": url}
            
            # Ensure English (skip if Gemini not configured)
            try:
                print("RAG Pipeline: Checking/translating to English...")
                text = self.gemini_client.ensure_english(text)
                print(f"RAG Pipeline: Text processed - {len(text)} characters")
            except Exception as e:
                print(f"RAG Pipeline Warning: Could not translate to English: {e}")
                # Continue with original text
            
            # Chunk text
            print("RAG Pipeline: Chunking text...")
            chunks = self.vector_store.chunk_text(text)
            print(f"RAG Pipeline: Created {len(chunks)} chunks")
            
            # Create index (optional, may fail)
            try:
                print("RAG Pipeline: Creating vector index...")
                index = self.vector_store.create_index(chunks)
                doc_id = index
                print("RAG Pipeline: Vector index created successfully")
            except Exception as e:
                print(f"RAG Pipeline Warning: Could not create vector index: {e}")
                index = None
                doc_id = None
            
            result = {
                "text": text,
                "chunks": chunks,
                "chunk_count": len(chunks),
                "metadata": metadata,
                "index": index,
                "doc_id": doc_id,
                "success": True
            }
            
            print("RAG Pipeline: YouTube processing completed successfully")
            print(f"RAG Pipeline Result: text_length={len(text)}, chunks={len(chunks)}, success=True")
            
            return result
            
        except Exception as e:
            error_msg = f"RAG Pipeline Exception: {str(e)}"
            print(error_msg)
            import traceback
            traceback.print_exc()
            return {
                "success": False,
                "error": error_msg
            }
    
    def process_webpage(self, url: str) -> Dict[str, Any]:
        """
        Process web article - extracts content on-demand
        
        Args:
            url: Webpage URL
            
        Returns:
            Processed data dictionary
        """
        try:
            # Extract content
            text = self.web_extractor.extract_text(url)
            if not text:
                return {
                    "success": False,
                    "error": "Could not extract webpage content. API key may not be configured."
                }
            
            # Get metadata
            metadata = self.web_extractor.get_metadata(url)
            
            # Ensure English (skip if Gemini not configured)
            try:
                text = self.gemini_client.ensure_english(text)
            except Exception as e:
                print(f"Warning: Could not translate to English: {e}")
                # Continue with original text
            
            # Chunk text
            chunks = self.vector_store.chunk_text(text)
            
            # Create index (optional, may fail)
            try:
                index = self.vector_store.create_index(chunks)
                doc_id = index
            except Exception as e:
                print(f"Warning: Could not create vector index: {e}")
                index = None
                doc_id = None
            
            return {
                "text": text,
                "chunks": chunks,
                "chunk_count": len(chunks),
                "metadata": metadata,
                "index": index,
                "doc_id": doc_id,
                "success": True
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def process_document(self, file_path: str) -> Dict[str, Any]:
        """
        Process document file (includes image processing with Gemini Vision)
        
        Args:
            file_path: Path to document
            
        Returns:
            Processed data dictionary
        """
        try:
            # Extract text (for images, this returns a special marker)
            text = self.document_extractor.extract_text(file_path)
            if not text:
                raise ValueError("Failed to extract document content")
            
            # Check if this is an image file (special marker detected)
            if text.startswith("__GEMINI_IMAGE__") and text.endswith("__"):
                # Extract image path from marker
                image_path = text.replace("__GEMINI_IMAGE__", "").replace("__", "")
                print(f"Detected image file, processing with Gemini Vision: {image_path}")
                
                # Process image directly with Gemini Vision
                text = self.gemini_client.process_image_content(image_path)
                print(f"Image processed successfully, extracted {len(text)} characters")
            else:
                # Regular text document - ensure English
                text = self.gemini_client.ensure_english(text)
            
            # Chunk text
            chunks = self.vector_store.chunk_text(text)
            
            # Create index
            index = self.vector_store.create_index(chunks)
            
            return {
                "text": text,
                "chunks": chunks,
                "metadata": {"file_path": file_path},
                "index": index,
                "success": True
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def create_rag_assistant(self, texts: List[str]):
        """
        Create RAG assistant from multiple texts
        
        Args:
            texts: List of text strings
            
        Returns:
            Query engine
        """
        try:
            index = self.vector_store.create_index(texts)
            query_engine = self.vector_store.create_query_engine(index)
            return query_engine
        except Exception as e:
            raise Exception(f"Error creating RAG assistant: {str(e)}")
    
    def query(self, query_engine, question: str) -> str:
        """
        Query the RAG system
        
        Args:
            query_engine: Query engine instance
            question: Question to ask
            
        Returns:
            Answer
        """
        try:
            # Ensure question is in English
            question = self.gemini_client.ensure_english(question)
            
            # Query
            answer = self.vector_store.query(query_engine, question)
            
            # Ensure answer is in English
            answer = self.gemini_client.ensure_english(answer)
            
            return answer
            
        except Exception as e:
            raise Exception(f"Error querying: {str(e)}")

# Global pipeline instance
rag_pipeline = RAGPipeline()

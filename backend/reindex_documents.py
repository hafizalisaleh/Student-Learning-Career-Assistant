import os
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent
sys.path.insert(0, str(backend_dir))

from dotenv import load_dotenv
from config.database import SessionLocal
from documents.models import Document
from users.models import User  # Required for foreign key validation
from core.rag_pipeline import rag_pipeline
from utils.logger import logger

def reindex_all():
    """Reprocess all documents to regenerate embeddings with current model/dimensions"""
    load_dotenv()
    
    db = SessionLocal()
    try:
        documents = db.query(Document).all()
        logger.info(f"Found {len(documents)} documents to re-index")
        
        success_count = 0
        fail_count = 0
        
        for doc in documents:
            if not doc.file_path:
                logger.warning(f"Skipping document {doc.id} ({doc.title}) - no file path")
                continue
                
            logger.info(f"Processing document: {doc.title} (ID: {doc.id})")
            
            # Use absolute path if it's relative
            file_path = doc.file_path
            if not os.path.isabs(file_path):
                file_path = os.path.join(backend_dir, file_path)
                
            if not os.path.exists(file_path):
                logger.error(f"File not found: {file_path}")
                fail_count += 1
                continue
            
            try:
                # Delete existing embeddings first
                rag_pipeline.delete_document_embeddings(str(doc.id))
                
                # Reprocess
                result = rag_pipeline.process_document(
                    file_path=file_path,
                    document_id=str(doc.id),
                    store_embeddings=True
                )
                
                if result.get("success"):
                    logger.info(f"Successfully re-indexed {doc.title}: {result.get('chunk_count')} chunks")
                    # Update database metadata if needed
                    doc.doc_metadata = doc.doc_metadata or {}
                    doc.doc_metadata["embeddings_stored"] = True
                    doc.doc_metadata["chunk_count"] = result.get("chunk_count", 0)
                    doc.doc_metadata["reindexed_at"] = "2026-02-23"
                    success_count += 1
                else:
                    logger.error(f"Failed to re-index {doc.title}: {result.get('error')}")
                    fail_count += 1
                    
            except Exception as e:
                logger.error(f"Error re-indexing document {doc.id}: {str(e)}")
                fail_count += 1
        
        db.commit()
        logger.info("=" * 50)
        logger.info(f"Re-indexing complete: {success_count} success, {fail_count} failed")
        logger.info("=" * 50)
        
    finally:
        db.close()

if __name__ == "__main__":
    reindex_all()

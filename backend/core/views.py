"""
Vector Store and RAG API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List, Any
from users.auth import get_current_user
from users.models import User
from core.rag_pipeline import rag_pipeline
from utils.logger import logger

router = APIRouter(prefix="/api/vectors", tags=["vectors"])


# Request/Response Models
class QueryRequest(BaseModel):
    """RAG query request"""
    question: str
    document_id: Optional[str] = None
    n_results: int = 5
    mode: str = "structured_output"  # structured_output | file_search | nli_verification


class SearchRequest(BaseModel):
    """Similarity search request"""
    query: str
    document_id: Optional[str] = None
    n_results: int = 5


class QueryResponse(BaseModel):
    """RAG query response"""
    success: bool
    answer: Optional[str] = None
    sources: Optional[List[Any]] = None
    context_used: Optional[str] = None
    error: Optional[str] = None
    mode: Optional[str] = None
    grounding_metadata: Optional[Any] = None
    citations_metadata: Optional[List[Any]] = None
    verified_citations: Optional[List[Any]] = None
    verification_summary: Optional[Any] = None


class SearchResponse(BaseModel):
    """Similarity search response"""
    success: bool
    query: Optional[str] = None
    results: Optional[List[Any]] = None
    count: int = 0
    error: Optional[str] = None


# Endpoints
@router.get("/stats")
def get_vector_store_stats(
    current_user: User = Depends(get_current_user)
):
    """
    Get vector store statistics

    Returns:
        Collection statistics including total chunks, unique documents, etc.
    """
    try:
        stats = rag_pipeline.get_vector_store_stats()
        return stats
    except Exception as e:
        logger.error(f"Error getting vector store stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/documents/{document_id}/embeddings")
def get_document_embeddings(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get all embeddings and chunks for a specific document

    Args:
        document_id: Document ID

    Returns:
        Document chunks with embedding previews
    """
    try:
        result = rag_pipeline.get_document_embeddings(document_id)

        if not result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=result.get("error", "Document not found in vector store")
            )

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting document embeddings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/query", response_model=QueryResponse)
def query_documents(
    request: QueryRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Query documents using RAG - retrieves relevant chunks and generates answer

    Args:
        request: Query request with question and optional filters

    Returns:
        Generated answer with source chunks
    """
    try:
        logger.info(f"RAG Query from user {current_user.email} [mode={request.mode}]: {request.question[:100]}")

        result = rag_pipeline.query_documents(
            question=request.question,
            document_id=request.document_id,
            n_results=request.n_results,
            mode=request.mode
        )

        return QueryResponse(
            success=result.get("success", False),
            answer=result.get("answer"),
            sources=result.get("sources"),
            context_used=result.get("context_used"),
            error=result.get("error"),
            mode=result.get("mode"),
            grounding_metadata=result.get("grounding_metadata"),
            citations_metadata=result.get("citations_metadata"),
            verified_citations=result.get("verified_citations"),
            verification_summary=result.get("verification_summary")
        )
    except Exception as e:
        logger.error(f"Error in RAG query: {e}")
        return QueryResponse(
            success=False,
            error=str(e)
        )


@router.post("/search", response_model=SearchResponse)
def search_similar(
    request: SearchRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Search for similar chunks without generating an answer

    Args:
        request: Search request with query and optional filters

    Returns:
        Similar chunks with similarity scores
    """
    try:
        logger.info(f"Similarity search from user {current_user.email}: {request.query[:100]}")

        result = rag_pipeline.search_similar(
            query=request.query,
            document_id=request.document_id,
            n_results=request.n_results
        )

        return SearchResponse(
            success=result.get("success", False),
            query=result.get("query"),
            results=result.get("results"),
            count=result.get("count", 0),
            error=result.get("error")
        )
    except Exception as e:
        logger.error(f"Error in similarity search: {e}")
        return SearchResponse(
            success=False,
            error=str(e)
        )


@router.delete("/documents/{document_id}")
def delete_document_embeddings(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete all embeddings for a document from the vector store

    Args:
        document_id: Document ID

    Returns:
        Deletion result
    """
    try:
        result = rag_pipeline.delete_document_embeddings(document_id)

        if not result.get("success"):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "Failed to delete embeddings")
            )

        logger.info(f"Deleted embeddings for document {document_id} by user {current_user.email}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document embeddings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/health")
def vector_store_health():
    """
    Check vector store health (no auth required)

    Returns:
        Health status
    """
    try:
        stats = rag_pipeline.get_vector_store_stats()
        return {
            "status": "healthy",
            "collection": stats.get("collection_name"),
            "total_chunks": stats.get("total_chunks", 0)
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }


@router.post("/test-embedding")
def test_embedding(
    current_user: User = Depends(get_current_user)
):
    """
    Test endpoint to verify embedding generation works

    Returns:
        Test results with embedding sample
    """
    try:
        from core.vector_store import vector_store
        import uuid

        test_text = "This is a test document for verifying RAG pipeline functionality. Machine learning and artificial intelligence are transforming education."
        test_doc_id = f"test_{uuid.uuid4().hex[:8]}"

        logger.info(f"Testing embedding with doc_id: {test_doc_id}")

        # Test embedding generation
        result = vector_store.add_document(
            document_id=test_doc_id,
            text=test_text,
            metadata={"source": "test", "type": "embedding_test"}
        )

        logger.info(f"Test embedding result: {result}")

        # Get stats after adding
        stats = vector_store.get_collection_stats()

        # Clean up test document
        cleanup = vector_store.delete_document(test_doc_id)

        return {
            "success": result.get("success"),
            "test_doc_id": test_doc_id,
            "chunks_created": result.get("chunk_count"),
            "total_chunks_after": stats.get("total_chunks"),
            "cleanup_success": cleanup.get("success"),
            "error": result.get("error")
        }
    except Exception as e:
        logger.error(f"Test embedding failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }


@router.post("/reprocess/{document_id}")
def reprocess_document_embeddings(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Reprocess a document to regenerate its embeddings

    Args:
        document_id: Document ID to reprocess

    Returns:
        Processing result
    """
    from config.database import SessionLocal
    from documents.models import Document

    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return {"success": False, "error": "Document not found"}

        if not doc.file_path:
            return {"success": False, "error": "Document has no file path"}

        logger.info(f"Reprocessing document {document_id}: {doc.file_path}")

        # Delete existing embeddings
        delete_result = rag_pipeline.delete_document_embeddings(document_id)
        logger.info(f"Deleted existing embeddings: {delete_result}")

        # Reprocess
        result = rag_pipeline.process_document(
            file_path=doc.file_path,
            document_id=document_id,
            store_embeddings=True
        )

        logger.info(f"Reprocess result: {result}")

        if result.get("success") and result.get("embeddings_stored"):
            doc.vector_db_reference_id = document_id
            doc.doc_metadata = doc.doc_metadata or {}
            doc.doc_metadata["embeddings_stored"] = True
            doc.doc_metadata["chunk_count"] = result.get("chunk_count", 0)
            db.commit()

        return {
            "success": result.get("success"),
            "embeddings_stored": result.get("embeddings_stored"),
            "chunk_count": result.get("chunk_count"),
            "error": result.get("error")
        }
    except Exception as e:
        logger.error(f"Reprocess failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {"success": False, "error": str(e)}
    finally:
        db.close()


@router.post("/file-search/index/{document_id}")
def index_for_file_search(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Index a document for Gemini File Search mode.
    Creates a File Search store and uploads the document.
    """
    from config.database import SessionLocal
    from documents.models import Document
    from core.file_search_manager import file_search_manager

    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )

        if not doc.file_path:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Document has no file path"
            )

        # Check if file exists
        import os
        if not os.path.exists(doc.file_path):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File not found at path: {doc.file_path}"
            )

        logger.info(f"Indexing document {document_id} for file search: {doc.file_path}")

        result = file_search_manager.create_store_and_upload(
            document_id=document_id,
            file_path=doc.file_path,
            display_name=doc.title
        )

        if result.get("success"):
            # Update document metadata
            doc.doc_metadata = doc.doc_metadata or {}
            doc.doc_metadata["file_search_indexed"] = True
            doc.doc_metadata["file_search_store"] = result.get("store_name")
            db.commit()

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File search indexing failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    finally:
        db.close()


@router.get("/file-search/status/{document_id}")
def file_search_status(
    document_id: str,
    current_user: User = Depends(get_current_user)
):
    """Check if a document has been indexed for File Search"""
    from core.file_search_manager import file_search_manager

    store_name = file_search_manager.get_or_create_store(document_id)
    return {
        "indexed": store_name is not None,
        "store_name": store_name
    }

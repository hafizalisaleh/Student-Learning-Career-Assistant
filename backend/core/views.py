"""
Vector Store and RAG API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List, Any
from sqlalchemy.orm import Session
from config.database import get_db, SessionLocal
from config.settings import settings
from documents.models import Document
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
    section_title: Optional[str] = None
    section_pages: Optional[List[int]] = None


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


def _get_owned_document_or_404(
    db: Session,
    document_id: str,
    current_user: User,
) -> Document:
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == current_user.id,
    ).first()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    return document


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
        stats = rag_pipeline.get_vector_store_stats(user_id=str(current_user.id))
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get all embeddings and chunks for a specific document

    Args:
        document_id: Document ID

    Returns:
        Document chunks with embedding previews
    """
    try:
        _get_owned_document_or_404(db, document_id, current_user)
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
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

        if request.document_id:
            _get_owned_document_or_404(db, request.document_id, current_user)

        result = rag_pipeline.query_documents(
            question=request.question,
            document_id=request.document_id,
            n_results=request.n_results,
            mode=request.mode,
            user_id=str(current_user.id),
            section_title=request.section_title,
            section_pages=request.section_pages,
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
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

        if request.document_id:
            _get_owned_document_or_404(db, request.document_id, current_user)

        result = rag_pipeline.search_similar(
            query=request.query,
            document_id=request.document_id,
            n_results=request.n_results,
            user_id=str(current_user.id),
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete all embeddings for a document from the vector store

    Args:
        document_id: Document ID

    Returns:
        Deletion result
    """
    try:
        _get_owned_document_or_404(db, document_id, current_user)
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
    db = SessionLocal()
    try:
        doc = _get_owned_document_or_404(db, document_id, current_user)

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
            doc.doc_metadata["docling_markdown_path"] = result.get("markdown_path")
            if result.get("text"):
                doc.extracted_text = result.get("text")
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
    from core.file_search_manager import file_search_manager

    db = SessionLocal()
    try:
        doc = _get_owned_document_or_404(db, document_id, current_user)

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
    db = SessionLocal()
    try:
        _get_owned_document_or_404(db, document_id, current_user)
        store_name = file_search_manager.get_or_create_store(document_id)
        return {
            "indexed": store_name is not None,
            "store_name": store_name
        }
    finally:
        db.close()


# --- Vision Query ---

class VisionQueryRequest(BaseModel):
    """Vision-aware RAG query request"""
    question: str
    document_id: Optional[str] = None
    n_results: int = settings.VISION_QUERY_DEFAULT_LIMIT
    selected_page: Optional[int] = None
    selected_image_data: Optional[str] = None


@router.post("/vision-query")
def vision_query(
    request: VisionQueryRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Vision-aware RAG query. Retrieves chunks, enriches with tables/images
    from source documents, and routes to vision model when needed.
    """
    try:
        from core.vision_service import vision_service

        logger.info(f"Vision query from {current_user.email}: {request.question[:100]}")
        return vision_service.answer_question(
            query=request.question,
            document_id=request.document_id,
            user_id=str(current_user.id),
            limit=request.n_results,
            selected_page=request.selected_page,
            selected_image_data=request.selected_image_data,
        )

    except Exception as e:
        logger.error(f"Vision query error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return {
            "success": False,
            "error": str(e),
            "answer": f"Error: {str(e)}",
            "mode": "vision",
            "vision_used": False
        }


# --- Content Revision ---

class RevisionRequest(BaseModel):
    """Request to revise AI-generated content"""
    current_content: str
    revision_prompt: str
    content_type: str  # mindmap | diagram | summary | note
    document_title: str = ""


class RevisionResponse(BaseModel):
    """Revision response"""
    success: bool
    revised_content: str
    content_type: str
    error: Optional[str] = None


@router.post("/revise", response_model=RevisionResponse)
def revise_content_endpoint(
    request: RevisionRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Revise AI-generated content (mindmap, diagram, summary, note)
    based on a natural language revision prompt.
    """
    from core.revision import revise_content

    valid_types = ["mindmap", "diagram", "summary", "note"]
    if request.content_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid content_type. Must be one of: {', '.join(valid_types)}"
        )

    logger.info(
        f"User {current_user.email} revising {request.content_type}: "
        f"{request.revision_prompt[:60]}"
    )

    result = revise_content(
        current_content=request.current_content,
        revision_prompt=request.revision_prompt,
        content_type=request.content_type,
        document_title=request.document_title,
    )

    return RevisionResponse(**result)


# --- Knowledge Graph ---

@router.get("/knowledge-graph")
def get_knowledge_graph(
    current_user: User = Depends(get_current_user)
):
    """
    Build a knowledge graph from the user's documents, notes, and embeddings.
    Returns {nodes, links, stats} for react-force-graph.
    """
    from config.database import SessionLocal
    from documents.models import Document, ProcessingStatus
    from core.knowledge_graph import build_knowledge_graph

    db = SessionLocal()
    try:
        # Get all completed documents
        docs = db.query(Document).filter(
            Document.user_id == current_user.id,
            Document.processing_status == ProcessingStatus.COMPLETED,
        ).all()

        documents_data = []
        for doc in docs:
            metadata = doc.doc_metadata or {}
            documents_data.append({
                "id": str(doc.id),
                "title": doc.title,
                "content_type": doc.content_type.value if doc.content_type else None,
                "topics": doc.topics or [],
                "keywords": doc.keywords or [],
                "domains": doc.domains or [],
                "table_of_contents": metadata.get("table_of_contents") or [],
            })

        # Get all notes
        from notes.models import Note as NoteModel
        notes = db.query(NoteModel).filter(
            NoteModel.user_id == current_user.id
        ).all()

        notes_data = []
        for note in notes:
            notes_data.append({
                "id": str(note.id),
                "title": note.title,
                "document_id": str(note.document_id) if note.document_id else "",
                "note_type": note.note_type,
                "tags": note.tags or [],
            })

        graph = build_knowledge_graph(
            documents=documents_data,
            notes=notes_data,
            chunks=[],
        )

        return graph

    except Exception as e:
        logger.error(f"Knowledge graph error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to build knowledge graph: {str(e)}"
        )
    finally:
        db.close()

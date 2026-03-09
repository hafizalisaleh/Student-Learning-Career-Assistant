"""
Document API endpoints
"""
from datetime import datetime, timezone
from mimetypes import guess_type
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import Session
from typing import Any, Dict, List, Optional
import validators
from config.database import get_db
from documents.models import Document, ContentType, ProcessingStatus
from documents.schemas import (
    URLUpload, DocumentResponse, DocumentListResponse
)
from documents.validators import DocumentValidator
from documents.upload_handler import upload_handler
from documents.table_of_contents import build_table_of_contents_from_path
from users.auth import get_current_user
from users.models import User
from core.rag_pipeline import rag_pipeline
from documents.topic_extractor import topic_extractor

router = APIRouter(prefix="/api/documents", tags=["documents"])


def _merge_doc_metadata(existing: Optional[Dict[str, Any]], **updates: Any) -> Dict[str, Any]:
    """Create a new document metadata payload without mutating the existing JSON object in-place."""
    metadata = dict(existing or {})
    for key, value in updates.items():
        if value is not None:
            metadata[key] = value
    return metadata


def _cleanup_document_quizzes(db: Session, document_id: str, user_id: str) -> Dict[str, int]:
    """Delete or detach quizzes that reference a document being removed."""
    from quizzes.models import Quiz, QuizAttempt, QuizQuestion

    deleted_quizzes = 0
    updated_quizzes = 0

    quizzes = db.query(Quiz).filter(
        Quiz.user_id == user_id,
        Quiz.document_references.contains([document_id])
    ).all()

    for quiz in quizzes:
        remaining_references = [
            ref for ref in (quiz.document_references or [])
            if ref != document_id
        ]

        if remaining_references:
            quiz.document_references = remaining_references
            updated_quizzes += 1
            continue

        db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz.id).delete()
        db.query(QuizAttempt).filter(QuizAttempt.quiz_id == quiz.id).delete()
        db.delete(quiz)
        deleted_quizzes += 1

    return {
        "deleted_quizzes": deleted_quizzes,
        "updated_quizzes": updated_quizzes,
    }


def _build_and_store_document_toc(db: Session, document: Document) -> Dict[str, Any]:
    metadata = document.doc_metadata or {}
    toc = build_table_of_contents_from_path(
        markdown_path=metadata.get("docling_markdown_path"),
        document_id=str(document.id),
        db=db,
    )
    document.doc_metadata = _merge_doc_metadata(
        metadata,
        table_of_contents=toc.get("items", []),
        table_of_contents_count=toc.get("count", 0),
        table_of_contents_total_pages=toc.get("total_pages", 0),
        table_of_contents_source=toc.get("source", "pages"),
    )
    return toc

def process_document_background(document_id: str):
    """
    Background task to process document - Enhanced with topic extraction
    For URLs (YouTube/Article): Skip extraction, mark as completed immediately
    For Files: Extract topics, index to vector store

    Args:
        document_id: Document ID
    """
    # Create a new database session for background task
    from config.database import SessionLocal
    from utils.logger import logger

    db = SessionLocal()
    try:
        logger.info(f"[Background] Starting document processing for {document_id}")
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return
        
        # For URLs (YouTube and Articles), skip processing at upload time
        # Content will be extracted on-demand when generating summaries/notes/quizzes
        if doc.content_type in [ContentType.YOUTUBE, ContentType.ARTICLE]:
            logger.info(f"URL document {document_id} - skipping content extraction at upload")
            doc.processing_status = ProcessingStatus.COMPLETED
            doc.doc_metadata = _merge_doc_metadata(
                doc.doc_metadata,
                type="url",
                extraction="on-demand",
                indexed=False,
                embeddings_stored=False,
                ready_for_generation=True,
                extracted_text_available=False,
                processing_stage="completed",
                enrichment_status="skipped",
                generation_ready_at=datetime.now(timezone.utc).isoformat(),
                note="Content will be extracted when needed for summaries/notes/quizzes",
            )
            db.commit()
            return
        
        # Generate thumbnail for PDFs
        if doc.content_type == ContentType.PDF and doc.file_path:
            thumbnail_path = upload_handler.generate_thumbnail(doc.file_path, document_id)
            if thumbnail_path:
                doc.thumbnail_path = thumbnail_path
                logger.info(f"Thumbnail generated for document {document_id}")

        # For file uploads, update status to processing
        doc.processing_status = ProcessingStatus.PROCESSING
        doc.doc_metadata = _merge_doc_metadata(
            doc.doc_metadata,
            ready_for_generation=False,
            extracted_text_available=False,
            processing_stage="extracting",
            enrichment_status="pending",
        )
        db.commit()
        
        # Extract content for topic analysis and create embeddings
        extracted_text = ""
        logger.info(f"[Background] Calling RAG pipeline for {document_id}, file: {doc.file_path}")

        # Pass document_id to store embeddings in vector store
        result = rag_pipeline.process_document(
            file_path=doc.file_path,
            document_id=document_id,
            store_embeddings=True
        )

        logger.info(
            f"[Background] RAG pipeline result for {document_id}: "
            f"success={result.get('success')}, embeddings_stored={result.get('embeddings_stored')}, "
            f"chunk_count={result.get('chunk_count')}"
        )

        db.expire_all()
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            if result.get("embeddings_stored"):
                rag_pipeline.delete_document_embeddings(document_id)
            logger.info(f"Document {document_id} was deleted while processing; cleaned up extracted embeddings")
            return

        if not result.get("success"):
            error_message = result.get("error") or "Content extraction failed"
            doc.processing_status = ProcessingStatus.FAILED
            doc.doc_metadata = _merge_doc_metadata(
                doc.doc_metadata,
                indexed=False,
                embeddings_stored=False,
                ready_for_generation=False,
                extracted_text_available=False,
                processing_stage="failed",
                enrichment_status="skipped",
                error=error_message,
                note="Document upload succeeded, but extraction/indexing failed.",
            )
            db.commit()
            logger.warning(f"Document {document_id} extraction failed: {error_message}")
            return

        extracted_text = (result.get("text") or "").strip()
        if not extracted_text:
            doc.processing_status = ProcessingStatus.FAILED
            doc.doc_metadata = _merge_doc_metadata(
                doc.doc_metadata,
                indexed=False,
                embeddings_stored=False,
                ready_for_generation=False,
                extracted_text_available=False,
                processing_stage="failed",
                enrichment_status="skipped",
                error="No extractable text was found in the uploaded document.",
                note="The document uploaded successfully, but no readable text could be extracted.",
            )
            db.commit()
            logger.warning(f"Document {document_id} contains no extractable text")
            return

        topic_error_message = None
        try:
            logger.info(f"Extracting topics for document {document_id}")
            topic_data = topic_extractor.extract_topics_and_domains(
                extracted_text,
                doc.original_filename
            )
        except Exception as topic_error:
            topic_error_message = str(topic_error)
            logger.warning(f"Topic extraction failed for {document_id}: {topic_error_message}")
            topic_data = {
                "topics": [],
                "domains": [],
                "keywords": [],
                "subject_area": "General",
                "difficulty_level": "intermediate",
                "technical_skills": [],
                "concepts": [],
                "technologies": [],
                "programming_languages": [],
                "extraction_confidence": "low",
                "extraction_method": "failed",
            }

        # Persist the "ready for generation" state before slower enrichment work starts.
        doc.vector_db_reference_id = document_id if result.get("embeddings_stored") else None
        doc.extracted_text = extracted_text
        doc.topics = topic_data.get('topics', [])
        doc.domains = topic_data.get('domains', [])
        doc.keywords = topic_data.get('keywords', [])
        doc.subject_area = topic_data.get('subject_area', 'General')
        doc.difficulty_level = topic_data.get('difficulty_level', 'intermediate')
        doc.processing_status = ProcessingStatus.COMPLETED
        toc = _build_and_store_document_toc(db, doc)
        doc.doc_metadata = _merge_doc_metadata(
            doc.doc_metadata,
            indexed=bool(result.get("embeddings_stored")),
            embeddings_stored=bool(result.get("embeddings_stored")),
            chunk_count=result.get("chunk_count", 0),
            extracted_text_char_count=len(extracted_text),
            docling_markdown_path=result.get("markdown_path"),
            indexed_at=datetime.now(timezone.utc).isoformat(),
            technical_skills=topic_data.get('technical_skills', []),
            concepts=topic_data.get('concepts', []),
            technologies=topic_data.get('technologies', []),
            programming_languages=topic_data.get('programming_languages', []),
            extraction_confidence=topic_data.get('extraction_confidence', 'medium'),
            extraction_method=topic_data.get('extraction_method', 'ai'),
            table_of_contents=toc.get("items", []),
            table_of_contents_count=toc.get("count", 0),
            table_of_contents_total_pages=toc.get("total_pages", 0),
            table_of_contents_source=toc.get("source", "pages"),
            ready_for_generation=True,
            extracted_text_available=True,
            generation_ready_at=datetime.now(timezone.utc).isoformat(),
            processing_stage="enriching" if not topic_error_message else "completed",
            enrichment_status="processing" if not topic_error_message else "failed",
            topic_extraction_failed=bool(topic_error_message),
            topic_extraction_error=topic_error_message,
        )
        db.commit()
        logger.info(
            f"Document {document_id} is ready for generation with topics: {doc.topics[:3]}"
        )

        if topic_error_message:
            return

        # Knowledge Evolution is enrichment work. It should never block document readiness.
        try:
            from knowledge_timeline.concept_matcher import concept_matcher
            from knowledge_timeline.snapshot_service import snapshot_service

            concept_ids = concept_matcher.process_document_concepts(
                db, document_id, str(doc.user_id), topic_data
            )

            if concept_ids:
                snapshot_service.record_document_upload_snapshots(
                    db, str(doc.user_id), document_id
                )
                doc.doc_metadata = _merge_doc_metadata(
                    doc.doc_metadata,
                    enrichment_status="completed",
                    processing_stage="completed",
                    concept_link_count=len(concept_ids),
                    enriched_at=datetime.now(timezone.utc).isoformat(),
                )
                db.commit()
                logger.info(
                    f"Knowledge evolution: linked {len(concept_ids)} concepts for document {document_id}"
                )
            else:
                doc.doc_metadata = _merge_doc_metadata(
                    doc.doc_metadata,
                    enrichment_status="skipped",
                    processing_stage="completed",
                    concept_link_count=0,
                    enriched_at=datetime.now(timezone.utc).isoformat(),
                )
                db.commit()
        except Exception as evo_err:
            logger.warning(f"Knowledge evolution processing failed (non-critical): {evo_err}")
            doc.doc_metadata = _merge_doc_metadata(
                doc.doc_metadata,
                enrichment_status="failed",
                processing_stage="completed",
                enrichment_error=str(evo_err),
            )
            db.commit()
        
    except Exception as e:
        logger.error(f"Error processing document {document_id}: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        try:
            doc = db.query(Document).filter(Document.id == document_id).first()
            if doc:
                doc.processing_status = ProcessingStatus.FAILED
                doc.doc_metadata = _merge_doc_metadata(
                    doc.doc_metadata,
                    ready_for_generation=False,
                    extracted_text_available=bool(doc.extracted_text),
                    processing_stage="failed",
                    enrichment_status="failed",
                    error=str(e),
                )
                db.commit()
        except Exception as db_error:
            logger.error(f"Failed to update document status: {db_error}")
    finally:
        db.close()
        logger.info(f"[Background] Closed database session for {document_id}")

@router.post("/upload/file", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload a document file
    
    Args:
        background_tasks: Background tasks
        file: Uploaded file
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Document data
    """
    try:
        from utils.logger import logger
        logger.info(f"File upload started: {file.filename} by user {current_user.email}")
        
        # Validate file
        DocumentValidator.validate_upload(file)
        logger.info(f"File validation passed: {file.filename}")
        
        # Save file
        file_info = upload_handler.save_file(file, current_user.id)
        logger.info(f"File saved successfully: {file_info['file_path']}")
        
        # Determine content type
        content_type = DocumentValidator.get_content_type(file.filename)
        
        # Create document record
        new_document = Document(
            user_id=current_user.id,
            title=file.filename,
            content_type=ContentType(content_type),
            original_filename=file.filename,
            file_path=file_info["file_path"],
            file_size=file_info["file_size"],
            processing_status=ProcessingStatus.PENDING
        )
        
        db.add(new_document)
        db.commit()
        db.refresh(new_document)
        
        logger.info(f"Document record created with ID: {new_document.id}")
        
        # Process in background (creates its own db session)
        background_tasks.add_task(process_document_background, str(new_document.id))

        return DocumentResponse.from_orm(new_document)

    except HTTPException:
        raise
    except Exception as e:
        from utils.logger import logger
        logger.error(f"File upload failed: {str(e)}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}"
        )


@router.get("/upload/config")
def get_upload_config(
    current_user: User = Depends(get_current_user)
):
    """Return the effective upload constraints for the current environment."""
    return DocumentValidator.get_upload_constraints()

@router.post("/upload/youtube", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_youtube(
    background_tasks: BackgroundTasks,
    url_data: URLUpload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload YouTube video URL
    
    Args:
        background_tasks: Background tasks
        url_data: YouTube URL data
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Document data
    """
    url = str(url_data.url)
    
    # Validate YouTube URL
    if "youtube.com" not in url and "youtu.be" not in url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid YouTube URL"
        )
    
    # Create document record
    new_document = Document(
        user_id=current_user.id,
        title=url_data.title or url,
        content_type=ContentType.YOUTUBE,
        file_url=url,
        processing_status=ProcessingStatus.PENDING
    )
    
    db.add(new_document)
    db.commit()
    db.refresh(new_document)

    # Process in background (creates its own db session)
    background_tasks.add_task(process_document_background, str(new_document.id))

    return DocumentResponse.from_orm(new_document)

@router.post("/upload/web", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_web_article(
    background_tasks: BackgroundTasks,
    url_data: URLUpload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload web article URL
    
    Args:
        background_tasks: Background tasks
        url_data: Web article URL data
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Document data
    """
    url = str(url_data.url)
    
    # Validate URL
    if not validators.url(url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid URL"
        )
    
    # Create document record
    new_document = Document(
        user_id=current_user.id,
        title=url_data.title or url,
        content_type=ContentType.ARTICLE,
        file_url=url,
        processing_status=ProcessingStatus.PENDING
    )
    
    db.add(new_document)
    db.commit()
    db.refresh(new_document)

    # Process in background (creates its own db session)
    background_tasks.add_task(process_document_background, str(new_document.id))

    return DocumentResponse.from_orm(new_document)

@router.get("/", response_model=DocumentListResponse)
def get_documents(
    page: int = 1,
    page_size: int = 10,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get user's documents
    
    Args:
        page: Page number
        page_size: Items per page
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        List of documents
    """
    # Query documents
    query = db.query(Document).filter(Document.user_id == current_user.id)
    total = query.count()
    
    documents = query.offset((page - 1) * page_size).limit(page_size).all()
    
    return DocumentListResponse(
        documents=[DocumentResponse.from_orm(doc) for doc in documents],
        total=total,
        page=page,
        page_size=page_size
    )

@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get specific document
    
    Args:
        document_id: Document ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Document data
    """
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    return DocumentResponse.from_orm(doc)


@router.get("/{document_id}/table-of-contents")
def get_document_table_of_contents(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == current_user.id,
    ).first()

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    metadata = doc.doc_metadata or {}
    toc_items = metadata.get("table_of_contents")
    if not isinstance(toc_items, list):
        toc = _build_and_store_document_toc(db, doc)
        db.commit()
    else:
        toc = {
            "items": toc_items,
            "count": metadata.get("table_of_contents_count", len(toc_items)),
            "total_pages": metadata.get("table_of_contents_total_pages", 0),
            "source": metadata.get("table_of_contents_source", "contents"),
        }

    return {
        "document_id": str(doc.id),
        "title": doc.title,
        "items": toc.get("items", []),
        "count": toc.get("count", 0),
        "total_pages": toc.get("total_pages", 0),
        "source": toc.get("source", "contents"),
        "fallback": toc.get("source", "contents") != "contents",
    }

@router.delete("/{document_id}")
def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete document
    
    Args:
        document_id: Document ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Success message
    """
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    cleanup_warnings: List[str] = []
    document_id_str = str(doc.id)
    user_id_str = str(current_user.id)
    file_path = doc.file_path
    thumbnail_path = doc.thumbnail_path
    metadata = doc.doc_metadata or {}

    vector_cleanup = rag_pipeline.delete_document_embeddings(document_id_str)
    if not vector_cleanup.get("success"):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=vector_cleanup.get("error", "Failed to delete document embeddings")
        )

    if metadata.get("file_search_indexed") or metadata.get("file_search_store"):
        try:
            from core.file_search_manager import file_search_manager

            file_search_cleanup = file_search_manager.delete_store(document_id_str)
            if not file_search_cleanup.get("success"):
                cleanup_warnings.append(
                    file_search_cleanup.get("error", "Failed to delete file search store")
                )
        except Exception as cleanup_error:
            cleanup_warnings.append(f"Failed to delete file search store: {cleanup_error}")

    quiz_cleanup = _cleanup_document_quizzes(db, document_id_str, user_id_str)

    db.delete(doc)
    db.commit()

    if file_path and not upload_handler.delete_file(file_path):
        cleanup_warnings.append("Failed to delete uploaded file from disk")

    if thumbnail_path and thumbnail_path != file_path and not upload_handler.delete_file(thumbnail_path):
        cleanup_warnings.append("Failed to delete document thumbnail from disk")

    response = {
        "message": "Document deleted successfully",
        "cleanup": {
            "deleted_chunks": vector_cleanup.get("deleted_chunks", 0),
            **quiz_cleanup,
        },
    }
    if cleanup_warnings:
        response["warnings"] = cleanup_warnings

    return response

@router.get("/{document_id}/content")
def get_document_content(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Extract and return document content ON-DEMAND
    This endpoint is called only when content is actually needed
    (e.g., generating summary, creating notes, making quiz)
    NOT called during upload - saves database storage
    
    Args:
        document_id: Document ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Extracted content
    """
    from utils.logger import logger
    
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == current_user.id
    ).first()
    
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    
    # Extract content based on type
    try:
        if doc.extracted_text:
            return {
                "document_id": str(doc.id),
                "title": doc.title,
                "content": doc.extracted_text,
                "metadata": doc.doc_metadata or {},
                "extracted_at": str(doc.upload_date)
            }
        if doc.content_type == ContentType.YOUTUBE:
            result = rag_pipeline.process_youtube(doc.file_url)
        elif doc.content_type == ContentType.ARTICLE:
            result = rag_pipeline.process_webpage(doc.file_url)
        elif doc.file_path:
            result = upload_handler.extract_content_on_demand(
                doc.file_path, 
                doc.content_type.value
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No file path or URL available"
            )
        
        if result.get("success"):
            logger.info(f"Content extracted on-demand for document {document_id}")
            return {
                "document_id": str(doc.id),
                "title": doc.title,
                "content": result.get("text", ""),
                "metadata": result.get("metadata", {}),
                "extracted_at": str(doc.upload_date)
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to extract content: {result.get('error')}"
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error extracting content for {document_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Content extraction failed: {str(e)}"
        )

@router.get("/interest-profile")
def get_user_interest_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get aggregated interest profile from all user's documents
    Returns topics, domains, skills for career recommendations
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Aggregated interest profile
    """
    from utils.logger import logger
    
    # Get all user documents with topic data
    documents = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.processing_status == ProcessingStatus.COMPLETED
    ).all()
    
    if not documents:
        return {
            "primary_domains": [],
            "all_domains": [],
            "primary_topics": [],
            "all_topics": [],
            "top_skills": [],
            "all_skills": [],
            "technologies": [],
            "programming_languages": [],
            "keywords": [],
            "total_documents": 0,
            "message": "No documents uploaded yet"
        }
    
    # Extract topic data from documents
    documents_data = []
    for doc in documents:
        doc_data = {
            'topics': doc.topics or [],
            'domains': doc.domains or [],
            'keywords': doc.keywords or [],
            'technical_skills': doc.doc_metadata.get('technical_skills', []) if doc.doc_metadata else [],
            'technologies': doc.doc_metadata.get('technologies', []) if doc.doc_metadata else [],
            'programming_languages': doc.doc_metadata.get('programming_languages', []) if doc.doc_metadata else []
        }
        documents_data.append(doc_data)
    
    # Aggregate interests
    logger.info(f"Aggregating interests from {len(documents_data)} documents for user {current_user.email}")
    interest_profile = topic_extractor.aggregate_user_interests(documents_data)

    return interest_profile


@router.get("/{document_id}/mindmap")
async def generate_document_mindmap(
    document_id: str,
    style: str = "default",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate a Mermaid mind map diagram from document content.

    Args:
        document_id: Document ID
        style: Mind map style (simple, default, detailed)
        current_user: Current authenticated user
        db: Database session

    Returns:
        Mermaid diagram code
    """
    from documents.mindmap import mindmap_generator
    from utils.logger import logger

    # Get document
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == current_user.id
    ).first()

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    logger.info(f"Generating mind map for document {document_id} by user {current_user.email}")

    # Extract content on-demand
    try:
        content = doc.extracted_text
        if content:
            logger.info(f"Using stored extracted_text for mind map generation")
        elif doc.content_type == ContentType.YOUTUBE:
            result = rag_pipeline.process_youtube(doc.file_url, store_embeddings=False)
            if result.get("success"):
                content = result.get("text")
        elif doc.content_type == ContentType.ARTICLE:
            result = rag_pipeline.process_webpage(doc.file_url, store_embeddings=False)
            if result.get("success"):
                content = result.get("text")
        elif doc.file_path:
            result = upload_handler.extract_content_on_demand(
                doc.file_path,
                doc.content_type.value
            )
            if result.get("success"):
                content = result.get("text")

        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not extract content from document"
            )

        # Generate mind map
        result = mindmap_generator.generate_mindmap(
            content=content,
            title=doc.title,
            style=style
        )

        if result.get("success"):
            return {
                "document_id": str(doc.id),
                "title": doc.title,
                "mermaid_code": result["mermaid_code"],
                "style": style
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=result.get("error", "Failed to generate mind map")
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Mind map generation error for {document_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Mind map generation failed: {str(e)}"
        )


@router.get("/{document_id}/file")
def get_document_file(
    document_id: str,
    db: Session = Depends(get_db)
):
    """
    Get the actual file for a document
    Returns the file as a stream for the PDF viewer
    """
    import os
    doc = db.query(Document).filter(Document.id == document_id).first()
    
    if not doc or not doc.file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document or file not found"
        )
    
    if not os.path.exists(doc.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Physical file not found on server"
        )
    
    # Detemine media type
    media_type = "application/pdf"
    if doc.content_type == ContentType.IMAGE:
        media_type = "image/auto"
    elif doc.content_type == ContentType.DOCX:
        media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    
    return FileResponse(
        path=doc.file_path,
        media_type=media_type,
        filename=doc.original_filename
    )


@router.get("/{document_id}/artifacts/{artifact_path:path}")
def get_document_artifact(
    document_id: str,
    artifact_path: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Serve Docling-generated artifact files referenced from extracted markdown.
    Only files inside `<document>.docling/` are allowed.
    """
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == current_user.id,
    ).first()

    if not doc or not doc.file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    docling_root = Path(f"{doc.file_path}.docling").resolve()
    candidate = (docling_root / artifact_path).resolve()

    if candidate != docling_root and docling_root not in candidate.parents:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artifact not found"
        )

    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artifact file not found"
        )

    media_type = guess_type(str(candidate))[0] or "application/octet-stream"
    return FileResponse(
        path=str(candidate),
        media_type=media_type,
        filename=candidate.name,
    )


@router.get("/{document_id}/thumbnail")
def get_document_thumbnail(
    document_id: str,
    db: Session = Depends(get_db)
):
    """
    Get the thumbnail image for a document.
    Returns the thumbnail PNG as a file response.
    """
    import os

    doc = db.query(Document).filter(Document.id == document_id).first()

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    # Check if thumbnail exists on disk
    thumbnail_path = getattr(doc, 'thumbnail_path', None)

    # Fallback: check if thumbnail file exists by convention
    if not thumbnail_path:
        from pathlib import Path
        fallback_path = Path(upload_handler.upload_folder) / "thumbnails" / f"{document_id}.png"
        if fallback_path.exists():
            thumbnail_path = str(fallback_path)

    if not thumbnail_path or not os.path.exists(thumbnail_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thumbnail not available"
        )

    return FileResponse(
        path=thumbnail_path,
        media_type="image/png",
        filename=f"{document_id}_thumbnail.png"
    )

@router.get("/{document_id}/diagram")
async def generate_document_diagram(
    document_id: str,
    diagram_type: str = "flowchart",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate a Mermaid diagram from document content.

    Args:
        document_id: Document ID
        diagram_type: Type of diagram (flowchart, sequence, er, state, class)

    Returns:
        Mermaid diagram code
    """
    from documents.diagram_generator import diagram_generator
    from utils.logger import logger

    # Validate diagram type
    valid_types = ["flowchart", "sequence", "er", "state", "class"]
    if diagram_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid diagram type. Must be one of: {', '.join(valid_types)}"
        )

    # Get document
    doc = db.query(Document).filter(
        Document.id == document_id,
        Document.user_id == current_user.id
    ).first()

    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )

    logger.info(f"Generating {diagram_type} diagram for document {document_id} by user {current_user.email}")

    # Extract content on-demand (same approach as mindmap)
    try:
        content = None

        # First try to get from extracted_text if already processed
        if doc.extracted_text:
            content = doc.extracted_text
            logger.info(f"Using stored extracted_text for diagram generation")
        # Otherwise extract on-demand based on content type
        elif doc.content_type == ContentType.YOUTUBE:
            result = rag_pipeline.process_youtube(doc.file_url, store_embeddings=False)
            if result.get("success"):
                content = result.get("text")
        elif doc.content_type == ContentType.ARTICLE:
            result = rag_pipeline.process_webpage(doc.file_url, store_embeddings=False)
            if result.get("success"):
                content = result.get("text")
        elif doc.file_path:
            result = upload_handler.extract_content_on_demand(
                doc.file_path,
                doc.content_type.value
            )
            if result.get("success"):
                content = result.get("text")

        # Try vector store as last fallback
        if not content:
            try:
                from core.vector_store import vector_store
                chunks_result = vector_store.get_document_chunks(str(doc.id))
                chunk_list = chunks_result.get("chunks", []) if chunks_result.get("success") else []
                if chunk_list:
                    content = "\n\n".join([c.get("text", "") for c in chunk_list])
                    logger.info(f"Retrieved {len(chunk_list)} chunks for diagram generation")
            except Exception as e:
                logger.warning(f"Could not retrieve chunks: {e}")

        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not extract content from document"
            )

        # Generate diagram
        result = diagram_generator.generate_diagram(
            content=content,
            title=doc.title,
            diagram_type=diagram_type
        )

        return {
            "document_id": str(doc.id),
            "title": doc.title,
            "mermaid_code": result["mermaid_code"],
            "diagram_type": diagram_type,
            "success": result.get("success", True)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Diagram generation error for {document_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Diagram generation failed: {str(e)}"
        )

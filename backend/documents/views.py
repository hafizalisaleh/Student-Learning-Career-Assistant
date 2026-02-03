"""
Document API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
import validators
from config.database import get_db
from documents.models import Document, ContentType, ProcessingStatus
from documents.schemas import (
    URLUpload, DocumentResponse, DocumentListResponse
)
from documents.validators import DocumentValidator
from documents.upload_handler import upload_handler
from users.auth import get_current_user
from users.models import User
from core.rag_pipeline import rag_pipeline
from documents.topic_extractor import topic_extractor

router = APIRouter(prefix="/api/documents", tags=["documents"])

def process_document_background(document_id: str, db: Session):
    """
    Background task to process document - Enhanced with topic extraction
    For URLs (YouTube/Article): Skip extraction, mark as completed immediately
    For Files: Extract topics, index to vector store
    
    Args:
        document_id: Document ID
        db: Database session
    """
    try:
        from utils.logger import logger
        doc = db.query(Document).filter(Document.id == document_id).first()
        if not doc:
            return
        
        # For URLs (YouTube and Articles), skip processing at upload time
        # Content will be extracted on-demand when generating summaries/notes/quizzes
        if doc.content_type in [ContentType.YOUTUBE, ContentType.ARTICLE]:
            logger.info(f"URL document {document_id} - skipping content extraction at upload")
            doc.processing_status = ProcessingStatus.COMPLETED
            doc.doc_metadata = {
                "type": "url",
                "extraction": "on-demand",
                "note": "Content will be extracted when needed for summaries/notes/quizzes"
            }
            db.commit()
            return
        
        # For file uploads, update status to processing
        doc.processing_status = ProcessingStatus.PROCESSING
        db.commit()
        
        # Extract content for topic analysis
        extracted_text = ""
        try:
            result = rag_pipeline.process_document(doc.file_path)
            
            if result.get("success"):
                # Store vector DB reference
                doc.vector_db_reference_id = result.get("doc_id")
                extracted_text = result.get("text", "")
                
                # Extract topics and domains using AI
                logger.info(f"Extracting topics for document {document_id}")
                topic_data = topic_extractor.extract_topics_and_domains(
                    extracted_text,
                    doc.original_filename
                )
                
                # Store topic data in document
                doc.topics = topic_data.get('topics', [])
                doc.domains = topic_data.get('domains', [])
                doc.keywords = topic_data.get('keywords', [])
                doc.subject_area = topic_data.get('subject_area', 'General')
                doc.difficulty_level = topic_data.get('difficulty_level', 'intermediate')
                
                # Store comprehensive metadata
                doc.doc_metadata = {
                    "indexed": True,
                    "chunk_count": result.get("chunk_count", 0),
                    "indexed_at": str(doc.upload_date),
                    "technical_skills": topic_data.get('technical_skills', []),
                    "concepts": topic_data.get('concepts', []),
                    "technologies": topic_data.get('technologies', []),
                    "programming_languages": topic_data.get('programming_languages', []),
                    "extraction_confidence": topic_data.get('extraction_confidence', 'medium'),
                    "extraction_method": topic_data.get('extraction_method', 'ai')
                }
                
                doc.processing_status = ProcessingStatus.COMPLETED
                logger.info(f"Document {document_id} processed successfully with topics: {doc.topics[:3]}")
            else:
                # If extraction fails, mark as completed but without topics
                doc.processing_status = ProcessingStatus.COMPLETED
                doc.doc_metadata = {
                    "indexed": False,
                    "note": "File uploaded successfully, content extraction failed"
                }
                logger.warning(f"Document {document_id} extraction failed: {result.get('error')}")
        except Exception as extract_error:
            logger.error(f"Topic extraction failed for {document_id}: {extract_error}")
            # Still mark as completed - file is uploaded
            doc.processing_status = ProcessingStatus.COMPLETED
            doc.doc_metadata = {
                "indexed": False,
                "note": "File uploaded successfully, topic extraction failed"
            }
        
        db.commit()
        
    except Exception as e:
        from utils.logger import logger
        logger.error(f"Error processing document {document_id}: {e}")
        if doc:
            doc.processing_status = ProcessingStatus.FAILED
            doc.doc_metadata = {"error": str(e)}
            db.commit()

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
        
        # Process in background
        background_tasks.add_task(process_document_background, str(new_document.id), db)
        
        return DocumentResponse.from_orm(new_document)
        
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
    
    # Process in background
    background_tasks.add_task(process_document_background, str(new_document.id), db)
    
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
    
    # Process in background
    background_tasks.add_task(process_document_background, str(new_document.id), db)
    
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
    
    # Delete file if exists
    if doc.file_path:
        upload_handler.delete_file(doc.file_path)
    
    # Delete from database
    db.delete(doc)
    db.commit()
    
    return {"message": "Document deleted successfully"}

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


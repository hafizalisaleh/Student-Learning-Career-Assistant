"""
Summary API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from config.database import get_db
from summarizer.models import Summary
from summarizer.schemas import SummaryCreate, SummaryResponse
from documents.models import Document, ProcessingStatus
from documents.upload_handler import upload_handler
from users.auth import get_current_user
from users.models import User
from summarizer.summarizer import summarizer
from core.rag_pipeline import rag_pipeline
from utils.logger import logger

router = APIRouter(prefix="/api/summaries", tags=["summaries"])

@router.post("/generate", response_model=SummaryResponse, status_code=status.HTTP_201_CREATED)
async def generate_summary(
    summary_data: SummaryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate summary from document - extracts content on-demand
    
    Args:
        summary_data: Summary creation data
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Generated summary
    """
    try:
        # Check if document exists and belongs to user
        document = db.query(Document).filter(
            Document.id == summary_data.document_id,
            Document.user_id == current_user.id
        ).first()
        
        if not document:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )
        
        logger.info(f"Generating summary for document {document.id} by user {current_user.email}")
        logger.info(f"Summary type: {summary_data.summary_length.value}")
        
        # Extract content on-demand based on document type
        content = None
        try:
            if document.content_type.value == "youtube":
                logger.info(f"Extracting YouTube content from {document.file_url}")
                result = rag_pipeline.process_youtube(document.file_url)
                if result.get("success"):
                    content = result.get("text")
                else:
                    logger.error(f"YouTube extraction failed: {result.get('error')}")
            elif document.content_type.value == "article":
                logger.info(f"Extracting web article content from {document.file_url}")
                result = rag_pipeline.process_webpage(document.file_url)
                if result.get("success"):
                    content = result.get("text")
                else:
                    logger.error(f"Article extraction failed: {result.get('error')}")
            elif document.file_path:
                logger.info(f"Extracting file content from {document.file_path}")
                result = upload_handler.extract_content_on_demand(
                    document.file_path, 
                    document.content_type.value
                )
                if result.get("success"):
                    content = result.get("text")
                else:
                    logger.error(f"File extraction failed: {result.get('error')}")
        except Exception as extract_error:
            logger.error(f"Content extraction error: {extract_error}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to extract document content: {str(extract_error)}"
            )
        
        if not content:
            logger.error("No content extracted from document")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not extract content from document. Please ensure the document is accessible and has content."
            )
        
        logger.info(f"Content extracted successfully, length: {len(content)} characters")
        
        # Check minimum content length
        if len(content) < 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Document content is too short for summarization (minimum 100 characters required)"
            )
        
        # Generate summary using Gemini AI
        try:
            logger.info(f"Starting AI summary generation...")
            summary_text = summarizer.generate_summary(
                content,
                summary_data.summary_length.value
            )
            logger.info(f"Summary generated successfully, length: {len(summary_text)} characters")
        except Exception as gen_error:
            logger.error(f"Summary generation error: {gen_error}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate summary: {str(gen_error)}"
            )
        
        # Save summary to database
        new_summary = Summary(
            user_id=current_user.id,
            document_id=summary_data.document_id,
            summary_text=summary_text,
            summary_length=summary_data.summary_length
        )
        
        db.add(new_summary)
        db.commit()
        db.refresh(new_summary)
        
        logger.info(f"Summary saved to database with ID: {new_summary.id}")
        
        return SummaryResponse.from_orm(new_summary)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in summary generation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred: {str(e)}"
        )

@router.get("/", response_model=list[SummaryResponse])
def get_all_summaries(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all summaries for the current user
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        List of all user's summaries
    """
    summaries = db.query(Summary).filter(
        Summary.user_id == current_user.id
    ).order_by(Summary.generated_at.desc()).all()
    
    return [SummaryResponse.from_orm(summary) for summary in summaries]

@router.get("/document/{document_id}", response_model=list[SummaryResponse])
def get_summaries_by_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all summaries for a document
    
    Args:
        document_id: Document ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        List of summaries
    """
    summaries = db.query(Summary).filter(
        Summary.document_id == document_id,
        Summary.user_id == current_user.id
    ).all()
    
    return [SummaryResponse.from_orm(summary) for summary in summaries]

@router.delete("/{summary_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_summary(
    summary_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a summary
    
    Args:
        summary_id: Summary ID (UUID string)
        current_user: Current authenticated user
        db: Database session
    """
    try:
        # Validate UUID format
        import uuid
        try:
            uuid_obj = uuid.UUID(summary_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid summary ID format"
            )
        
        summary = db.query(Summary).filter(
            Summary.id == uuid_obj,
            Summary.user_id == current_user.id
        ).first()
        
        if not summary:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Summary not found"
            )
        
        db.delete(summary)
        db.commit()
        logger.info(f"Summary {summary_id} deleted successfully by user {current_user.email}")
        return {"message": "Summary deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting summary {summary_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete summary: {str(e)}"
        )

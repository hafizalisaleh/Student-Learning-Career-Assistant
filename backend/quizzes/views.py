"""
Quiz API endpoints
"""
from datetime import datetime, timezone
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from config.database import get_db
from quizzes.models import DifficultyLevel, QuestionType, Quiz, QuizAttempt, QuizQuestion
from quizzes.schemas import (
    QuestionFeedback,
    QuestionResponse,
    QuizCreate,
    QuizResponse,
    QuizResultResponse,
    QuizSubmission,
)
from documents.models import Document, ProcessingStatus
from users.auth import get_current_user
from users.models import User
from quizzes.generator import quiz_generator
from quizzes.evidence import (
    build_evidence_payload,
    encode_explanation,
    parse_explanation,
)
from quizzes.evaluator import quiz_evaluator
from core.generation_thresholds import MIN_GENERATION_CONTENT_CHARS
from core.rag_retriever import rag_retriever
from core.vector_store import vector_store
from documents.table_of_contents import sanitize_heading
from utils.logger import logger

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])

SCOPE_TEXT_RE = re.compile(r"[^a-z0-9]+")


def _build_fallback_quiz_chunk(document: Document, content: str) -> Dict[str, Any]:
    return {
        "text": content,
        "metadata": {
            "document_id": str(document.id),
            "document_title": document.title,
            "document_source": document.file_path or document.original_filename or document.title,
            "page_numbers": [],
            "source_modality": "full_text",
            "chunk_index": None,
        },
        "similarity": None,
    }


def _build_follow_up_focus_context(
    db: Session,
    current_user: User,
    source_quiz_id: Optional[str],
) -> Optional[str]:
    if not source_quiz_id:
        return None

    import uuid

    try:
        source_quiz_uuid = uuid.UUID(source_quiz_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid source quiz ID format",
        )

    source_quiz = db.query(Quiz).filter(
        Quiz.id == source_quiz_uuid,
        Quiz.user_id == current_user.id,
    ).first()

    if not source_quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source quiz for follow-up was not found",
        )

    latest_attempt = db.query(QuizAttempt).filter(
        QuizAttempt.quiz_id == source_quiz.id,
        QuizAttempt.user_id == current_user.id,
        QuizAttempt.completed_at.isnot(None),
    ).order_by(QuizAttempt.completed_at.desc()).first()

    if not latest_attempt or not latest_attempt.answers:
        return None

    question_map = {
        str(question.id): question
        for question in db.query(QuizQuestion).filter(
            QuizQuestion.quiz_id == source_quiz.id
        ).all()
    }

    incorrect_lines: List[str] = []
    correct_lines: List[str] = []

    for answer in latest_attempt.answers:
        question_id = answer.get("question_id")
        question = question_map.get(question_id)
        if not question:
            continue

        explanation_text, evidence = parse_explanation(question.explanation)
        evidence_line = ""
        if evidence and evidence.get("excerpt"):
            page = evidence.get("page")
            page_label = f"page {page}" if page else "the source"
            evidence_line = f"\n  Evidence ({page_label}): {evidence['excerpt']}"

        line = (
            f"- Question: {question.question_text}\n"
            f"  User answer: {answer.get('user_answer', 'No answer')}\n"
            f"  Correct answer: {answer.get('correct_answer', question.correct_answer)}\n"
            f"  Why it matters: {explanation_text or 'Review the supporting detail from the source.'}"
            f"{evidence_line}"
        )

        if answer.get("is_correct"):
            correct_lines.append(line)
        else:
            incorrect_lines.append(line)

    if incorrect_lines:
        return (
            f"Previous quiz score: {latest_attempt.score}%.\n"
            "Focus the follow-up quiz on the weak areas below. Re-test the same concepts from a different angle, "
            "prefer application and source-grounded explanations, and avoid repeating wording exactly.\n\n"
            "WEAK AREAS:\n"
            + "\n".join(incorrect_lines[:6])
        )

    if correct_lines:
        return (
            f"Previous quiz score: {latest_attempt.score}% with all answered questions correct.\n"
            "Generate a stronger reinforcement quiz that raises difficulty through comparison, transfer, and application. "
            "Build on the successfully answered concepts below instead of repeating simple recall.\n\n"
            "MASTERED AREAS:\n"
            + "\n".join(correct_lines[:5])
        )

    return None


def _build_selection_focus_context(quiz_data: QuizCreate) -> Optional[str]:
    blocks: List[str] = []

    if quiz_data.selected_topics:
        blocks.append(
            "FOCUS TOPICS:\n- " + "\n- ".join(topic.strip() for topic in quiz_data.selected_topics if topic.strip())
        )

    if quiz_data.selected_subtopics:
        blocks.append(
            "FOCUS SUBTOPICS:\n- " + "\n- ".join(subtopic.strip() for subtopic in quiz_data.selected_subtopics if subtopic.strip())
        )

    if quiz_data.selected_sections:
        section_lines: List[str] = []
        for section in quiz_data.selected_sections:
            title = (section.title or "").strip()
            if not title:
                continue
            if section.pages:
                page_label = ", ".join(str(page) for page in section.pages)
                section_lines.append(f"- {title} (pages {page_label})")
            else:
                section_lines.append(f"- {title}")
        if section_lines:
            blocks.append("FOCUS SECTIONS:\n" + "\n".join(section_lines))

    if not blocks:
        return None

    return (
        "If subtopics or sections are selected, keep the quiz inside that scope. "
        "Only expand to broader document coverage when the selected focus does not provide enough evidence.\n\n"
        + "\n\n".join(blocks)
    )


def _normalize_scope_text(value: str) -> str:
    cleaned = sanitize_heading(value or "").lower()
    cleaned = SCOPE_TEXT_RE.sub(" ", cleaned)
    return " ".join(cleaned.split())


def _dedupe_scope_titles(values: List[str]) -> List[str]:
    seen = set()
    deduped: List[str] = []
    for value in values:
        normalized = _normalize_scope_text(value)
        if normalized and normalized not in seen:
            seen.add(normalized)
            deduped.append(normalized)
    return deduped


def _selected_section_titles(quiz_data: QuizCreate) -> List[str]:
    explicit_titles = [
        section.title.strip()
        for section in quiz_data.selected_sections
        if (section.title or "").strip()
    ]
    if explicit_titles:
        return _dedupe_scope_titles(explicit_titles)

    subtopic_titles = [
        subtopic.strip()
        for subtopic in quiz_data.selected_subtopics
        if subtopic.strip()
    ]
    return _dedupe_scope_titles(subtopic_titles)


def _chunk_matches_selected_sections(chunk: Dict[str, Any], section_titles: List[str]) -> bool:
    if not section_titles:
        return True

    text = (chunk.get("text") or "").strip()
    if not text:
        return False

    heading_window = " ".join(
        line.strip()
        for line in text.splitlines()[:2]
        if line.strip()
    )[:280]
    normalized_heading = _normalize_scope_text(heading_window)
    if not normalized_heading:
        return False

    return any(
        normalized_heading.startswith(section_title)
        for section_title in section_titles
    )


def _retrieve_scoped_quiz_chunks(
    *,
    document: Document,
    current_user: User,
    quiz_data: QuizCreate,
) -> Optional[Dict[str, Any]]:
    strict_section_titles = _selected_section_titles(quiz_data)
    focus_terms = [
        *(subtopic.strip() for subtopic in quiz_data.selected_subtopics if subtopic.strip()),
        *(topic.strip() for topic in quiz_data.selected_topics if topic.strip()),
    ]
    section_titles = [
        section.title.strip()
        for section in quiz_data.selected_sections
        if (section.title or "").strip()
    ]
    section_page_values = set()
    for section in quiz_data.selected_sections:
        for raw_page in section.pages:
            try:
                page = int(raw_page)
            except (TypeError, ValueError):
                continue
            if page > 0:
                section_page_values.add(page)
    section_pages = sorted(section_page_values)

    if not focus_terms and not section_titles and not section_pages:
        return None

    query_text = (
        "Generate a quiz focused strictly on "
        + ", ".join((focus_terms or section_titles or [document.title])[:8])
    )

    scoped = vector_store.query(
        query_text=query_text,
        n_results=max(12, min(24, quiz_data.num_questions * 3)),
        document_id=str(document.id),
        user_id=str(current_user.id),
        section_title=" / ".join(section_titles[:3]) if section_titles else None,
        section_pages=section_pages or None,
    )

    if not scoped.get("success") or not scoped.get("results"):
        return None

    chunks = scoped.get("results", [])
    if strict_section_titles:
        strictly_scoped_chunks = [
            chunk for chunk in chunks
            if _chunk_matches_selected_sections(chunk, strict_section_titles)
        ]
        if strictly_scoped_chunks:
            logger.info(
                "Strict section filter kept %s/%s quiz chunks for %s",
                len(strictly_scoped_chunks),
                len(chunks),
                ", ".join(strict_section_titles),
            )
            chunks = strictly_scoped_chunks

    content = "\n\n".join(
        chunk.get("text", "").strip()
        for chunk in chunks
        if chunk.get("text")
    ).strip()

    if len(content) < 120:
        return None

    return {
        "content": content,
        "evidence_chunks": chunks,
        "source": "focused_scope",
    }

@router.post("/generate", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
def generate_quiz(
    quiz_data: QuizCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generate a new quiz from documents using RAG when available.
    Uses vector similarity search to retrieve relevant chunks,
    falls back to full text extraction if embeddings not available.

    Args:
        quiz_data: Quiz creation data
        current_user: Current authenticated user
        db: Database session

    Returns:
        Generated quiz with questions
    """
    logger.info(f"Generating quiz for user {current_user.email}")
    logger.info(f"Document IDs: {quiz_data.document_ids}")
    logger.info(f"Question type: {quiz_data.question_type.value}, Difficulty: {quiz_data.difficulty.value}")

    # Validate documents
    documents = db.query(Document).filter(
        Document.id.in_([str(doc_id) for doc_id in quiz_data.document_ids]),
        Document.user_id == current_user.id
    ).all()

    if not documents:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No documents found"
        )

    logger.info(f"Found {len(documents)} documents")

    # Extract content from all documents using RAG retriever
    extracted_contents = []
    evidence_chunks: List[Dict[str, Any]] = []
    for doc in documents:
        try:
            scoped_retrieval = _retrieve_scoped_quiz_chunks(
                document=doc,
                current_user=current_user,
                quiz_data=quiz_data,
            )
            if scoped_retrieval:
                extracted_contents.append(scoped_retrieval["content"])
                evidence_chunks.extend(scoped_retrieval["evidence_chunks"])
                logger.info(
                    "Document %s: Retrieved %s chars via %s (chunks=%s)",
                    doc.id,
                    len(scoped_retrieval["content"]),
                    scoped_retrieval["source"],
                    len(scoped_retrieval["evidence_chunks"]),
                )
                continue

            # Use RAG retriever (uses embeddings if available, else full text)
            retrieval_result = rag_retriever.get_content_for_generation(
                document=doc,
                task_type="quiz",
                chunk_count=8
            )

            content = retrieval_result.get("content")
            content_source = retrieval_result.get("source")

            if content and len(content) > 100:
                extracted_contents.append(content)
                retrieved_chunks = retrieval_result.get("metadata", {}).get("retrieved_chunks") or []
                if retrieved_chunks:
                    for chunk in retrieved_chunks:
                        metadata = dict(chunk.get("metadata") or {})
                        metadata.setdefault("document_id", str(doc.id))
                        metadata.setdefault("document_title", doc.title)
                        metadata.setdefault(
                            "document_source",
                            doc.file_path or doc.original_filename or doc.title,
                        )
                        evidence_chunks.append(
                            {
                                "text": chunk.get("text", ""),
                                "metadata": metadata,
                                "similarity": chunk.get("similarity"),
                            }
                        )
                else:
                    evidence_chunks.append(_build_fallback_quiz_chunk(doc, content))
                logger.info(f"Document {doc.id}: Retrieved {len(content)} chars via {content_source} (chunks={retrieval_result.get('chunks_used', 0)})")
            else:
                logger.warning(f"No content extracted from document {doc.id}")
        except Exception as e:
            logger.error(f"Error extracting content from document {doc.id}: {e}", exc_info=True)

    if not extracted_contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract content from any documents. Please ensure documents are accessible."
        )

    # Combine content from all documents
    combined_content = "\n\n".join(extracted_contents)
    logger.info(f"Combined content length: {len(combined_content)} characters")

    if len(combined_content) < MIN_GENERATION_CONTENT_CHARS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Insufficient content to generate quiz "
                f"(minimum {MIN_GENERATION_CONTENT_CHARS} characters required)."
            )
        )
    
    selection_focus_context = _build_selection_focus_context(quiz_data)
    follow_up_focus_context = _build_follow_up_focus_context(
        db=db,
        current_user=current_user,
        source_quiz_id=str(quiz_data.follow_up_from_quiz_id) if quiz_data.follow_up_from_quiz_id else None,
    )
    focus_context_parts = [
        part.strip()
        for part in [quiz_data.focus_context, selection_focus_context, follow_up_focus_context]
        if part and part.strip()
    ]
    focus_context = "\n\n".join(focus_context_parts) if focus_context_parts else None

    # Generate questions based on type
    try:
        if quiz_data.question_type.value == "mcq":
            generated_questions = quiz_generator.generate_mcq_questions(
                combined_content,
                quiz_data.num_questions,
                quiz_data.difficulty.value,
                focus_context=focus_context,
                evidence_chunks=evidence_chunks,
            )
        elif quiz_data.question_type.value == "short":
            generated_questions = quiz_generator.generate_short_answer_questions(
                combined_content,
                quiz_data.num_questions,
                quiz_data.difficulty.value,
                focus_context=focus_context,
                evidence_chunks=evidence_chunks,
            )
        elif quiz_data.question_type.value == "true_false":
            generated_questions = quiz_generator.generate_true_false_questions(
                combined_content,
                quiz_data.num_questions,
                quiz_data.difficulty.value,
                focus_context=focus_context,
                evidence_chunks=evidence_chunks,
            )
        elif quiz_data.question_type.value == "fill_blank":
            generated_questions = quiz_generator.generate_fill_blank_questions(
                combined_content,
                quiz_data.num_questions,
                quiz_data.difficulty.value,
                focus_context=focus_context,
                evidence_chunks=evidence_chunks,
            )
        else:  # mixed
            generated_questions = quiz_generator.generate_mixed_questions(
                combined_content,
                quiz_data.num_questions,
                quiz_data.difficulty.value,
                focus_context=focus_context,
                evidence_chunks=evidence_chunks,
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate quiz: {str(e)}"
        )
    
    if not generated_questions:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate questions. Please try again."
        )

    generated_questions = quiz_generator.validate_grounded_questions(
        generated_questions,
        evidence_chunks,
    )

    title_question_types = (
        ["mcq", "short", "true_false", "fill_blank"]
        if quiz_data.question_type.value == "mixed"
        else [quiz_data.question_type.value]
    )
    generated_title = quiz_generator.generate_quiz_title(
        content=combined_content,
        difficulty=quiz_data.difficulty.value,
        allowed_types=title_question_types,
        selected_topics=quiz_data.selected_topics,
        selected_subtopics=quiz_data.selected_subtopics,
        focus_context=focus_context,
    )
    
    # Create quiz
    new_quiz = Quiz(
        user_id=current_user.id,
        title=quiz_data.title or generated_title,
        difficulty_level=DifficultyLevel(quiz_data.difficulty.value),
        question_type=quiz_data.question_type.value,
        document_references=[str(doc_id) for doc_id in quiz_data.document_ids]
    )
    
    db.add(new_quiz)
    db.flush()
    
    # Create questions
    question_objects = []
    for q_data in generated_questions:
        source_index = max(1, int(q_data.get("source_index", 1)))
        source_chunk = evidence_chunks[source_index - 1] if source_index - 1 < len(evidence_chunks) else None
        explanation = encode_explanation(
            q_data.get("explanation", ""),
            build_evidence_payload(source_chunk, source_index) if source_chunk else None,
        )
        question = QuizQuestion(
            quiz_id=new_quiz.id,
            question_text=q_data['question_text'],
            question_type=QuestionType(q_data['question_type']),
            options=q_data.get('options'),
            correct_answer=q_data['correct_answer'],
            explanation=explanation,
            difficulty=DifficultyLevel(quiz_data.difficulty.value)
        )
        db.add(question)
        question_objects.append(question)
    
    db.commit()
    db.refresh(new_quiz)
    
    # Prepare response
    return QuizResponse(
        id=new_quiz.id,
        user_id=new_quiz.user_id,
        title=new_quiz.title,
        difficulty_level=new_quiz.difficulty_level,
        question_type=new_quiz.question_type,
        created_at=new_quiz.created_at,
        document_references=new_quiz.document_references,
        questions=[
            QuestionResponse(
                id=q.id,
                quiz_id=q.quiz_id,
                question_text=q.question_text,
                question_type=q.question_type,
                options=q.options,
                difficulty=q.difficulty
            ) for q in question_objects
        ]
    )

@router.get("/", response_model=List[QuizResponse])
def list_quizzes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List all quizzes for current user
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        List of quizzes
    """
    quizzes = db.query(Quiz).filter(
        Quiz.user_id == current_user.id
    ).order_by(Quiz.created_at.desc()).all()
    
    result = []
    for quiz in quizzes:
        questions = db.query(QuizQuestion).filter(
            QuizQuestion.quiz_id == quiz.id
        ).all()
        
        result.append(QuizResponse(
            id=quiz.id,
            user_id=quiz.user_id,
            title=quiz.title,
            difficulty_level=quiz.difficulty_level,
            question_type=quiz.question_type,
            created_at=quiz.created_at,
            document_references=quiz.document_references,
            questions=[
                QuestionResponse(
                    id=q.id,
                    quiz_id=q.quiz_id,
                    question_text=q.question_text,
                    question_type=q.question_type,
                    options=q.options,
                    difficulty=q.difficulty
                ) for q in questions
            ]
        ))
    
    return result

@router.get("/analytics", response_model=dict)
def get_quiz_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get quiz analytics for current user
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Quiz analytics including total quizzes, attempts, scores, and topic performance
    """
    from sqlalchemy import func
    
    try:
        # Get total quizzes
        total_quizzes = db.query(Quiz).filter(
            Quiz.user_id == current_user.id
        ).count()
        
        # Get total attempts
        total_attempts = db.query(QuizAttempt).filter(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.completed_at.isnot(None),
        ).count()
        
        # Get average and best scores
        score_stats = db.query(
            func.avg(QuizAttempt.score).label('avg_score'),
            func.max(QuizAttempt.score).label('max_score')
        ).filter(
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.completed_at.isnot(None)
        ).first()
        
        average_score = float(score_stats.avg_score) if score_stats.avg_score else 0.0
        best_score = float(score_stats.max_score) if score_stats.max_score else 0.0
        
        # Get topic performance
        topics_data = db.query(
            Quiz.title,
            func.count(QuizAttempt.id).label('attempt_count'),
            func.avg(QuizAttempt.score).label('avg_score')
        ).join(
            QuizAttempt, Quiz.id == QuizAttempt.quiz_id
        ).filter(
            Quiz.user_id == current_user.id,
            QuizAttempt.completed_at.isnot(None)
        ).group_by(Quiz.title).all()
        
        topics = [
            {
                'topic': topic[0] or 'General',
                'count': topic[1],
                'average_score': float(topic[2]) if topic[2] else 0.0
            }
            for topic in topics_data
        ]
        
        return {
            'total_quizzes': total_quizzes,
            'total_attempts': total_attempts,
            'average_score': average_score,
            'best_score': best_score,
            'topics': topics
        }
    except Exception as e:
        logger.error(f"Error fetching quiz analytics: {str(e)}", exc_info=True)
        # Return default values on error
        return {
            'total_quizzes': 0,
            'total_attempts': 0,
            'average_score': 0.0,
            'best_score': 0.0,
            'topics': []
        }

@router.get("/attempts/history", response_model=List[QuizResultResponse])
def get_quiz_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get quiz attempt history for current user
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        List of quiz attempts
    """
    attempts = db.query(QuizAttempt).filter(
        QuizAttempt.user_id == current_user.id,
        QuizAttempt.completed_at.isnot(None),
    ).order_by(QuizAttempt.completed_at.desc()).all()
    
    return [
        QuizResultResponse(
            attempt_id=attempt.id,
            quiz_id=attempt.quiz_id,
            score=attempt.score,
            total_questions=attempt.total_questions,
            correct_answers=attempt.correct_answers or 0,
            time_taken=attempt.time_taken,
            completed_at=attempt.completed_at,
            feedback=[]
        ) for attempt in attempts
    ]

@router.get("/{quiz_id}", response_model=QuizResponse)
def get_quiz(
    quiz_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get quiz with questions
    
    Args:
        quiz_id: Quiz ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Quiz with questions
    """
    quiz = db.query(Quiz).filter(
        Quiz.id == quiz_id,
        Quiz.user_id == current_user.id
    ).first()
    
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )
    
    questions = db.query(QuizQuestion).filter(
        QuizQuestion.quiz_id == quiz_id
    ).all()
    
    return QuizResponse(
        id=quiz.id,
        user_id=quiz.user_id,
        title=quiz.title,
        difficulty_level=quiz.difficulty_level,
        question_type=quiz.question_type,
        created_at=quiz.created_at,
        document_references=quiz.document_references,
        questions=[
            QuestionResponse(
                id=q.id,
                quiz_id=q.quiz_id,
                question_text=q.question_text,
                question_type=q.question_type,
                options=q.options,
                difficulty=q.difficulty
            ) for q in questions
        ]
    )

@router.post("/{quiz_id}/start")
def start_quiz_attempt(
    quiz_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Start a quiz attempt (records start time)
    
    Args:
        quiz_id: Quiz ID
        current_user: Current authenticated user
        db: Session: Database session
        
    Returns:
        Confirmation with attempt start time
    """
    # Validate UUID
    try:
        import uuid
        uuid_obj = uuid.UUID(quiz_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid quiz ID format"
        )
    
    # Check if quiz exists
    quiz = db.query(Quiz).filter(
        Quiz.id == uuid_obj,
        Quiz.user_id == current_user.id
    ).first()
    
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )
    
    # Check if there's already an incomplete attempt
    existing_attempt = db.query(QuizAttempt).filter(
        QuizAttempt.quiz_id == uuid_obj,
        QuizAttempt.user_id == current_user.id,
        QuizAttempt.completed_at == None
    ).first()
    
    if existing_attempt:
        logger.info(f"Resuming existing attempt {existing_attempt.id} for quiz {quiz_id}")
        return {
            "attempt_id": str(existing_attempt.id),
            "started_at": existing_attempt.started_at,
            "message": "Resuming existing attempt"
        }
    
    # Create new attempt
    new_attempt = QuizAttempt(
        quiz_id=uuid_obj,
        user_id=current_user.id,
        started_at=datetime.now(timezone.utc)
    )
    
    db.add(new_attempt)
    db.commit()
    db.refresh(new_attempt)
    
    logger.info(f"Started new quiz attempt {new_attempt.id} for quiz {quiz_id}")
    
    return {
        "attempt_id": str(new_attempt.id),
        "started_at": new_attempt.started_at,
        "message": "Quiz attempt started"
    }

@router.post("/{quiz_id}/submit", response_model=QuizResultResponse)
def submit_quiz(
    quiz_id: str,
    submission: QuizSubmission,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Submit quiz answers and get results
    
    Args:
        quiz_id: Quiz ID
        submission: Quiz submission with answers
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Quiz results with feedback
    """
    try:
        logger.info(f"Submitting quiz {quiz_id} for user {current_user.email}")
        logger.info(f"Received {len(submission.answers)} answers")
        
        # Validate UUID
        import uuid
        try:
            uuid_obj = uuid.UUID(quiz_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid quiz ID format"
            )
        
        # Get quiz and questions
        quiz = db.query(Quiz).filter(
            Quiz.id == uuid_obj,
            Quiz.user_id == current_user.id
        ).first()
        
        if not quiz:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Quiz not found"
            )
        
        questions = db.query(QuizQuestion).filter(
            QuizQuestion.quiz_id == uuid_obj
        ).all()
        
        if not questions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quiz has no questions"
            )
        
        logger.info(f"Found {len(questions)} questions for quiz")
        
        # Prepare questions for evaluation
        question_data = []
        for q in questions:
            explanation, evidence = parse_explanation(q.explanation)
            question_data.append({
                'id': str(q.id),
                'question_text': q.question_text,
                'question_type': q.question_type.value,
                'correct_answer': q.correct_answer,
                'explanation': explanation,
                'options': q.options,
                'evidence': evidence,
            })
        
        # Prepare answers for evaluation
        answer_data = [
            {'question_id': str(ans.question_id), 'answer': ans.answer}
            for ans in submission.answers
        ]
        
        # Evaluate quiz
        try:
            logger.info(f"Evaluating quiz {quiz_id} for user {current_user.email}")
            evaluation = quiz_evaluator.evaluate_quiz(question_data, answer_data)
            logger.info(f"Evaluation complete: Score {evaluation['score']}%, Correct: {evaluation['correct_answers']}/{evaluation['total_questions']}")
        except Exception as e:
            logger.error(f"Error evaluating quiz: {str(e)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error evaluating quiz: {str(e)}"
            )
        
        # Resume the latest incomplete attempt if one exists, otherwise store a new completed attempt.
        existing_attempt = db.query(QuizAttempt).filter(
            QuizAttempt.quiz_id == quiz.id,
            QuizAttempt.user_id == current_user.id,
            QuizAttempt.completed_at.is_(None),
        ).order_by(QuizAttempt.started_at.desc()).first()
        
        started_time = existing_attempt.started_at if existing_attempt else datetime.now(timezone.utc)
        completed_time = datetime.now(timezone.utc)
        time_taken_seconds = int((completed_time - started_time).total_seconds())
        
        # Prepare detailed answers with evaluation results
        detailed_answers = []
        for ans, fb in zip(submission.answers, evaluation['feedback']):
            detailed_answers.append({
                'question_id': str(ans.question_id),
                'user_answer': ans.answer,
                'correct_answer': fb['correct_answer'],
                'is_correct': fb['is_correct'],
                'points_earned': fb['points_earned'],
                'points_possible': fb['points_possible']
            })
        
        if existing_attempt:
            # Update existing attempt
            existing_attempt.score = evaluation['score']
            existing_attempt.total_questions = evaluation['total_questions']
            existing_attempt.correct_answers = evaluation['correct_answers']
            existing_attempt.answers = detailed_answers
            existing_attempt.completed_at = completed_time
            existing_attempt.time_taken = time_taken_seconds
            db.commit()
            db.refresh(existing_attempt)
            new_attempt = existing_attempt
            logger.info(f"Updated existing attempt {existing_attempt.id}")
        else:
            # Create new quiz attempt
            new_attempt = QuizAttempt(
                quiz_id=quiz.id,
                user_id=current_user.id,
                score=evaluation['score'],
                total_questions=evaluation['total_questions'],
                correct_answers=evaluation['correct_answers'],
                answers=detailed_answers,
                started_at=started_time,
                completed_at=completed_time,
                time_taken=time_taken_seconds
            )
            db.add(new_attempt)
            db.commit()
            db.refresh(new_attempt)
            logger.info(f"Created new attempt {new_attempt.id}")
        
        # Prepare feedback
        feedback = [
            QuestionFeedback(
                question_id=fb['question_id'],
                question_text=fb['question_text'],
                user_answer=fb['user_answer'],
                correct_answer=fb['correct_answer'],
                is_correct=fb['is_correct'],
                explanation=fb['explanation'],
                points_earned=fb['points_earned'],
                points_possible=fb['points_possible'],
                evidence=fb.get('evidence'),
            ) for fb in evaluation['feedback']
        ]
        
        logger.info(f"Quiz submission successful: Score {evaluation['score']}%, Correct {evaluation['correct_answers']}/{evaluation['total_questions']}")

        # Knowledge Evolution: record quiz snapshot
        try:
            from knowledge_timeline.snapshot_service import snapshot_service
            doc_ids = quiz.document_references or []
            if doc_ids:
                snapshot_service.record_quiz_snapshot(db, str(current_user.id), [str(d) for d in doc_ids])
                db.commit()
        except Exception as evo_err:
            logger.warning(f"Knowledge evolution quiz snapshot failed (non-critical): {evo_err}")

        return QuizResultResponse(
            attempt_id=new_attempt.id,
            quiz_id=quiz.id,
            score=evaluation['score'],
            total_questions=evaluation['total_questions'],
            correct_answers=evaluation['correct_answers'],
            time_taken=new_attempt.time_taken,
            completed_at=new_attempt.completed_at,
            feedback=feedback
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting quiz {quiz_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to submit quiz: {str(e)}"
        )

@router.get("/{quiz_id}/attempt", response_model=Optional[QuizResultResponse])
def get_quiz_attempt(
    quiz_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get user's attempt for a specific quiz with all details
    
    Args:
        quiz_id: Quiz ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Quiz attempt with detailed feedback
    """
    # Validate UUID
    try:
        import uuid
        uuid_obj = uuid.UUID(quiz_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid quiz ID format"
        )
    
    attempt = db.query(QuizAttempt).filter(
        QuizAttempt.quiz_id == uuid_obj,
        QuizAttempt.user_id == current_user.id,
        QuizAttempt.completed_at.isnot(None),
    ).order_by(QuizAttempt.completed_at.desc()).first()
    
    if not attempt:
        return None
    
    # Get questions for feedback
    questions = db.query(QuizQuestion).filter(
        QuizQuestion.quiz_id == uuid_obj
    ).all()
    
    question_map = {str(q.id): q for q in questions}
    
    # Build detailed feedback from stored answers
    feedback = []
    if attempt.answers:
        for ans in attempt.answers:
            q_id = ans.get('question_id')
            question = question_map.get(q_id)
            if question:
                explanation, evidence = parse_explanation(question.explanation)
                feedback.append(QuestionFeedback(
                    question_id=q_id,
                    question_text=question.question_text,
                    user_answer=ans.get('user_answer', ''),
                    correct_answer=ans.get('correct_answer', ''),
                    is_correct=ans.get('is_correct', False),
                    explanation=explanation,
                    points_earned=ans.get('points_earned', 0),
                    points_possible=ans.get('points_possible', 1),
                    evidence=evidence,
                ))
    
    return QuizResultResponse(
        attempt_id=attempt.id,
        quiz_id=attempt.quiz_id,
        score=attempt.score,
        total_questions=attempt.total_questions,
        correct_answers=attempt.correct_answers or 0,
        time_taken=attempt.time_taken,
        completed_at=attempt.completed_at,
        feedback=feedback
    )

@router.delete("/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quiz(
    quiz_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete a quiz and its questions
    
    Args:
        quiz_id: Quiz ID (UUID string)
        current_user: Current authenticated user
        db: Database session
    """
    try:
        # Validate UUID format
        import uuid
        try:
            uuid_obj = uuid.UUID(quiz_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid quiz ID format"
            )
        
        quiz = db.query(Quiz).filter(
            Quiz.id == uuid_obj,
            Quiz.user_id == current_user.id
        ).first()
        
        if not quiz:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Quiz not found"
            )
        
        # Delete associated questions and attempts
        db.query(QuizQuestion).filter(QuizQuestion.quiz_id == uuid_obj).delete()
        db.query(QuizAttempt).filter(QuizAttempt.quiz_id == uuid_obj).delete()
        
        db.delete(quiz)
        db.commit()
        logger.info(f"Quiz {quiz_id} deleted successfully by user {current_user.email}")
        return {"message": "Quiz deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting quiz {quiz_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete quiz: {str(e)}"
        )

"""
Quiz API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
from config.database import get_db
from quizzes.models import Quiz, QuizQuestion, QuizAttempt, DifficultyLevel, QuestionType
from quizzes.schemas import (
    QuizCreate, QuizResponse, QuestionResponse, QuizSubmission,
    QuizResultResponse, QuestionFeedback
)
from documents.models import Document, ProcessingStatus
from users.auth import get_current_user
from users.models import User
from quizzes.generator import quiz_generator
from quizzes.evaluator import quiz_evaluator
from core.rag_retriever import rag_retriever
from utils.logger import logger

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])

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
    for doc in documents:
        try:
            # Use RAG retriever (uses embeddings if available, else full text)
            retrieval_result = rag_retriever.get_content_for_generation(
                document=doc,
                task_type="quiz",
                chunk_count=5
            )

            content = retrieval_result.get("content")
            content_source = retrieval_result.get("source")

            if content and len(content) > 100:
                extracted_contents.append(content)
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

    if len(combined_content) < 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient content to generate quiz (minimum 200 characters required)."
        )
    
    # Generate questions based on type
    try:
        if quiz_data.question_type.value == "mcq":
            generated_questions = quiz_generator.generate_mcq_questions(
                combined_content,
                quiz_data.num_questions,
                quiz_data.difficulty.value
            )
        elif quiz_data.question_type.value == "short":
            generated_questions = quiz_generator.generate_short_answer_questions(
                combined_content,
                quiz_data.num_questions,
                quiz_data.difficulty.value
            )
        elif quiz_data.question_type.value == "true_false":
            generated_questions = quiz_generator.generate_true_false_questions(
                combined_content,
                quiz_data.num_questions,
                quiz_data.difficulty.value
            )
        elif quiz_data.question_type.value == "fill_blank":
            generated_questions = quiz_generator.generate_fill_blank_questions(
                combined_content,
                quiz_data.num_questions,
                quiz_data.difficulty.value
            )
        else:  # mixed
            generated_questions = quiz_generator.generate_mixed_questions(
                combined_content,
                quiz_data.num_questions,
                quiz_data.difficulty.value
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
    
    # Create quiz
    new_quiz = Quiz(
        user_id=current_user.id,
        title=quiz_data.title or f"Quiz - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        difficulty_level=DifficultyLevel(quiz_data.difficulty.value),
        question_type=quiz_data.question_type.value,
        document_references=[str(doc_id) for doc_id in quiz_data.document_ids]
    )
    
    db.add(new_quiz)
    db.flush()
    
    # Create questions
    question_objects = []
    for q_data in generated_questions:
        question = QuizQuestion(
            quiz_id=new_quiz.id,
            question_text=q_data['question_text'],
            question_type=QuestionType(q_data['question_type']),
            options=q_data.get('options'),
            correct_answer=q_data['correct_answer'],
            explanation=q_data.get('explanation', ''),
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
            QuizAttempt.user_id == current_user.id
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
        QuizAttempt.user_id == current_user.id
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
            question_data.append({
                'id': str(q.id),
                'question_text': q.question_text,
                'question_type': q.question_type.value,
                'correct_answer': q.correct_answer,
                'explanation': q.explanation,
                'options': q.options
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
        
        # Check if user already attempted this quiz
        existing_attempt = db.query(QuizAttempt).filter(
            QuizAttempt.quiz_id == quiz.id,
            QuizAttempt.user_id == current_user.id
        ).first()
        
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
            points_possible=fb['points_possible']
        ) for fb in evaluation['feedback']
        ]
        
        logger.info(f"Quiz submission successful: Score {evaluation['score']}%, Correct {evaluation['correct_answers']}/{evaluation['total_questions']}")
        
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

@router.get("/{quiz_id}/attempt", response_model=QuizResultResponse)
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
        QuizAttempt.user_id == current_user.id
    ).order_by(QuizAttempt.completed_at.desc()).first()
    
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No attempt found for this quiz"
        )
    
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
                feedback.append(QuestionFeedback(
                    question_id=q_id,
                    question_text=question.question_text,
                    user_answer=ans.get('user_answer', ''),
                    correct_answer=ans.get('correct_answer', ''),
                    is_correct=ans.get('is_correct', False),
                    explanation=question.explanation or '',
                    points_earned=ans.get('points_earned', 0),
                    points_possible=ans.get('points_possible', 1)
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

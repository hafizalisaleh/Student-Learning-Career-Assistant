"""
Quiz evaluator for grading and providing feedback.
"""

from typing import Any, Dict, List

from utils.rag_llm_client import RAGLLMClient, safe_load_json

class QuizEvaluator:
    """Evaluate quiz answers and provide feedback"""
    
    def __init__(self):
        self.client = RAGLLMClient()
    
    def evaluate_mcq(
        self, 
        user_answer: str, 
        correct_answer: str, 
        explanation: str
    ) -> Dict[str, Any]:
        """
        Evaluate MCQ answer
        
        Args:
            user_answer: User's selected answer
            correct_answer: Correct answer
            explanation: Explanation for the answer
            
        Returns:
            Evaluation result
        """
        is_correct = user_answer.strip().lower() == correct_answer.strip().lower()
        
        return {
            'is_correct': is_correct,
            'points_earned': 1.0 if is_correct else 0.0,
            'points_possible': 1.0,
            'explanation': explanation
        }
    
    def evaluate_true_false(
        self, 
        user_answer: str, 
        correct_answer: str, 
        explanation: str
    ) -> Dict[str, Any]:
        """Evaluate true/false answer"""
        is_correct = user_answer.strip().lower() == correct_answer.strip().lower()
        
        return {
            'is_correct': is_correct,
            'points_earned': 1.0 if is_correct else 0.0,
            'points_possible': 1.0,
            'explanation': explanation
        }
    
    def evaluate_fill_blank(
        self, 
        user_answer: str, 
        correct_answer: str, 
        explanation: str
    ) -> Dict[str, Any]:
        """Evaluate fill in the blank answer"""
        # Check for exact match or close match
        user_lower = user_answer.strip().lower()
        correct_lower = correct_answer.strip().lower()
        
        is_correct = user_lower == correct_lower
        
        # Check for partial credit
        if not is_correct and correct_lower in user_lower:
            return {
                'is_correct': False,
                'points_earned': 0.5,
                'points_possible': 1.0,
                'explanation': f"Partially correct. Expected: {correct_answer}. {explanation}"
            }
        
        return {
            'is_correct': is_correct,
            'points_earned': 1.0 if is_correct else 0.0,
            'points_possible': 1.0,
            'explanation': explanation if is_correct else f"Incorrect. Expected: {correct_answer}. {explanation}"
        }
    
    def evaluate_short_answer(
        self, 
        user_answer: str, 
        correct_answer: str, 
        question_text: str
    ) -> Dict[str, Any]:
        """
        Evaluate short answer using AI
        
        Args:
            user_answer: User's answer
            correct_answer: Expected answer
            question_text: Original question
            
        Returns:
            Evaluation result with AI feedback
        """
        prompt = f"""
Evaluate the student's short-answer response against the expected answer.

QUESTION:
{question_text}

EXPECTED ANSWER:
{correct_answer}

STUDENT ANSWER:
{user_answer}

Return JSON only with:
- score: number between 0 and 1
- feedback: concise explanation of what was correct, missing, or wrong
""".strip()
        
        try:
            response = self.client.generate_json(
                prompt=prompt,
                system_prompt=(
                    "You are grading a student's short-answer response. "
                    "Be strict but fair, award partial credit when justified, and return valid JSON only."
                ),
                temperature=0.1,
                max_tokens=500,
                schema={
                    "type": "object",
                    "properties": {
                        "score": {"type": "number"},
                        "feedback": {"type": "string"},
                    },
                    "required": ["score", "feedback"],
                },
            )
            parsed = safe_load_json(response)
            score = float(parsed.get('score', 0.0))
            score = max(0.0, min(1.0, score))
            feedback = str(parsed.get('feedback', 'Unable to evaluate answer.')).strip()
            
            return {
                'is_correct': score >= 0.7,  # 70% or higher is considered correct
                'points_earned': score,
                'points_possible': 1.0,
                'explanation': feedback
            }
            
        except Exception:
            # Fallback to simple string matching
            user_lower = user_answer.strip().lower()
            correct_lower = correct_answer.strip().lower()
            
            if user_lower == correct_lower:
                score = 1.0
            elif correct_lower in user_lower or user_lower in correct_lower:
                score = 0.5
            else:
                score = 0.0
            
            return {
                'is_correct': score >= 0.7,
                'points_earned': score,
                'points_possible': 1.0,
                'explanation': f"Expected answer: {correct_answer}. Your answer was {'correct' if score >= 0.7 else 'incorrect'}."
            }
    
    def evaluate_quiz(
        self, 
        questions: List[Dict[str, Any]], 
        answers: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Evaluate entire quiz
        
        Args:
            questions: List of question dictionaries
            answers: List of answer dictionaries
            
        Returns:
            Complete evaluation results
        """
        results = []
        total_points = 0.0
        earned_points = 0.0
        correct_count = 0
        
        # Create answer lookup
        answer_map = {ans['question_id']: ans['answer'] for ans in answers}
        
        for question in questions:
            question_id = str(question['id'])
            user_answer = answer_map.get(question_id, "")
            
            # Evaluate based on question type
            if question['question_type'] == 'mcq':
                result = self.evaluate_mcq(
                    user_answer,
                    question['correct_answer'],
                    question['explanation']
                )
            elif question['question_type'] == 'true_false':
                result = self.evaluate_true_false(
                    user_answer,
                    question['correct_answer'],
                    question['explanation']
                )
            elif question['question_type'] == 'fill_blank':
                result = self.evaluate_fill_blank(
                    user_answer,
                    question['correct_answer'],
                    question['explanation']
                )
            elif question['question_type'] == 'short':
                result = self.evaluate_short_answer(
                    user_answer,
                    question['correct_answer'],
                    question['question_text']
                )
            else:
                result = {
                    'is_correct': False,
                    'points_earned': 0.0,
                    'points_possible': 1.0,
                    'explanation': "Unknown question type"
                }
            
            # Add to results
            results.append({
                'question_id': question_id,
                'question_text': question['question_text'],
                'user_answer': user_answer,
                'correct_answer': question['correct_answer'],
                'is_correct': result['is_correct'],
                'points_earned': result['points_earned'],
                'points_possible': result['points_possible'],
                'explanation': result['explanation'],
                'evidence': question.get('evidence'),
            })
            
            earned_points += result['points_earned']
            total_points += result['points_possible']
            if result['is_correct']:
                correct_count += 1
        
        # Calculate final score
        score_percentage = (earned_points / total_points * 100) if total_points > 0 else 0.0
        
        return {
            'score': round(score_percentage, 2),
            'total_questions': len(questions),
            'correct_answers': correct_count,
            'points_earned': round(earned_points, 2),
            'points_possible': round(total_points, 2),
            'feedback': results
        }

# Global evaluator instance
quiz_evaluator = QuizEvaluator()

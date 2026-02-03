"""
Quiz evaluator for grading and providing feedback
"""
from typing import Dict, List, Any
from utils.gemini_client import gemini_client

class QuizEvaluator:
    """Evaluate quiz answers and provide feedback"""
    
    def __init__(self):
        self.gemini_client = gemini_client
    
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
        Evaluate the following student answer to a question.
        
        Question: {question_text}
        
        Expected Answer: {correct_answer}
        
        Student's Answer: {user_answer}
        
        Provide evaluation in this format:
        SCORE: [0.0 to 1.0]
        FEEDBACK: [Detailed feedback explaining the score, what was correct, what was missing, and suggestions]
        
        Be fair and consider partial credit for partially correct answers.
        """
        
        try:
            response = self.gemini_client.generate_text(prompt, temperature=0.3)
            
            # Parse response
            score = 0.0
            feedback = "Unable to evaluate answer."
            
            lines = response.split('\n')
            for line in lines:
                if line.startswith('SCORE:'):
                    try:
                        score = float(line.split(':')[1].strip())
                        score = max(0.0, min(1.0, score))  # Clamp between 0 and 1
                    except:
                        score = 0.0
                elif line.startswith('FEEDBACK:'):
                    feedback = line.split(':', 1)[1].strip()
            
            return {
                'is_correct': score >= 0.7,  # 70% or higher is considered correct
                'points_earned': score,
                'points_possible': 1.0,
                'explanation': feedback
            }
            
        except Exception as e:
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
                'explanation': result['explanation']
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

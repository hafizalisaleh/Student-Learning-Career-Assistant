"""
Quiz generator using RAG and Gemini AI
"""
from typing import List, Dict, Any
import json
import re
from utils.gemini_client import gemini_client

class QuizGenerator:
    """Generate quizzes from content using AI"""
    
    def __init__(self):
        self.gemini_client = gemini_client
    
    def generate_mcq_questions(
        self, 
        content: str, 
        num_questions: int, 
        difficulty: str
    ) -> List[Dict[str, Any]]:
        """
        Generate multiple choice questions
        
        Args:
            content: Source content
            num_questions: Number of questions to generate
            difficulty: Difficulty level
            
        Returns:
            List of MCQ questions
        """
        difficulty_instructions = {
            "easy": "Focus on basic recall and simple concepts. Questions should be straightforward.",
            "medium": "Focus on understanding and application. Questions should require thinking.",
            "hard": "Focus on analysis and synthesis. Questions should be challenging and require deep understanding."
        }
        
        instruction = difficulty_instructions.get(difficulty, difficulty_instructions["medium"])
        
        prompt = f"""
        Generate {num_questions} multiple choice questions from the following content.
        
        Difficulty Level: {difficulty}
        {instruction}
        
        Content:
        {content[:3000]}
        
        Format each question EXACTLY as follows:
        Q1: [Question text]
        A) [Option A]
        B) [Option B]
        C) [Option C]
        D) [Option D]
        CORRECT: [A/B/C/D]
        EXPLANATION: [Brief explanation]
        
        Q2: [Next question]
        ...
        
        Generate {num_questions} questions now:
        """
        
        try:
            response = self.gemini_client.generate_text(prompt, temperature=0.7)
            questions = self._parse_mcq_response(response)
            return questions[:num_questions]
        except Exception as e:
            raise Exception(f"Error generating MCQ questions: {str(e)}")
    
    def generate_short_answer_questions(
        self, 
        content: str, 
        num_questions: int, 
        difficulty: str
    ) -> List[Dict[str, Any]]:
        """Generate short answer questions"""
        
        prompt = f"""
        Generate {num_questions} short answer questions from the following content.
        Difficulty: {difficulty}
        
        Content:
        {content[:3000]}
        
        Format each question as:
        Q1: [Question text]
        ANSWER: [Expected answer - 2-3 sentences]
        
        Q2: [Next question]
        ...
        
        Generate {num_questions} questions:
        """
        
        try:
            response = self.gemini_client.generate_text(prompt, temperature=0.7)
            questions = self._parse_short_answer_response(response)
            return questions[:num_questions]
        except Exception as e:
            raise Exception(f"Error generating short answer questions: {str(e)}")
    
    def generate_true_false_questions(
        self, 
        content: str, 
        num_questions: int, 
        difficulty: str
    ) -> List[Dict[str, Any]]:
        """Generate true/false questions"""
        
        prompt = f"""
        Generate {num_questions} true/false questions from the following content.
        Difficulty: {difficulty}
        
        Content:
        {content[:3000]}
        
        Format each question as:
        Q1: [Statement]
        ANSWER: [TRUE/FALSE]
        EXPLANATION: [Why it's true or false]
        
        Generate {num_questions} questions:
        """
        
        try:
            response = self.gemini_client.generate_text(prompt, temperature=0.7)
            questions = self._parse_true_false_response(response)
            return questions[:num_questions]
        except Exception as e:
            raise Exception(f"Error generating true/false questions: {str(e)}")
    
    def generate_fill_blank_questions(
        self, 
        content: str, 
        num_questions: int, 
        difficulty: str
    ) -> List[Dict[str, Any]]:
        """Generate fill in the blank questions"""
        
        prompt = f"""
        Generate {num_questions} fill in the blank questions from the following content.
        Difficulty: {difficulty}
        
        Content:
        {content[:3000]}
        
        Format each question as:
        Q1: [Sentence with _____ for the blank]
        ANSWER: [Word or phrase that fills the blank]
        
        Generate {num_questions} questions:
        """
        
        try:
            response = self.gemini_client.generate_text(prompt, temperature=0.7)
            questions = self._parse_fill_blank_response(response)
            return questions[:num_questions]
        except Exception as e:
            raise Exception(f"Error generating fill blank questions: {str(e)}")
    
    def generate_mixed_questions(
        self, 
        content: str, 
        num_questions: int, 
        difficulty: str
    ) -> List[Dict[str, Any]]:
        """Generate mixed question types"""
        
        questions = []
        questions_per_type = num_questions // 4
        remainder = num_questions % 4
        
        # Generate each type
        try:
            questions.extend(self.generate_mcq_questions(
                content, questions_per_type + (1 if remainder > 0 else 0), difficulty
            ))
            questions.extend(self.generate_short_answer_questions(
                content, questions_per_type + (1 if remainder > 1 else 0), difficulty
            ))
            questions.extend(self.generate_true_false_questions(
                content, questions_per_type + (1 if remainder > 2 else 0), difficulty
            ))
            questions.extend(self.generate_fill_blank_questions(
                content, questions_per_type, difficulty
            ))
            
            return questions[:num_questions]
        except Exception as e:
            raise Exception(f"Error generating mixed questions: {str(e)}")
    
    def _parse_mcq_response(self, response: str) -> List[Dict[str, Any]]:
        """Parse MCQ response from AI"""
        questions = []
        
        # Split by question number
        question_blocks = re.split(r'Q\d+:', response)[1:]
        
        for block in question_blocks:
            try:
                lines = block.strip().split('\n')
                question_text = lines[0].strip()
                
                options = []
                correct_answer = None
                explanation = ""
                
                for line in lines[1:]:
                    line = line.strip()
                    if line.startswith(('A)', 'B)', 'C)', 'D)')):
                        options.append(line[3:].strip())
                    elif line.startswith('CORRECT:'):
                        correct_letter = line.split(':')[1].strip()
                        correct_map = {'A': 0, 'B': 1, 'C': 2, 'D': 3}
                        correct_answer = options[correct_map.get(correct_letter, 0)] if options else None
                    elif line.startswith('EXPLANATION:'):
                        explanation = line.split(':', 1)[1].strip()
                
                if question_text and options and correct_answer:
                    questions.append({
                        'question_text': question_text,
                        'question_type': 'mcq',
                        'options': options,
                        'correct_answer': correct_answer,
                        'explanation': explanation
                    })
            except Exception as e:
                continue
        
        return questions
    
    def _parse_short_answer_response(self, response: str) -> List[Dict[str, Any]]:
        """Parse short answer response"""
        questions = []
        question_blocks = re.split(r'Q\d+:', response)[1:]
        
        for block in question_blocks:
            try:
                lines = block.strip().split('\n')
                question_text = lines[0].strip()
                answer = ""
                
                for line in lines[1:]:
                    if line.strip().startswith('ANSWER:'):
                        answer = line.split(':', 1)[1].strip()
                        break
                
                if question_text and answer:
                    questions.append({
                        'question_text': question_text,
                        'question_type': 'short',
                        'options': None,
                        'correct_answer': answer,
                        'explanation': f"Expected answer: {answer}"
                    })
            except Exception:
                continue
        
        return questions
    
    def _parse_true_false_response(self, response: str) -> List[Dict[str, Any]]:
        """Parse true/false response"""
        questions = []
        question_blocks = re.split(r'Q\d+:', response)[1:]
        
        for block in question_blocks:
            try:
                lines = block.strip().split('\n')
                question_text = lines[0].strip()
                answer = None
                explanation = ""
                
                for line in lines[1:]:
                    if line.strip().startswith('ANSWER:'):
                        answer = line.split(':')[1].strip().upper()
                    elif line.strip().startswith('EXPLANATION:'):
                        explanation = line.split(':', 1)[1].strip()
                
                if question_text and answer in ['TRUE', 'FALSE']:
                    questions.append({
                        'question_text': question_text,
                        'question_type': 'true_false',
                        'options': ['True', 'False'],
                        'correct_answer': answer.capitalize(),
                        'explanation': explanation
                    })
            except Exception:
                continue
        
        return questions
    
    def _parse_fill_blank_response(self, response: str) -> List[Dict[str, Any]]:
        """Parse fill in the blank response"""
        questions = []
        question_blocks = re.split(r'Q\d+:', response)[1:]
        
        for block in question_blocks:
            try:
                lines = block.strip().split('\n')
                question_text = lines[0].strip()
                answer = ""
                
                for line in lines[1:]:
                    if line.strip().startswith('ANSWER:'):
                        answer = line.split(':', 1)[1].strip()
                        break
                
                if question_text and answer and '_' in question_text:
                    questions.append({
                        'question_text': question_text,
                        'question_type': 'fill_blank',
                        'options': None,
                        'correct_answer': answer,
                        'explanation': f"The blank should be filled with: {answer}"
                    })
            except Exception:
                continue
        
        return questions

# Global generator instance
quiz_generator = QuizGenerator()

"""
Career recommendation generator
"""
from typing import Dict, Any, List
from utils.gemini_client import gemini_client
import json

class CareerRecommender:
    """Generate career recommendations and learning paths"""
    
    def __init__(self):
        self.gemini = gemini_client
    
    def generate_recommendations(
        self, 
        parsed_content: Dict[str, Any],
        analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate personalized career recommendations
        
        Args:
            parsed_content: Parsed resume data
            analysis: Resume analysis results
            
        Returns:
            Career recommendations
        """
        skills = parsed_content.get('skills', [])
        experience_years = parsed_content.get('experience_years', 0)
        education = parsed_content.get('education', [])
        
        prompt = f"""
Based on the following candidate profile, provide comprehensive career recommendations:

CURRENT SKILLS:
{', '.join(skills)}

EXPERIENCE:
{experience_years} years

EDUCATION:
{', '.join(education[:2])}

RESUME STRENGTHS:
{', '.join(analysis.get('strengths', []))}

AREAS FOR IMPROVEMENT:
{', '.join(analysis.get('weaknesses', []))}

Provide recommendations in the following JSON format:
{{
    "job_titles": ["title1", "title2", "title3", "title4", "title5"],
    "skills_to_learn": ["skill1", "skill2", "skill3", "skill4", "skill5"],
    "course_recommendations": [
        {{"title": "course name", "platform": "platform", "reason": "why this course"}},
        {{"title": "course name", "platform": "platform", "reason": "why this course"}},
        {{"title": "course name", "platform": "platform", "reason": "why this course"}}
    ],
    "industry_insights": "detailed insights about career trajectory and industry trends"
}}

Focus on:
1. Realistic job titles based on current skills and experience
2. High-demand skills that complement current expertise
3. Specific courses on platforms like Coursera, Udemy, edX
4. Industry trends and growth opportunities
"""
        
        try:
            response = self.gemini.generate_text(prompt, temperature=0.5)
            recommendations = self._parse_recommendations(response)
            
            # Ensure all fields exist
            recommendations.setdefault('job_titles', self._generate_job_titles(skills))
            recommendations.setdefault('skills_to_learn', self._suggest_skills(skills))
            recommendations.setdefault('course_recommendations', self._suggest_courses(skills))
            recommendations.setdefault('industry_insights', 'Continue building expertise in your field')
            
            return recommendations
            
        except Exception:
            # Fallback to rule-based recommendations
            return self._rule_based_recommendations(parsed_content)
    
    def _parse_recommendations(self, response: str) -> Dict[str, Any]:
        """Parse AI response into structured recommendations"""
        try:
            # Extract JSON
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            
            if json_start != -1 and json_end > json_start:
                json_str = response[json_start:json_end]
                return json.loads(json_str)
            
            return {}
            
        except Exception:
            return {}
    
    def _rule_based_recommendations(self, parsed_content: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback rule-based recommendations"""
        skills = parsed_content.get('skills', [])
        
        return {
            'job_titles': self._generate_job_titles(skills),
            'skills_to_learn': self._suggest_skills(skills),
            'course_recommendations': self._suggest_courses(skills),
            'industry_insights': self._generate_insights(skills)
        }
    
    def _generate_job_titles(self, skills: List[str]) -> List[str]:
        """Generate relevant job titles based on skills"""
        skills_lower = [s.lower() for s in skills]
        
        job_mappings = {
            'python': ['Python Developer', 'Backend Developer', 'Data Scientist'],
            'machine learning': ['ML Engineer', 'AI Researcher', 'Data Scientist'],
            'react': ['Frontend Developer', 'Full Stack Developer', 'React Developer'],
            'java': ['Java Developer', 'Backend Engineer', 'Software Engineer'],
            'data science': ['Data Scientist', 'Data Analyst', 'ML Engineer'],
            'aws': ['Cloud Engineer', 'DevOps Engineer', 'Solutions Architect']
        }
        
        job_titles = set()
        for skill in skills_lower:
            for key, titles in job_mappings.items():
                if key in skill:
                    job_titles.update(titles)
        
        if not job_titles:
            job_titles = ['Software Engineer', 'Developer', 'Technical Specialist']
        
        return list(job_titles)[:5]
    
    def _suggest_skills(self, current_skills: List[str]) -> List[str]:
        """Suggest complementary skills to learn"""
        skills_lower = [s.lower() for s in current_skills]
        
        skill_recommendations = {
            'python': ['FastAPI', 'Django', 'PostgreSQL', 'Docker', 'AWS'],
            'javascript': ['TypeScript', 'React', 'Node.js', 'MongoDB', 'GraphQL'],
            'data science': ['Machine Learning', 'Deep Learning', 'TensorFlow', 'SQL', 'Statistics'],
            'machine learning': ['Deep Learning', 'PyTorch', 'MLOps', 'Computer Vision', 'NLP'],
            'react': ['Next.js', 'TypeScript', 'Redux', 'Testing', 'CI/CD']
        }
        
        suggested = set()
        for skill in skills_lower:
            for key, recommendations in skill_recommendations.items():
                if key in skill:
                    suggested.update(recommendations)
        
        # Remove already known skills
        suggested = suggested - set([s.title() for s in skills_lower])
        
        if not suggested:
            suggested = {'Docker', 'Kubernetes', 'CI/CD', 'Cloud Computing', 'System Design'}
        
        return list(suggested)[:5]
    
    def _suggest_courses(self, skills: List[str]) -> List[Dict[str, str]]:
        """Suggest relevant courses"""
        skills_lower = [s.lower() for s in skills]
        
        course_database = [
            {
                'title': 'Complete Python Bootcamp',
                'platform': 'Udemy',
                'reason': 'Strengthen Python fundamentals',
                'keywords': ['python']
            },
            {
                'title': 'Machine Learning Specialization',
                'platform': 'Coursera',
                'reason': 'Learn ML algorithms and applications',
                'keywords': ['machine learning', 'data science']
            },
            {
                'title': 'React - The Complete Guide',
                'platform': 'Udemy',
                'reason': 'Master modern React development',
                'keywords': ['react', 'javascript']
            },
            {
                'title': 'AWS Certified Solutions Architect',
                'platform': 'A Cloud Guru',
                'reason': 'Master cloud architecture',
                'keywords': ['aws', 'cloud']
            },
            {
                'title': 'Deep Learning Specialization',
                'platform': 'Coursera',
                'reason': 'Advanced neural networks',
                'keywords': ['deep learning', 'tensorflow']
            }
        ]
        
        relevant_courses = []
        for course in course_database:
            if any(keyword in ' '.join(skills_lower) for keyword in course['keywords']):
                relevant_courses.append({
                    'title': course['title'],
                    'platform': course['platform'],
                    'reason': course['reason']
                })
        
        if not relevant_courses:
            relevant_courses = course_database[:3]
        
        return relevant_courses[:3]
    
    def _generate_insights(self, skills: List[str]) -> str:
        """Generate industry insights"""
        skills_lower = [s.lower() for s in skills]
        
        if any(s in ' '.join(skills_lower) for s in ['machine learning', 'ai', 'data science']):
            return "AI and ML fields are experiencing rapid growth with high demand for skilled professionals. Focus on practical projects and stay updated with latest frameworks."
        elif any(s in ' '.join(skills_lower) for s in ['react', 'javascript', 'frontend']):
            return "Frontend development continues to evolve with frameworks like Next.js and Svelte. Full-stack capabilities are increasingly valuable."
        elif any(s in ' '.join(skills_lower) for s in ['aws', 'cloud', 'devops']):
            return "Cloud computing and DevOps skills are critical in modern software development. Multi-cloud expertise is becoming essential."
        else:
            return "Software development offers diverse career paths. Focus on building strong fundamentals and practical experience through projects."

career_recommender = CareerRecommender()

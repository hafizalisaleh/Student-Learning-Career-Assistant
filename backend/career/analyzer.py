"""
AI-powered resume analyzer
"""
from typing import Dict, Any, List
from utils.gemini_client import gemini_client
import json

class ResumeAnalyzer:
    """Analyzer for comprehensive resume evaluation"""
    
    def __init__(self):
        self.gemini = gemini_client
    
    def analyze_resume(self, parsed_content: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze resume and provide comprehensive feedback
        
        Args:
            parsed_content: Parsed resume data
            
        Returns:
            Analysis results with scores and suggestions
        """
        raw_text = parsed_content.get('raw_text', '')
        skills = parsed_content.get('skills', [])
        education = parsed_content.get('education', [])
        sections = parsed_content.get('sections', [])
        
        # Generate AI analysis
        prompt = f"""
Analyze the following resume and provide a comprehensive evaluation:

RESUME TEXT:
{raw_text[:2000]}

IDENTIFIED SKILLS:
{', '.join(skills)}

EDUCATION:
{', '.join(education)}

RESUME SECTIONS:
{', '.join(sections)}

Please provide a detailed analysis in the following JSON format:
{{
    "ats_score": <score 0-100>,
    "strengths": ["strength1", "strength2", "strength3"],
    "weaknesses": ["weakness1", "weakness2", "weakness3"],
    "improvement_suggestions": ["suggestion1", "suggestion2", "suggestion3"],
    "keyword_match_score": <score 0-100>,
    "formatting_score": <score 0-100>,
    "content_quality_score": <score 0-100>,
    "detailed_feedback": "comprehensive feedback text"
}}

Consider:
1. ATS compatibility (keyword usage, formatting)
2. Content quality (achievements, quantifiable results)
3. Structure and organization
4. Skills relevance and presentation
5. Missing critical sections
6. Overall professionalism
"""
        
        try:
            response = self.gemini.generate_text(prompt, temperature=0.3)
            analysis = self._parse_analysis(response)
            
            # Calculate overall ATS score if not provided
            if 'ats_score' not in analysis:
                analysis['ats_score'] = self._calculate_ats_score(
                    analysis.get('keyword_match_score', 50),
                    analysis.get('formatting_score', 50),
                    analysis.get('content_quality_score', 50)
                )
            
            return analysis
            
        except Exception as e:
            # Fallback to rule-based analysis
            return self._rule_based_analysis(parsed_content)
    
    def _parse_analysis(self, response: str) -> Dict[str, Any]:
        """Parse AI response into structured format"""
        try:
            # Try to extract JSON from response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            
            if json_start != -1 and json_end > json_start:
                json_str = response[json_start:json_end]
                return json.loads(json_str)
            
            # Fallback parsing
            return self._extract_analysis_data(response)
            
        except Exception:
            return self._extract_analysis_data(response)
    
    def _extract_analysis_data(self, response: str) -> Dict[str, Any]:
        """Extract analysis data from unstructured response"""
        # Default structure
        analysis = {
            'ats_score': 65.0,
            'strengths': [],
            'weaknesses': [],
            'improvement_suggestions': [],
            'keyword_match_score': 60.0,
            'formatting_score': 70.0,
            'content_quality_score': 65.0,
            'detailed_feedback': response[:500]
        }
        
        # Try to extract lists
        lines = response.split('\n')
        current_section = None
        
        for line in lines:
            line_lower = line.lower().strip()
            
            if 'strength' in line_lower:
                current_section = 'strengths'
            elif 'weakness' in line_lower:
                current_section = 'weaknesses'
            elif 'suggestion' in line_lower or 'improvement' in line_lower:
                current_section = 'improvement_suggestions'
            elif line.strip().startswith(('*', '-', '•')) and current_section:
                item = line.strip().lstrip('*-•').strip()
                if item and len(analysis[current_section]) < 5:
                    analysis[current_section].append(item)
        
        return analysis
    
    def _rule_based_analysis(self, parsed_content: Dict[str, Any]) -> Dict[str, Any]:
        """Fallback rule-based analysis"""
        skills = parsed_content.get('skills', [])
        sections = parsed_content.get('sections', [])
        education = parsed_content.get('education', [])
        
        # Calculate scores
        keyword_score = min(len(skills) * 10, 100)
        formatting_score = min(len(sections) * 15, 100)
        content_score = 50 + (10 if education else 0) + (10 if len(skills) > 5 else 0)
        
        strengths = []
        weaknesses = []
        suggestions = []
        
        # Analyze strengths
        if len(skills) > 8:
            strengths.append("Strong technical skills section")
        if 'Experience' in sections:
            strengths.append("Includes work experience section")
        if education:
            strengths.append("Education background clearly stated")
        
        # Analyze weaknesses
        if len(skills) < 5:
            weaknesses.append("Limited skills listed")
        if 'Summary' not in sections and 'Objective' not in sections:
            weaknesses.append("Missing professional summary")
        if 'Projects' not in sections:
            weaknesses.append("No projects section")
        
        # Generate suggestions
        if len(skills) < 8:
            suggestions.append("Add more relevant technical skills")
        if 'Certifications' not in sections:
            suggestions.append("Include professional certifications if available")
        suggestions.append("Use action verbs and quantify achievements")
        suggestions.append("Ensure ATS-friendly formatting (avoid tables/images)")
        
        ats_score = self._calculate_ats_score(keyword_score, formatting_score, content_score)
        
        return {
            'ats_score': ats_score,
            'strengths': strengths[:5],
            'weaknesses': weaknesses[:5],
            'improvement_suggestions': suggestions[:5],
            'keyword_match_score': keyword_score,
            'formatting_score': formatting_score,
            'content_quality_score': content_score,
            'detailed_feedback': 'Rule-based analysis completed'
        }
    
    def _calculate_ats_score(
        self, 
        keyword_score: float, 
        formatting_score: float, 
        content_score: float
    ) -> float:
        """Calculate overall ATS score"""
        return round((keyword_score * 0.4 + formatting_score * 0.3 + content_score * 0.3), 2)
    
    def match_job(
        self, 
        parsed_content: Dict[str, Any], 
        job_description: str,
        required_skills: List[str]
    ) -> Dict[str, Any]:
        """
        Match resume against job description
        
        Args:
            parsed_content: Parsed resume data
            job_description: Job description text
            required_skills: List of required skills
            
        Returns:
            Job match analysis
        """
        resume_skills = set([s.lower() for s in parsed_content.get('skills', [])])
        required_skills_lower = set([s.lower() for s in required_skills])
        
        # Calculate matches
        matched_skills = resume_skills.intersection(required_skills_lower)
        missing_skills = required_skills_lower - resume_skills
        
        match_score = (len(matched_skills) / len(required_skills_lower) * 100) if required_skills_lower else 0
        
        # Generate AI recommendations
        prompt = f"""
Compare this resume with the job description and provide recommendations:

JOB DESCRIPTION:
{job_description[:1000]}

RESUME SKILLS:
{', '.join(parsed_content.get('skills', []))}

MATCHED SKILLS:
{', '.join(matched_skills)}

MISSING SKILLS:
{', '.join(missing_skills)}

Provide 3-5 specific recommendations for improving the match.
"""
        
        try:
            recommendations_text = self.gemini.generate_text(prompt, temperature=0.3)
            recommendations = [
                line.strip().lstrip('*-•').strip() 
                for line in recommendations_text.split('\n') 
                if line.strip().startswith(('*', '-', '•', '1', '2', '3', '4', '5'))
            ][:5]
        except Exception:
            recommendations = [
                f"Acquire missing skills: {', '.join(list(missing_skills)[:3])}",
                "Tailor resume to highlight relevant experience",
                "Add keywords from job description"
            ]
        
        return {
            'match_score': round(match_score, 2),
            'matched_skills': list(matched_skills),
            'missing_skills': list(missing_skills),
            'recommendations': recommendations
        }
    
    def analyze_with_interest_profile(
        self,
        parsed_content: Dict[str, Any],
        interest_profile: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Enhanced resume analysis using user's document interest profile
        Provides personalized recommendations based on learning history
        
        Args:
            parsed_content: Parsed resume data
            interest_profile: User's aggregated interests from documents
            
        Returns:
            Comprehensive analysis with interest-based recommendations
        """
        resume_skills = parsed_content.get('skills', [])
        resume_text = parsed_content.get('raw_text', '')
        
        # Extract data from interest profile
        user_domains = interest_profile.get('primary_domains', [])
        user_topics = interest_profile.get('primary_topics', [])
        user_skills = interest_profile.get('top_skills', [])
        user_technologies = interest_profile.get('technologies', [])
        user_languages = interest_profile.get('programming_languages', [])
        
        # Generate comprehensive AI analysis
        prompt = f"""
Analyze this resume considering the user's learning profile from their study documents:

RESUME CONTENT:
{resume_text[:2000]}

RESUME SKILLS:
{', '.join(resume_skills)}

USER'S LEARNING PROFILE (from uploaded study materials):
- Primary Domains: {', '.join(user_domains[:5])}
- Topics Studied: {', '.join(user_topics[:10])}
- Technical Skills Learned: {', '.join(user_skills[:10])}
- Technologies: {', '.join(user_technologies[:10])}
- Programming Languages: {', '.join(user_languages)}

Provide a comprehensive analysis in JSON format:
{{
    "resume_gaps": {{
        "missing_learned_skills": ["skills from learning profile not in resume"],
        "underrepresented_domains": ["domains studied but not highlighted"],
        "technologies_to_add": ["technologies learned but not mentioned"]
    }},
    "recommendations": {{
        "skills_to_add": ["specific skills from learning to add"],
        "projects_to_showcase": ["project ideas based on learned topics"],
        "certifications_to_pursue": ["certifications aligned with domains"],
        "keywords_to_include": ["ATS keywords based on learning"],
        "sections_to_improve": ["resume sections needing work"]
    }},
    "career_alignment": {{
        "suitable_roles": ["job roles matching learning profile"],
        "industries": ["industries aligned with domains"],
        "career_path_suggestions": ["career progression based on skills"]
    }},
    "actionable_steps": {{
        "immediate": ["actions to take right now"],
        "short_term": ["actions for next 1-3 months"],
        "long_term": ["actions for 3-12 months"]
    }},
    "strengths": ["resume strengths considering learning"],
    "improvement_priority": "high/medium/low"
}}

Focus on:
1. Skills learned but missing from resume
2. How to better showcase documented knowledge
3. Specific projects based on study materials
4. Career paths aligned with learning domains
5. Certifications that validate learned skills

Return ONLY the JSON object.
"""
        
        try:
            response = self.gemini.generate_text(prompt, temperature=0.3)
            analysis = self._parse_analysis(response)
            
            # Add metadata
            analysis['analysis_type'] = 'interest_profile_enhanced'
            analysis['domains_analyzed'] = user_domains[:5]
            analysis['topics_analyzed'] = user_topics[:10]
            
            return analysis
            
        except Exception as e:
            # Fallback analysis
            return self._fallback_interest_analysis(
                resume_skills,
                user_domains,
                user_topics,
                user_skills,
                user_technologies,
                user_languages
            )
    
    def _fallback_interest_analysis(
        self,
        resume_skills: List[str],
        user_domains: List[str],
        user_topics: List[str],
        user_skills: List[str],
        user_technologies: List[str],
        user_languages: List[str]
    ) -> Dict[str, Any]:
        """Fallback analysis when AI fails"""
        resume_skills_lower = set([s.lower() for s in resume_skills])
        user_skills_lower = set([s.lower() for s in user_skills])
        user_tech_lower = set([t.lower() for t in user_technologies])
        
        # Find gaps
        missing_skills = [s for s in user_skills if s.lower() not in resume_skills_lower]
        missing_tech = [t for t in user_technologies if t.lower() not in resume_skills_lower]
        
        return {
            'resume_gaps': {
                'missing_learned_skills': missing_skills[:10],
                'underrepresented_domains': user_domains[:5],
                'technologies_to_add': missing_tech[:10]
            },
            'recommendations': {
                'skills_to_add': missing_skills[:5],
                'projects_to_showcase': [
                    f"Build a project demonstrating {topic}" for topic in user_topics[:3]
                ],
                'certifications_to_pursue': [
                    f"{domain} Certification" for domain in user_domains[:3]
                ],
                'keywords_to_include': user_skills[:10] + user_technologies[:10],
                'sections_to_improve': ['Skills', 'Projects', 'Technical Summary']
            },
            'career_alignment': {
                'suitable_roles': self._suggest_roles_from_domains(user_domains),
                'industries': user_domains[:5],
                'career_path_suggestions': [
                    f"Specialize in {domain}" for domain in user_domains[:3]
                ]
            },
            'actionable_steps': {
                'immediate': [
                    'Update resume with learned skills',
                    'Add relevant keywords',
                    'Create projects portfolio'
                ],
                'short_term': [
                    'Pursue relevant certifications',
                    'Build 2-3 portfolio projects',
                    'Network in target industries'
                ],
                'long_term': [
                    'Gain practical experience',
                    'Contribute to open source',
                    'Build expertise in chosen domain'
                ]
            },
            'strengths': [
                f"Learning {domain}" for domain in user_domains[:3]
            ],
            'improvement_priority': 'high' if missing_skills else 'medium',
            'analysis_type': 'fallback_interest_profile'
        }
    
    def _suggest_roles_from_domains(self, domains: List[str]) -> List[str]:
        """Suggest job roles based on domains"""
        domain_role_map = {
            'Artificial Intelligence': ['ML Engineer', 'AI Researcher', 'Data Scientist'],
            'Web Development': ['Full Stack Developer', 'Frontend Developer', 'Backend Developer'],
            'Data Science': ['Data Analyst', 'Data Scientist', 'Business Intelligence Analyst'],
            'Cloud Computing': ['Cloud Engineer', 'DevOps Engineer', 'Cloud Architect'],
            'Cybersecurity': ['Security Analyst', 'Security Engineer', 'Penetration Tester'],
            'Mobile Development': ['Mobile Developer', 'iOS Developer', 'Android Developer'],
            'Database': ['Database Administrator', 'Data Engineer', 'Database Developer'],
            'Software Engineering': ['Software Engineer', 'Software Developer', 'Systems Engineer']
        }
        
        roles = []
        for domain in domains[:5]:
            if domain in domain_role_map:
                roles.extend(domain_role_map[domain])
        
        return list(set(roles))[:10]  # Return unique roles, max 10

resume_analyzer = ResumeAnalyzer()


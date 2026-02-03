"""
Intelligent skill matching engine for resume analysis
Compares resume skills with user's learning profile
"""
from typing import Dict, Any, List, Tuple, Set
from difflib import SequenceMatcher
import re

class SkillMatcher:
    """
    Matches resume skills with learned skills from documents
    Provides gap analysis and recommendations
    """
    
    # Skill synonyms for better matching
    SKILL_SYNONYMS = {
        'javascript': ['js', 'ecmascript', 'node.js', 'nodejs'],
        'python': ['py'],
        'machine learning': ['ml', 'artificial intelligence', 'ai'],
        'deep learning': ['dl', 'neural networks'],
        'react': ['react.js', 'reactjs'],
        'angular': ['angularjs', 'angular.js'],
        'vue': ['vue.js', 'vuejs'],
        'node': ['node.js', 'nodejs'],
        'mongodb': ['mongo'],
        'postgresql': ['postgres', 'psql'],
        'docker': ['containerization'],
        'kubernetes': ['k8s'],
        'aws': ['amazon web services'],
        'gcp': ['google cloud platform', 'google cloud'],
        'azure': ['microsoft azure'],
        'typescript': ['ts'],
        'html': ['html5'],
        'css': ['css3', 'styling'],
        'sql': ['structured query language'],
        'git': ['version control', 'github', 'gitlab'],
    }
    
    # Skill categories for better organization
    SKILL_CATEGORIES = {
        'Programming Languages': [
            'python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'c', 
            'ruby', 'php', 'swift', 'kotlin', 'go', 'rust', 'scala'
        ],
        'Web Development': [
            'html', 'css', 'react', 'angular', 'vue', 'next.js', 'node.js',
            'express', 'django', 'flask', 'fastapi', 'spring', 'asp.net'
        ],
        'Databases': [
            'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'cassandra',
            'oracle', 'sqlite', 'dynamodb', 'elasticsearch'
        ],
        'Cloud & DevOps': [
            'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins',
            'terraform', 'ansible', 'ci/cd', 'github actions'
        ],
        'Data Science & AI': [
            'machine learning', 'deep learning', 'tensorflow', 'pytorch',
            'pandas', 'numpy', 'data analysis', 'nlp', 'computer vision'
        ],
        'Mobile Development': [
            'android', 'ios', 'react native', 'flutter', 'xamarin', 'ionic'
        ],
        'Tools & Others': [
            'git', 'linux', 'agile', 'scrum', 'jira', 'testing', 'jest', 'pytest'
        ]
    }
    
    @staticmethod
    def normalize_skill(skill: str) -> str:
        """Normalize skill name for comparison"""
        return skill.lower().strip().replace('.', '').replace('-', ' ')
    
    @staticmethod
    def are_skills_similar(skill1: str, skill2: str, threshold: float = 0.85) -> bool:
        """
        Check if two skills are similar using fuzzy matching
        
        Args:
            skill1: First skill
            skill2: Second skill
            threshold: Similarity threshold (0-1)
            
        Returns:
            True if skills are similar
        """
        skill1_norm = SkillMatcher.normalize_skill(skill1)
        skill2_norm = SkillMatcher.normalize_skill(skill2)
        
        # Exact match
        if skill1_norm == skill2_norm:
            return True
        
        # Check synonyms
        for base_skill, synonyms in SkillMatcher.SKILL_SYNONYMS.items():
            if (skill1_norm == base_skill or skill1_norm in synonyms) and \
               (skill2_norm == base_skill or skill2_norm in synonyms):
                return True
        
        # Fuzzy matching
        similarity = SequenceMatcher(None, skill1_norm, skill2_norm).ratio()
        return similarity >= threshold
    
    @staticmethod
    def match_skills(
        resume_skills: List[str],
        learned_skills: List[str],
        threshold: float = 0.85
    ) -> Dict[str, Any]:
        """
        Match resume skills with learned skills
        
        Args:
            resume_skills: Skills from resume
            learned_skills: Skills from learning documents
            threshold: Similarity threshold
            
        Returns:
            Detailed match analysis
        """
        resume_skills_set = set([SkillMatcher.normalize_skill(s) for s in resume_skills])
        learned_skills_set = set([SkillMatcher.normalize_skill(s) for s in learned_skills])
        
        # Find matches
        matched_skills = []
        missing_from_resume = []
        unmatched_resume = set(resume_skills_set)
        unmatched_learned = set(learned_skills_set)
        
        # Direct and fuzzy matching
        for learned_skill in learned_skills:
            learned_norm = SkillMatcher.normalize_skill(learned_skill)
            matched = False
            
            for resume_skill in resume_skills:
                resume_norm = SkillMatcher.normalize_skill(resume_skill)
                
                if SkillMatcher.are_skills_similar(learned_skill, resume_skill, threshold):
                    matched_skills.append({
                        'learned': learned_skill,
                        'resume': resume_skill,
                        'similarity': SequenceMatcher(None, learned_norm, resume_norm).ratio()
                    })
                    matched = True
                    unmatched_resume.discard(resume_norm)
                    unmatched_learned.discard(learned_norm)
                    break
            
            if not matched:
                missing_from_resume.append(learned_skill)
        
        # Calculate scores
        total_learned = len(learned_skills)
        total_matched = len(matched_skills)
        match_percentage = (total_matched / total_learned * 100) if total_learned > 0 else 0
        
        return {
            'matched_skills': matched_skills,
            'missing_from_resume': missing_from_resume,
            'extra_in_resume': list(unmatched_resume),
            'match_score': round(match_percentage, 2),
            'total_learned_skills': total_learned,
            'total_matched': total_matched,
            'total_missing': len(missing_from_resume)
        }
    
    @staticmethod
    def categorize_skills(skills: List[str]) -> Dict[str, List[str]]:
        """
        Categorize skills into groups
        
        Args:
            skills: List of skills
            
        Returns:
            Dictionary of categorized skills
        """
        categorized = {category: [] for category in SkillMatcher.SKILL_CATEGORIES.keys()}
        categorized['Other'] = []
        
        for skill in skills:
            skill_norm = SkillMatcher.normalize_skill(skill)
            categorized_flag = False
            
            for category, category_skills in SkillMatcher.SKILL_CATEGORIES.items():
                for cat_skill in category_skills:
                    if SkillMatcher.are_skills_similar(skill, cat_skill, threshold=0.8):
                        categorized[category].append(skill)
                        categorized_flag = True
                        break
                if categorized_flag:
                    break
            
            if not categorized_flag:
                categorized['Other'].append(skill)
        
        # Remove empty categories
        return {k: v for k, v in categorized.items() if v}
    
    @staticmethod
    def analyze_skill_gaps(
        resume_skills: List[str],
        learned_skills: List[str],
        learned_domains: List[str]
    ) -> Dict[str, Any]:
        """
        Comprehensive skill gap analysis
        
        Args:
            resume_skills: Skills from resume
            learned_skills: Skills learned from documents
            learned_domains: Domains/topics studied
            
        Returns:
            Detailed gap analysis with priorities
        """
        # Match skills
        match_result = SkillMatcher.match_skills(resume_skills, learned_skills)
        
        # Categorize missing skills
        missing_categorized = SkillMatcher.categorize_skills(match_result['missing_from_resume'])
        
        # Prioritize missing skills
        high_priority = []
        medium_priority = []
        low_priority = []
        
        for skill in match_result['missing_from_resume']:
            skill_norm = SkillMatcher.normalize_skill(skill)
            
            # High priority: core skills in primary domains
            if any(domain.lower() in skill_norm or skill_norm in domain.lower() 
                   for domain in learned_domains[:3]):
                high_priority.append(skill)
            # Medium priority: related to domains
            elif any(domain.lower() in skill_norm or skill_norm in domain.lower() 
                     for domain in learned_domains):
                medium_priority.append(skill)
            # Low priority: other skills
            else:
                low_priority.append(skill)
        
        # Identify strengths
        strengths = []
        if match_result['matched_skills']:
            strengths = [match['learned'] for match in match_result['matched_skills'][:10]]
        
        # Generate insights
        insights = []
        
        if match_result['match_score'] < 30:
            insights.append({
                'type': 'critical',
                'message': 'Your resume shows limited skills from your learning profile. Consider adding more relevant skills.'
            })
        elif match_result['match_score'] < 60:
            insights.append({
                'type': 'warning',
                'message': 'Your resume could better reflect your learning journey. Add more learned skills.'
            })
        else:
            insights.append({
                'type': 'success',
                'message': 'Good alignment between your resume and learning profile!'
            })
        
        if high_priority:
            insights.append({
                'type': 'action',
                'message': f'Add these {len(high_priority)} high-priority skills that align with your primary domains.'
            })
        
        return {
            'match_score': match_result['match_score'],
            'matched_skills': strengths,
            'gaps': {
                'high_priority': high_priority,
                'medium_priority': medium_priority,
                'low_priority': low_priority,
                'categorized': missing_categorized
            },
            'extra_skills': match_result['extra_in_resume'],
            'insights': insights,
            'recommendations': SkillMatcher._generate_gap_recommendations(
                high_priority, medium_priority, learned_domains
            )
        }
    
    @staticmethod
    def _generate_gap_recommendations(
        high_priority: List[str],
        medium_priority: List[str],
        domains: List[str]
    ) -> List[str]:
        """Generate recommendations based on gaps"""
        recommendations = []
        
        if high_priority:
            recommendations.append(
                f"⚠️ Add high-priority skills to resume: {', '.join(high_priority[:5])}"
            )
            recommendations.append(
                f"Create a 'Technical Skills' section highlighting: {', '.join(high_priority[:3])}"
            )
        
        if medium_priority:
            recommendations.append(
                f"Consider adding: {', '.join(medium_priority[:5])}"
            )
        
        if domains:
            recommendations.append(
                f"Emphasize expertise in: {', '.join(domains[:3])}"
            )
            recommendations.append(
                f"Tailor your professional summary to highlight {domains[0]} skills"
            )
        
        recommendations.append(
            "Quantify your experience with specific tools and technologies"
        )
        recommendations.append(
            "Include projects that demonstrate your learned skills"
        )
        
        return recommendations
    
    @staticmethod
    def suggest_skill_additions(
        resume_skills: List[str],
        learned_skills: List[str],
        technologies: List[str],
        programming_languages: List[str]
    ) -> Dict[str, List[str]]:
        """
        Suggest specific skills to add to resume
        
        Args:
            resume_skills: Current resume skills
            learned_skills: Skills from learning
            technologies: Technologies studied
            programming_languages: Languages studied
            
        Returns:
            Categorized skill suggestions
        """
        all_learned = set(learned_skills + technologies + programming_languages)
        resume_normalized = set([SkillMatcher.normalize_skill(s) for s in resume_skills])
        
        suggestions = {
            'programming_languages': [],
            'frameworks_libraries': [],
            'tools_platforms': [],
            'core_skills': []
        }
        
        for skill in all_learned:
            skill_norm = SkillMatcher.normalize_skill(skill)
            
            # Skip if already in resume
            if any(SkillMatcher.are_skills_similar(skill, rs, 0.85) for rs in resume_skills):
                continue
            
            # Categorize suggestion
            if skill in programming_languages:
                suggestions['programming_languages'].append(skill)
            elif any(fw in skill_norm for fw in ['react', 'angular', 'vue', 'django', 'flask', 'spring']):
                suggestions['frameworks_libraries'].append(skill)
            elif any(tool in skill_norm for tool in ['docker', 'kubernetes', 'aws', 'azure', 'git']):
                suggestions['tools_platforms'].append(skill)
            else:
                suggestions['core_skills'].append(skill)
        
        # Limit each category
        return {k: v[:10] for k, v in suggestions.items() if v}

skill_matcher = SkillMatcher()

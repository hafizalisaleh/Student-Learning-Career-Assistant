"""
Intelligent recommendation engine for career guidance
Provides personalized suggestions for skills, projects, certifications based on user profile
"""
from typing import Dict, Any, List
from utils.gemini_client import gemini_client
import json


class RecommendationEngine:
    """
    Generates comprehensive career recommendations by analyzing:
    - User's learning profile (documents uploaded)
    - Resume content and gaps
    - Industry trends and requirements
    """
    
    def __init__(self):
        self.gemini = gemini_client
    
    def generate_comprehensive_recommendations(
        self,
        resume_data: Dict[str, Any],
        interest_profile: Dict[str, Any],
        skill_gaps: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Generate comprehensive career recommendations
        
        Args:
            resume_data: Parsed resume data
            interest_profile: User's learning profile from documents
            skill_gaps: Analyzed skill gaps
            
        Returns:
            Detailed recommendations for improvement
        """
        # Extract key information
        resume_skills = resume_data.get('skills', [])
        resume_projects = resume_data.get('projects', [])
        resume_certifications = resume_data.get('certifications', [])
        resume_experience = resume_data.get('experience', [])
        
        learned_domains = interest_profile.get('primary_domains', [])
        learned_topics = interest_profile.get('primary_topics', [])
        learned_skills = interest_profile.get('top_skills', [])
        technologies = interest_profile.get('technologies', [])
        languages = interest_profile.get('programming_languages', [])
        
        # Generate AI-powered recommendations
        try:
            recommendations = self._generate_ai_recommendations(
                resume_data, interest_profile, skill_gaps
            )
        except Exception as e:
            print(f"AI recommendations failed: {e}, using rule-based")
            recommendations = self._generate_fallback_recommendations(
                resume_data, interest_profile, skill_gaps
            )
        
        return recommendations
    
    def _generate_ai_recommendations(
        self,
        resume_data: Dict[str, Any],
        interest_profile: Dict[str, Any],
        skill_gaps: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate AI-powered recommendations using Gemini"""
        
        prompt = f"""
As a career advisor, analyze this candidate's resume against their learning profile and provide comprehensive guidance.

RESUME SUMMARY:
- Skills: {', '.join(resume_data.get('skills', [])[:15])}
- Projects: {len(resume_data.get('projects', []))} projects
- Certifications: {len(resume_data.get('certifications', []))} certifications
- Experience: {resume_data.get('experience_years', 0)} years

LEARNING PROFILE (from uploaded study materials):
- Primary Domains: {', '.join(interest_profile.get('primary_domains', [])[:5])}
- Topics Studied: {', '.join(interest_profile.get('primary_topics', [])[:10])}
- Technical Skills Learned: {', '.join(interest_profile.get('top_skills', [])[:10])}
- Technologies: {', '.join(interest_profile.get('technologies', [])[:10])}
- Programming Languages: {', '.join(interest_profile.get('programming_languages', []))}

SKILL GAPS IDENTIFIED:
- High Priority Missing Skills: {', '.join(skill_gaps.get('gaps', {}).get('high_priority', [])[:10])}
- Medium Priority: {', '.join(skill_gaps.get('gaps', {}).get('medium_priority', [])[:10])}
- Match Score: {skill_gaps.get('match_score', 0)}%

Provide detailed recommendations in this JSON format:
{{
    "skills_to_add": [
        {{
            "skill": "skill name",
            "reason": "why this skill is important",
            "priority": "high/medium/low",
            "where_to_add": "which section of resume"
        }}
    ],
    "skills_to_remove": [
        {{
            "skill": "skill name",
            "reason": "why to remove or update"
        }}
    ],
    "projects_to_add": [
        {{
            "project_idea": "project title",
            "description": "what to build",
            "technologies": ["tech1", "tech2"],
            "impact": "how it helps resume",
            "difficulty": "beginner/intermediate/advanced"
        }}
    ],
    "projects_to_improve": [
        {{
            "current_project": "existing project name (if available)",
            "improvements": ["improvement1", "improvement2"],
            "technologies_to_add": ["tech1", "tech2"]
        }}
    ],
    "certifications_to_pursue": [
        {{
            "certification": "certification name",
            "provider": "organization offering it",
            "relevance": "why it's relevant to their profile",
            "priority": "high/medium/low",
            "estimated_time": "time to complete"
        }}
    ],
    "resume_structure_improvements": [
        "improvement suggestion 1",
        "improvement suggestion 2"
    ],
    "experience_enhancements": [
        {{
            "section": "experience/project section",
            "suggestion": "how to improve the description",
            "keywords_to_add": ["keyword1", "keyword2"]
        }}
    ],
    "job_roles_suited": [
        {{
            "role": "job title",
            "match_percentage": 85,
            "reason": "why they're suited for this role"
        }}
    ],
    "learning_path": [
        {{
            "step": 1,
            "action": "what to learn/do next",
            "timeframe": "estimated time",
            "resources": ["resource suggestion 1", "resource suggestion 2"]
        }}
    ],
    "immediate_actions": [
        "quick win 1",
        "quick win 2",
        "quick win 3"
    ]
}}

Be specific, actionable, and consider their learning profile. Focus on bridging gaps between what they've learned and what's on their resume.
"""
        
        response = self.gemini.generate_text(prompt, temperature=0.3)
        
        # Parse JSON response
        try:
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            
            if json_start != -1 and json_end > json_start:
                json_str = response[json_start:json_end]
                return json.loads(json_str)
        except Exception as e:
            print(f"Error parsing AI recommendations: {e}")
        
        return self._generate_fallback_recommendations(resume_data, interest_profile, skill_gaps)
    
    def _generate_fallback_recommendations(
        self,
        resume_data: Dict[str, Any],
        interest_profile: Dict[str, Any],
        skill_gaps: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate rule-based recommendations as fallback"""
        
        missing_skills = skill_gaps.get('gaps', {})
        high_priority = missing_skills.get('high_priority', [])
        medium_priority = missing_skills.get('medium_priority', [])
        
        recommendations = {
            'skills_to_add': [],
            'projects_to_add': [],
            'certifications_to_pursue': [],
            'resume_structure_improvements': [],
            'job_roles_suited': [],
            'immediate_actions': []
        }
        
        # Skills to add
        for skill in high_priority[:10]:
            recommendations['skills_to_add'].append({
                'skill': skill,
                'reason': f'You studied {skill} but it\'s missing from your resume',
                'priority': 'high',
                'where_to_add': 'Technical Skills section'
            })
        
        for skill in medium_priority[:5]:
            recommendations['skills_to_add'].append({
                'skill': skill,
                'reason': f'Relevant to your learning domains',
                'priority': 'medium',
                'where_to_add': 'Skills section'
            })
        
        # Project suggestions based on domains
        domains = interest_profile.get('primary_domains', [])
        project_ideas = self._suggest_projects_by_domain(domains, interest_profile.get('technologies', []))
        recommendations['projects_to_add'] = project_ideas[:5]
        
        # Certification suggestions
        cert_suggestions = self._suggest_certifications_by_domain(domains)
        recommendations['certifications_to_pursue'] = cert_suggestions[:5]
        
        # Structure improvements
        recommendations['resume_structure_improvements'] = [
            'Add a Technical Skills section at the top',
            'Include quantifiable achievements in experience descriptions',
            'Add a Projects section showcasing your work',
            'Ensure ATS-friendly formatting (avoid tables, graphics)',
            'Add relevant keywords from job descriptions'
        ]
        
        # Immediate actions
        recommendations['immediate_actions'] = [
            f'Add {len(high_priority)} high-priority skills to your resume',
            'Create a GitHub portfolio with 2-3 projects',
            'Get at least one relevant certification',
            'Update resume with action verbs and metrics',
            'Optimize resume for ATS systems'
        ]
        
        # Job roles
        job_roles = self._suggest_job_roles(domains, interest_profile.get('top_skills', []))
        recommendations['job_roles_suited'] = job_roles[:5]
        
        return recommendations
    
    def _suggest_projects_by_domain(
        self,
        domains: List[str],
        technologies: List[str]
    ) -> List[Dict[str, Any]]:
        """Suggest project ideas based on domains"""
        
        project_templates = {
            'Machine Learning': [
                {
                    'project_idea': 'Predictive Analytics Dashboard',
                    'description': 'Build an ML model to predict trends with interactive visualization',
                    'technologies': ['Python', 'Scikit-learn', 'Pandas', 'Plotly'],
                    'impact': 'Demonstrates ML skills and data visualization',
                    'difficulty': 'intermediate'
                },
                {
                    'project_idea': 'Image Classification System',
                    'description': 'Create a CNN-based image classifier with web interface',
                    'technologies': ['TensorFlow', 'Keras', 'Flask', 'React'],
                    'impact': 'Shows deep learning and full-stack capabilities',
                    'difficulty': 'advanced'
                }
            ],
            'Web Development': [
                {
                    'project_idea': 'Full-Stack E-commerce Platform',
                    'description': 'Build a complete e-commerce site with payment integration',
                    'technologies': ['React', 'Node.js', 'MongoDB', 'Stripe'],
                    'impact': 'Demonstrates full-stack development skills',
                    'difficulty': 'advanced'
                },
                {
                    'project_idea': 'Real-time Chat Application',
                    'description': 'Create a chat app with WebSockets and user authentication',
                    'technologies': ['Socket.io', 'Express', 'React', 'JWT'],
                    'impact': 'Shows real-time communication expertise',
                    'difficulty': 'intermediate'
                }
            ],
            'Data Science': [
                {
                    'project_idea': 'Customer Segmentation Analysis',
                    'description': 'Perform clustering analysis on customer data with insights',
                    'technologies': ['Python', 'Pandas', 'Matplotlib', 'Scikit-learn'],
                    'impact': 'Demonstrates data analysis and visualization',
                    'difficulty': 'intermediate'
                }
            ],
            'Cloud Computing': [
                {
                    'project_idea': 'Serverless API with AWS Lambda',
                    'description': 'Build a scalable REST API using serverless architecture',
                    'technologies': ['AWS Lambda', 'API Gateway', 'DynamoDB', 'Python'],
                    'impact': 'Shows cloud-native development skills',
                    'difficulty': 'intermediate'
                }
            ],
            'Mobile Development': [
                {
                    'project_idea': 'Cross-Platform Mobile App',
                    'description': 'Create a feature-rich mobile app for iOS and Android',
                    'technologies': ['React Native', 'Firebase', 'Redux'],
                    'impact': 'Demonstrates mobile development expertise',
                    'difficulty': 'intermediate'
                }
            ]
        }
        
        suggestions = []
        for domain in domains[:3]:
            if domain in project_templates:
                suggestions.extend(project_templates[domain])
        
        # Generic project if no specific domain match
        if not suggestions:
            suggestions.append({
                'project_idea': 'Personal Portfolio Website',
                'description': 'Create a professional portfolio showcasing your work',
                'technologies': technologies[:4] if technologies else ['HTML', 'CSS', 'JavaScript'],
                'impact': 'Essential for showcasing your skills',
                'difficulty': 'beginner'
            })
        
        return suggestions
    
    def _suggest_certifications_by_domain(self, domains: List[str]) -> List[Dict[str, Any]]:
        """Suggest relevant certifications based on domains"""
        
        cert_templates = {
            'Machine Learning': [
                {
                    'certification': 'TensorFlow Developer Certificate',
                    'provider': 'Google',
                    'relevance': 'Industry-recognized ML certification',
                    'priority': 'high',
                    'estimated_time': '3-4 months'
                },
                {
                    'certification': 'AWS Certified Machine Learning',
                    'provider': 'Amazon',
                    'relevance': 'Cloud-based ML deployment skills',
                    'priority': 'high',
                    'estimated_time': '2-3 months'
                }
            ],
            'Web Development': [
                {
                    'certification': 'AWS Certified Developer Associate',
                    'provider': 'Amazon',
                    'relevance': 'Essential for cloud-based web apps',
                    'priority': 'high',
                    'estimated_time': '2-3 months'
                },
                {
                    'certification': 'Meta Front-End Developer',
                    'provider': 'Meta (Coursera)',
                    'relevance': 'Modern front-end development practices',
                    'priority': 'medium',
                    'estimated_time': '4-6 months'
                }
            ],
            'Data Science': [
                {
                    'certification': 'Google Data Analytics Certificate',
                    'provider': 'Google',
                    'relevance': 'Fundamental data analysis skills',
                    'priority': 'high',
                    'estimated_time': '3-6 months'
                }
            ],
            'Cloud Computing': [
                {
                    'certification': 'AWS Solutions Architect Associate',
                    'provider': 'Amazon',
                    'relevance': 'Most sought-after cloud certification',
                    'priority': 'high',
                    'estimated_time': '2-3 months'
                },
                {
                    'certification': 'Microsoft Azure Fundamentals',
                    'provider': 'Microsoft',
                    'relevance': 'Azure cloud platform basics',
                    'priority': 'medium',
                    'estimated_time': '1-2 months'
                }
            ],
            'Cybersecurity': [
                {
                    'certification': 'CompTIA Security+',
                    'provider': 'CompTIA',
                    'relevance': 'Entry-level security certification',
                    'priority': 'high',
                    'estimated_time': '3-4 months'
                }
            ]
        }
        
        suggestions = []
        for domain in domains[:3]:
            if domain in cert_templates:
                suggestions.extend(cert_templates[domain])
        
        if not suggestions:
            suggestions = [
                {
                    'certification': 'Professional Certificate in your domain',
                    'provider': 'Coursera/edX',
                    'relevance': 'Build credibility in your field',
                    'priority': 'medium',
                    'estimated_time': '3-6 months'
                }
            ]
        
        return suggestions
    
    def _suggest_job_roles(self, domains: List[str], skills: List[str]) -> List[Dict[str, Any]]:
        """Suggest suitable job roles"""
        
        role_mappings = {
            'Machine Learning': [
                {
                    'title': 'Machine Learning Engineer',
                    'description': 'Design and implement ML models and algorithms for production systems',
                    'skills': ['Python', 'TensorFlow', 'PyTorch', 'Scikit-learn', 'Deep Learning'],
                    'salary': '$100k - $180k'
                },
                {
                    'title': 'Data Scientist',
                    'description': 'Extract insights from data using statistical analysis and ML techniques',
                    'skills': ['Python', 'R', 'SQL', 'Statistics', 'Machine Learning'],
                    'salary': '$95k - $165k'
                },
                {
                    'title': 'AI Engineer',
                    'description': 'Develop AI-powered applications and intelligent systems',
                    'skills': ['Python', 'Neural Networks', 'NLP', 'Computer Vision', 'MLOps'],
                    'salary': '$110k - $190k'
                }
            ],
            'Web Development': [
                {
                    'title': 'Full Stack Developer',
                    'description': 'Build complete web applications from front-end to back-end',
                    'skills': ['JavaScript', 'React', 'Node.js', 'SQL', 'REST APIs'],
                    'salary': '$80k - $150k'
                },
                {
                    'title': 'Front-End Developer',
                    'description': 'Create responsive and interactive user interfaces',
                    'skills': ['HTML', 'CSS', 'JavaScript', 'React', 'TypeScript'],
                    'salary': '$75k - $140k'
                },
                {
                    'title': 'Back-End Developer',
                    'description': 'Design and maintain server-side application logic and databases',
                    'skills': ['Node.js', 'Python', 'Java', 'Databases', 'APIs'],
                    'salary': '$85k - $155k'
                }
            ],
            'Data Science': [
                {
                    'title': 'Data Analyst',
                    'description': 'Analyze data to help organizations make informed business decisions',
                    'skills': ['SQL', 'Python', 'Excel', 'Tableau', 'Statistics'],
                    'salary': '$70k - $120k'
                },
                {
                    'title': 'Business Intelligence Analyst',
                    'description': 'Transform data into actionable business insights',
                    'skills': ['SQL', 'Power BI', 'Tableau', 'Data Modeling', 'ETL'],
                    'salary': '$75k - $130k'
                },
                {
                    'title': 'Data Engineer',
                    'description': 'Build and maintain data pipelines and infrastructure',
                    'skills': ['Python', 'SQL', 'Spark', 'Kafka', 'AWS/Azure'],
                    'salary': '$90k - $160k'
                }
            ],
            'Cloud Computing': [
                {
                    'title': 'Cloud Engineer',
                    'description': 'Design and manage cloud infrastructure and services',
                    'skills': ['AWS/Azure/GCP', 'Terraform', 'Kubernetes', 'Docker', 'Linux'],
                    'salary': '$95k - $170k'
                },
                {
                    'title': 'DevOps Engineer',
                    'description': 'Automate deployment pipelines and manage infrastructure as code',
                    'skills': ['CI/CD', 'Docker', 'Kubernetes', 'Jenkins', 'Python'],
                    'salary': '$100k - $175k'
                },
                {
                    'title': 'Cloud Architect',
                    'description': 'Design scalable and secure cloud solutions for enterprises',
                    'skills': ['AWS/Azure', 'Architecture', 'Security', 'Networking', 'Terraform'],
                    'salary': '$120k - $200k'
                }
            ],
            'Mobile Development': [
                {
                    'title': 'Mobile App Developer',
                    'description': 'Create native and cross-platform mobile applications',
                    'skills': ['React Native', 'Flutter', 'iOS', 'Android', 'JavaScript'],
                    'salary': '$85k - $155k'
                },
                {
                    'title': 'iOS Developer',
                    'description': 'Build applications specifically for Apple\'s iOS platform',
                    'skills': ['Swift', 'SwiftUI', 'Xcode', 'iOS SDK', 'Apple APIs'],
                    'salary': '$90k - $165k'
                },
                {
                    'title': 'Android Developer',
                    'description': 'Develop applications for Android mobile devices',
                    'skills': ['Kotlin', 'Java', 'Android Studio', 'Android SDK', 'Material Design'],
                    'salary': '$85k - $160k'
                }
            ],
            'Cybersecurity': [
                {
                    'title': 'Security Analyst',
                    'description': 'Monitor and protect systems from security threats',
                    'skills': ['Network Security', 'SIEM', 'Threat Analysis', 'Firewalls', 'IDS/IPS'],
                    'salary': '$80k - $145k'
                },
                {
                    'title': 'Cybersecurity Engineer',
                    'description': 'Design and implement security solutions for IT infrastructure',
                    'skills': ['Security Architecture', 'Penetration Testing', 'Cryptography', 'Linux', 'Python'],
                    'salary': '$95k - $170k'
                },
                {
                    'title': 'Penetration Tester',
                    'description': 'Identify vulnerabilities by simulating cyber attacks',
                    'skills': ['Ethical Hacking', 'Kali Linux', 'Metasploit', 'Web Security', 'Network Security'],
                    'salary': '$90k - $165k'
                }
            ]
        }
        
        # Default roles if no specific domain match
        default_roles = [
            {
                'title': 'Software Developer',
                'description': 'Design, develop, and maintain software applications',
                'skills': ['Programming', 'Problem Solving', 'Git', 'Algorithms', 'Testing'],
                'salary': '$75k - $140k'
            },
            {
                'title': 'Software Engineer',
                'description': 'Build scalable software solutions and systems',
                'skills': ['Programming', 'System Design', 'APIs', 'Databases', 'Testing'],
                'salary': '$85k - $155k'
            }
        ]
        
        suggestions = []
        matched_domains = []
        
        # Match roles based on user's domains
        for domain in domains[:3]:
            for key in role_mappings.keys():
                if key.lower() in domain.lower() or domain.lower() in key.lower():
                    if key not in matched_domains:
                        matched_domains.append(key)
                        for role_info in role_mappings[key][:2]:
                            # Calculate match score based on skill overlap
                            matching_skills = len(set(skills) & set(role_info['skills']))
                            total_required = len(role_info['skills'])
                            match_score = min(95, 60 + (matching_skills / total_required * 35)) if total_required > 0 else 60
                            
                            suggestions.append({
                                'role_title': role_info['title'],
                                'description': role_info['description'],
                                'required_skills': role_info['skills'],
                                'salary_range': role_info['salary'],
                                'match_score': int(match_score)
                            })
                    break
        
        # Add default roles if not enough suggestions
        if len(suggestions) < 3:
            for role_info in default_roles:
                if len(suggestions) >= 5:
                    break
                suggestions.append({
                    'role_title': role_info['title'],
                    'description': role_info['description'],
                    'required_skills': role_info['skills'],
                    'salary_range': role_info['salary'],
                    'match_score': 70
                })
        
        return suggestions[:5]


recommendation_engine = RecommendationEngine()

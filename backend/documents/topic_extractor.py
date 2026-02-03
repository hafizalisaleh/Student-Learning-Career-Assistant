"""
AI-powered topic and domain extraction service
Analyzes document content to identify topics, domains, skills, and subject areas
"""
from typing import Dict, List, Any
from utils.gemini_client import gemini_client
import json
import re

class TopicExtractor:
    """Extract topics, domains, and keywords from document content"""
    
    def __init__(self):
        self.gemini = gemini_client
    
    def extract_topics_and_domains(
        self, 
        text: str, 
        filename: str = ""
    ) -> Dict[str, Any]:
        """
        Analyze document and extract comprehensive topic information
        
        Args:
            text: Extracted document text
            filename: Original filename for context
            
        Returns:
            Dictionary with topics, domains, keywords, subject area, and difficulty
        """
        # Truncate text for analysis (first 3000 chars for context)
        analysis_text = text[:3000] if len(text) > 3000 else text
        
        prompt = f"""
Analyze the following document content and extract comprehensive topic information for career tracking and skills analysis.

FILENAME: {filename}

CONTENT:
{analysis_text}

Provide a detailed analysis in the following JSON format:
{{
    "topics": ["topic1", "topic2", "topic3", ...],
    "domains": ["domain1", "domain2", ...],
    "keywords": ["keyword1", "keyword2", "keyword3", ...],
    "subject_area": "primary subject",
    "difficulty_level": "beginner/intermediate/advanced",
    "technical_skills": ["skill1", "skill2", ...],
    "concepts": ["concept1", "concept2", ...],
    "technologies": ["tech1", "tech2", ...],
    "programming_languages": ["lang1", "lang2", ...]
}}

GUIDELINES:
1. **Topics**: Specific subjects discussed (e.g., "Machine Learning", "Neural Networks", "REST APIs", "Database Design")
2. **Domains**: Broader fields/industries (e.g., "Artificial Intelligence", "Web Development", "Data Science", "Cloud Computing", "Cybersecurity")
3. **Keywords**: Important terms, technologies, frameworks, methodologies (e.g., "TensorFlow", "React", "Agile", "SQL")
4. **Subject Area**: Primary academic/professional field (e.g., "Computer Science", "Software Engineering", "Business Analytics")
5. **Difficulty Level**: Assess content complexity - beginner, intermediate, or advanced
6. **Technical Skills**: Concrete technical abilities mentioned (e.g., "Python Programming", "API Development", "Data Analysis")
7. **Concepts**: Theoretical concepts covered (e.g., "Object-Oriented Programming", "Design Patterns", "Algorithm Complexity")
8. **Technologies**: Tools, platforms, frameworks (e.g., "Docker", "AWS", "MongoDB", "Git")
9. **Programming Languages**: Any programming languages mentioned or implied

Return ONLY the JSON object, no additional text.
"""
        
        try:
            response = self.gemini.generate_text(prompt, temperature=0.2)
            extracted_data = self._parse_extraction_response(response)
            
            # Validate and clean data
            extracted_data = self._validate_and_clean(extracted_data)
            
            # Add metadata
            extracted_data['extraction_confidence'] = 'high'
            extracted_data['extraction_method'] = 'ai'
            
            return extracted_data
            
        except Exception as e:
            print(f"AI extraction failed: {e}, falling back to rule-based")
            return self._rule_based_extraction(text, filename)
    
    def _parse_extraction_response(self, response: str) -> Dict[str, Any]:
        """Parse AI response into structured format"""
        try:
            # Extract JSON from response
            json_start = response.find('{')
            json_end = response.rfind('}') + 1
            
            if json_start != -1 and json_end > json_start:
                json_str = response[json_start:json_end]
                data = json.loads(json_str)
                return data
            
            # Try alternative parsing
            return self._alternative_parse(response)
            
        except Exception as e:
            print(f"JSON parsing failed: {e}")
            return self._alternative_parse(response)
    
    def _alternative_parse(self, response: str) -> Dict[str, Any]:
        """Alternative parsing when JSON extraction fails"""
        result = {
            'topics': [],
            'domains': [],
            'keywords': [],
            'subject_area': 'General',
            'difficulty_level': 'intermediate',
            'technical_skills': [],
            'concepts': [],
            'technologies': [],
            'programming_languages': []
        }
        
        # Extract topics (lines starting with "Topics:" or "- ")
        topics_match = re.search(r'topics[:\s]+(.+?)(?=domains|keywords|$)', response, re.IGNORECASE | re.DOTALL)
        if topics_match:
            topics_text = topics_match.group(1)
            result['topics'] = self._extract_list_items(topics_text)
        
        # Extract domains
        domains_match = re.search(r'domains[:\s]+(.+?)(?=keywords|subject|$)', response, re.IGNORECASE | re.DOTALL)
        if domains_match:
            domains_text = domains_match.group(1)
            result['domains'] = self._extract_list_items(domains_text)
        
        # Extract keywords
        keywords_match = re.search(r'keywords[:\s]+(.+?)(?=subject|difficulty|$)', response, re.IGNORECASE | re.DOTALL)
        if keywords_match:
            keywords_text = keywords_match.group(1)
            result['keywords'] = self._extract_list_items(keywords_text)
        
        return result
    
    def _extract_list_items(self, text: str) -> List[str]:
        """Extract items from text list"""
        # Split by commas, newlines, or bullet points
        items = re.split(r'[,\n]|(?:^|\n)[\-•*]\s*', text)
        # Clean and filter
        items = [item.strip().strip('"\'[]') for item in items if item.strip()]
        # Remove empty and very short items
        items = [item for item in items if len(item) > 2 and len(item) < 100]
        return items[:20]  # Limit to 20 items
    
    def _validate_and_clean(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and clean extracted data"""
        # Ensure all required fields exist
        required_fields = {
            'topics': [],
            'domains': [],
            'keywords': [],
            'subject_area': 'General',
            'difficulty_level': 'intermediate',
            'technical_skills': [],
            'concepts': [],
            'technologies': [],
            'programming_languages': []
        }
        
        for field, default in required_fields.items():
            if field not in data:
                data[field] = default
            elif isinstance(default, list) and not isinstance(data[field], list):
                data[field] = [data[field]] if data[field] else []
        
        # Clean and deduplicate lists
        for field in ['topics', 'domains', 'keywords', 'technical_skills', 'concepts', 'technologies', 'programming_languages']:
            if isinstance(data[field], list):
                # Remove duplicates (case-insensitive)
                seen = set()
                cleaned = []
                for item in data[field]:
                    item_lower = str(item).lower().strip()
                    if item_lower and item_lower not in seen and len(item_lower) > 2:
                        seen.add(item_lower)
                        cleaned.append(str(item).strip())
                data[field] = cleaned[:15]  # Limit to 15 items per field
        
        # Validate difficulty level
        valid_difficulties = ['beginner', 'intermediate', 'advanced']
        if data['difficulty_level'].lower() not in valid_difficulties:
            data['difficulty_level'] = 'intermediate'
        else:
            data['difficulty_level'] = data['difficulty_level'].lower()
        
        # Ensure subject_area is a string
        if not isinstance(data['subject_area'], str):
            data['subject_area'] = 'General'
        
        return data
    
    def _rule_based_extraction(self, text: str, filename: str) -> Dict[str, Any]:
        """Fallback rule-based extraction when AI fails"""
        text_lower = text.lower()
        
        # Common domains mapping
        domain_keywords = {
            'Artificial Intelligence': ['machine learning', 'deep learning', 'neural network', 'ai', 'artificial intelligence'],
            'Web Development': ['html', 'css', 'javascript', 'web', 'frontend', 'backend', 'react', 'angular', 'vue'],
            'Data Science': ['data science', 'data analysis', 'statistics', 'visualization', 'pandas', 'numpy'],
            'Cloud Computing': ['aws', 'azure', 'cloud', 'docker', 'kubernetes', 'devops'],
            'Cybersecurity': ['security', 'encryption', 'cybersecurity', 'authentication', 'firewall'],
            'Mobile Development': ['android', 'ios', 'mobile', 'swift', 'kotlin', 'flutter'],
            'Database': ['database', 'sql', 'mongodb', 'postgresql', 'mysql', 'nosql'],
            'Software Engineering': ['software', 'programming', 'coding', 'development', 'engineering']
        }
        
        # Detect domains
        detected_domains = []
        for domain, keywords in domain_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                detected_domains.append(domain)
        
        # Extract programming languages
        programming_languages = []
        lang_patterns = ['python', 'java', 'javascript', 'c\\+\\+', 'c#', 'ruby', 'php', 'swift', 'kotlin', 'go', 'rust']
        for lang in lang_patterns:
            if re.search(rf'\b{lang}\b', text_lower):
                programming_languages.append(lang.upper() if len(lang) <= 3 else lang.capitalize())
        
        # Extract common technologies
        tech_patterns = ['react', 'angular', 'vue', 'node', 'express', 'django', 'flask', 'spring', 
                        'docker', 'kubernetes', 'git', 'aws', 'azure', 'tensorflow', 'pytorch']
        technologies = []
        for tech in tech_patterns:
            if tech in text_lower:
                technologies.append(tech.capitalize())
        
        # Determine difficulty based on content complexity
        difficulty = 'intermediate'
        if any(term in text_lower for term in ['basic', 'introduction', 'beginner', 'fundamentals', 'getting started']):
            difficulty = 'beginner'
        elif any(term in text_lower for term in ['advanced', 'expert', 'complex', 'optimization', 'architecture']):
            difficulty = 'advanced'
        
        return {
            'topics': detected_domains[:5],  # Use domains as topics in fallback
            'domains': detected_domains,
            'keywords': technologies + programming_languages,
            'subject_area': detected_domains[0] if detected_domains else 'Computer Science',
            'difficulty_level': difficulty,
            'technical_skills': technologies,
            'concepts': [],
            'technologies': technologies,
            'programming_languages': programming_languages,
            'extraction_confidence': 'medium',
            'extraction_method': 'rule-based'
        }
    
    def aggregate_user_interests(
        self, 
        documents_data: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Aggregate topics and domains from all user documents to build interest profile
        
        Args:
            documents_data: List of document topic data
            
        Returns:
            Aggregated interest profile
        """
        all_topics = []
        all_domains = []
        all_keywords = []
        all_skills = []
        all_technologies = []
        all_languages = []
        
        domain_counts = {}
        topic_counts = {}
        skill_counts = {}
        
        for doc in documents_data:
            # Aggregate topics
            for topic in doc.get('topics', []):
                all_topics.append(topic)
                topic_counts[topic] = topic_counts.get(topic, 0) + 1
            
            # Aggregate domains
            for domain in doc.get('domains', []):
                all_domains.append(domain)
                domain_counts[domain] = domain_counts.get(domain, 0) + 1
            
            # Aggregate keywords
            all_keywords.extend(doc.get('keywords', []))
            
            # Aggregate skills
            for skill in doc.get('technical_skills', []):
                all_skills.append(skill)
                skill_counts[skill] = skill_counts.get(skill, 0) + 1
            
            # Aggregate technologies
            all_technologies.extend(doc.get('technologies', []))
            
            # Aggregate programming languages
            all_languages.extend(doc.get('programming_languages', []))
        
        # Sort by frequency
        top_domains = sorted(domain_counts.items(), key=lambda x: x[1], reverse=True)
        top_topics = sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)
        top_skills = sorted(skill_counts.items(), key=lambda x: x[1], reverse=True)
        
        # Deduplicate
        unique_keywords = list(set(all_keywords))
        unique_technologies = list(set(all_technologies))
        unique_languages = list(set(all_languages))
        
        return {
            'primary_domains': [domain for domain, _ in top_domains[:5]],
            'all_domains': [domain for domain, _ in top_domains],
            'primary_topics': [topic for topic, _ in top_topics[:10]],
            'all_topics': [topic for topic, _ in top_topics],
            'top_skills': [skill for skill, _ in top_skills[:10]],
            'all_skills': list(set(all_skills)),
            'technologies': unique_technologies[:15],
            'programming_languages': unique_languages,
            'keywords': unique_keywords[:30],
            'total_documents': len(documents_data),
            'domain_distribution': dict(top_domains),
            'topic_distribution': dict(top_topics),
            'skill_distribution': dict(top_skills)
        }

# Global topic extractor instance
topic_extractor = TopicExtractor()

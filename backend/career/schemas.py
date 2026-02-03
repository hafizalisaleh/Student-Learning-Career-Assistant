"""
Career module schemas
"""
from pydantic import BaseModel, validator
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid

class ResumeUpload(BaseModel):
    """Schema for resume upload"""
    file_type: str
    
    @validator('file_type')
    def validate_file_type(cls, v):
        allowed_types = ['pdf', 'docx']
        if v not in allowed_types:
            raise ValueError(f'File type must be one of {allowed_types}')
        return v

class ResumeResponse(BaseModel):
    """Schema for resume response"""
    id: uuid.UUID
    user_id: uuid.UUID
    file_path: str
    parsed_content: Dict[str, Any]
    upload_date: datetime
    filename: Optional[str] = None
    
    class Config:
        from_attributes = True

class ResumeAnalysisResponse(BaseModel):
    """Schema for resume analysis response"""
    id: uuid.UUID
    resume_id: uuid.UUID
    ats_score: float
    strengths: List[str]
    weaknesses: List[str]
    improvement_suggestions: List[str]
    keyword_match_score: float
    formatting_score: float
    content_quality_score: float
    analyzed_at: datetime
    
    class Config:
        from_attributes = True

class CareerRecommendationResponse(BaseModel):
    """Schema for career recommendation"""
    id: uuid.UUID
    resume_id: uuid.UUID
    job_titles: List[str]
    skills_to_learn: List[str]
    course_recommendations: List[Dict[str, str]]
    industry_insights: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class JobMatchRequest(BaseModel):
    """Schema for job matching request"""
    job_description: str
    required_skills: List[str] = []

class JobMatchResponse(BaseModel):
    """Schema for job match response"""
    match_score: float
    matched_skills: List[str]
    missing_skills: List[str]
    recommendations: List[str]

class SkillSuggestion(BaseModel):
    """Schema for individual skill suggestion"""
    skill: str
    reason: str
    priority: str
    where_to_add: str

class ProjectSuggestion(BaseModel):
    """Schema for project suggestion"""
    project_idea: str
    description: str
    technologies: List[str]
    impact: str
    difficulty: str

class CertificationSuggestion(BaseModel):
    """Schema for certification suggestion"""
    certification: str
    provider: str
    relevance: str
    priority: str
    estimated_time: str

class JobRoleSuggestion(BaseModel):
    """Schema for job role suggestion"""
    role: str
    match_percentage: float
    reason: str

class ComprehensiveAnalysisResponse(BaseModel):
    """Schema for comprehensive resume analysis with all recommendations"""
    analysis_id: str
    analysis_type: str
    analyzed_at: str
    
    # Scores
    ats_score: float
    keyword_match_score: float
    formatting_score: float
    content_quality_score: float
    skill_match_score: Optional[float] = None
    
    # Basic analysis
    strengths: List[str]
    weaknesses: List[str]
    improvement_suggestions: List[str]
    
    # Skill analysis
    matched_skills: Optional[List[str]] = None
    skill_gaps: Optional[Dict[str, Any]] = None
    skill_insights: Optional[List[Dict[str, str]]] = None
    
    # Recommendations
    skills_to_add: Optional[List[Dict[str, str]]] = None
    skills_to_remove: Optional[List[Dict[str, str]]] = None
    projects_to_add: Optional[List[Dict[str, Any]]] = None
    projects_to_improve: Optional[List[Dict[str, Any]]] = None
    certifications_to_pursue: Optional[List[Dict[str, str]]] = None
    resume_structure_improvements: Optional[List[str]] = None
    experience_enhancements: Optional[List[Dict[str, Any]]] = None
    job_roles_suited: Optional[List[Dict[str, Any]]] = None
    learning_path: Optional[List[Dict[str, Any]]] = None
    immediate_actions: Optional[List[str]] = None
    
    # Career alignment
    resume_gaps: Optional[Dict[str, Any]] = None
    career_alignment: Optional[Dict[str, Any]] = None
    actionable_steps: Optional[Dict[str, List[str]]] = None
    
    # Profile context
    learning_profile: Optional[Dict[str, Any]] = None
    
    # Optional message
    message: Optional[str] = None
    error: Optional[str] = None

class SkillSuggestionsResponse(BaseModel):
    """Schema for skill suggestions response"""
    resume_id: str
    current_skills_count: int
    learned_skills_count: int
    suggestions: Dict[str, List[str]]
    recommendation: str

class CareerRecommendationsResponse(BaseModel):
    """Schema for career recommendations response"""
    resume_id: str
    recommendations: Dict[str, Any]
    profile_summary: Dict[str, Any]

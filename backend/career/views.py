"""
Career module API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
from config.database import get_db
from career.models import Resume, ResumeAnalysis, CareerRecommendation
from career.schemas import (
    ResumeResponse, ResumeAnalysisResponse, 
    CareerRecommendationResponse, JobMatchRequest, JobMatchResponse
)
from career.resume_parser import resume_parser
from career.analyzer import resume_analyzer
from career.recommender import career_recommender
from career.skill_matcher import skill_matcher
from career.recommendation_engine import recommendation_engine
from users.auth import get_current_user
from users.models import User
from progress.models import ActivityType
from progress.analytics import progress_analytics
import uuid
import os
from pathlib import Path

router = APIRouter(prefix="/api/career", tags=["career"])

# Upload directory
UPLOAD_DIR = Path("uploads/resumes")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

@router.post("/resume/upload", response_model=ResumeResponse)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload and parse resume
    
    Args:
        file: Resume file (PDF or DOCX)
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Parsed resume data
    """
    # Validate file type
    allowed_extensions = ['.pdf', '.docx']
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_extensions)}"
        )
    
    # Save file
    file_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{file_id}{file_ext}"
    
    try:
        content = await file.read()
        with open(file_path, 'wb') as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error saving file: {str(e)}"
        )
    
    # Parse resume
    try:
        if file_ext == '.pdf':
            parsed_content = resume_parser.parse_pdf(str(file_path))
        else:  # .docx
            parsed_content = resume_parser.parse_docx(str(file_path))
    except ValueError as e:
        # User-friendly errors (invalid file, scanned PDF, etc.)
        os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process resume. Please try a different file format. Error: {str(e)}"
        )

    # Save to database
    resume = Resume(
        user_id=current_user.id,
        filename=file.filename,
        file_path=str(file_path),
        parsed_content=parsed_content
    )
    
    db.add(resume)
    db.commit()
    db.refresh(resume)
    
    # Log activity
    progress_analytics.log_activity(
        db,
        current_user.id,
        ActivityType.RESUME_UPLOADED,
        {'resume_id': str(resume.id), 'filename': file.filename}
    )
    
    return ResumeResponse.from_orm(resume)

@router.post("/resume/{resume_id}/analyze", response_model=Dict[str, Any])
def analyze_resume(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Comprehensive resume analysis with AI-powered recommendations
    
    Analyzes resume against user's learning profile from uploaded documents
    and provides detailed, actionable career guidance including:
    - Skill gap analysis
    - Project recommendations
    - Certification suggestions
    - Resume improvement tips
    - Career path guidance
    
    Args:
        resume_id: Resume ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Comprehensive analysis with recommendations
    """
    from documents.models import Document, ProcessingStatus
    from documents.topic_extractor import topic_extractor
    
    # Get resume
    resume = db.query(Resume).filter(
        Resume.id == resume_id,
        Resume.user_id == current_user.id
    ).first()
    
    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found"
        )
    
    # Get user's learning profile from documents
    try:
        documents = db.query(Document).filter(
            Document.user_id == current_user.id,
            Document.processing_status == ProcessingStatus.COMPLETED
        ).all()
        
        # Extract topic data
        documents_data = []
        for doc in documents:
            doc_data = {
                'topics': doc.topics or [],
                'domains': doc.domains or [],
                'keywords': doc.keywords or [],
                'technical_skills': doc.doc_metadata.get('technical_skills', []) if doc.doc_metadata else [],
                'technologies': doc.doc_metadata.get('technologies', []) if doc.doc_metadata else [],
                'programming_languages': doc.doc_metadata.get('programming_languages', []) if doc.doc_metadata else []
            }
            documents_data.append(doc_data)
        
        # Aggregate interests
        interest_profile = topic_extractor.aggregate_user_interests(documents_data) if documents_data else {}
        
        # COMPREHENSIVE ANALYSIS PIPELINE
        if interest_profile and interest_profile.get('total_documents', 0) > 0:
            # Step 1: Perform skill gap analysis
            resume_skills = resume.parsed_content.get('skills', [])
            learned_skills = interest_profile.get('top_skills', [])
            learned_domains = interest_profile.get('primary_domains', [])
            
            skill_gaps = skill_matcher.analyze_skill_gaps(
                resume_skills,
                learned_skills,
                learned_domains
            )
            
            # Step 2: Enhanced resume analysis with interest profile
            analysis_results = resume_analyzer.analyze_with_interest_profile(
                resume.parsed_content,
                interest_profile
            )
            
            # Step 3: Generate comprehensive recommendations
            recommendations = recommendation_engine.generate_comprehensive_recommendations(
                resume.parsed_content,
                interest_profile,
                skill_gaps
            )
            
            analysis_type = 'comprehensive_profile_based'
            
            # Combine all results
            complete_analysis = {
                'analysis_type': analysis_type,
                'ats_score': analysis_results.get('ats_score', 0),
                'keyword_match_score': analysis_results.get('keyword_match_score', 0),
                'formatting_score': analysis_results.get('formatting_score', 0),
                'content_quality_score': analysis_results.get('content_quality_score', 0),
                
                # Resume analysis
                'strengths': analysis_results.get('strengths', []),
                'weaknesses': analysis_results.get('weaknesses', []),
                'improvement_suggestions': analysis_results.get('improvement_suggestions', []),
                
                # Skill analysis
                'skill_match_score': skill_gaps.get('match_score', 0),
                'matched_skills': skill_gaps.get('matched_skills', []),
                'skill_gaps': skill_gaps.get('gaps', {}),
                'skill_insights': skill_gaps.get('insights', []),
                
                # Comprehensive recommendations
                'skills_to_add': recommendations.get('skills_to_add', []),
                'skills_to_remove': recommendations.get('skills_to_remove', []),
                'projects_to_add': recommendations.get('projects_to_add', []),
                'projects_to_improve': recommendations.get('projects_to_improve', []),
                'certifications_to_pursue': recommendations.get('certifications_to_pursue', []),
                'resume_structure_improvements': recommendations.get('resume_structure_improvements', []),
                'experience_enhancements': recommendations.get('experience_enhancements', []),
                'job_roles_suited': recommendations.get('job_roles_suited', []),
                'learning_path': recommendations.get('learning_path', []),
                'immediate_actions': recommendations.get('immediate_actions', []),
                
                # Career alignment from analyzer
                'resume_gaps': analysis_results.get('resume_gaps', {}),
                'career_alignment': analysis_results.get('career_alignment', {}),
                'actionable_steps': analysis_results.get('actionable_steps', {}),
                
                # Profile context
                'learning_profile': {
                    'domains': interest_profile.get('primary_domains', []),
                    'topics': interest_profile.get('primary_topics', []),
                    'skills': interest_profile.get('top_skills', []),
                    'technologies': interest_profile.get('technologies', []),
                    'languages': interest_profile.get('programming_languages', []),
                    'total_documents': interest_profile.get('total_documents', 0)
                }
            }
            
        else:
            # Standard analysis if no documents
            analysis_results = resume_analyzer.analyze_resume(resume.parsed_content)
            analysis_type = 'standard'
            
            complete_analysis = {
                'analysis_type': analysis_type,
                'ats_score': analysis_results.get('ats_score', 0),
                'keyword_match_score': analysis_results.get('keyword_match_score', 0),
                'formatting_score': analysis_results.get('formatting_score', 0),
                'content_quality_score': analysis_results.get('content_quality_score', 0),
                'strengths': analysis_results.get('strengths', []),
                'weaknesses': analysis_results.get('weaknesses', []),
                'improvement_suggestions': analysis_results.get('improvement_suggestions', []),
                'message': 'Upload study materials to get personalized recommendations based on your learning profile'
            }
            
    except Exception as e:
        print(f"Comprehensive analysis failed: {e}")
        # Fallback to standard analysis
        analysis_results = resume_analyzer.analyze_resume(resume.parsed_content)
        analysis_type = 'standard_fallback'
        
        complete_analysis = {
            'analysis_type': analysis_type,
            'ats_score': analysis_results.get('ats_score', 0),
            'keyword_match_score': analysis_results.get('keyword_match_score', 0),
            'formatting_score': analysis_results.get('formatting_score', 0),
            'content_quality_score': analysis_results.get('content_quality_score', 0),
            'strengths': analysis_results.get('strengths', []),
            'weaknesses': analysis_results.get('weaknesses', []),
            'improvement_suggestions': analysis_results.get('improvement_suggestions', []),
            'error': str(e)
        }
    
    # Save simplified analysis to database
    analysis = ResumeAnalysis(
        resume_id=resume_id,
        ats_score=complete_analysis.get('ats_score', 0),
        strengths=complete_analysis.get('strengths', []),
        weaknesses=complete_analysis.get('weaknesses', []),
        improvement_suggestions=complete_analysis.get('improvement_suggestions', []),
        keyword_match_score=complete_analysis.get('keyword_match_score', 0),
        formatting_score=complete_analysis.get('formatting_score', 0),
        content_quality_score=complete_analysis.get('content_quality_score', 0)
    )
    
    db.add(analysis)
    db.commit()
    db.refresh(analysis)
    
    # Log activity
    progress_analytics.log_activity(
        db,
        current_user.id,
        ActivityType.RESUME_ANALYZED,
        {
            'resume_id': str(resume_id),
            'ats_score': complete_analysis.get('ats_score', 0),
            'analysis_type': analysis_type
        }
    )
    
    # Add analysis ID to response
    complete_analysis['analysis_id'] = str(analysis.id)
    complete_analysis['analyzed_at'] = analysis.analyzed_at.isoformat()
    
    return complete_analysis

@router.get("/resume/{resume_id}/skill-suggestions", response_model=Dict[str, Any])
def get_skill_suggestions(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get skill addition suggestions based on learning profile
    
    Args:
        resume_id: Resume ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Categorized skill suggestions
    """
    from documents.models import Document, ProcessingStatus
    from documents.topic_extractor import topic_extractor
    
    # Get resume
    resume = db.query(Resume).filter(
        Resume.id == resume_id,
        Resume.user_id == current_user.id
    ).first()
    
    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found"
        )
    
    # Get user's learning profile
    documents = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.processing_status == ProcessingStatus.COMPLETED
    ).all()
    
    if not documents:
        return {
            'message': 'Upload study materials to get personalized skill suggestions',
            'suggestions': {}
        }
    
    # Extract profile
    documents_data = []
    for doc in documents:
        doc_data = {
            'topics': doc.topics or [],
            'domains': doc.domains or [],
            'keywords': doc.keywords or [],
            'technical_skills': doc.doc_metadata.get('technical_skills', []) if doc.doc_metadata else [],
            'technologies': doc.doc_metadata.get('technologies', []) if doc.doc_metadata else [],
            'programming_languages': doc.doc_metadata.get('programming_languages', []) if doc.doc_metadata else []
        }
        documents_data.append(doc_data)
    
    interest_profile = topic_extractor.aggregate_user_interests(documents_data)
    
    # Get skill suggestions
    resume_skills = resume.parsed_content.get('skills', [])
    learned_skills = interest_profile.get('top_skills', [])
    technologies = interest_profile.get('technologies', [])
    languages = interest_profile.get('programming_languages', [])
    
    suggestions = skill_matcher.suggest_skill_additions(
        resume_skills,
        learned_skills,
        technologies,
        languages
    )
    
    return {
        'resume_id': str(resume_id),
        'current_skills_count': len(resume_skills),
        'learned_skills_count': len(learned_skills),
        'suggestions': suggestions,
        'recommendation': 'Add these skills to strengthen your resume based on your learning profile'
    }

@router.get("/resume/{resume_id}/recommendations", response_model=Dict[str, Any])
def get_career_recommendations(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get comprehensive career recommendations
    
    Args:
        resume_id: Resume ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Detailed career guidance and recommendations
    """
    from documents.models import Document, ProcessingStatus
    from documents.topic_extractor import topic_extractor
    
    # Get resume
    resume = db.query(Resume).filter(
        Resume.id == resume_id,
        Resume.user_id == current_user.id
    ).first()
    
    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found"
        )
    
    # Get learning profile
    documents = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.processing_status == ProcessingStatus.COMPLETED
    ).all()
    
    if not documents:
        return {
            'message': 'Upload study materials to get personalized career recommendations',
            'recommendations': {}
        }
    
    # Build profile
    documents_data = []
    for doc in documents:
        doc_data = {
            'topics': doc.topics or [],
            'domains': doc.domains or [],
            'keywords': doc.keywords or [],
            'technical_skills': doc.doc_metadata.get('technical_skills', []) if doc.doc_metadata else [],
            'technologies': doc.doc_metadata.get('technologies', []) if doc.doc_metadata else [],
            'programming_languages': doc.doc_metadata.get('programming_languages', []) if doc.doc_metadata else []
        }
        documents_data.append(doc_data)
    
    interest_profile = topic_extractor.aggregate_user_interests(documents_data)
    
    # Analyze skill gaps
    resume_skills = resume.parsed_content.get('skills', [])
    learned_skills = interest_profile.get('top_skills', [])
    learned_domains = interest_profile.get('primary_domains', [])
    
    skill_gaps = skill_matcher.analyze_skill_gaps(
        resume_skills,
        learned_skills,
        learned_domains
    )
    
    # Generate recommendations
    recommendations = recommendation_engine.generate_comprehensive_recommendations(
        resume.parsed_content,
        interest_profile,
        skill_gaps
    )
    
    return {
        'resume_id': str(resume_id),
        'recommendations': recommendations,
        'interest_profile': interest_profile,
        'profile_summary': {
            'domains': interest_profile.get('primary_domains', [])[:5],
            'skills': interest_profile.get('top_skills', [])[:10],
            'documents_analyzed': interest_profile.get('total_documents', 0)
        }
    }

@router.post("/resume/{resume_id}/match-job", response_model=JobMatchResponse)
def match_job(
    resume_id: uuid.UUID,
    request: JobMatchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Match resume against a job description
    
    Args:
        resume_id: Resume ID
        request: Job match request with description and skills
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Job match analysis
    """
    # Get resume
    resume = db.query(Resume).filter(
        Resume.id == resume_id,
        Resume.user_id == current_user.id
    ).first()
    
    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found"
        )
    
    # Perform matching
    try:
        match_results = resume_analyzer.match_job(
            resume.parsed_content,
            request.job_description,
            request.required_skills
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error matching job: {str(e)}"
        )
    
    return JobMatchResponse(**match_results)

@router.get("/resumes", response_model=list[ResumeResponse])
def list_resumes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List all resumes for current user
    
    Args:
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        List of resumes
    """
    resumes = db.query(Resume).filter(
        Resume.user_id == current_user.id
    ).order_by(Resume.upload_date.desc()).all()
    
    return [ResumeResponse.from_orm(resume) for resume in resumes]

@router.get("/resume/{resume_id}/analysis", response_model=ResumeAnalysisResponse)
def get_resume_analysis(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get existing resume analysis
    
    Args:
        resume_id: Resume ID
        current_user: Current authenticated user
        db: Database session
        
    Returns:
        Resume analysis
    """
    analysis = db.query(ResumeAnalysis).join(Resume).filter(
        ResumeAnalysis.resume_id == resume_id,
        Resume.user_id == current_user.id
    ).first()
    
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found"
        )
    
    return ResumeAnalysisResponse.from_orm(analysis)


# ========== Frontend-Compatible Endpoints ==========

@router.post("/analyze-resume", response_model=Dict[str, Any])
async def upload_and_analyze_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Combined endpoint: Upload resume and analyze it in one request
    This matches the frontend's expected API

    Args:
        file: Resume file (PDF or DOCX)
        current_user: Current authenticated user
        db: Database session

    Returns:
        Combined resume and analysis data
    """
    from documents.models import Document, ProcessingStatus
    from documents.topic_extractor import topic_extractor

    # Validate file type
    allowed_extensions = ['.pdf', '.docx', '.doc']
    file_ext = os.path.splitext(file.filename)[1].lower()

    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_extensions)}"
        )

    # Save file
    file_id = str(uuid.uuid4())
    file_path = UPLOAD_DIR / f"{file_id}{file_ext}"

    try:
        content = await file.read()
        with open(file_path, 'wb') as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error saving file: {str(e)}"
        )

    # Parse resume
    try:
        if file_ext == '.pdf':
            parsed_content = resume_parser.parse_pdf(str(file_path))
        else:  # .docx or .doc
            parsed_content = resume_parser.parse_docx(str(file_path))
    except ValueError as e:
        # User-friendly errors (invalid file, scanned PDF, etc.)
        os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        os.remove(file_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process resume. Please try a different file format. Error: {str(e)}"
        )

    # Save resume to database
    resume = Resume(
        user_id=current_user.id,
        filename=file.filename,
        file_path=str(file_path),
        parsed_content=parsed_content
    )

    db.add(resume)
    db.commit()
    db.refresh(resume)

    # Log activity
    progress_analytics.log_activity(
        db,
        current_user.id,
        ActivityType.RESUME_UPLOADED,
        {'resume_id': str(resume.id), 'filename': file.filename}
    )

    # Now perform analysis
    try:
        # Get user's learning profile from documents
        documents = db.query(Document).filter(
            Document.user_id == current_user.id,
            Document.processing_status == ProcessingStatus.COMPLETED
        ).all()

        # Extract topic data
        documents_data = []
        for doc in documents:
            doc_data = {
                'topics': doc.topics or [],
                'domains': doc.domains or [],
                'keywords': doc.keywords or [],
                'technical_skills': doc.doc_metadata.get('technical_skills', []) if doc.doc_metadata else [],
                'technologies': doc.doc_metadata.get('technologies', []) if doc.doc_metadata else [],
                'programming_languages': doc.doc_metadata.get('programming_languages', []) if doc.doc_metadata else []
            }
            documents_data.append(doc_data)

        # Aggregate interests
        interest_profile = topic_extractor.aggregate_user_interests(documents_data) if documents_data else {}

        # Perform analysis based on whether we have a learning profile
        if interest_profile and interest_profile.get('total_documents', 0) > 0:
            resume_skills = resume.parsed_content.get('skills', [])
            learned_skills = interest_profile.get('top_skills', [])
            learned_domains = interest_profile.get('primary_domains', [])

            skill_gaps = skill_matcher.analyze_skill_gaps(
                resume_skills,
                learned_skills,
                learned_domains
            )

            analysis_results = resume_analyzer.analyze_with_interest_profile(
                resume.parsed_content,
                interest_profile
            )

            recommendations = recommendation_engine.generate_comprehensive_recommendations(
                resume.parsed_content,
                interest_profile,
                skill_gaps
            )

            analysis_type = 'comprehensive_profile_based'
        else:
            analysis_results = resume_analyzer.analyze_resume(resume.parsed_content)
            skill_gaps = {}
            recommendations = {}
            analysis_type = 'standard'

        # Build career analysis response matching frontend types
        career_analysis = {
            'id': str(resume.id),
            'user_id': str(current_user.id),
            'resume_id': str(resume.id),
            'resume_filename': resume.filename,
            'overall_assessment': analysis_results.get('detailed_feedback',
                f"Resume analyzed with {analysis_type} analysis. ATS Score: {analysis_results.get('ats_score', 0)}%"),
            'ats_score': analysis_results.get('ats_score', 0),
            'strengths': analysis_results.get('strengths', []),
            'weaknesses': analysis_results.get('weaknesses', []),
            'improvement_suggestions': analysis_results.get('improvement_suggestions', []),
            'recommended_roles': [],
            'recommendations': [],
            'skill_gaps': [],
            'interview_tips': [],
            'interview_prep': {
                'common_questions': [],
                'tips': []
            },
            'analyzed_at': resume.upload_date.isoformat(),
            'created_at': resume.upload_date.isoformat()
        }

        # Add skill gaps in expected format
        if skill_gaps and skill_gaps.get('gaps'):
            for category, skills in skill_gaps.get('gaps', {}).items():
                for skill in skills[:3]:  # Limit to 3 per category
                    career_analysis['skill_gaps'].append({
                        'skill_name': skill,
                        'importance': f"Important for {category}",
                        'learning_resources': [f"Learn {skill} online", f"{skill} certification"]
                    })

        # Add recommendations in expected format
        if recommendations:
            job_roles = recommendations.get('job_roles_suited', [])
            for role in job_roles[:5]:
                if isinstance(role, dict):
                    career_analysis['recommendations'].append({
                        'role_title': role.get('role_title', role.get('title', 'Role')),
                        'match_percentage': role.get('match_score', 75),
                        'description': role.get('description', ''),
                        'required_skills': role.get('required_skills', []),
                        'growth_potential': role.get('growth_potential', 'Good')
                    })
                else:
                    career_analysis['recommendations'].append({
                        'role_title': str(role),
                        'match_percentage': 70,
                        'description': f"Based on your skills and experience",
                        'required_skills': [],
                        'growth_potential': 'Good'
                    })

        # Generate interview prep
        interview_prep = _generate_interview_prep(resume.parsed_content, interest_profile)
        career_analysis['interview_prep'] = {
            'common_questions': interview_prep.get('common_questions', [])[:10],
            'tips': interview_prep.get('tips', [])[:5]
        }
        career_analysis['interview_tips'] = interview_prep.get('tips', [])[:5]

        # Save analysis to database
        db_analysis = ResumeAnalysis(
            resume_id=resume.id,
            ats_score=career_analysis['ats_score'],
            strengths=career_analysis['strengths'],
            weaknesses=career_analysis['weaknesses'],
            improvement_suggestions=career_analysis['improvement_suggestions'],
            keyword_match_score=analysis_results.get('keyword_match_score', 0),
            formatting_score=analysis_results.get('formatting_score', 0),
            content_quality_score=analysis_results.get('content_quality_score', 0)
        )

        db.add(db_analysis)
        db.commit()

        # Log activity
        progress_analytics.log_activity(
            db,
            current_user.id,
            ActivityType.RESUME_ANALYZED,
            {'resume_id': str(resume.id), 'ats_score': career_analysis['ats_score']}
        )

        return {
            'resume': {
                'id': str(resume.id),
                'filename': resume.filename,
                'upload_date': resume.upload_date.isoformat()
            },
            'analysis': career_analysis
        }

    except Exception as e:
        print(f"Analysis error: {e}")
        # Return basic analysis if comprehensive fails
        return {
            'resume': {
                'id': str(resume.id),
                'filename': resume.filename,
                'upload_date': resume.upload_date.isoformat()
            },
            'analysis': {
                'id': str(resume.id),
                'user_id': str(current_user.id),
                'resume_id': str(resume.id),
                'resume_filename': resume.filename,
                'overall_assessment': 'Resume uploaded successfully. Analysis in progress.',
                'ats_score': 0,
                'strengths': [],
                'weaknesses': [],
                'improvement_suggestions': ['Complete your profile for better recommendations'],
                'recommended_roles': [],
                'recommendations': [],
                'skill_gaps': [],
                'interview_tips': [],
                'interview_prep': {'common_questions': [], 'tips': []},
                'analyzed_at': resume.upload_date.isoformat(),
                'created_at': resume.upload_date.isoformat()
            }
        }


@router.get("/analysis", response_model=Dict[str, Any])
def get_current_analysis(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the current/latest career analysis for the user

    Args:
        current_user: Current authenticated user
        db: Database session

    Returns:
        Latest career analysis data
    """
    from documents.models import Document, ProcessingStatus
    from documents.topic_extractor import topic_extractor

    # Get latest resume
    resume = db.query(Resume).filter(
        Resume.user_id == current_user.id
    ).order_by(Resume.upload_date.desc()).first()

    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume found. Please upload a resume first."
        )

    # Get latest analysis
    analysis = db.query(ResumeAnalysis).filter(
        ResumeAnalysis.resume_id == resume.id
    ).order_by(ResumeAnalysis.analyzed_at.desc()).first()

    # Get interest profile
    documents = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.processing_status == ProcessingStatus.COMPLETED
    ).all()

    documents_data = []
    for doc in documents:
        doc_data = {
            'topics': doc.topics or [],
            'domains': doc.domains or [],
            'keywords': doc.keywords or []
        }
        documents_data.append(doc_data)

    interest_profile = topic_extractor.aggregate_user_interests(documents_data) if documents_data else {}

    # Build response
    career_analysis = {
        'id': str(resume.id),
        'user_id': str(current_user.id),
        'resume_id': str(resume.id),
        'resume_filename': resume.filename,
        'overall_assessment': f"Resume analysis complete. ATS Score: {analysis.ats_score if analysis else 0}%",
        'ats_score': analysis.ats_score if analysis else 0,
        'strengths': analysis.strengths if analysis else [],
        'weaknesses': analysis.weaknesses if analysis else [],
        'improvement_suggestions': analysis.improvement_suggestions if analysis else [],
        'recommended_roles': [],
        'recommendations': [],
        'skill_gaps': [],
        'interview_tips': [],
        'interview_prep': {'common_questions': [], 'tips': []},
        'analyzed_at': (analysis.analyzed_at if analysis else resume.upload_date).isoformat(),
        'created_at': resume.upload_date.isoformat()
    }

    # Generate interview prep if we have profile data
    if resume.parsed_content:
        interview_prep = _generate_interview_prep(resume.parsed_content, interest_profile)
        career_analysis['interview_prep'] = {
            'common_questions': interview_prep.get('common_questions', [])[:10],
            'tips': interview_prep.get('tips', [])[:5]
        }

    return career_analysis


@router.get("/resume", response_model=Dict[str, Any])
def get_latest_resume(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the latest resume for the user

    Args:
        current_user: Current authenticated user
        db: Database session

    Returns:
        Latest resume data
    """
    resume = db.query(Resume).filter(
        Resume.user_id == current_user.id
    ).order_by(Resume.upload_date.desc()).first()

    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume found"
        )

    return {
        'id': str(resume.id),
        'filename': resume.filename,
        'upload_date': resume.upload_date.isoformat(),
        'skills': resume.parsed_content.get('skills', []) if resume.parsed_content else [],
        'education': resume.parsed_content.get('education', []) if resume.parsed_content else [],
        'experience': resume.parsed_content.get('experience', []) if resume.parsed_content else []
    }


@router.get("/recommendations", response_model=Dict[str, Any])
def get_recommendations(
    resume_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get career recommendations, optionally for a specific resume

    Args:
        resume_id: Optional resume ID
        current_user: Current authenticated user
        db: Database session

    Returns:
        Career recommendations
    """
    from documents.models import Document, ProcessingStatus
    from documents.topic_extractor import topic_extractor

    # Get resume
    if resume_id:
        resume = db.query(Resume).filter(
            Resume.id == resume_id,
            Resume.user_id == current_user.id
        ).first()
    else:
        resume = db.query(Resume).filter(
            Resume.user_id == current_user.id
        ).order_by(Resume.upload_date.desc()).first()

    if not resume:
        return {
            'message': 'Upload your resume first to get personalized career recommendations',
            'recommendations': {}
        }

    # Get learning profile
    documents = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.processing_status == ProcessingStatus.COMPLETED
    ).all()

    if not documents:
        return {
            'resume_id': str(resume.id),
            'message': 'Upload study materials to get personalized recommendations based on your learning profile',
            'recommendations': {}
        }

    # Build profile
    documents_data = []
    for doc in documents:
        doc_data = {
            'topics': doc.topics or [],
            'domains': doc.domains or [],
            'keywords': doc.keywords or [],
            'technical_skills': doc.doc_metadata.get('technical_skills', []) if doc.doc_metadata else [],
            'technologies': doc.doc_metadata.get('technologies', []) if doc.doc_metadata else [],
            'programming_languages': doc.doc_metadata.get('programming_languages', []) if doc.doc_metadata else []
        }
        documents_data.append(doc_data)

    interest_profile = topic_extractor.aggregate_user_interests(documents_data)

    # Analyze skill gaps
    resume_skills = resume.parsed_content.get('skills', []) if resume.parsed_content else []
    learned_skills = interest_profile.get('top_skills', [])
    learned_domains = interest_profile.get('primary_domains', [])

    skill_gaps = skill_matcher.analyze_skill_gaps(
        resume_skills,
        learned_skills,
        learned_domains
    )

    # Generate recommendations
    recommendations = recommendation_engine.generate_comprehensive_recommendations(
        resume.parsed_content or {},
        interest_profile,
        skill_gaps
    )

    return {
        'resume_id': str(resume.id),
        'recommendations': recommendations,
        'interest_profile': interest_profile,
        'profile_summary': {
            'domains': interest_profile.get('primary_domains', [])[:5],
            'skills': interest_profile.get('top_skills', [])[:10],
            'documents_analyzed': interest_profile.get('total_documents', 0)
        }
    }


@router.get("/interview-prep", response_model=Dict[str, Any])
def get_interview_prep(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get interview preparation data based on resume and learning profile

    Args:
        current_user: Current authenticated user
        db: Database session

    Returns:
        Interview preparation data
    """
    from documents.models import Document, ProcessingStatus
    from documents.topic_extractor import topic_extractor

    # Get latest resume
    resume = db.query(Resume).filter(
        Resume.user_id == current_user.id
    ).order_by(Resume.upload_date.desc()).first()

    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume found. Please upload a resume first."
        )

    # Get learning profile
    documents = db.query(Document).filter(
        Document.user_id == current_user.id,
        Document.processing_status == ProcessingStatus.COMPLETED
    ).all()

    documents_data = []
    for doc in documents:
        doc_data = {
            'topics': doc.topics or [],
            'domains': doc.domains or [],
            'keywords': doc.keywords or [],
            'technical_skills': doc.doc_metadata.get('technical_skills', []) if doc.doc_metadata else [],
            'technologies': doc.doc_metadata.get('technologies', []) if doc.doc_metadata else []
        }
        documents_data.append(doc_data)

    interest_profile = topic_extractor.aggregate_user_interests(documents_data) if documents_data else {}

    # Generate interview prep
    interview_prep = _generate_interview_prep(
        resume.parsed_content or {},
        interest_profile
    )

    return interview_prep


def _generate_interview_prep(parsed_content: Dict[str, Any], interest_profile: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate interview preparation data

    Args:
        parsed_content: Parsed resume content
        interest_profile: User's interest profile from documents

    Returns:
        Interview preparation data
    """
    skills = parsed_content.get('skills', [])
    domains = interest_profile.get('primary_domains', [])
    topics = interest_profile.get('primary_topics', [])

    # Common interview questions
    common_questions = [
        "Tell me about yourself.",
        "What are your greatest strengths and weaknesses?",
        "Why do you want to work for our company?",
        "Where do you see yourself in five years?",
        "Describe a challenging project you worked on.",
        "How do you handle pressure and tight deadlines?",
        "What motivates you in your work?",
        "Tell me about a time you had a conflict with a colleague.",
        "What makes you unique for this role?",
        "Do you have any questions for us?"
    ]

    # Add skill-specific questions
    if skills:
        for skill in skills[:5]:
            common_questions.append(f"Can you describe your experience with {skill}?")
            common_questions.append(f"What projects have you completed using {skill}?")

    # Interview tips
    tips = [
        "Research the company thoroughly before the interview",
        "Prepare specific examples using the STAR method (Situation, Task, Action, Result)",
        "Practice common questions out loud",
        "Dress appropriately for the company culture",
        "Arrive 10-15 minutes early",
        "Bring copies of your resume and a notepad",
        "Ask thoughtful questions about the role and team",
        "Send a thank-you email within 24 hours after the interview",
        "Be honest about your experience and skills",
        "Show enthusiasm and positive body language"
    ]

    # Role-specific questions based on domains
    role_specific_questions = {}

    domain_questions = {
        'Software Engineering': [
            "Explain the difference between REST and GraphQL APIs",
            "How do you approach debugging complex issues?",
            "Describe your experience with version control systems",
            "What design patterns are you familiar with?",
            "How do you ensure code quality?"
        ],
        'Data Science': [
            "Explain the difference between supervised and unsupervised learning",
            "How do you handle missing data in datasets?",
            "Describe a data analysis project you've completed",
            "What tools do you use for data visualization?",
            "How do you validate a machine learning model?"
        ],
        'Web Development': [
            "Explain the difference between server-side and client-side rendering",
            "How do you optimize website performance?",
            "Describe your experience with responsive design",
            "What frameworks are you most comfortable with?",
            "How do you handle cross-browser compatibility?"
        ],
        'Artificial Intelligence': [
            "Explain the concept of neural networks",
            "How do you prevent overfitting in models?",
            "Describe your experience with NLP or computer vision",
            "What frameworks do you use for ML/AI development?",
            "How do you evaluate model performance?"
        ],
        'Cloud Computing': [
            "Explain the differences between IaaS, PaaS, and SaaS",
            "How do you design for high availability?",
            "Describe your experience with containerization",
            "What security considerations are important in cloud?",
            "How do you optimize cloud costs?"
        ]
    }

    for domain in domains[:3]:
        if domain in domain_questions:
            role_specific_questions[domain] = domain_questions[domain]

    # Technical concepts to review
    technical_concepts = []
    for skill in skills[:10]:
        technical_concepts.append(f"Review fundamentals of {skill}")

    for topic in topics[:5]:
        technical_concepts.append(f"Prepare examples related to {topic}")

    return {
        'id': str(uuid.uuid4()),
        'user_id': '',  # Will be filled by caller
        'role_title': domains[0] if domains else 'Software Professional',
        'common_questions': common_questions[:15],
        'tips': tips,
        'behavioral_framework': "Use the STAR method for behavioral questions: describe the Situation, explain your Task, detail the Actions you took, and share the Results achieved.",
        'technical_concepts': technical_concepts[:10],
        'role_specific_questions': role_specific_questions,
        'created_at': ''
    }

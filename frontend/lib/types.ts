// User types
export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_verified: boolean;
  profile_picture_url?: string;
  created_at: string;
}

// Document types
export interface Document {
  id: string;
  user_id: string;
  title: string;
  content_type: 'YOUTUBE' | 'ARTICLE' | 'PDF' | 'PPT' | 'IMAGE' | 'DOCX' | 'EXCEL' | 'TEXT';
  original_filename?: string;
  file_url?: string;
  file_path?: string;
  upload_date: string;
  file_size?: number;
  processing_status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  extracted_text?: string;
  topics?: string[];
  keywords?: string[];
  created_at: string;
}

// Note types
export interface Note {
  id: string;
  user_id: string;
  document_id: string;
  title: string;
  note_type?: string;
  content: string;
  tags?: string[];
  generated_at: string;
  created_at?: string;
  updated_at?: string;
}

// Summary types
export interface Summary {
  id: string;
  user_id: string;
  document_id: string;
  summary_text: string;
  summary_length: 'SHORT' | 'MEDIUM' | 'DETAILED';
  generated_at: string;
}

// Quiz types
export interface Question {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: 'MCQ' | 'SHORT_ANSWER' | 'TRUE_FALSE' | 'FILL_BLANK';
  options?: string[];
  correct_answer: string;
  explanation?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
}

export interface Quiz {
  id: string;
  user_id: string;
  title: string;
  difficulty_level: 'EASY' | 'MEDIUM' | 'HARD';
  question_type: string;
  document_references?: string[];
  created_at: string;
  questions?: Question[];
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  user_id: string;
  score: number;
  total_questions: number;
  correct_answers: number;
  answers: Record<string, any>;
  started_at: string;
  completed_at?: string;
  time_taken?: number;
}

export interface QuizAnalytics {
  total_quizzes: number;
  total_attempts: number;
  average_score: number;
  best_score: number;
  worst_score: number;
  total_time_spent: number;
  quizzes_by_difficulty: {
    easy: number;
    medium: number;
    hard: number;
  };
  recent_attempts: QuizAttempt[];
}

// Progress types
export interface UserProgress {
  id: string;
  user_id: string;
  total_documents: number;
  total_notes: number;
  total_summaries: number;
  total_quizzes_generated: number;
  total_quizzes_attempted: number;
  average_quiz_score: number;
  study_streak_days: number;
  last_activity_date?: string;
  updated_at?: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  activity_type: 'UPLOAD' | 'NOTE' | 'SUMMARY' | 'QUIZ' | 'QUIZ_ATTEMPT' | 'RESUME_UPLOADED' | 'RESUME_ANALYZED';
  activity_details?: Record<string, any>;
  timestamp: string;
}

// Career types
export interface Resume {
  id: string;
  user_id: string;
  filename: string;
  file_url?: string;
  file_path?: string;
  upload_date: string;
  parsed_content?: Record<string, any>;
  analysis_score?: number;
  last_analyzed_at?: string;
}

export interface ResumeAnalysis {
  id: string;
  resume_id: string;
  ats_score: number;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  keyword_match_score: number;
  formatting_score: number;
  content_quality_score: number;
  analyzed_at: string;
}

export interface CareerRecommendation {
  id: string;
  user_id: string;
  recommendation_type: string;
  recommendation_text: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  is_completed: boolean;
  created_at: string;
}

export interface CareerAnalysis {
  id: string;
  user_id: string;
  resume_id?: string;
  resume_filename?: string;
  overall_assessment: string;
  ats_score: number;
  strengths: string[];
  weaknesses: string[];
  improvement_suggestions: string[];
  recommended_roles: Array<{
    title: string;
    match_percentage: number;
    description?: string;
  }>;
  recommendations?: Array<{
    role_title: string;
    match_percentage: number;
    description?: string;
    required_skills?: string[];
    salary_range?: string;
    growth_potential?: string;
  }>;
  skill_gaps: Array<{
    skill_name: string;
    importance: string;
    learning_resources?: string[];
  }>;
  interview_tips?: string[];
  interview_prep?: {
    common_questions: string[];
    tips: string[];
  };
  analyzed_at: string;
  created_at: string;
}

export interface InterviewPrep {
  id: string;
  user_id: string;
  role_title: string;
  company_name?: string;
  common_questions: string[];
  tips: string[];
  star_examples?: Record<string, any>[];
  behavioral_framework?: string;
  technical_topics?: string[];
  technical_concepts?: string[];
  role_specific_questions?: Record<string, string[]>;
  created_at: string;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

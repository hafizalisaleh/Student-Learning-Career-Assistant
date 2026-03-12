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

// Auth types
export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// Document types
export interface Document {
  id: string;
  user_id: string;
  title: string;
  content_type: 'youtube' | 'article' | 'pdf' | 'ppt' | 'image' | 'docx' | 'excel' | 'text';
  original_filename?: string;
  file_url?: string;
  file_path?: string;
  upload_date: string;
  file_size?: number;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  doc_metadata?: Record<string, any> | null;
  thumbnail_path?: string;
  extracted_text?: string;
  topics?: string[];
  domains?: string[];
  keywords?: string[];
  difficulty_level?: string;
  subject_area?: string;
  created_at: string;
}

export interface TableOfContentsItem {
  id: string;
  number?: string | null;
  title: string;
  label: string;
  level: number;
  page_start: number;
  page_end: number;
  pages: number[];
  path: string[];
  children: TableOfContentsItem[];
}

export interface TableOfContentsResponse {
  document_id: string;
  title: string;
  items: TableOfContentsItem[];
  count: number;
  total_pages: number;
  source: 'contents' | 'headings' | 'pages';
  fallback: boolean;
}

export interface RagQueryOptions {
  sectionTitle?: string;
  sectionPages?: number[];
}

// Learning path types
export type GoalDepth = 'basics' | 'deep' | 'practical';
export type LearningSourceMode = 'web' | 'pdf' | 'hybrid';
export type LessonProgressStatus = 'not_started' | 'completed' | 'review_due';

export interface LearningPathGenerateRequest {
  topic: string;
  background: string;
  goal_depth: GoalDepth;
  daily_minutes: number;
  teaching_style: string[];
  focus_areas: string[];
  source_mode: LearningSourceMode;
  document_ids: string[];
  seed_urls: string[];
  custom_instructions?: string;
}

export interface LearningPathSourceReference {
  label: string;
  source_type: string;
  locator: string;
  excerpt: string;
}

export interface LearningLessonProgress {
  status: LessonProgressStatus;
  attempts: number;
  mastery_score: number;
  xp_earned: number;
  is_completed: boolean;
  completed_at?: string | null;
  last_submission: Record<string, unknown>;
}

export interface LearningLessonSummary {
  id: string;
  unit_id: string;
  title: string;
  objective: string;
  duration_minutes: number;
  difficulty: number;
  unlock_hint: string;
  exercise_type: 'multiple_choice' | 'fill_blank' | 'order_steps' | string;
  key_terms: string[];
  source_refs: string[];
  is_available: boolean;
  is_locked: boolean;
  is_completed: boolean;
  progress: LearningLessonProgress;
}

export interface LearningPathUnit {
  id: string;
  path_id: string;
  order_index: number;
  title: string;
  objective: string;
  sequence_reason: string;
  lessons: LearningLessonSummary[];
}

export interface LearningPathCard {
  id: string;
  title: string;
  topic: string;
  tagline: string;
  goal_depth: GoalDepth;
  source_mode: LearningSourceMode;
  estimated_days: number;
  total_lessons: number;
  completed_lessons: number;
  completion_percentage: number;
  daily_minutes: number;
  teaching_style: string[];
  focus_areas: string[];
  next_lesson_id?: string | null;
  next_lesson_title?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface LearningPathDocument {
  id: string;
  title: string;
  content_type: string;
}

export interface LearningPath {
  id: string;
  title: string;
  topic: string;
  background: string;
  custom_instructions?: string | null;
  tagline: string;
  rationale: string;
  goal_depth: GoalDepth;
  source_mode: LearningSourceMode;
  status: 'ready' | 'failed';
  daily_minutes: number;
  estimated_days: number;
  total_lessons: number;
  completed_lessons: number;
  completion_percentage: number;
  teaching_style: string[];
  focus_areas: string[];
  source_documents: LearningPathDocument[];
  next_lesson_id?: string | null;
  next_lesson_title?: string | null;
  units: LearningPathUnit[];
  created_at: string;
  updated_at?: string | null;
}

export interface LearningLessonSection {
  title: string;
  content: string;
}

export interface LearningLessonDiagram {
  title: string;
  mermaid: string;
  caption: string;
}

export interface LearningLessonExercise {
  type: 'multiple_choice' | 'fill_blank' | 'order_steps' | string;
  prompt: string;
  options: string[];
  correct_option_index: number;
  acceptable_answers: string[];
  correct_sequence: string[];
  explanation: string;
}

export interface LearningLessonContent {
  hook: string;
  tldr: string;
  sections: LearningLessonSection[];
  personalized_analogy: string;
  diagram: LearningLessonDiagram;
  exercise: LearningLessonExercise;
  mastery_check: {
    prompt: string;
    success_criteria: string;
  };
  source_refs: LearningPathSourceReference[];
}

export interface LearningLessonDetail {
  id: string;
  path_id: string;
  unit_id: string;
  title: string;
  objective: string;
  duration_minutes: number;
  difficulty: number;
  unlock_hint: string;
  exercise_type: string;
  key_terms: string[];
  source_refs: string[];
  is_available: boolean;
  is_locked: boolean;
  is_completed: boolean;
  progress: LearningLessonProgress;
  previous_lesson_id?: string | null;
  next_lesson_id?: string | null;
  content?: LearningLessonContent | null;
}

export interface LearningPathChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LearningPathChatSource {
  label: string;
  detail: string;
  url?: string | null;
}

export interface LearningPathChatRequest {
  messages: LearningPathChatMessage[];
  model?: string;
  lesson_id?: string | null;
  unit_id?: string | null;
}

export interface LearningPathChatResponse {
  answer: string;
  model: string;
  call_count: number;
  remembers_via_history: boolean;
  used_live_tools: boolean;
  history_turns_used: number;
  sources: LearningPathChatSource[];
}

export interface LearningLessonCompletionRequest {
  selected_option_index?: number;
  text_answer?: string;
  ordered_steps?: string[];
}

export interface LearningLessonCompletionResponse {
  correct: boolean;
  xp_earned: number;
  status: LessonProgressStatus;
  feedback: string;
  progress: LearningLessonProgress;
}

// Note types
export interface Note {
  id: string;
  user_id: string;
  document_id: string;
  title: string;
  note_type?: string;
  content: string;
  content_format?: 'markdown' | 'blocknote';
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
  summary_length: 'short' | 'medium' | 'detailed';
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

export interface QuizResult {
  attempt_id: string;
  quiz_id: string;
  score: number;
  total_questions: number;
  correct_answers: number;
  time_taken?: number;
  completed_at: string;
  feedback: Array<{
    question_id: string;
    question_text: string;
    user_answer: string;
    correct_answer: string;
    is_correct: boolean;
    explanation: string;
    points_earned: number;
    points_possible: number;
    evidence?: {
      source_index: number;
      document_id?: string | null;
      document_title: string;
      document_source?: string | null;
      page?: number | null;
      pages?: number[];
      excerpt: string;
      modality?: string | null;
      chunk_index?: number | null;
      similarity?: number | null;
    } | null;
  }>;
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

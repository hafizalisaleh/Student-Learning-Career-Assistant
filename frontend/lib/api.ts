import axios, { AxiosInstance } from 'axios';
import type {
  LearningPathChatRequest,
  LearningPathChatResponse,
  LearningLessonCompletionRequest,
  LearningLessonCompletionResponse,
  LearningLessonDetail,
  LearningPath,
  LearningPathCard,
  LearningPathGenerateRequest,
  LearningPathOutlinePreview,
  LearningPathSetupQuestionRequest,
  LearningPathSetupQuestionResponse,
  LearningPathSetupSummaryRequest,
  LearningPathSetupSummaryResponse,
  LearningPathUpdateRequest,
  QuizResult,
  RagQueryOptions,
  TableOfContentsResponse,
} from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Extend AxiosInstance with custom methods
interface ApiInstance extends AxiosInstance {
  // Documents
  getDocuments: () => Promise<any>;
  getDocument: (id: string) => Promise<any>;
  getDocumentTableOfContents: (id: string) => Promise<TableOfContentsResponse>;
  getDocumentUploadConfig: () => Promise<any>;
  uploadDocument: (formData: FormData) => Promise<any>;
  deleteDocument: (id: string) => Promise<any>;
  processUrl: (url: string) => Promise<any>;
  getDocumentThumbnailUrl: (id: string) => string;
  getDocumentMindmap: (id: string, style?: string) => Promise<any>;
  getDocumentDiagram: (id: string, diagramType?: string) => Promise<any>;

  // Learning Paths
  getLearningPaths: () => Promise<LearningPathCard[]>;
  getLearningPathBackgroundQuestion: (data: LearningPathSetupQuestionRequest) => Promise<LearningPathSetupQuestionResponse>;
  getLearningPathGoalQuestion: (data: LearningPathSetupQuestionRequest) => Promise<LearningPathSetupQuestionResponse>;
  getLearningPathSetupSummary: (data: LearningPathSetupSummaryRequest) => Promise<LearningPathSetupSummaryResponse>;
  previewLearningPath: (data: LearningPathGenerateRequest) => Promise<LearningPathOutlinePreview>;
  generateLearningPath: (data: LearningPathGenerateRequest) => Promise<LearningPath>;
  getLearningPath: (id: string) => Promise<LearningPath>;
  updateLearningPath: (id: string, data: LearningPathUpdateRequest) => Promise<LearningPathCard>;
  deleteLearningPath: (id: string) => Promise<{ success: boolean }>;
  chatLearningPath: (pathId: string, data: LearningPathChatRequest) => Promise<LearningPathChatResponse>;
  getLearningLesson: (pathId: string, lessonId: string) => Promise<LearningLessonDetail>;
  generateLearningLesson: (pathId: string, lessonId: string, regenerate?: boolean) => Promise<LearningLessonDetail>;
  completeLearningLesson: (pathId: string, lessonId: string, data: LearningLessonCompletionRequest) => Promise<LearningLessonCompletionResponse>;

  // Notes
  getNotes: () => Promise<any>;
  getNotesByDocument: (id: string) => Promise<any>;
  getNote: (id: string) => Promise<any>;
  createNote: (data: any) => Promise<any>;
  updateNote: (id: string, data: any) => Promise<any>;
  createStudyNote: (data: { title: string; document_id: string; content: string; content_format?: 'markdown' | 'blocknote'; tags?: string[]; note_type?: 'structured' | 'bullet' | 'detailed' | 'study' }) => Promise<any>;
  deleteNote: (id: string) => Promise<any>;
  downloadNote: (id: string) => Promise<Blob>;
  exportNoteDocx: (id: string) => Promise<Blob>;
  exportNoteMarkdown: (id: string) => Promise<Blob>;

  // Summaries
  getSummaries: () => Promise<any>;
  getSummariesByDocument: (id: string) => Promise<any>;
  generateSummary: (data: any) => Promise<any>;
  deleteSummary: (id: string) => Promise<any>;

  // Quizzes
  getQuizzes: () => Promise<any>;
  getQuiz: (id: string) => Promise<any>;
  generateQuiz: (data: any) => Promise<any>;
  startQuizAttempt: (quizId: string) => Promise<any>;
  getQuizAttempt: (quizId: string) => Promise<any>;
  getQuizAttemptHistory: () => Promise<QuizResult[]>;
  submitQuizAttempt: (quizId: string, answers: any) => Promise<any>;
  deleteQuiz: (id: string) => Promise<any>;
  getQuizAnalytics: () => Promise<any>;

  // Progress
  getProgress: () => Promise<any>;
  getProgressOverview: () => Promise<any>;
  getActivityLog: () => Promise<any>;
  getAIInsights: () => Promise<any>;

  // Knowledge Evolution
  getEvolutionTimeline: (conceptId?: string) => Promise<any>;
  getEvolutionConcepts: (domain?: string) => Promise<any>;
  getEvolutionConceptDetail: (conceptId: string) => Promise<any>;
  getEvolutionDomainSummary: () => Promise<any>;
  recalculateEvolution: () => Promise<any>;

  // Career
  getCareerAnalysis: () => Promise<any>;
  getCurrentCareerAnalysis: () => Promise<any>;
  getCareerRecommendations: (resumeId?: string) => Promise<any>;
  getInterviewPrep: () => Promise<any>;
  uploadAndAnalyzeResume: (file: File) => Promise<any>;
  getLatestResume: () => Promise<any>;

  // RAG / Vector Store
  ragQuery: (question: string, documentId?: string, nResults?: number, mode?: string, options?: RagQueryOptions) => Promise<any>;
  visionQuery: (
    question: string,
    documentId?: string,
    nResults?: number,
    options?: {
      selectedPage?: number;
      selectedImageDataUrl?: string | null;
    }
  ) => Promise<any>;
  ragSearch: (query: string, documentId?: string, nResults?: number) => Promise<any>;
  getVectorStats: () => Promise<any>;
  getDocumentEmbeddings: (documentId: string) => Promise<any>;
  indexForFileSearch: (documentId: string) => Promise<any>;
  getFileSearchStatus: (documentId: string) => Promise<any>;
  reviseContent: (data: { current_content: string; revision_prompt: string; content_type: string; document_title?: string }) => Promise<any>;
  getKnowledgeGraph: () => Promise<any>;
}

const axiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
}) as ApiInstance;

// Add auth token to requests
axiosInstance.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const storage = localStorage.getItem('auth-storage');
    if (storage) {
      const { state } = JSON.parse(storage);
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`;
      }
    }
  }
  return config;
});

// Handle 401 errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth-storage');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ===== Documents =====
axiosInstance.getDocuments = async () => {
  const response = await axiosInstance.get('/api/documents/');
  // Backend returns { documents: [...], total, page, page_size }
  return response.data.documents || response.data;
};

axiosInstance.getDocument = async (id: string) => {
  const response = await axiosInstance.get(`/api/documents/${id}`);
  return response.data;
};

axiosInstance.getDocumentTableOfContents = async (id: string) => {
  const response = await axiosInstance.get(`/api/documents/${id}/table-of-contents`);
  return response.data;
};

axiosInstance.getDocumentUploadConfig = async () => {
  const response = await axiosInstance.get('/api/documents/upload/config');
  return response.data;
};

axiosInstance.uploadDocument = async (formData: FormData) => {
  const response = await axiosInstance.post('/api/documents/upload/file', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

axiosInstance.deleteDocument = async (id: string) => {
  const response = await axiosInstance.delete(`/api/documents/${id}`);
  return response.data;
};

axiosInstance.getDocumentThumbnailUrl = (id: string) => {
  return `${API_URL}/api/documents/${id}/thumbnail`;
};

axiosInstance.getDocumentMindmap = async (id: string, style: string = 'default') => {
  const response = await axiosInstance.get(`/api/documents/${id}/mindmap?style=${style}`);
  return response.data;
};

axiosInstance.getDocumentDiagram = async (id: string, diagramType: string = 'flowchart') => {
  const response = await axiosInstance.get(`/api/documents/${id}/diagram?diagram_type=${diagramType}`);
  return response.data;
};

axiosInstance.processUrl = async (url: string) => {
  // Detect URL type and call appropriate endpoint
  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
  const endpoint = isYouTube ? '/api/documents/upload/youtube' : '/api/documents/upload/web';
  const response = await axiosInstance.post(endpoint, { url });
  return response.data;
};

// ===== Learning Paths =====
axiosInstance.getLearningPaths = async () => {
  const response = await axiosInstance.get('/api/learning-paths/');
  return response.data;
};

axiosInstance.getLearningPathBackgroundQuestion = async (data: LearningPathSetupQuestionRequest) => {
  const response = await axiosInstance.post('/api/learning-paths/setup/background-question', data);
  return response.data;
};

axiosInstance.getLearningPathGoalQuestion = async (data: LearningPathSetupQuestionRequest) => {
  const response = await axiosInstance.post('/api/learning-paths/setup/goal-question', data);
  return response.data;
};

axiosInstance.getLearningPathSetupSummary = async (data: LearningPathSetupSummaryRequest) => {
  const response = await axiosInstance.post('/api/learning-paths/setup/summary', data);
  return response.data;
};

axiosInstance.previewLearningPath = async (data: LearningPathGenerateRequest) => {
  const response = await axiosInstance.post('/api/learning-paths/preview', data);
  return response.data;
};

axiosInstance.generateLearningPath = async (data: LearningPathGenerateRequest) => {
  const response = await axiosInstance.post('/api/learning-paths/generate', data);
  return response.data;
};

axiosInstance.getLearningPath = async (id: string) => {
  const response = await axiosInstance.get(`/api/learning-paths/${id}`);
  return response.data;
};

axiosInstance.updateLearningPath = async (id: string, data: LearningPathUpdateRequest) => {
  const response = await axiosInstance.patch(`/api/learning-paths/${id}`, data);
  return response.data;
};

axiosInstance.deleteLearningPath = async (id: string) => {
  const response = await axiosInstance.delete(`/api/learning-paths/${id}`);
  return response.data;
};

axiosInstance.chatLearningPath = async (pathId: string, data: LearningPathChatRequest) => {
  const response = await axiosInstance.post(`/api/learning-paths/${pathId}/chat`, data);
  return response.data;
};

axiosInstance.getLearningLesson = async (pathId: string, lessonId: string) => {
  const response = await axiosInstance.get(`/api/learning-paths/${pathId}/lessons/${lessonId}`);
  return response.data;
};

axiosInstance.generateLearningLesson = async (pathId: string, lessonId: string, regenerate: boolean = false) => {
  const params = regenerate ? '?regenerate=true' : '';
  const response = await axiosInstance.post(`/api/learning-paths/${pathId}/lessons/${lessonId}/generate${params}`);
  return response.data;
};

axiosInstance.completeLearningLesson = async (pathId: string, lessonId: string, data: LearningLessonCompletionRequest) => {
  const response = await axiosInstance.post(`/api/learning-paths/${pathId}/lessons/${lessonId}/complete`, data);
  return response.data;
};

// ===== Notes =====
axiosInstance.getNotes = async () => {
  const response = await axiosInstance.get('/api/notes/');
  return response.data;
};

axiosInstance.getNotesByDocument = async (id: string) => {
  const response = await axiosInstance.get(`/api/notes/document/${id}`);
  return response.data;
};

axiosInstance.getNote = async (id: string) => {
  const response = await axiosInstance.get(`/api/notes/${id}`);
  return response.data;
};

axiosInstance.updateNote = async (id: string, data: any) => {
  const response = await axiosInstance.put(`/api/notes/${id}`, data);
  return response.data;
};

axiosInstance.createStudyNote = async (data: { title: string; document_id: string; content: string; content_format?: 'markdown' | 'blocknote'; tags?: string[]; note_type?: 'structured' | 'bullet' | 'detailed' | 'study' }) => {
  const response = await axiosInstance.post('/api/notes/study', data);
  return response.data;
};

axiosInstance.createNote = async (data: any) => {
  const response = await axiosInstance.post('/api/notes/generate', data);
  return response.data;
};

axiosInstance.deleteNote = async (id: string) => {
  const response = await axiosInstance.delete(`/api/notes/${id}`);
  return response.data;
};

axiosInstance.downloadNote = async (id: string) => {
  const response = await axiosInstance.get(`/api/notes/${id}/download`, {
    responseType: 'blob',
  });
  return response.data;
};

axiosInstance.exportNoteDocx = async (id: string) => {
  const response = await axiosInstance.get(`/api/notes/${id}/export/docx`, {
    responseType: 'blob',
  });
  return response.data;
};

axiosInstance.exportNoteMarkdown = async (id: string) => {
  const response = await axiosInstance.get(`/api/notes/${id}/export/markdown`, {
    responseType: 'blob',
  });
  return response.data;
};

// ===== Summaries =====
axiosInstance.getSummaries = async () => {
  const response = await axiosInstance.get('/api/summaries/');
  return response.data;
};

axiosInstance.getSummariesByDocument = async (id: string) => {
  const response = await axiosInstance.get(`/api/summaries/document/${id}`);
  return response.data;
};

axiosInstance.generateSummary = async (data: any) => {
  const response = await axiosInstance.post('/api/summaries/generate', data);
  return response.data;
};

axiosInstance.deleteSummary = async (id: string) => {
  const response = await axiosInstance.delete(`/api/summaries/${id}`);
  return response.data;
};

// ===== Quizzes =====
axiosInstance.getQuizzes = async () => {
  const response = await axiosInstance.get('/api/quizzes/');
  return response.data;
};

axiosInstance.getQuiz = async (id: string) => {
  const response = await axiosInstance.get(`/api/quizzes/${id}`);
  return response.data;
};

axiosInstance.generateQuiz = async (data: any) => {
  const response = await axiosInstance.post('/api/quizzes/generate', data);
  return response.data;
};

axiosInstance.startQuizAttempt = async (quizId: string) => {
  const response = await axiosInstance.post(`/api/quizzes/${quizId}/start`);
  return response.data;
};

axiosInstance.getQuizAttempt = async (quizId: string) => {
  const response = await axiosInstance.get(`/api/quizzes/${quizId}/attempt`);
  return response.data;
};

axiosInstance.getQuizAttemptHistory = async () => {
  const response = await axiosInstance.get('/api/quizzes/attempts/history');
  return response.data;
};

axiosInstance.submitQuizAttempt = async (quizId: string, answers: any) => {
  const response = await axiosInstance.post(`/api/quizzes/${quizId}/submit`, { answers });
  return response.data;
};

axiosInstance.deleteQuiz = async (id: string) => {
  const response = await axiosInstance.delete(`/api/quizzes/${id}`);
  return response.data;
};

axiosInstance.getQuizAnalytics = async () => {
  const response = await axiosInstance.get('/api/quizzes/analytics');
  return response.data;
};

// ===== Progress =====
axiosInstance.getProgress = async () => {
  const response = await axiosInstance.get('/api/progress/analytics/detailed');
  return response.data;
};

axiosInstance.getProgressOverview = async () => {
  const response = await axiosInstance.get('/api/progress/dashboard');
  return response.data;
};

axiosInstance.getActivityLog = async () => {
  const response = await axiosInstance.get('/api/progress/activities');
  return response.data;
};

axiosInstance.getAIInsights = async () => {
  const response = await axiosInstance.get('/api/progress/insights/ai');
  return response.data;
};

// ===== Knowledge Evolution =====
axiosInstance.getEvolutionTimeline = async (conceptId?: string) => {
  const params = conceptId ? `?concept_id=${conceptId}` : '';
  const response = await axiosInstance.get(`/api/evolution/timeline${params}`);
  return response.data;
};

axiosInstance.getEvolutionConcepts = async (domain?: string) => {
  const params = domain ? `?domain=${encodeURIComponent(domain)}` : '';
  const response = await axiosInstance.get(`/api/evolution/concepts${params}`);
  return response.data;
};

axiosInstance.getEvolutionConceptDetail = async (conceptId: string) => {
  const response = await axiosInstance.get(`/api/evolution/concepts/${conceptId}`);
  return response.data;
};

axiosInstance.getEvolutionDomainSummary = async () => {
  const response = await axiosInstance.get('/api/evolution/domain-summary');
  return response.data;
};

axiosInstance.recalculateEvolution = async () => {
  const response = await axiosInstance.post('/api/evolution/recalculate');
  return response.data;
};

// ===== Career =====
axiosInstance.getCareerAnalysis = async () => {
  const response = await axiosInstance.get('/api/career/analysis');
  return response.data;
};

axiosInstance.getCurrentCareerAnalysis = async () => {
  const response = await axiosInstance.get('/api/career/analysis');
  return response.data;
};

axiosInstance.getCareerRecommendations = async (resumeId?: string) => {
  const url = resumeId ? `/api/career/recommendations?resume_id=${resumeId}` : '/api/career/recommendations';
  const response = await axiosInstance.get(url);
  return response.data;
};

axiosInstance.getInterviewPrep = async () => {
  const response = await axiosInstance.get('/api/career/interview-prep');
  return response.data;
};

axiosInstance.uploadAndAnalyzeResume = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await axiosInstance.post('/api/career/analyze-resume', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

axiosInstance.getLatestResume = async () => {
  const response = await axiosInstance.get('/api/career/resume');
  return response.data;
};

// ===== RAG / Vector Store =====
axiosInstance.ragQuery = async (
  question: string,
  documentId?: string,
  nResults: number = 5,
  mode: string = 'structured_output',
  options?: RagQueryOptions
) => {
  const response = await axiosInstance.post('/api/vectors/query', {
    question,
    document_id: documentId,
    n_results: nResults,
    mode,
    section_title: options?.sectionTitle,
    section_pages: options?.sectionPages,
  });
  return response.data;
};

axiosInstance.visionQuery = async (
  question: string,
  documentId?: string,
  nResults: number = 6,
  options?: {
    selectedPage?: number;
    selectedImageDataUrl?: string | null;
  }
) => {
  const response = await axiosInstance.post('/api/vectors/vision-query', {
    question,
    document_id: documentId,
    n_results: nResults,
    selected_page: options?.selectedPage,
    selected_image_data: options?.selectedImageDataUrl,
  });
  return response.data;
};

axiosInstance.ragSearch = async (query: string, documentId?: string, nResults: number = 5) => {
  const response = await axiosInstance.post('/api/vectors/search', {
    query,
    document_id: documentId,
    n_results: nResults,
  });
  return response.data;
};

axiosInstance.getVectorStats = async () => {
  const response = await axiosInstance.get('/api/vectors/stats');
  return response.data;
};

axiosInstance.getDocumentEmbeddings = async (documentId: string) => {
  const response = await axiosInstance.get(`/api/vectors/documents/${documentId}/embeddings`);
  return response.data;
};

axiosInstance.indexForFileSearch = async (documentId: string) => {
  const response = await axiosInstance.post(`/api/vectors/file-search/index/${documentId}`);
  return response.data;
};

axiosInstance.getFileSearchStatus = async (documentId: string) => {
  const response = await axiosInstance.get(`/api/vectors/file-search/status/${documentId}`);
  return response.data;
};

axiosInstance.reviseContent = async (data: { current_content: string; revision_prompt: string; content_type: string; document_title?: string }) => {
  const response = await axiosInstance.post('/api/vectors/revise', data);
  return response.data;
};

axiosInstance.getKnowledgeGraph = async () => {
  const response = await axiosInstance.get('/api/vectors/knowledge-graph');
  return response.data;
};

export const api = axiosInstance;
export default api;

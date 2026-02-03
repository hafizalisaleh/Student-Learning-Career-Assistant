import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Extend AxiosInstance with custom methods
interface ApiInstance extends AxiosInstance {
  // Documents
  getDocuments: () => Promise<any>;
  uploadDocument: (formData: FormData) => Promise<any>;
  deleteDocument: (id: string) => Promise<any>;
  processUrl: (url: string) => Promise<any>;

  // Notes
  getNotes: () => Promise<any>;
  getNote: (id: string) => Promise<any>;
  createNote: (data: any) => Promise<any>;
  deleteNote: (id: string) => Promise<any>;
  downloadNote: (id: string) => Promise<Blob>;
  exportNoteDocx: (id: string) => Promise<Blob>;

  // Summaries
  getSummaries: () => Promise<any>;
  generateSummary: (data: any) => Promise<any>;
  deleteSummary: (id: string) => Promise<any>;

  // Quizzes
  getQuizzes: () => Promise<any>;
  getQuiz: (id: string) => Promise<any>;
  generateQuiz: (data: any) => Promise<any>;
  submitQuizAttempt: (quizId: string, answers: any) => Promise<any>;
  deleteQuiz: (id: string) => Promise<any>;
  getQuizAnalytics: () => Promise<any>;

  // Progress
  getProgress: () => Promise<any>;
  getProgressOverview: () => Promise<any>;
  getActivityLog: () => Promise<any>;
  getAIInsights: () => Promise<any>;

  // Career
  getCareerAnalysis: () => Promise<any>;
  getCurrentCareerAnalysis: () => Promise<any>;
  getCareerRecommendations: (resumeId?: string) => Promise<any>;
  getInterviewPrep: () => Promise<any>;
  uploadAndAnalyzeResume: (file: File) => Promise<any>;
  getLatestResume: () => Promise<any>;
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
  return response.data;
};

axiosInstance.uploadDocument = async (formData: FormData) => {
  const response = await axiosInstance.post('/api/documents/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

axiosInstance.deleteDocument = async (id: string) => {
  const response = await axiosInstance.delete(`/api/documents/${id}`);
  return response.data;
};

axiosInstance.processUrl = async (url: string) => {
  const response = await axiosInstance.post('/api/documents/process-url', { url });
  return response.data;
};

// ===== Notes =====
axiosInstance.getNotes = async () => {
  const response = await axiosInstance.get('/api/notes/');
  return response.data;
};

axiosInstance.getNote = async (id: string) => {
  const response = await axiosInstance.get(`/api/notes/${id}`);
  return response.data;
};

axiosInstance.createNote = async (data: any) => {
  const response = await axiosInstance.post('/api/notes/', data);
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
  const response = await axiosInstance.get(`/api/notes/${id}/export-docx`, {
    responseType: 'blob',
  });
  return response.data;
};

// ===== Summaries =====
axiosInstance.getSummaries = async () => {
  const response = await axiosInstance.get('/api/summaries/');
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

axiosInstance.submitQuizAttempt = async (quizId: string, answers: any) => {
  const response = await axiosInstance.post(`/api/quizzes/${quizId}/attempt`, { answers });
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
  const response = await axiosInstance.get('/api/progress/analytics');
  return response.data;
};

axiosInstance.getProgressOverview = async () => {
  const response = await axiosInstance.get('/api/progress/analytics');
  return response.data;
};

axiosInstance.getActivityLog = async () => {
  const response = await axiosInstance.get('/api/progress/activity');
  return response.data;
};

axiosInstance.getAIInsights = async () => {
  const response = await axiosInstance.get('/api/progress/ai-insights');
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

export const api = axiosInstance;
export default api;

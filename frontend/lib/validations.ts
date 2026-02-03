import { z } from 'zod';

// Login validation schema
export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must not exceed 72 characters'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// Register validation schema
export const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must not exceed 72 characters'),
  confirmPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must not exceed 72 characters'),
  first_name: z.string().min(2, 'First name must be at least 2 characters'),
  last_name: z.string().min(2, 'Last name must be at least 2 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

export type RegisterFormData = z.infer<typeof registerSchema>;

// Note creation validation schema
export const noteSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  document_id: z.string().uuid('Invalid document ID'),
  tags: z.array(z.string()).optional(),
});

export type NoteFormData = z.infer<typeof noteSchema>;

// Summary generation validation schema
export const summarySchema = z.object({
  document_id: z.string().uuid('Please select a document'),
  summary_length: z.enum(['SHORT', 'MEDIUM', 'DETAILED'], {
    required_error: 'Please select a summary length',
  }),
});

export type SummaryFormData = z.infer<typeof summarySchema>;

// Quiz generation validation schema
export const quizSchema = z.object({
  title: z.string().min(1, 'Quiz title is required'),
  document_ids: z.array(z.string().uuid()).min(1, 'Please select at least one document'),
  num_questions: z.number().min(1).max(50),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  question_type: z.enum(['MCQ', 'SHORT_ANSWER', 'TRUE_FALSE', 'FILL_BLANK', 'MIXED']),
});

export type QuizFormData = z.infer<typeof quizSchema>;

// Aliases for backwards compatibility
export const createNoteSchema = noteSchema;
export type CreateNoteFormData = NoteFormData;

export const generateQuizSchema = quizSchema;
export type GenerateQuizFormData = QuizFormData;

export const generateSummarySchema = summarySchema;
export type GenerateSummaryFormData = SummaryFormData;

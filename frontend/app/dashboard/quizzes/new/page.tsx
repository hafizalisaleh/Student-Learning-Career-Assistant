'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/api';
import { generateQuizSchema, type GenerateQuizFormData } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  ArrowLeft,
  Sparkles,
  FileText,
  CheckSquare,
  ToggleLeft,
  MessageSquare,
  Zap,
  Target,
  Flame,
  ChevronDown,
  Plus,
  Minus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { Document } from '@/lib/types';

const questionTypes = [
  {
    id: 'mcq',
    label: 'Multiple Choice',
    description: 'Classic 4-option questions',
    icon: CheckSquare,
    color: 'var(--primary)',
  },
  {
    id: 'true_false',
    label: 'True or False',
    description: 'Binary answer format',
    icon: ToggleLeft,
    color: 'var(--secondary)',
  },
  {
    id: 'short',
    label: 'Short Answer',
    description: 'Open text responses',
    icon: MessageSquare,
    color: 'var(--highlight)',
  },
];

const difficulties = [
  { id: 'easy', label: 'Easy', icon: Zap, color: '#22c55e', rgb: '34, 197, 94' },
  { id: 'medium', label: 'Medium', icon: Target, color: '#f59e0b', rgb: '245, 158, 11' },
  { id: 'hard', label: 'Hard', icon: Flame, color: '#ef4444', rgb: '239, 68, 68' },
];

export default function NewQuizPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner size="lg" /></div>}>
      <NewQuizContent />
    </Suspense>
  );
}

function NewQuizContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const docIdFromQuery = searchParams.get('document');
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['mcq']);
  const [selectedDifficulty, setSelectedDifficulty] = useState('medium');
  const [numQuestions, setNumQuestions] = useState(10);
  const [isDocDropdownOpen, setIsDocDropdownOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<GenerateQuizFormData>({
    resolver: zodResolver(generateQuizSchema),
    defaultValues: {
      num_questions: 10,
      difficulty: 'medium',
      question_types: ['mcq'],
    },
  });

  useEffect(() => {
    async function fetchDocuments() {
      try {
        const data = await api.getDocuments();
        const docsArray = Array.isArray(data) ? data : [];
        const completedDocs = docsArray.filter(
          (doc) => doc.processing_status?.toLowerCase() === 'completed'
        );
        setDocuments(completedDocs);

        // Pre-select document from query param
        if (docIdFromQuery) {
          const doc = completedDocs.find((d: Document) => d.id === docIdFromQuery);
          if (doc) {
            setSelectedDoc(doc);
            setValue('document_id', doc.id);
          }
        }
      } catch (error) {
        console.error('Failed to load documents:', error);
        toast.error('Failed to load documents');
      }
    }
    fetchDocuments();
  }, [docIdFromQuery, setValue]);

  const handleTypeToggle = (typeId: string) => {
    const newTypes = selectedTypes.includes(typeId)
      ? selectedTypes.filter((t) => t !== typeId)
      : [...selectedTypes, typeId];

    if (newTypes.length > 0) {
      setSelectedTypes(newTypes);
      setValue('question_types', newTypes as any);
    }
  };

  const handleDocSelect = (doc: Document) => {
    setSelectedDoc(doc);
    setValue('document_id', doc.id);
    setIsDocDropdownOpen(false);
  };

  const adjustQuestions = (delta: number) => {
    const newValue = Math.min(50, Math.max(1, numQuestions + delta));
    setNumQuestions(newValue);
    setValue('num_questions', newValue);
  };

  const onSubmit = async (data: GenerateQuizFormData) => {
    if (!selectedDoc) {
      toast.error('Please select a document');
      return;
    }

    try {
      setIsLoading(true);
      const requestData = {
        document_ids: [selectedDoc.id],
        num_questions: numQuestions,
        difficulty: selectedDifficulty,
        question_type: selectedTypes.length === 1 ? selectedTypes[0] : 'mixed',
        title: data.topic || undefined,
      };

      const quiz = await api.generateQuiz(requestData);
      toast.success('Quiz generated successfully!');
      router.push(`/dashboard/quizzes/${quiz.id}`);
    } catch (error: any) {
      console.error('Quiz generation error:', error);
      const errorMessage =
        error.response?.data?.detail || error.message || 'Failed to generate quiz';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="quiz-atmosphere min-h-screen pb-12">
      {/* Atmospheric orbs */}
      <div className="quiz-orb quiz-orb-1" />
      <div className="quiz-orb quiz-orb-2" />
      <div className="quiz-orb quiz-orb-3" />

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/dashboard/quizzes"
            className="inline-flex items-center gap-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span className="text-sm font-medium">Back to Quizzes</span>
          </Link>

          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              Create Quiz
            </h1>
            <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
              AI-powered assessment from your documents
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Document Selection */}
          <div className="quiz-glass-card p-8">
            <div className="mb-4">
              <h2 className="text-sm font-medium text-[var(--text-secondary)]">
                Source Document
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Select the document to generate questions from
              </p>
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsDocDropdownOpen(!isDocDropdownOpen)}
                className={cn(
                  'w-full p-5 rounded-2xl border-2 border-dashed transition-all duration-300 text-left',
                  selectedDoc
                    ? 'border-[var(--accent-blue)]/50 bg-[var(--accent-blue)]/5'
                    : 'border-[var(--card-border)] hover:border-[var(--card-border-hover)] bg-[var(--bg-elevated)]/50'
                )}
              >
                {selectedDoc ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-[var(--accent-blue)]/10 flex items-center justify-center">
                        <FileText className="w-6 h-6 text-[var(--accent-blue)]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">
                          {selectedDoc.title}
                        </p>
                        <p className="text-sm text-[var(--text-tertiary)]">
                          {selectedDoc.content_type} • Ready
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        'w-5 h-5 text-[var(--text-tertiary)] transition-transform',
                        isDocDropdownOpen && 'rotate-180'
                      )}
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-[var(--bg-tertiary)] flex items-center justify-center border border-dashed border-[var(--card-border)]">
                        <Plus className="w-5 h-5 text-[var(--text-tertiary)]" />
                      </div>
                      <div>
                        <p className="font-medium text-[var(--text-secondary)]">
                          Choose a document
                        </p>
                        <p className="text-sm text-[var(--text-tertiary)]">
                          {documents.length} documents available
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        'w-5 h-5 text-[var(--text-tertiary)] transition-transform',
                        isDocDropdownOpen && 'rotate-180'
                      )}
                    />
                  </div>
                )}
              </button>

              {/* Dropdown */}
              {isDocDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 p-2 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--card-border)] shadow-2xl z-50 max-h-64 overflow-y-auto">
                  {documents.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-[var(--text-tertiary)]">No documents available</p>
                      <Link
                        href="/dashboard/documents"
                        className="text-[var(--accent-blue)] text-sm mt-1 inline-block hover:underline"
                      >
                        Upload a document →
                      </Link>
                    </div>
                  ) : (
                    <div className="quiz-stagger space-y-1">
                      {documents.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => handleDocSelect(doc)}
                          className={cn(
                            'w-full p-3 rounded-xl flex items-center gap-3 transition-all',
                            selectedDoc?.id === doc.id
                              ? 'bg-[var(--accent-blue)]/10 border border-[var(--accent-blue)]/30'
                              : 'hover:bg-[var(--bg-elevated)]'
                          )}
                        >
                          <div
                            className={cn(
                              'w-10 h-10 rounded-lg flex items-center justify-center',
                              selectedDoc?.id === doc.id
                                ? 'bg-[var(--accent-blue)]/20'
                                : 'bg-[var(--bg-tertiary)]'
                            )}
                          >
                            <FileText
                              className={cn(
                                'w-5 h-5',
                                selectedDoc?.id === doc.id
                                  ? 'text-[var(--accent-blue)]'
                                  : 'text-[var(--text-tertiary)]'
                              )}
                            />
                          </div>
                          <div className="text-left flex-1 min-w-0">
                            <p className="font-medium text-[var(--text-primary)] truncate">
                              {doc.title}
                            </p>
                            <p className="text-xs text-[var(--text-tertiary)]">
                              {doc.content_type}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {errors.document_id && (
              <p className="mt-3 text-sm text-[var(--error)]">{errors.document_id.message}</p>
            )}
          </div>

          {/* Question Types */}
          <div className="quiz-glass-card p-8">
            <div className="mb-4">
              <h2 className="text-sm font-medium text-[var(--text-secondary)]">
                Question Types
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Select one or more formats
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {questionTypes.map((type) => {
                const Icon = type.icon;
                const isSelected = selectedTypes.includes(type.id);
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => handleTypeToggle(type.id)}
                    className="quiz-type-card group text-left"
                    style={
                      {
                        '--type-color': type.color,
                        borderColor: isSelected ? type.color : undefined,
                      } as React.CSSProperties
                    }
                  >
                    <div className="relative z-10">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-lg mb-3 flex items-center justify-center transition-all',
                          isSelected
                            ? 'bg-[var(--primary)]'
                            : 'bg-[var(--bg-secondary)]'
                        )}
                      >
                        <Icon
                          className={cn(
                            'w-6 h-6 transition-colors',
                            isSelected ? 'text-white' : 'text-[var(--text-tertiary)]'
                          )}
                        />
                      </div>
                      <h3
                        className={cn(
                          'font-semibold mb-1 transition-colors',
                          isSelected ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                        )}
                      >
                        {type.label}
                      </h3>
                      <p className="text-sm text-[var(--text-tertiary)]">{type.description}</p>

                      {/* Selection indicator */}
                      <div
                        className={cn(
                          'absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                          isSelected
                            ? 'border-current bg-current'
                            : 'border-[var(--card-border)]'
                        )}
                        style={{ color: isSelected ? type.color : undefined }}
                      >
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedTypes.length === 0 && (
              <p className="mt-4 text-sm text-[var(--error)]">
                Select at least one question type
              </p>
            )}
          </div>

          {/* Configuration Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Number of Questions */}
            <div className="quiz-glass-card p-6">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-4">
                Number of Questions
              </label>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => adjustQuestions(-5)}
                  className="w-12 h-12 rounded-xl bg-[var(--bg-elevated)] border border-[var(--card-border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--card-border-hover)] transition-all"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <div className="flex-1 text-center">
                  <input
                    type="number"
                    value={numQuestions}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setNumQuestions(Math.min(50, Math.max(1, val)));
                      setValue('num_questions', Math.min(50, Math.max(1, val)));
                    }}
                    className="quiz-number-input w-20 text-center text-3xl font-display font-bold text-[var(--text-primary)] bg-transparent border-none focus:outline-none"
                    min={1}
                    max={50}
                  />
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">questions</p>
                </div>
                <button
                  type="button"
                  onClick={() => adjustQuestions(5)}
                  className="w-12 h-12 rounded-xl bg-[var(--bg-elevated)] border border-[var(--card-border)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--card-border-hover)] transition-all"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Difficulty */}
            <div className="quiz-glass-card p-6">
              <label className="block text-sm font-medium text-[var(--text-secondary)] mb-4">
                Difficulty Level
              </label>
              <div className="flex gap-2">
                {difficulties.map((diff) => {
                  const Icon = diff.icon;
                  const isActive = selectedDifficulty === diff.id;
                  return (
                    <button
                      key={diff.id}
                      type="button"
                      onClick={() => {
                        setSelectedDifficulty(diff.id);
                        setValue('difficulty', diff.id as any);
                      }}
                      className={cn(
                        'quiz-difficulty-btn flex-1 flex items-center justify-center gap-2',
                        isActive && 'quiz-difficulty-btn-active'
                      )}
                      style={
                        {
                          '--diff-color': diff.color,
                          '--diff-rgb': diff.rgb,
                        } as React.CSSProperties
                      }
                    >
                      <Icon className="w-4 h-4" />
                      {diff.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Topic (Optional) */}
          <div className="quiz-glass-card p-8">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3">
              Quiz Title
              <span className="text-[var(--text-tertiary)] font-normal ml-2">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g., Machine Learning Fundamentals"
              className="w-full px-5 py-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--card-border)] focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] transition-all"
              {...register('topic')}
            />
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <Link href="/dashboard/quizzes" className="flex-1">
              <button
                type="button"
                className="w-full py-4 px-6 rounded-2xl border border-[var(--card-border)] text-[var(--text-secondary)] font-semibold hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-all"
              >
                Cancel
              </button>
            </Link>
            <button
              type="submit"
              disabled={isLoading || selectedTypes.length === 0 || !selectedDoc}
              className={cn(
                'flex-[2] py-4 px-6 rounded-2xl font-semibold flex items-center justify-center gap-3 transition-all',
                isLoading || selectedTypes.length === 0 || !selectedDoc
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
                  : 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]'
              )}
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Generating Quiz...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Generate Quiz</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Quiz } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import toast from 'react-hot-toast';
import {
  CheckCircle,
  XCircle,
  Clock,
  Award,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Sparkles,
  Trophy,
  Target,
  Zap,
  BookOpen,
  ChevronRight,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

interface QuizAnswer {
  question_id: string;
  selected_answer?: string;
  answer_text?: string;
}

export default function TakeQuizPage() {
  const params = useParams();
  const router = useRouter();
  const quizId = params.id as string;

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [attempt, setAttempt] = useState<any | null>(null);
  const [timeStarted, setTimeStarted] = useState<Date | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);

  const answeredCount = useMemo(() => {
    return Object.values(answers).filter(
      (a) => a.selected_answer || a.answer_text
    ).length;
  }, [answers]);

  const progress = useMemo(() => {
    if (!quiz?.questions?.length) return 0;
    return (answeredCount / quiz.questions.length) * 100;
  }, [answeredCount, quiz?.questions?.length]);

  useEffect(() => {
    loadQuiz();
  }, [quizId]);

  const loadQuiz = async () => {
    try {
      setLoading(true);
      const data = await api.getQuiz(quizId);
      setQuiz(data);

      try {
        const existingAttempt = await api.getQuizAttempt(quizId);
        if (existingAttempt && existingAttempt.completed_at) {
          setAttempt(existingAttempt);
          setLoading(false);
          return;
        }
      } catch (error: any) {
        if (error.response?.status !== 404) {
          console.warn('Error checking for existing attempt:', error.message);
        }
      }

      try {
        const startResponse = await api.startQuizAttempt(quizId);
        setTimeStarted(new Date(startResponse.started_at));
      } catch (error: any) {
        setTimeStarted(new Date());
      }

      const initialAnswers: Record<string, QuizAnswer> = {};
      data.questions.forEach((q: any) => {
        initialAnswers[q.id] = { question_id: q.id };
      });
      setAnswers(initialAnswers);
    } catch (error: any) {
      console.error('Failed to load quiz:', error);
      toast.error(error.response?.data?.detail || 'Failed to load quiz');
      router.push('/dashboard/quizzes');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (
    questionId: string,
    value: string,
    type: 'mcq' | 'true_false' | 'short_answer'
  ) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        question_id: questionId,
        ...(type === 'short_answer'
          ? { answer_text: value }
          : { selected_answer: value }),
      },
    }));
  };

  const handleSubmit = async () => {
    const unanswered = quiz?.questions?.filter((q) => {
      const answer = answers[q.id];
      return !answer?.selected_answer && !answer?.answer_text;
    });

    if (unanswered && unanswered.length > 0) {
      toast.error(`Please answer all questions (${unanswered.length} remaining)`);
      return;
    }

    try {
      setSubmitting(true);
      const formattedAnswers = Object.values(answers).map((ans) => ({
        question_id: ans.question_id,
        answer: ans.selected_answer || ans.answer_text || '',
      }));

      const attemptData = await api.submitQuizAttempt(quizId, formattedAnswers);
      setAttempt(attemptData);
      toast.success('Quiz submitted successfully!');
    } catch (error: any) {
      console.error('Failed to submit quiz:', error);
      toast.error(error.response?.data?.detail || 'Failed to submit quiz');
    } finally {
      setSubmitting(false);
    }
  };

  const getScoreGrade = (score: number) => {
    if (score >= 90) return { label: 'Outstanding', color: 'var(--accent-green)', icon: Trophy };
    if (score >= 80) return { label: 'Excellent', color: 'var(--accent-green)', icon: Award };
    if (score >= 70) return { label: 'Good', color: 'var(--accent-blue)', icon: Target };
    if (score >= 60) return { label: 'Fair', color: 'var(--warning)', icon: Zap };
    return { label: 'Needs Work', color: 'var(--error)', icon: BookOpen };
  };

  if (loading) {
    return (
      <div className="quiz-atmosphere min-h-screen flex items-center justify-center">
        <div className="quiz-orb quiz-orb-1" />
        <div className="quiz-orb quiz-orb-2" />
        <div className="text-center relative z-10">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-amber-500 to-pink-500 flex items-center justify-center animate-pulse">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-[var(--text-secondary)]">Loading quiz...</p>
        </div>
      </div>
    );
  }

  // Results view
  if (attempt) {
    const timeTaken = attempt.time_taken
      ? Math.round(attempt.time_taken / 60)
      : timeStarted
      ? Math.round((new Date().getTime() - timeStarted.getTime()) / 60000)
      : 0;

    const grade = getScoreGrade(attempt.score);
    const GradeIcon = grade.icon;
    const scoreOffset = 502 - (502 * attempt.score) / 100;

    return (
      <div className="quiz-atmosphere min-h-screen pb-12">
        <div className="quiz-orb quiz-orb-1" />
        <div className="quiz-orb quiz-orb-2" />
        <div className="quiz-orb quiz-orb-3" />

        <div className="relative z-10 max-w-4xl mx-auto">
          {/* Back button */}
          <Link
            href="/dashboard/quizzes"
            className="inline-flex items-center gap-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors mb-8 group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span className="text-sm font-medium">Back to Quizzes</span>
          </Link>

          {/* Hero Results Card */}
          <div className="quiz-glass-card p-10 text-center mb-8">
            {/* Score Ring */}
            <div className="relative inline-block mb-8">
              <svg className="quiz-score-ring" width="180" height="180" viewBox="0 0 180 180">
                <defs>
                  <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="var(--accent-amber)" />
                    <stop offset="50%" stopColor="var(--accent-pink)" />
                    <stop offset="100%" stopColor="var(--accent-purple)" />
                  </linearGradient>
                </defs>
                <circle className="bg" cx="90" cy="90" r="80" />
                <circle
                  className="progress"
                  cx="90"
                  cy="90"
                  r="80"
                  style={{ '--score-offset': scoreOffset } as React.CSSProperties}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-5xl font-bold text-[var(--text-primary)]">
                  {Math.round(attempt.score)}
                </span>
                <span className="text-[var(--text-tertiary)] text-sm">percent</span>
              </div>
            </div>

            {/* Grade Badge */}
            <div
              className="inline-flex items-center gap-3 px-6 py-3 rounded-full mb-6"
              style={{ backgroundColor: `color-mix(in srgb, ${grade.color} 15%, transparent)` }}
            >
              <GradeIcon className="w-6 h-6" style={{ color: grade.color }} />
              <span className="font-display text-xl font-semibold" style={{ color: grade.color }}>
                {grade.label}
              </span>
            </div>

            <h1 className="font-display text-3xl font-bold text-[var(--text-primary)] mb-2">
              Quiz Completed!
            </h1>
            <p className="text-[var(--text-secondary)] mb-8">{quiz?.title || 'Assessment'}</p>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div
                className="quiz-stat-card"
                style={{ '--stat-accent': 'var(--accent-green)' } as React.CSSProperties}
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-[var(--accent-green)]" />
                </div>
                <p className="font-display text-3xl font-bold text-[var(--text-primary)]">
                  {attempt.correct_answers || 0}
                  <span className="text-lg text-[var(--text-tertiary)]">
                    /{attempt.total_questions || 0}
                  </span>
                </p>
                <p className="text-sm text-[var(--text-tertiary)]">Correct</p>
              </div>

              <div
                className="quiz-stat-card"
                style={{ '--stat-accent': 'var(--accent-purple)' } as React.CSSProperties}
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-[var(--accent-purple)]" />
                </div>
                <p className="font-display text-3xl font-bold text-[var(--text-primary)]">
                  {timeTaken}
                  <span className="text-lg text-[var(--text-tertiary)]">min</span>
                </p>
                <p className="text-sm text-[var(--text-tertiary)]">Duration</p>
              </div>

              <div
                className="quiz-stat-card"
                style={{ '--stat-accent': 'var(--accent-blue)' } as React.CSSProperties}
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <BarChart3 className="w-5 h-5 text-[var(--accent-blue)]" />
                </div>
                <p className="font-display text-3xl font-bold text-[var(--text-primary)]">
                  {Math.round(
                    ((attempt.correct_answers || 0) / (attempt.total_questions || 1)) * 100
                  )}
                  <span className="text-lg text-[var(--text-tertiary)]">%</span>
                </p>
                <p className="text-sm text-[var(--text-tertiary)]">Accuracy</p>
              </div>
            </div>

            <Button
              onClick={() => router.push('/dashboard/quizzes')}
              variant="primary"
              className="px-8"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Quizzes
            </Button>
          </div>

          {/* Detailed Feedback */}
          {attempt.feedback && attempt.feedback.length > 0 && (
            <div className="space-y-6">
              <h2 className="font-display text-2xl font-bold text-[var(--text-primary)] flex items-center gap-3">
                <BookOpen className="w-6 h-6 text-[var(--accent-purple)]" />
                Question Review
              </h2>

              <div className="quiz-stagger space-y-4">
                {attempt.feedback.map((fb: any, index: number) => (
                  <div key={fb.question_id || index} className="quiz-glass-card p-6">
                    <div className="flex items-start gap-4">
                      {/* Status indicator */}
                      <div
                        className={cn(
                          'w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0',
                          fb.is_correct
                            ? 'bg-[var(--accent-green)]/10'
                            : 'bg-[var(--error)]/10'
                        )}
                      >
                        {fb.is_correct ? (
                          <CheckCircle className="w-6 h-6 text-[var(--accent-green)]" />
                        ) : (
                          <XCircle className="w-6 h-6 text-[var(--error)]" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-[var(--bg-elevated)] text-[var(--text-tertiary)]">
                            Q{index + 1}
                          </span>
                          <span
                            className={cn(
                              'text-xs font-semibold px-2 py-1 rounded-full',
                              fb.is_correct
                                ? 'bg-[var(--accent-green)]/10 text-[var(--accent-green)]'
                                : 'bg-[var(--error)]/10 text-[var(--error)]'
                            )}
                          >
                            {fb.is_correct ? 'Correct' : 'Incorrect'}
                          </span>
                        </div>

                        <p className="text-[var(--text-primary)] font-medium mb-4">
                          {fb.question_text}
                        </p>

                        <div className="space-y-3">
                          <div className="flex items-start gap-3 p-3 rounded-xl bg-[var(--bg-elevated)]">
                            <div
                              className={cn(
                                'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                                fb.is_correct
                                  ? 'bg-[var(--accent-green)]'
                                  : 'bg-[var(--error)]'
                              )}
                            >
                              {fb.is_correct ? (
                                <Check className="w-4 h-4 text-white" />
                              ) : (
                                <XCircle className="w-4 h-4 text-white" />
                              )}
                            </div>
                            <div>
                              <p className="text-xs text-[var(--text-tertiary)] mb-1">Your answer</p>
                              <p
                                className={cn(
                                  'font-medium',
                                  fb.is_correct
                                    ? 'text-[var(--accent-green)]'
                                    : 'text-[var(--error)]'
                                )}
                              >
                                {fb.user_answer || 'Not answered'}
                              </p>
                            </div>
                          </div>

                          {!fb.is_correct && fb.correct_answer && (
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-[var(--accent-green)]/5 border border-[var(--accent-green)]/20">
                              <div className="w-6 h-6 rounded-full bg-[var(--accent-green)] flex items-center justify-center flex-shrink-0 mt-0.5">
                                <Check className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <p className="text-xs text-[var(--text-tertiary)] mb-1">
                                  Correct answer
                                </p>
                                <p className="font-medium text-[var(--accent-green)]">
                                  {fb.correct_answer}
                                </p>
                              </div>
                            </div>
                          )}

                          {fb.explanation && (
                            <div className="p-4 rounded-xl bg-[var(--accent-blue)]/5 border border-[var(--accent-blue)]/20">
                              <p className="text-xs font-semibold text-[var(--accent-blue)] mb-2">
                                Explanation
                              </p>
                              <p className="text-sm text-[var(--text-secondary)]">
                                {fb.explanation}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          <div className="quiz-glass-card p-8 mt-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-[var(--accent-purple)]" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold text-[var(--text-primary)]">
                  What's Next?
                </h2>
                <p className="text-sm text-[var(--text-tertiary)]">
                  Personalized recommendations based on your performance
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {attempt.score < 70 && (
                <Link
                  href="/dashboard/notes"
                  className="group p-5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--card-border)] hover:border-[var(--accent-blue)]/50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-[var(--accent-blue)]/10 flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-[var(--accent-blue)]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">Review Notes</p>
                        <p className="text-sm text-[var(--text-tertiary)]">
                          Revisit the material
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-[var(--accent-blue)] transition-colors" />
                  </div>
                </Link>
              )}

              <Link
                href="/dashboard/quizzes/new"
                className="group p-5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--card-border)] hover:border-[var(--accent-purple)]/50 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent-purple)]/10 flex items-center justify-center">
                      <Target className="w-5 h-5 text-[var(--accent-purple)]" />
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">Try Another Quiz</p>
                      <p className="text-sm text-[var(--text-tertiary)]">
                        Test different topics
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)] group-hover:text-[var(--accent-purple)] transition-colors" />
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Quiz taking view
  if (!quiz || !quiz.questions) return null;

  const currentQ = quiz.questions[currentQuestion];
  const isLastQuestion = currentQuestion === quiz.questions.length - 1;
  const isCurrentAnswered =
    answers[currentQ?.id]?.selected_answer || answers[currentQ?.id]?.answer_text;

  return (
    <div className="quiz-atmosphere min-h-screen pb-12">
      <div className="quiz-orb quiz-orb-1" />
      <div className="quiz-orb quiz-orb-2" />

      <div className="relative z-10 max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/quizzes"
            className="inline-flex items-center gap-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors mb-6 group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span className="text-sm font-medium">Exit Quiz</span>
          </Link>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                {quiz.title || 'Quiz'}
              </h1>
              {(quiz as any).topic && (
                <p className="text-sm text-[var(--text-tertiary)]">{(quiz as any).topic}</p>
              )}
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--card-border)]">
              <Clock className="w-4 h-4 text-[var(--accent-blue)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">
                {quiz.questions.length} Questions
              </span>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-[var(--text-secondary)]">
              Question {currentQuestion + 1} of {quiz.questions.length}
            </span>
            <span className="text-sm text-[var(--text-tertiary)]">
              {answeredCount} answered
            </span>
          </div>
          <div className="quiz-progress">
            <div className="quiz-progress-bar" style={{ width: `${progress}%` }} />
          </div>

          {/* Question dots */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {quiz.questions.map((q, i) => {
              const isAnswered = answers[q.id]?.selected_answer || answers[q.id]?.answer_text;
              const isCurrent = i === currentQuestion;
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestion(i)}
                  className={cn(
                    'w-8 h-8 rounded-lg text-sm font-medium transition-all',
                    isCurrent
                      ? 'bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)] text-white'
                      : isAnswered
                      ? 'bg-[var(--accent-green)]/20 text-[var(--accent-green)] border border-[var(--accent-green)]/30'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-tertiary)] border border-[var(--card-border)] hover:border-[var(--card-border-hover)]'
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question Card */}
        <div className="quiz-glass-card p-8 mb-6">
          <p className="font-display text-xl font-semibold text-[var(--text-primary)] mb-8">
            {currentQ.question_text}
          </p>

          {/* Render based on normalized question type */}
          {(() => {
            const qType = currentQ.question_type?.toLowerCase();

            // MCQ Options
            if (qType === 'mcq') {
              return (
                <div className="quiz-stagger space-y-3">
                  {currentQ.options?.map((option, idx) => {
                    const isSelected = answers[currentQ.id]?.selected_answer === option;
                    const letters = ['A', 'B', 'C', 'D'];
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAnswerChange(currentQ.id, option, 'mcq')}
                        className={cn('quiz-option w-full text-left', isSelected && 'quiz-option-selected')}
                      >
                        <div className="flex items-center gap-4">
                          <div className="quiz-letter-badge">{letters[idx]}</div>
                          <span className="text-[var(--text-primary)] flex-1">{option}</span>
                          {isSelected && (
                            <div className="w-6 h-6 rounded-full bg-[var(--accent-blue)] flex items-center justify-center">
                              <Check className="w-4 h-4 text-white" />
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            }

            // True/False
            if (qType === 'true_false') {
              return (
                <div className="grid grid-cols-2 gap-4">
                  {['True', 'False'].map((value) => {
                    const isSelected = answers[currentQ.id]?.selected_answer === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleAnswerChange(currentQ.id, value, 'true_false')}
                        className={cn(
                          'p-6 rounded-2xl border-2 transition-all text-center',
                          isSelected
                            ? value === 'True'
                              ? 'border-[var(--accent-green)] bg-[var(--accent-green)]/10'
                              : 'border-[var(--error)] bg-[var(--error)]/10'
                            : 'border-[var(--card-border)] hover:border-[var(--card-border-hover)] bg-[var(--bg-elevated)]'
                        )}
                      >
                        <div
                          className={cn(
                            'w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center',
                            isSelected
                              ? value === 'True'
                                ? 'bg-[var(--accent-green)]'
                                : 'bg-[var(--error)]'
                              : 'bg-[var(--bg-tertiary)]'
                          )}
                        >
                          {value === 'True' ? (
                            <CheckCircle className={cn('w-6 h-6', isSelected ? 'text-white' : 'text-[var(--text-tertiary)]')} />
                          ) : (
                            <XCircle className={cn('w-6 h-6', isSelected ? 'text-white' : 'text-[var(--text-tertiary)]')} />
                          )}
                        </div>
                        <span
                          className={cn(
                            'font-semibold',
                            isSelected
                              ? value === 'True'
                                ? 'text-[var(--accent-green)]'
                                : 'text-[var(--error)]'
                              : 'text-[var(--text-secondary)]'
                          )}
                        >
                          {value}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            }

            // Short Answer
            if (qType === 'short' || qType === 'short_answer') {
              return (
                <textarea
                  value={answers[currentQ.id]?.answer_text || ''}
                  onChange={(e) => handleAnswerChange(currentQ.id, e.target.value, 'short_answer')}
                  placeholder="Type your answer here..."
                  className="w-full p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--card-border)] focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] min-h-[150px] transition-all resize-none"
                />
              );
            }

            // Fill in blank
            if (qType === 'fill_blank') {
              return (
                <input
                  type="text"
                  value={answers[currentQ.id]?.answer_text || ''}
                  onChange={(e) => handleAnswerChange(currentQ.id, e.target.value, 'short_answer')}
                  placeholder="Fill in the blank..."
                  className="w-full p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--card-border)] focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] transition-all"
                />
              );
            }

            // Fallback - show textarea for unknown types
            return (
              <textarea
                value={answers[currentQ.id]?.answer_text || ''}
                onChange={(e) => handleAnswerChange(currentQ.id, e.target.value, 'short_answer')}
                placeholder="Type your answer here..."
                className="w-full p-5 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--card-border)] focus:border-[var(--accent-blue)] focus:ring-2 focus:ring-[var(--accent-blue)]/20 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] min-h-[150px] transition-all resize-none"
              />
            );
          })()}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
            disabled={currentQuestion === 0}
            className={cn(
              'px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all',
              currentQuestion === 0
                ? 'text-[var(--text-disabled)] cursor-not-allowed'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
            )}
          >
            <ArrowLeft className="w-4 h-4" />
            Previous
          </button>

          {isLastQuestion ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || answeredCount < quiz.questions.length}
              className={cn(
                'px-8 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all',
                submitting || answeredCount < quiz.questions.length
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-disabled)] cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-500 via-orange-500 to-pink-500 text-white shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40'
              )}
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  Submitting...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Submit Quiz
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentQuestion(Math.min((quiz.questions?.length || 1) - 1, currentQuestion + 1))}
              className={cn(
                'px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-all',
                isCurrentAnswered
                  ? 'bg-[var(--accent-blue)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              )}
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

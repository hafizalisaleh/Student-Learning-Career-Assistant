'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Clock3,
  Lock,
  RefreshCw,
  Target,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { api } from '@/lib/api';
import type {
  LearningLessonCompletionResponse,
  LearningLessonDetail,
  LearningPath,
} from '@/lib/types';
import { PageLoader } from '@/components/ui/loading-spinner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Markdown } from '@/components/ui/markdown';
import { MermaidDiagram } from '@/components/learn/mermaid-diagram';
import { cn } from '@/lib/utils';

function getErrorMessage(error: unknown, fallback: string) {
  const detail =
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null &&
    'detail' in error.response.data &&
    typeof error.response.data.detail === 'string'
      ? error.response.data.detail
      : null;

  if (detail) {
    return detail;
  }

  return error instanceof Error ? error.message : fallback;
}

export default function LearningLessonPage() {
  const params = useParams<{ id: string; lessonId: string }>();
  const [path, setPath] = useState<LearningPath | null>(null);
  const [lesson, setLesson] = useState<LearningLessonDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completion, setCompletion] = useState<LearningLessonCompletionResponse | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number | undefined>(undefined);
  const [textAnswer, setTextAnswer] = useState('');
  const [orderedSteps, setOrderedSteps] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const [pathResult, lessonResult] = await Promise.all([
          api.getLearningPath(params.id),
          api.getLearningLesson(params.id, params.lessonId),
        ]);
        setPath(pathResult);
        setLesson(lessonResult);
      } catch (error) {
        console.error('Failed to load lesson', error);
        toast.error('Failed to load lesson');
      } finally {
        setIsLoading(false);
      }
    }

    if (params.id && params.lessonId) {
      load();
    }
  }, [params.id, params.lessonId]);

  useEffect(() => {
    async function ensureContent() {
      if (!lesson || lesson.is_locked || lesson.content || isGenerating) return;
      try {
        setIsGenerating(true);
        const generated = await api.generateLearningLesson(params.id, params.lessonId);
        setLesson(generated);
      } catch (error: unknown) {
        console.error('Failed to generate lesson content', error);
        toast.error(getErrorMessage(error, 'Failed to generate lesson content'));
      } finally {
        setIsGenerating(false);
      }
    }

    ensureContent();
  }, [lesson, isGenerating, params.id, params.lessonId]);

  const allLessons = useMemo(() => path?.units.flatMap((unit) => unit.lessons) || [], [path]);
  const currentLessonIndex = useMemo(
    () => allLessons.findIndex((item) => item.id === lesson?.id),
    [allLessons, lesson?.id]
  );

  const resetSubmission = () => {
    setSelectedOptionIndex(undefined);
    setTextAnswer('');
    setOrderedSteps([]);
    setCompletion(null);
  };

  const handleRegenerate = async () => {
    try {
      setIsGenerating(true);
      const generated = await api.generateLearningLesson(params.id, params.lessonId, true);
      setLesson(generated);
      resetSubmission();
      toast.success('Lesson regenerated');
    } catch (error: unknown) {
      console.error('Failed to regenerate lesson', error);
      toast.error(getErrorMessage(error, 'Failed to regenerate lesson'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async () => {
    if (!lesson?.content) return;

    try {
      setIsSubmitting(true);
      const result = await api.completeLearningLesson(params.id, params.lessonId, {
        selected_option_index: selectedOptionIndex,
        text_answer: textAnswer.trim() || undefined,
        ordered_steps: orderedSteps,
      });
      setCompletion(result);
      setLesson((current) =>
        current
          ? {
              ...current,
              is_completed: result.progress.is_completed,
              progress: result.progress,
            }
          : current
      );
      toast.success(result.correct ? 'Lesson completed' : 'Lesson marked for review');
    } catch (error: unknown) {
      console.error('Failed to submit lesson', error);
      toast.error(getErrorMessage(error, 'Failed to submit lesson'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <PageLoader />;
  }

  if (!lesson || !path) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-[var(--card-border)] p-8 text-center text-[var(--text-tertiary)]">
        Lesson not found.
      </div>
    );
  }

  if (lesson.is_locked) {
    return (
      <Card variant="solid" hover="none">
        <CardContent className="space-y-4 p-8 text-center">
          <Lock className="mx-auto h-10 w-10 text-[var(--text-tertiary)]" />
          <h1 className="font-serif text-3xl tracking-[-0.04em] text-[var(--text-primary)]">This lesson is still locked</h1>
          <p className="mx-auto max-w-xl text-[var(--text-secondary)]">{lesson.unlock_hint}</p>
          <div className="flex justify-center gap-3">
            <Link href={`/dashboard/learn/${path.id}`}>
              <Button variant="outline">Back to path</Button>
            </Link>
            {path.next_lesson_id ? (
              <Link href={`/dashboard/learn/${path.id}/lessons/${path.next_lesson_id}`}>
                <Button>Open unlocked lesson</Button>
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-fade-in">
      <Card variant="glow">
        <CardContent className="space-y-5 p-6 lg:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/dashboard/learn/${path.id}`} className="inline-flex">
              <Badge variant="default" size="lg">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to path
              </Badge>
            </Link>
            <Badge variant="documents" size="lg">
              Lesson {currentLessonIndex + 1} / {allLessons.length}
            </Badge>
            <Badge variant={lesson.is_completed ? 'success' : 'default'} size="lg">
              {lesson.is_completed ? 'Completed' : 'In Progress'}
            </Badge>
          </div>

          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{path.title}</p>
            <h1 className="font-serif text-4xl tracking-[-0.05em] text-[var(--text-primary)] sm:text-5xl">
              {lesson.title}
            </h1>
            <p className="max-w-3xl text-lg text-[var(--text-secondary)]">{lesson.objective}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="default">
              <Clock3 className="h-3.5 w-3.5" />
              {lesson.duration_minutes} min
            </Badge>
            <Badge variant="default">
              <Target className="h-3.5 w-3.5" />
              Difficulty {lesson.difficulty}
            </Badge>
            <Badge variant="default">{lesson.exercise_type.replace('_', ' ')}</Badge>
            <Badge variant="notes">{lesson.progress.xp_earned} XP</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={handleRegenerate} isLoading={isGenerating}>
              <RefreshCw className="h-4 w-4" />
              Regenerate lesson
            </Button>
            {lesson.next_lesson_id && lesson.is_completed ? (
              <Link href={`/dashboard/learn/${path.id}/lessons/${lesson.next_lesson_id}`}>
                <Button>
                  <ArrowRight className="h-4 w-4" />
                  Next lesson
                </Button>
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card variant="solid" hover="none">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                Progress steps
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Move through the path in order. Completed lessons stay green. Locked lessons open as you progress.
              </p>
            </div>
            <div className="rounded-full border border-[var(--card-border)] bg-[var(--bg-elevated)] px-3 py-1 text-sm text-[var(--text-secondary)]">
              {path.completed_lessons}/{path.total_lessons} completed
            </div>
          </div>

          <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
            {allLessons.map((item, index) => {
              const cardClassName = cn(
                'min-w-[14rem] rounded-[1.15rem] border px-4 py-3 text-left transition-colors',
                item.id === lesson.id
                  ? 'border-[var(--accent-blue)] bg-[var(--documents-bg)]'
                  : item.is_completed
                    ? 'border-[var(--success-border)] bg-[var(--notes-bg)]'
                    : item.is_available
                      ? 'border-[var(--card-border)] bg-[var(--bg-primary)] hover:border-[var(--card-border-hover)]'
                      : 'border-[var(--card-border)] bg-[var(--bg-primary)] opacity-60'
              );

              const content = (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                      Step {index + 1}
                    </span>
                    {item.is_completed ? <CheckCircle2 className="h-4 w-4 text-[var(--success)]" /> : null}
                    {item.is_locked ? <Lock className="h-4 w-4 text-[var(--text-tertiary)]" /> : null}
                    {item.is_available && !item.is_completed && item.id !== lesson.id ? (
                      <ArrowRight className="h-4 w-4 text-[var(--documents)]" />
                    ) : null}
                  </div>
                  <p className="font-medium text-[var(--text-primary)]">{item.title}</p>
                </div>
              );

              if (item.is_locked) {
                return (
                  <div key={item.id} className={cardClassName}>
                    {content}
                  </div>
                );
              }

              return (
                <Link key={item.id} href={`/dashboard/learn/${path.id}/lessons/${item.id}`} className={cardClassName}>
                  {content}
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="mx-auto grid w-full max-w-4xl gap-5">
        <div className="grid gap-4 md:grid-cols-[1.5fr_0.8fr]">
          <Card>
            <CardHeader>
              <CardTitle>TL;DR</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-base leading-7 text-[var(--text-secondary)]">
                {lesson.content?.tldr || 'Generating the lesson summary...'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mastery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-6">
              <p className="text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                {Math.round(lesson.progress.mastery_score * 100)}%
              </p>
              <p className="text-sm text-[var(--text-secondary)]">Attempts: {lesson.progress.attempts}</p>
              <div className="flex flex-wrap gap-2">
                {lesson.key_terms.map((term) => (
                  <Badge key={term} variant="default">
                    {term}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lesson Diagram</CardTitle>
            <CardDescription>{lesson.content?.diagram.caption || 'Visual explanation of the core idea.'}</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            {lesson.content?.diagram.mermaid ? (
              <MermaidDiagram code={lesson.content.diagram.mermaid} title={lesson.content.diagram.title} />
            ) : (
              <p className="text-sm text-[var(--text-tertiary)]">Generating diagram...</p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Lesson Hook</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {isGenerating && !lesson.content ? (
                <p className="text-sm text-[var(--text-tertiary)]">Generating lesson content...</p>
              ) : (
                <p className="text-base leading-7 text-[var(--text-secondary)]">
                  {lesson.content?.hook || 'Lesson content is on the way.'}
                </p>
              )}
            </CardContent>
          </Card>

          {lesson.content?.sections.map((section) => (
            <Card key={section.title}>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <Markdown className="prose prose-sm max-w-none text-[var(--text-secondary)] [&_p]:leading-7">
                  {section.content}
                </Markdown>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle>Personalized Analogy</CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <p className="text-base leading-7 text-[var(--text-secondary)]">
                {lesson.content?.personalized_analogy || 'Generating analogy...'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mastery Check</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-6">
              <p className="text-base text-[var(--text-primary)]">
                {lesson.content?.mastery_check.prompt || 'Preparing mastery check...'}
              </p>
              <div className="rounded-[1.25rem] border border-[var(--card-border)] bg-[var(--bg-elevated)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Success criteria</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {lesson.content?.mastery_check.success_criteria || 'You should be able to explain the concept clearly and solve the practice check.'}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Practice</CardTitle>
              <CardDescription>
                Answer the lesson check to unlock the next step.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              {lesson.content ? (
                <>
                  <div className="rounded-[1.25rem] border border-[var(--card-border)] bg-[var(--bg-elevated)] p-4">
                    <p className="font-medium text-[var(--text-primary)]">{lesson.content.exercise.prompt}</p>
                  </div>

                  <ExerciseInput
                    lesson={lesson}
                    selectedOptionIndex={selectedOptionIndex}
                    setSelectedOptionIndex={setSelectedOptionIndex}
                    textAnswer={textAnswer}
                    setTextAnswer={setTextAnswer}
                    orderedSteps={orderedSteps}
                    setOrderedSteps={setOrderedSteps}
                  />

                  <div className="flex flex-wrap gap-3">
                    <Button onClick={handleSubmit} isLoading={isSubmitting}>
                      <CheckCircle2 className="h-4 w-4" />
                      Submit answer
                    </Button>
                    <Button variant="outline" onClick={resetSubmission}>
                      Reset
                    </Button>
                  </div>

                  {completion ? (
                    <div
                      className={cn(
                        'rounded-[1.25rem] border p-4',
                        completion.correct
                          ? 'border-[var(--success-border)] bg-[var(--notes-bg)]'
                          : 'border-[var(--warning-border)] bg-[var(--warning-bg)]'
                      )}
                    >
                      <p className="font-semibold text-[var(--text-primary)]">{completion.feedback}</p>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        XP: {completion.xp_earned} • Status: {completion.status}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-[var(--text-tertiary)]">Generating exercise...</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ExerciseInput({
  lesson,
  selectedOptionIndex,
  setSelectedOptionIndex,
  textAnswer,
  setTextAnswer,
  orderedSteps,
  setOrderedSteps,
}: {
  lesson: LearningLessonDetail;
  selectedOptionIndex: number | undefined;
  setSelectedOptionIndex: (value: number | undefined) => void;
  textAnswer: string;
  setTextAnswer: (value: string) => void;
  orderedSteps: string[];
  setOrderedSteps: (value: string[]) => void;
}) {
  const exercise = lesson.content?.exercise;

  if (!exercise) {
    return null;
  }

  if (exercise.type === 'multiple_choice') {
    return (
      <div className="grid gap-3">
        {exercise.options.map((option, index) => (
          <button
            key={option}
            type="button"
            onClick={() => setSelectedOptionIndex(index)}
            className={cn(
              'rounded-[1rem] border px-4 py-3 text-left transition-all',
              selectedOptionIndex === index
                ? 'border-[var(--accent-blue)] bg-[var(--documents-bg)]'
                : 'border-[var(--card-border)] bg-[var(--bg-elevated)] hover:border-[var(--card-border-hover)]'
            )}
          >
            <span className="text-sm font-medium text-[var(--text-primary)]">{option}</span>
          </button>
        ))}
      </div>
    );
  }

  if (exercise.type === 'fill_blank') {
    return (
      <Input
        label="Your answer"
        placeholder="Type the missing concept"
        value={textAnswer}
        onChange={(event) => setTextAnswer(event.target.value)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        {exercise.options.map((option) => {
          const isUsed = orderedSteps.includes(option);
          return (
            <button
              key={option}
              type="button"
              disabled={isUsed}
              onClick={() => setOrderedSteps([...orderedSteps, option])}
              className={cn(
                'rounded-[1rem] border px-4 py-3 text-left transition-all',
                isUsed
                  ? 'cursor-not-allowed border-[var(--success-border)] bg-[var(--notes-bg)] opacity-70'
                  : 'border-[var(--card-border)] bg-[var(--bg-elevated)] hover:border-[var(--card-border-hover)]'
              )}
            >
              <span className="text-sm font-medium text-[var(--text-primary)]">{option}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-[1.25rem] border border-[var(--card-border)] bg-[var(--bg-elevated)] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-[var(--text-primary)]">Your sequence</p>
          <Button variant="ghost" size="sm" onClick={() => setOrderedSteps([])}>
            Clear
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          {orderedSteps.length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Pick steps in order.</p>
          ) : (
            orderedSteps.map((step, index) => (
              <button
                key={`${step}-${index}`}
                type="button"
                onClick={() => setOrderedSteps(orderedSteps.filter((_, itemIndex) => itemIndex !== index))}
                className="flex w-full items-center gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--bg-primary)] px-3 py-3 text-left"
              >
                <span className="w-6 text-xs font-semibold uppercase text-[var(--text-tertiary)]">{index + 1}</span>
                <span className="flex-1 text-sm text-[var(--text-primary)]">{step}</span>
                <CircleHelp className="h-4 w-4 text-[var(--text-tertiary)]" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

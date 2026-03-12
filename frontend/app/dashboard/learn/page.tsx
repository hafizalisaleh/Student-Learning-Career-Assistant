'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import {
  ArrowUp,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Globe2,
  Loader2,
  MessageSquareQuote,
  PencilLine,
  RotateCcw,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageLoader } from '@/components/ui/loading-spinner';
import { PromptInput, PromptInputAction, PromptInputActions, PromptInputTextarea } from '@/components/ui/prompt-input';
import { api } from '@/lib/api';
import type {
  Document,
  GoalDepth,
  LearningPathCard,
  LearningPathGenerateRequest,
  LearningPathOutlinePreview,
  LearningPathSetupQuestionResponse,
  LearningSourceMode,
} from '@/lib/types';
import { cn } from '@/lib/utils';

type SetupStage = 'topic' | 'background' | 'goal' | 'summary' | 'outline';

type BuilderMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
};

const topicExamples = [
  'GPU parallel processing theory',
  'Data science portfolio and resume',
  'OCR mastery in 15 minutes a day',
  'LLMs for software engineers',
];

const stylePresets = [
  'visual explanations',
  'sports analogies',
  'TL;DR first',
  'practical applications',
  'job-relevant examples',
];

const focusPresets = [
  'foundations',
  'real-world examples',
  'implementation',
  'common mistakes',
];

const goalOptions: { value: GoalDepth; label: string }[] = [
  { value: 'basics', label: 'Basics' },
  { value: 'practical', label: 'Practical' },
  { value: 'deep', label: 'Deep' },
];

const timeOptions = [
  { value: 5, label: '5 min/day' },
  { value: 15, label: '15 min/day' },
  { value: 30, label: '30 min/day' },
];

const sourceOptions: { value: LearningSourceMode; label: string; icon: typeof Globe2 }[] = [
  { value: 'web', label: 'Web', icon: Globe2 },
  { value: 'hybrid', label: 'Hybrid', icon: BrainCircuit },
  { value: 'pdf', label: 'PDF', icon: FileText },
];

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

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function toggleToken(items: string[], value: string) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function mergeInstructions(current: string, next: string) {
  const parts = [normalizeText(current), normalizeText(next)].filter(Boolean);
  return Array.from(new Set(parts)).join('\n');
}

function formatQuestionMessage(question: LearningPathSetupQuestionResponse) {
  return [question.lead, question.question].filter(Boolean).join('\n\n');
}

function buildGeneratePayload({
  topic,
  background,
  courseTitle,
  learningGoal,
  goalDepth,
  dailyMinutes,
  teachingStyle,
  focusAreas,
  sourceMode,
  selectedDocumentIds,
  customInstructions,
}: {
  topic: string;
  background: string;
  courseTitle: string;
  learningGoal: string;
  goalDepth: GoalDepth;
  dailyMinutes: number;
  teachingStyle: string[];
  focusAreas: string[];
  sourceMode: LearningSourceMode;
  selectedDocumentIds: string[];
  customInstructions: string;
}): LearningPathGenerateRequest {
  return {
    topic: normalizeText(topic),
    background: normalizeText(background),
    course_title: normalizeText(courseTitle) || undefined,
    learning_goal: normalizeText(learningGoal) || undefined,
    goal_depth: goalDepth,
    daily_minutes: dailyMinutes,
    teaching_style: teachingStyle,
    focus_areas: focusAreas,
    source_mode: sourceMode,
    document_ids: sourceMode === 'web' ? [] : selectedDocumentIds,
    seed_urls: [],
    custom_instructions: normalizeText(customInstructions) || undefined,
  };
}

export default function LearnPage() {
  const router = useRouter();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [paths, setPaths] = useState<LearningPathCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSetupBusy, setIsSetupBusy] = useState(false);
  const [isPathActionPending, setIsPathActionPending] = useState(false);

  const [messages, setMessages] = useState<BuilderMessage[]>([
    {
      id: 'setup-intro',
      role: 'assistant',
      content: 'What do you want to learn? Start with the topic in one sentence, or choose one of the examples below.',
    },
  ]);
  const [stage, setStage] = useState<SetupStage>('topic');
  const [draft, setDraft] = useState('');
  const [activeActionMenu, setActiveActionMenu] = useState<'source' | 'goal' | 'pace' | null>(null);
  const [renamingPathId, setRenamingPathId] = useState<string | null>(null);
  const [renamedTitle, setRenamedTitle] = useState('');

  const [topic, setTopic] = useState('');
  const [background, setBackground] = useState('');
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [courseTitle, setCourseTitle] = useState('');
  const [learningGoal, setLearningGoal] = useState('');
  const [goalDepth, setGoalDepth] = useState<GoalDepth>('practical');
  const [dailyMinutes, setDailyMinutes] = useState(15);
  const [sourceMode, setSourceMode] = useState<LearningSourceMode>('web');
  const [teachingStyle, setTeachingStyle] = useState<string[]>(['visual explanations', 'practical applications']);
  const [focusAreas, setFocusAreas] = useState<string[]>(['foundations', 'real-world examples']);
  const [customInstructions, setCustomInstructions] = useState('');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<LearningPathSetupQuestionResponse | null>(null);
  const [outlinePreview, setOutlinePreview] = useState<LearningPathOutlinePreview | null>(null);
  const [selectedPreviewUnitIndex, setSelectedPreviewUnitIndex] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const [docs, learningPaths] = await Promise.all([api.getDocuments(), api.getLearningPaths()]);
        const readyDocs = Array.isArray(docs) ? docs.filter((doc) => doc.processing_status === 'completed') : [];
        setDocuments(readyDocs);
        setPaths(Array.isArray(learningPaths) ? learningPaths : []);

        if (readyDocs.length > 0) {
          setSelectedDocumentIds([readyDocs[0].id]);
          setSourceMode('hybrid');
        } else {
          setSourceMode('web');
        }
      } catch (error) {
        console.error('Failed to load learning path data', error);
        toast.error('Failed to load learning paths');
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, []);

  const canUseDocs = sourceMode !== 'web';
  const stageIndex = stage === 'topic' ? 0 : stage === 'background' ? 1 : stage === 'goal' ? 2 : stage === 'summary' ? 3 : 4;
  const selectedSourceMeta = sourceOptions.find((option) => option.value === sourceMode) ?? sourceOptions[0];
  const SelectedSourceIcon = selectedSourceMeta.icon;
  const selectedPreviewUnit = selectedPreviewUnitIndex !== null ? outlinePreview?.units[selectedPreviewUnitIndex] ?? null : null;
  const suggestionButtons = stage === 'topic' ? topicExamples : [];

  const progressItems = useMemo(
    () => [
      { title: 'Topic', done: Boolean(normalizeText(topic)) },
      { title: 'Background', done: Boolean(normalizeText(background)) },
      { title: 'Goals', done: selectedGoals.length > 0 || stageIndex > 2 },
      { title: 'Outline preview', done: Boolean(outlinePreview) },
    ],
    [background, outlinePreview, selectedGoals.length, stageIndex, topic]
  );

  function pushMessages(nextMessages: BuilderMessage[]) {
    setMessages((current) => [...current, ...nextMessages]);
  }

  async function handleTopicSubmit(rawValue: string) {
    const cleaned = normalizeText(rawValue);
    if (!cleaned) return;

    try {
      setIsSetupBusy(true);
      setTopic(cleaned);
      setOutlinePreview(null);
      setSelectedPreviewUnitIndex(null);
      pushMessages([{ id: crypto.randomUUID(), role: 'user', content: cleaned }]);

      const question = await api.getLearningPathBackgroundQuestion({ topic: cleaned });
      setCurrentQuestion(question);
      setStage('background');
      setDraft('');
      pushMessages([
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: formatQuestionMessage(question),
        },
      ]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to build the next setup question'));
    } finally {
      setIsSetupBusy(false);
    }
  }

  async function handleBackgroundSubmit(rawValue: string) {
    const cleaned = normalizeText(rawValue);
    if (!cleaned || !topic) return;

    try {
      setIsSetupBusy(true);
      setBackground(cleaned);
      pushMessages([{ id: crypto.randomUUID(), role: 'user', content: cleaned }]);

      const question = await api.getLearningPathGoalQuestion({
        topic,
        background: cleaned,
      });
      setCurrentQuestion(question);
      setStage('goal');
      setDraft('');
      pushMessages([
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: formatQuestionMessage(question),
        },
      ]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to generate the goal question'));
    } finally {
      setIsSetupBusy(false);
    }
  }

  async function handleGoalContinue() {
    const customGoal = normalizeText(draft);
    const goals = customGoal ? [...selectedGoals, customGoal] : selectedGoals;
    if (!topic || !background || goals.length === 0) {
      toast.error('Choose at least one learning goal');
      return;
    }

    try {
      setIsSetupBusy(true);
      setSelectedGoals(goals);
      pushMessages([
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: goals.join(' · '),
        },
      ]);

      const summary = await api.getLearningPathSetupSummary({
        topic,
        background,
        selected_goals: goals,
        goal_depth: goalDepth,
        daily_minutes: dailyMinutes,
        source_mode: sourceMode,
        teaching_style: teachingStyle,
        focus_areas: focusAreas,
        custom_instructions: customInstructions || undefined,
      });

      setCourseTitle(summary.course_title);
      setLearningGoal(summary.learning_goal);
      setBackground(summary.background);
      setCurrentQuestion(null);
      setStage('summary');
      setDraft('');
      pushMessages([
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: summary.assistant_message,
        },
      ]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to summarize the course setup'));
    } finally {
      setIsSetupBusy(false);
    }
  }

  async function handlePreviewOutline() {
    const nextInstruction = normalizeText(draft);
    const mergedInstructions = nextInstruction ? mergeInstructions(customInstructions, nextInstruction) : customInstructions;
    const payload = buildGeneratePayload({
      topic,
      background,
      courseTitle,
      learningGoal,
      goalDepth,
      dailyMinutes,
      teachingStyle,
      focusAreas,
      sourceMode,
      selectedDocumentIds,
      customInstructions: mergedInstructions,
    });

    if (!payload.topic || !payload.background || !payload.learning_goal) {
      toast.error('Finish the setup details first');
      return;
    }
    if (payload.source_mode !== 'web' && payload.document_ids.length === 0) {
      toast.error('Select at least one PDF source');
      return;
    }

    try {
      setIsGenerating(true);
      setCustomInstructions(mergedInstructions);
      if (nextInstruction) {
        pushMessages([{ id: crypto.randomUUID(), role: 'user', content: nextInstruction }]);
      }

      const preview = await api.previewLearningPath(payload);
      setOutlinePreview(preview);
      setCourseTitle(preview.title);
      setSelectedPreviewUnitIndex(0);
      setStage('outline');
      setDraft('');
      pushMessages([
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'I drafted the course outline. Select any unit on the left if you want the next revision to target a specific part of the path.',
        },
      ]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to preview the course outline'));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRequestOutlineChanges() {
    const cleaned = normalizeText(draft);
    if (!cleaned || !outlinePreview) return;

    const targetedInstruction = selectedPreviewUnit
      ? `Revise the "${selectedPreviewUnit.title}" unit. ${cleaned}`
      : cleaned;
    const mergedInstructions = mergeInstructions(customInstructions, targetedInstruction);
    const payload = buildGeneratePayload({
      topic,
      background,
      courseTitle,
      learningGoal,
      goalDepth,
      dailyMinutes,
      teachingStyle,
      focusAreas,
      sourceMode,
      selectedDocumentIds,
      customInstructions: mergedInstructions,
    });

    try {
      setIsGenerating(true);
      setCustomInstructions(mergedInstructions);
      pushMessages([{ id: crypto.randomUUID(), role: 'user', content: targetedInstruction }]);

      const preview = await api.previewLearningPath(payload);
      setOutlinePreview(preview);
      setCourseTitle(preview.title);
      setDraft('');
      pushMessages([
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Updated the outline preview. Keep iterating here, or create the course when the structure looks right.',
        },
      ]);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to revise the course outline'));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCreatePath() {
    if (!outlinePreview) {
      toast.error('Preview the outline first');
      return;
    }

    try {
      setIsGenerating(true);
      const payload = buildGeneratePayload({
        topic,
        background,
        courseTitle,
        learningGoal,
        goalDepth,
        dailyMinutes,
        teachingStyle,
        focusAreas,
        sourceMode,
        selectedDocumentIds,
        customInstructions,
      });
      const path = await api.generateLearningPath(payload);
      toast.success('Learning path created');
      router.push(`/dashboard/learn/${path.id}`);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to create learning path'));
    } finally {
      setIsGenerating(false);
    }
  }

  function handlePromptSubmit() {
    if (stage === 'topic') {
      void handleTopicSubmit(draft);
      return;
    }

    if (stage === 'background') {
      void handleBackgroundSubmit(draft);
      return;
    }

    if (stage === 'goal') {
      void handleGoalContinue();
      return;
    }

    if (stage === 'summary') {
      void handlePreviewOutline();
      return;
    }

    if (stage === 'outline') {
      void handleRequestOutlineChanges();
    }
  }

  function handleReset() {
    setMessages([
      {
        id: 'setup-intro-reset',
        role: 'assistant',
        content: 'What do you want to learn? Start with the topic in one sentence, or choose one of the examples below.',
      },
    ]);
    setStage('topic');
    setDraft('');
    setCurrentQuestion(null);
    setTopic('');
    setBackground('');
    setSelectedGoals([]);
    setCourseTitle('');
    setLearningGoal('');
    setGoalDepth('practical');
    setDailyMinutes(documents.length > 0 ? 15 : 15);
    setSourceMode(documents.length > 0 ? 'hybrid' : 'web');
    setTeachingStyle(['visual explanations', 'practical applications']);
    setFocusAreas(['foundations', 'real-world examples']);
    setCustomInstructions('');
    setOutlinePreview(null);
    setSelectedPreviewUnitIndex(null);
    setActiveActionMenu(null);
    setRenamingPathId(null);
    setRenamedTitle('');
    setSelectedDocumentIds(documents.length > 0 ? [documents[0].id] : []);
  }

  async function handleRenamePath(pathId: string) {
    const cleaned = normalizeText(renamedTitle);
    if (!cleaned) {
      toast.error('Enter a new path name');
      return;
    }

    try {
      setIsPathActionPending(true);
      const updated = await api.updateLearningPath(pathId, { title: cleaned });
      setPaths((current) => current.map((path) => (path.id === pathId ? updated : path)));
      setRenamingPathId(null);
      setRenamedTitle('');
      toast.success('Path renamed');
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to rename path'));
    } finally {
      setIsPathActionPending(false);
    }
  }

  async function handleDeletePath(pathId: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this learning path?')) {
      return;
    }

    try {
      setIsPathActionPending(true);
      await api.deleteLearningPath(pathId);
      setPaths((current) => current.filter((path) => path.id !== pathId));
      if (renamingPathId === pathId) {
        setRenamingPathId(null);
        setRenamedTitle('');
      }
      toast.success('Path removed');
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Failed to delete path'));
    } finally {
      setIsPathActionPending(false);
    }
  }

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="flex h-[calc(100svh-10.5rem)] min-h-[40rem] overflow-hidden rounded-[1.7rem] border border-[var(--card-border)] bg-[var(--bg-primary)] shadow-[var(--card-shadow)] animate-fade-in">
      <PanelGroup orientation="horizontal">
        <Panel defaultSize={42} minSize={30} className="border-r border-[var(--card-border)]">
          <div className="flex h-full min-h-0 flex-col bg-[var(--bg-secondary)]/35">
            <div className="border-b border-[var(--card-border)] bg-[var(--bg-primary)] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                    {outlinePreview ? 'Course outline' : 'Setup workspace'}
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                    {outlinePreview ? outlinePreview.title : 'Learn'}
                  </h1>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {outlinePreview
                      ? 'Preview the actual units and lessons before you generate the course.'
                      : 'Guide the setup in chat, keep the builder focused, and use the left rail for existing paths.'}
                  </p>
                </div>

                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-5">
                <section className="rounded-[1.5rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--primary)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Setup progress</p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {progressItems.map((item, index) => (
                      <div key={item.title} className="flex items-center gap-3">
                        <div
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
                            item.done
                              ? 'border-[var(--success-border)] bg-[var(--notes-bg)] text-[var(--success)]'
                              : index === stageIndex
                                ? 'border-[var(--accent-blue)] bg-[var(--documents-bg)] text-[var(--accent-blue)]'
                                : 'border-[var(--card-border)] text-[var(--text-tertiary)]'
                          )}
                        >
                          {item.done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                        </div>
                        <p className="text-sm text-[var(--text-primary)]">{item.title}</p>
                      </div>
                    ))}
                  </div>
                </section>

                {outlinePreview ? (
                  <section className="rounded-[1.5rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-5">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-[var(--primary)]" />
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Outline preview</p>
                    </div>
                    <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{outlinePreview.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{outlinePreview.tagline}</p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant="info">{outlinePreview.units.length} sections</Badge>
                      <Badge variant="info">{outlinePreview.total_lessons} lessons</Badge>
                      <Badge variant="info">~{outlinePreview.estimated_days} days</Badge>
                    </div>

                    <div className="mt-5 space-y-3">
                      {outlinePreview.units.map((unit, index) => (
                        <button
                          key={`${unit.title}-${index}`}
                          type="button"
                          onClick={() => setSelectedPreviewUnitIndex(index)}
                          className={cn(
                            'w-full rounded-[1.3rem] border p-4 text-left transition-colors',
                            selectedPreviewUnitIndex === index
                              ? 'border-[var(--accent-blue)] bg-[var(--documents-bg)]'
                              : 'border-[var(--card-border)] bg-[var(--bg-base)] hover:border-[var(--card-border-hover)]'
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-[var(--text-primary)]">{index + 1}. {unit.title}</p>
                              <p className="mt-1 text-sm text-[var(--text-secondary)]">{unit.lessons.length} lessons</p>
                            </div>
                            {selectedPreviewUnitIndex === index ? <Badge variant="default">Selected</Badge> : null}
                          </div>
                          <div className="mt-3 space-y-2">
                            {unit.lessons.map((lesson, lessonIndex) => (
                              <div key={`${unit.title}-${lesson.title}-${lessonIndex}`} className="rounded-[1rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] px-3 py-2 text-sm text-[var(--text-primary)]">
                                {index + 1}.{lessonIndex + 1} {lesson.title}
                              </div>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="rounded-[1.5rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-5">
                  <div className="flex items-center gap-2">
                    <MessageSquareQuote className="h-4 w-4 text-[var(--primary)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Existing paths</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {paths.length === 0 ? (
                      <p className="text-sm text-[var(--text-tertiary)]">No learning paths yet.</p>
                    ) : (
                      paths.slice(0, 5).map((path) => (
                        <div
                          key={path.id}
                          className="rounded-[1.15rem] border border-[var(--card-border)] bg-[var(--bg-base)] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <Link href={`/dashboard/learn/${path.id}`} className="min-w-0 flex-1">
                              <p className="truncate font-medium text-[var(--text-primary)]">{path.title}</p>
                              <p className="mt-1 text-sm text-[var(--text-secondary)]">{path.total_lessons} lessons</p>
                            </Link>
                            <Badge variant="default">{path.completion_percentage}%</Badge>
                          </div>

                          {renamingPathId === path.id ? (
                            <div className="mt-3 flex items-center gap-2">
                              <input
                                value={renamedTitle}
                                onChange={(event) => setRenamedTitle(event.target.value)}
                                className="h-10 flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg-solid)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--primary)]"
                                placeholder="Rename path"
                              />
                              <Button type="button" size="sm" onClick={() => void handleRenamePath(path.id)} disabled={isPathActionPending}>
                                Save
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRenamingPathId(null);
                                  setRenamedTitle('');
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="mt-3 flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRenamingPathId(path.id);
                                  setRenamedTitle(path.title);
                                }}
                              >
                                <PencilLine className="h-4 w-4" />
                                Rename
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void handleDeletePath(path.id)}
                                disabled={isPathActionPending}
                              >
                                <Trash2 className="h-4 w-4" />
                                Remove
                              </Button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-[var(--bg-secondary)] transition-all hover:bg-[var(--primary)]/30 active:bg-[var(--primary)]/50" />

        <Panel defaultSize={58} minSize={38}>
          <div className="flex h-full min-h-0 flex-col bg-[var(--bg-primary)]">
            <div className="border-b border-[var(--card-border)] bg-[var(--bg-secondary)] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                    Course setup
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
                    {stage === 'topic'
                      ? 'Step 1: choose the topic'
                      : stage === 'background'
                        ? 'Step 2: describe the starting point'
                        : stage === 'goal'
                          ? 'Step 3: choose the outcome'
                          : stage === 'summary'
                            ? 'Review before building the outline'
                            : 'Request changes or create the course'}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {stage === 'outline'
                      ? 'Select a unit on the left, then ask for changes in the chat.'
                      : 'The chat drives the setup. Goal, pace, and source live in the prompt actions.'}
                  </p>
                </div>

                {isSetupBusy || isGenerating ? (
                  <Badge variant="info">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Working
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {messages.map((message) => (
                  <div key={message.id} className={cn('max-w-[92%]', message.role === 'user' ? 'ml-auto' : '')}>
                    <div
                      className={cn(
                        'rounded-[1.6rem] border px-4 py-3 text-sm leading-7 whitespace-pre-wrap',
                        message.role === 'user'
                          ? 'border-[var(--accent-blue)] bg-[var(--documents-bg)] text-[var(--text-primary)]'
                          : 'border-[var(--card-border)] bg-[var(--card-bg-solid)] text-[var(--text-secondary)]'
                      )}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}

                {suggestionButtons.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {suggestionButtons.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void handleTopicSubmit(suggestion)}
                        className="rounded-full border border-[var(--card-border)] bg-[var(--card-bg-solid)] px-4 py-2 text-sm text-[var(--text-primary)] transition-colors hover:border-[var(--card-border-hover)]"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}

                {stage === 'background' && currentQuestion ? (
                  <div className="flex flex-wrap gap-2">
                    {currentQuestion.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => void handleBackgroundSubmit(option)}
                        className="rounded-full border border-[var(--card-border)] bg-[var(--card-bg-solid)] px-4 py-2 text-sm text-[var(--text-primary)] transition-colors hover:border-[var(--card-border-hover)]"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                ) : null}

                {stage === 'goal' && currentQuestion ? (
                  <div className="rounded-[1.5rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-[var(--text-primary)]">Select all that apply</p>
                      <p className="text-xs text-[var(--text-tertiary)]">You can also type a custom goal below.</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {currentQuestion.options.map((option) => {
                        const active = selectedGoals.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setSelectedGoals((current) => toggleToken(current, option))}
                            className={cn(
                              'rounded-full border px-4 py-2 text-sm transition-colors',
                              active
                                ? 'border-[var(--accent-blue)] bg-[var(--documents-bg)] text-[var(--documents)]'
                                : 'border-[var(--card-border)] bg-[var(--bg-base)] text-[var(--text-primary)] hover:border-[var(--card-border-hover)]'
                            )}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {stage === 'summary' ? (
                  <div className="space-y-5">
                    <div className="rounded-[1.7rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-5">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Here&apos;s what I&apos;m thinking</p>
                      <div className="mt-4 space-y-4">
                        <EditableField
                          label="Course name"
                          value={courseTitle}
                          onChange={setCourseTitle}
                          placeholder="Course name"
                        />
                        <EditableField
                          label="Learning goal"
                          value={learningGoal}
                          onChange={setLearningGoal}
                          multiline
                          placeholder="What should this course help the learner achieve?"
                        />
                        <EditableField
                          label="Background knowledge"
                          value={background}
                          onChange={setBackground}
                          multiline
                          placeholder="Summarize the learner's current foundation"
                        />
                      </div>
                    </div>

                    <div className="rounded-[1.7rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-5">
                      <PreferenceGroup
                        title="Teaching style"
                        items={stylePresets}
                        isSelected={(value) => teachingStyle.includes(value)}
                        onToggle={(value) => setTeachingStyle((current) => toggleToken(current, value))}
                      />

                      <div className="mt-5">
                        <PreferenceGroup
                          title="Focus areas"
                          items={focusPresets}
                          isSelected={(value) => focusAreas.includes(value)}
                          onToggle={(value) => setFocusAreas((current) => toggleToken(current, value))}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {stage === 'outline' && outlinePreview ? (
                  <div className="rounded-[1.7rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">Outline ready to review</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">
                          {outlinePreview.rationale}
                        </p>
                      </div>
                      {selectedPreviewUnit ? <Badge variant="default">{selectedPreviewUnit.title}</Badge> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-t border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--card-bg-solid)_88%,transparent)] p-4 backdrop-blur-xl">
              <div className="mx-auto max-w-3xl">
                <PromptInput
                  value={draft}
                  onValueChange={setDraft}
                  onSubmit={handlePromptSubmit}
                  isLoading={isGenerating || isSetupBusy}
                  className="border-[var(--card-border)] bg-[var(--card-bg-solid)]"
                >
                  <div className="flex w-full flex-col">
                    <PromptInputTextarea
                      placeholder={
                        stage === 'topic'
                          ? 'Teach me GPU theory, OCR, practical LLM systems, Roman history, or anything else...'
                          : stage === 'background'
                            ? 'I know CPU architecture, I am new to the field, I have built projects, etc.'
                            : stage === 'goal'
                              ? 'Optional: type a custom goal if none of the options fit.'
                              : stage === 'summary'
                                ? 'Want to tweak the course? Tell me what to change or edit the fields above directly.'
                                : selectedPreviewUnit
                                  ? `Request changes for ${selectedPreviewUnit.title}...`
                                  : 'Request changes to the outline...'
                      }
                      className="min-h-[54px] px-3 pt-3 text-base leading-[1.45]"
                    />

                    <PromptInputActions className="mt-4 flex w-full items-center justify-between gap-2 px-2 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <DropdownMenu open={activeActionMenu === 'source'} onOpenChange={(open) => setActiveActionMenu(open ? 'source' : null)}>
                          <PromptInputAction tooltip="Choose the source mode">
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  'rounded-full',
                                  activeActionMenu === 'source' && 'border-[var(--accent-blue)] bg-[var(--documents-bg)] text-[var(--documents)]'
                                )}
                                type="button"
                              >
                                <SelectedSourceIcon className="h-4 w-4" />
                                {selectedSourceMeta.label}
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                          </PromptInputAction>
                          <DropdownMenuContent align="start" side="top" className="w-72">
                            <DropdownMenuLabel>Source strategy</DropdownMenuLabel>
                            <DropdownMenuRadioGroup value={sourceMode}>
                              {sourceOptions.map((option) => (
                                <DropdownMenuRadioItem
                                  key={option.value}
                                  value={option.value}
                                  onSelect={() => {
                                    setSourceMode(option.value);
                                    if (option.value !== 'web' && selectedDocumentIds.length === 0 && documents.length > 0) {
                                      setSelectedDocumentIds([documents[0].id]);
                                    }
                                  }}
                                >
                                  {option.label}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>

                            {canUseDocs ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>PDF sources</DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent className="w-72">
                                    <DropdownMenuLabel>{sourceMode === 'hybrid' ? 'Blend with web' : 'Use these PDFs'}</DropdownMenuLabel>
                                    {documents.length > 0 ? (
                                      documents.map((document) => {
                                        const checked = selectedDocumentIds.includes(document.id);
                                        return (
                                          <DropdownMenuCheckboxItem
                                            key={document.id}
                                            checked={checked}
                                            onSelect={(event) => event.preventDefault()}
                                            onCheckedChange={(nextChecked) =>
                                              setSelectedDocumentIds((current) =>
                                                nextChecked === true
                                                  ? current.includes(document.id)
                                                    ? current
                                                    : [...current, document.id]
                                                  : current.filter((item) => item !== document.id)
                                              )
                                            }
                                          >
                                            {document.title || document.original_filename || 'Study source'}
                                          </DropdownMenuCheckboxItem>
                                        );
                                      })
                                    ) : (
                                      <div className="px-3 py-2 text-sm text-[var(--text-tertiary)]">No completed documents available yet.</div>
                                    )}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu open={activeActionMenu === 'goal'} onOpenChange={(open) => setActiveActionMenu(open ? 'goal' : null)}>
                          <PromptInputAction tooltip="Choose the learning depth">
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  'rounded-full',
                                  activeActionMenu === 'goal' && 'border-[var(--accent-blue)] bg-[var(--documents-bg)] text-[var(--documents)]'
                                )}
                                type="button"
                              >
                                <Wand2 className="h-4 w-4" />
                                {goalOptions.find((option) => option.value === goalDepth)?.label}
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                          </PromptInputAction>
                          <DropdownMenuContent align="start" side="top" className="w-56">
                            <DropdownMenuLabel>Learning depth</DropdownMenuLabel>
                            <DropdownMenuRadioGroup value={goalDepth}>
                              {goalOptions.map((option) => (
                                <DropdownMenuRadioItem key={option.value} value={option.value} onSelect={() => setGoalDepth(option.value)}>
                                  {option.label}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu open={activeActionMenu === 'pace'} onOpenChange={(open) => setActiveActionMenu(open ? 'pace' : null)}>
                          <PromptInputAction tooltip="Choose the daily pace">
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  'rounded-full',
                                  activeActionMenu === 'pace' && 'border-[var(--accent-blue)] bg-[var(--documents-bg)] text-[var(--documents)]'
                                )}
                                type="button"
                              >
                                <Clock3 className="h-4 w-4" />
                                {dailyMinutes} min/day
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                          </PromptInputAction>
                          <DropdownMenuContent align="start" side="top" className="w-56">
                            <DropdownMenuLabel>Daily pace</DropdownMenuLabel>
                            <DropdownMenuRadioGroup value={String(dailyMinutes)}>
                              {timeOptions.map((option) => (
                                <DropdownMenuRadioItem key={option.value} value={String(option.value)} onSelect={() => setDailyMinutes(option.value)}>
                                  {option.label}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="flex items-center gap-2">
                        {stage === 'outline' ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void handleRequestOutlineChanges()}
                            disabled={isGenerating || !normalizeText(draft)}
                          >
                            Request changes
                          </Button>
                        ) : null}

                        {stage === 'topic' || stage === 'background' ? (
                          <PromptInputAction tooltip="Send">
                            <Button
                              type="button"
                              size="icon"
                              className="size-10 rounded-full"
                              onClick={handlePromptSubmit}
                              disabled={!normalizeText(draft) || isSetupBusy}
                              aria-label="Send"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                          </PromptInputAction>
                        ) : null}

                        {stage === 'goal' ? (
                          <PromptInputAction tooltip="Continue">
                            <Button
                              type="button"
                              size="icon"
                              className="size-10 rounded-full"
                              onClick={() => void handleGoalContinue()}
                              disabled={isSetupBusy}
                              aria-label="Continue"
                            >
                              {isSetupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                            </Button>
                          </PromptInputAction>
                        ) : null}

                        {stage === 'summary' ? (
                          <PromptInputAction tooltip="Create course outline">
                            <Button
                              type="button"
                              size="icon"
                              className="size-10 rounded-full"
                              onClick={() => void handlePreviewOutline()}
                              disabled={isGenerating || isSetupBusy}
                              aria-label="Create course outline"
                            >
                              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            </Button>
                          </PromptInputAction>
                        ) : null}

                        {stage === 'outline' ? (
                          <PromptInputAction tooltip="Create course">
                            <Button
                              type="button"
                              size="icon"
                              className="size-10 rounded-full"
                              onClick={() => void handleCreatePath()}
                              disabled={isGenerating}
                              aria-label="Create course"
                            >
                              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            </Button>
                          </PromptInputAction>
                        ) : null}
                      </div>
                    </PromptInputActions>
                  </div>
                </PromptInput>
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">{label}</p>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-2 min-h-[120px] w-full rounded-[1.25rem] border border-[var(--card-border)] bg-[var(--bg-base)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)]"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-2 h-14 w-full rounded-[1.25rem] border border-[var(--card-border)] bg-[var(--bg-base)] px-4 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)]"
        />
      )}
    </div>
  );
}

function PreferenceGroup({
  title,
  items,
  isSelected,
  onToggle,
}: {
  title: string;
  items: string[];
  isSelected: (value: string) => boolean;
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-tertiary)]">Choose what fits this course</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const selected = isSelected(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
              className={cn(
                'rounded-full border px-3 py-2 text-sm transition-colors',
                selected
                  ? 'border-[var(--accent-blue)] bg-[var(--documents-bg)] text-[var(--documents)]'
                  : 'border-[var(--card-border)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--card-border-hover)] hover:text-[var(--text-primary)]'
              )}
            >
              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  Clock3,
  FileText,
  Globe2,
  Loader2,
  MessageSquareQuote,
  RotateCcw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { api } from '@/lib/api';
import type { Document, GoalDepth, LearningPathCard, LearningSourceMode } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/loading-spinner';
import { PromptInput, PromptInputAction, PromptInputActions, PromptInputTextarea } from '@/components/ui/prompt-input';
import { cn } from '@/lib/utils';

type SetupStage = 'topic' | 'background' | 'preferences' | 'review';

type BuilderMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
};

const topicExamples = [
  'LLMs for software engineers',
  'Data science portfolio and resume',
  'OCR mastery in 15 minutes a day',
  'Stoic philosophy for modern work',
];

const backgroundPresets = [
  'Software engineer moving into AI',
  'Researcher transitioning to industry',
  'Product designer learning from scratch',
  'Student building a project portfolio',
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

function titleCase(value: string) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function suggestPathTitle(topic: string) {
  const cleaned = topic.trim();
  if (!cleaned) return 'Your personalized path';
  return cleaned.length > 58 ? `${cleaned.slice(0, 57)}…` : cleaned;
}

function toggleToken(items: string[], value: string) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function buildPreviewUnits(topic: string, focusAreas: string[]) {
  const fallback = [
    { title: 'Foundations', detail: 'Understand the core ideas and vocabulary first.' },
    { title: 'Application', detail: 'See how the concept works in practical situations.' },
    { title: 'Mastery', detail: 'Review, practice, and retain what matters.' },
  ];

  if (!topic.trim()) {
    return fallback;
  }

  const topicLabel = suggestPathTitle(topic).replace('Your personalized path', 'This topic');
  const custom = focusAreas.slice(0, 3).map((focus, index) => ({
    title:
      index === 0
        ? `${titleCase(focus)} foundations`
        : index === 1
          ? `${titleCase(focus)} in practice`
          : `${titleCase(focus)} review`,
    detail: `A short set of lessons that keeps ${topicLabel.toLowerCase()} grounded in ${focus}.`,
  }));

  return custom.length > 0 ? custom : fallback;
}

function buildSummaryMessage({
  topic,
  background,
  goalDepth,
  dailyMinutes,
  sourceMode,
  teachingStyle,
}: {
  topic: string;
  background: string;
  goalDepth: GoalDepth;
  dailyMinutes: number;
  sourceMode: LearningSourceMode;
  teachingStyle: string[];
}) {
  const goal = goalOptions.find((option) => option.value === goalDepth)?.label ?? goalDepth;
  const source = sourceOptions.find((option) => option.value === sourceMode)?.label ?? sourceMode;
  return `Ready to build **${suggestPathTitle(topic)}**.\n\n- Background: ${background}\n- Goal: ${goal}\n- Pace: ${dailyMinutes} min/day\n- Sources: ${source}\n- Style: ${teachingStyle.length ? teachingStyle.join(', ') : 'Default explanations'}`;
}

export default function LearnPage() {
  const router = useRouter();

  const [documents, setDocuments] = useState<Document[]>([]);
  const [paths, setPaths] = useState<LearningPathCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const [messages, setMessages] = useState<BuilderMessage[]>([
    {
      id: 'setup-intro',
      role: 'assistant',
      content: 'What do you want to learn? Give me the topic in one sentence, or tap one of the suggestions below.',
    },
  ]);
  const [stage, setStage] = useState<SetupStage>('topic');
  const [draft, setDraft] = useState('');

  const [topic, setTopic] = useState('');
  const [background, setBackground] = useState('');
  const [goalDepth, setGoalDepth] = useState<GoalDepth>('practical');
  const [dailyMinutes, setDailyMinutes] = useState(15);
  const [sourceMode, setSourceMode] = useState<LearningSourceMode>('hybrid');
  const [teachingStyle, setTeachingStyle] = useState<string[]>(['visual explanations', 'practical applications']);
  const [focusAreas, setFocusAreas] = useState<string[]>(['foundations', 'real-world examples']);
  const [customInstructions, setCustomInstructions] = useState('');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);

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

  const canGenerate = Boolean(topic.trim() && background.trim() && (sourceMode === 'web' || selectedDocumentIds.length > 0));
  const canUseDocs = sourceMode !== 'web';
  const previewUnits = useMemo(() => buildPreviewUnits(topic, focusAreas), [focusAreas, topic]);
  const stageIndex = stage === 'topic' ? 0 : stage === 'background' ? 1 : stage === 'preferences' ? 2 : 3;
  const selectedSourceMeta = sourceOptions.find((option) => option.value === sourceMode) ?? sourceOptions[1];
  const SelectedSourceIcon = selectedSourceMeta.icon;

  const suggestionButtons = useMemo(() => {
    if (stage === 'topic') return topicExamples;
    if (stage === 'background') return backgroundPresets;
    return [];
  }, [stage]);

  function pushConversation(userMessage: string, assistantMessage: string, nextStage: SetupStage) {
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: userMessage },
      { id: crypto.randomUUID(), role: 'assistant', content: assistantMessage },
    ]);
    setStage(nextStage);
    setDraft('');
  }

  function handleTopicSubmit(nextTopic: string) {
    const cleaned = nextTopic.trim();
    if (!cleaned) return;
    setTopic(cleaned);
    pushConversation(
      cleaned,
      'Good. What is your background? Pick one below or type your own in one sentence so I can tune the path difficulty.',
      'background'
    );
  }

  function handleBackgroundSubmit(nextBackground: string) {
    const cleaned = nextBackground.trim();
    if (!cleaned) return;
    setBackground(cleaned);
    pushConversation(
      cleaned,
      'Now shape the path. Pick your goal, pace, source mode, and teaching style on the left. Add any final instruction below, then continue.',
      'preferences'
    );
  }

  function handlePreferencesContinue() {
    if (!topic.trim() || !background.trim()) {
      toast.error('Finish the topic and background first');
      return;
    }

    if (canUseDocs && selectedDocumentIds.length === 0) {
      toast.error('Pick at least one source document for PDF or hybrid mode');
      return;
    }

    const note = draft.trim();
    if (note) {
      setCustomInstructions(note);
    }

    pushConversation(
      note || 'Continue with these settings.',
      buildSummaryMessage({
        topic,
        background,
        goalDepth,
        dailyMinutes,
        sourceMode,
        teachingStyle,
      }),
      'review'
    );
  }

  async function handleGenerate() {
    if (!canGenerate) {
      toast.error('Finish the setup first');
      return;
    }

    try {
      setIsGenerating(true);
      const path = await api.generateLearningPath({
        topic: topic.trim(),
        background: background.trim(),
        goal_depth: goalDepth,
        daily_minutes: dailyMinutes,
        teaching_style: teachingStyle,
        focus_areas: focusAreas,
        source_mode: sourceMode,
        document_ids: canUseDocs ? selectedDocumentIds : [],
        seed_urls: [],
        custom_instructions: customInstructions.trim() || undefined,
      });
      toast.success('Learning path created');
      router.push(`/dashboard/learn/${path.id}`);
    } catch (error: unknown) {
      console.error('Failed to create learning path', error);
      toast.error(getErrorMessage(error, 'Failed to create learning path'));
    } finally {
      setIsGenerating(false);
    }
  }

  function handlePromptSubmit() {
    if (stage === 'topic') {
      handleTopicSubmit(draft);
      return;
    }

    if (stage === 'background') {
      handleBackgroundSubmit(draft);
      return;
    }

    if (stage === 'preferences') {
      handlePreferencesContinue();
      return;
    }

    if (stage === 'review') {
      void handleGenerate();
    }
  }

  function handleReset() {
    setStage('topic');
    setMessages([
      {
        id: 'setup-intro-reset',
        role: 'assistant',
        content: 'What do you want to learn? Give me the topic in one sentence, or tap one of the suggestions below.',
      },
    ]);
    setDraft('');
    setTopic('');
    setBackground('');
    setGoalDepth('practical');
    setDailyMinutes(15);
    setSourceMode('hybrid');
    setTeachingStyle(['visual explanations', 'practical applications']);
    setFocusAreas(['foundations', 'real-world examples']);
    setCustomInstructions('');
    if (documents.length > 0) {
      setSelectedDocumentIds([documents[0].id]);
    } else {
      setSelectedDocumentIds([]);
    }
  }

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="flex h-[calc(100svh-10.5rem)] min-h-[40rem] overflow-hidden rounded-[1.7rem] border border-[var(--card-border)] bg-[var(--bg-primary)] shadow-[var(--card-shadow)] animate-fade-in">
      <PanelGroup orientation="horizontal">
        <Panel defaultSize={46} minSize={34} className="border-r border-[var(--card-border)]">
          <div className="flex h-full min-h-0 flex-col bg-[var(--bg-secondary)]/40">
            <div className="border-b border-[var(--card-border)] bg-[var(--bg-primary)] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                    Live preview
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                    {suggestPathTitle(topic)}
                  </h1>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {background.trim()
                      ? background
                      : 'Your path summary updates as you answer the setup chat.'}
                  </p>
                </div>

                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <PreviewStat label="Goal" value={goalOptions.find((option) => option.value === goalDepth)?.label ?? 'Practical'} icon={Wand2} />
                <PreviewStat label="Pace" value={`${dailyMinutes} min/day`} icon={Clock3} />
                <PreviewStat label="Sources" value={selectedSourceMeta.label} icon={selectedSourceMeta.icon} />
                <PreviewStat label="Ready docs" value={`${documents.length}`} icon={FileText} />
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
                    {[
                      { title: 'Topic', done: Boolean(topic.trim()) },
                      { title: 'Background', done: Boolean(background.trim()) },
                      { title: 'Preferences', done: stageIndex >= 2 },
                      { title: 'Ready to generate', done: stage === 'review' },
                    ].map((item, index) => (
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

                <section className="rounded-[1.5rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-5">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-[var(--primary)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Likely path shape</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {previewUnits.map((unit, index) => (
                      <div key={`${unit.title}-${index}`} className="rounded-[1.15rem] border border-[var(--card-border)] bg-[var(--bg-base)] p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--documents-bg)] text-sm font-semibold text-[var(--documents)]">
                            {index + 1}
                          </div>
                          <p className="font-medium text-[var(--text-primary)]">{unit.title}</p>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{unit.detail}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-[1.5rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-5">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Selected documents</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canUseDocs ? (
                      selectedDocumentIds.length > 0 ? (
                        selectedDocumentIds.map((documentId) => {
                          const document = documents.find((item) => item.id === documentId);
                          return (
                            <Badge key={documentId} variant="documents">
                              {document?.title || document?.original_filename || 'Study source'}
                            </Badge>
                          );
                        })
                      ) : (
                        <p className="text-sm text-[var(--text-tertiary)]">Pick at least one document for PDF or hybrid mode.</p>
                      )
                    ) : (
                      <p className="text-sm text-[var(--text-tertiary)]">Web mode ignores local documents.</p>
                    )}
                  </div>
                </section>

                <section className="rounded-[1.5rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-5">
                  <div className="flex items-center gap-2">
                    <MessageSquareQuote className="h-4 w-4 text-[var(--primary)]" />
                    <p className="text-sm font-semibold text-[var(--text-primary)]">Existing paths</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {paths.length === 0 ? (
                      <p className="text-sm text-[var(--text-tertiary)]">No learning paths yet.</p>
                    ) : (
                      paths.slice(0, 3).map((path) => (
                        <Link
                          key={path.id}
                          href={`/dashboard/learn/${path.id}`}
                          className="block rounded-[1.15rem] border border-[var(--card-border)] bg-[var(--bg-base)] p-4 transition-colors hover:border-[var(--card-border-hover)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-[var(--text-primary)]">{path.title}</p>
                              <p className="mt-1 text-sm text-[var(--text-secondary)]">{path.total_lessons} lessons</p>
                            </div>
                            <Badge variant="default">{path.completion_percentage}%</Badge>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-[var(--bg-secondary)] transition-all hover:bg-[var(--primary)]/30 active:bg-[var(--primary)]/50" />

        <Panel defaultSize={54} minSize={38}>
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
                        ? 'Step 2: set the learner background'
                        : stage === 'preferences'
                          ? 'Step 3: tune the path'
                          : 'Review and generate'}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    One thread. One prompt area. No duplicate form blocks.
                  </p>
                </div>

                {stage === 'review' ? (
                  <Button onClick={() => void handleGenerate()} isLoading={isGenerating} disabled={!canGenerate}>
                    <Sparkles className="h-4 w-4" />
                    Generate path
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div className="mx-auto flex max-w-3xl flex-col gap-4">
                {messages.map((message) => (
                  <div key={message.id} className={cn('max-w-[92%]', message.role === 'user' ? 'ml-auto' : '')}>
                    <div
                      className={cn(
                        'rounded-[1.6rem] border px-4 py-3 text-sm leading-7',
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
                  <div className="flex flex-wrap gap-2 pt-2">
                    {suggestionButtons.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          if (stage === 'topic') {
                            handleTopicSubmit(suggestion);
                          } else if (stage === 'background') {
                            handleBackgroundSubmit(suggestion);
                          }
                        }}
                        className="rounded-full border border-[var(--card-border)] bg-[var(--card-bg-solid)] px-4 py-2 text-sm text-[var(--text-primary)] transition-colors hover:border-[var(--card-border-hover)]"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}

                {stage === 'preferences' || stage === 'review' ? (
                  <div className="space-y-5 rounded-[1.75rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] p-5">
                    <PreferenceGroup
                      title="Goal"
                      items={goalOptions.map((option) => option.label)}
                      isSelected={(value) => goalOptions.find((option) => option.value === goalDepth)?.label === value}
                      onToggle={(value) => {
                        const selected = goalOptions.find((option) => option.label === value);
                        if (selected) setGoalDepth(selected.value);
                      }}
                    />

                    <PreferenceGroup
                      title="Pace"
                      items={timeOptions.map((option) => option.label)}
                      isSelected={(value) => timeOptions.find((option) => option.value === dailyMinutes)?.label === value}
                      onToggle={(value) => {
                        const selected = timeOptions.find((option) => option.label === value);
                        if (selected) setDailyMinutes(selected.value);
                      }}
                    />

                    <PreferenceGroup
                      title="Source mode"
                      items={sourceOptions.map((option) => option.label)}
                      isSelected={(value) => sourceOptions.find((option) => option.value === sourceMode)?.label === value}
                      onToggle={(value) => {
                        const selected = sourceOptions.find((option) => option.label === value);
                        if (selected) setSourceMode(selected.value);
                      }}
                    />

                    <PreferenceGroup
                      title="Teaching style"
                      items={stylePresets}
                      isSelected={(value) => teachingStyle.includes(value)}
                      onToggle={(value) => setTeachingStyle((current) => toggleToken(current, value))}
                      multiple
                    />

                    <PreferenceGroup
                      title="Focus areas"
                      items={focusPresets}
                      isSelected={(value) => focusAreas.includes(value)}
                      onToggle={(value) => setFocusAreas((current) => toggleToken(current, value))}
                      multiple
                    />

                    {canUseDocs ? (
                      <PreferenceGroup
                        title="Grounding documents"
                        items={documents.map((document) => document.id)}
                        labelFor={(value) => {
                          const document = documents.find((item) => item.id === value);
                          return document?.title || document?.original_filename || 'Study source';
                        }}
                        isSelected={(value) => selectedDocumentIds.includes(value)}
                        onToggle={(value) =>
                          setSelectedDocumentIds((current) =>
                            current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
                          )
                        }
                        multiple
                      />
                    ) : null}
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
                  isLoading={isGenerating}
                  className="border-[var(--card-border)] bg-[var(--card-bg-solid)]"
                >
                  <div className="flex w-full flex-col">
                    <PromptInputTextarea
                      placeholder={
                        stage === 'topic'
                          ? 'Teach me OCR, chemistry for designers, practical LLM systems, or anything else...'
                          : stage === 'background'
                            ? 'I am a frontend engineer, researcher, student, beginner, product manager...'
                            : stage === 'preferences'
                              ? 'Optional: add a final instruction like “use sports analogies” or “make it resume-focused”.'
                              : 'Optional: add one last instruction before generating.'
                      }
                      className="min-h-[54px] px-3 pt-3 text-base leading-[1.45]"
                    />

                    <PromptInputActions className="mt-4 flex w-full items-center justify-between gap-2 px-2 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <PromptInputAction tooltip="Current source mode">
                          <Button variant="outline" className="rounded-full" type="button">
                            <SelectedSourceIcon className="h-4 w-4" />
                            {selectedSourceMeta.label}
                          </Button>
                        </PromptInputAction>
                        <PromptInputAction tooltip="Current path goal">
                          <Button variant="outline" className="rounded-full" type="button">
                            <Wand2 className="h-4 w-4" />
                            {goalOptions.find((option) => option.value === goalDepth)?.label}
                          </Button>
                        </PromptInputAction>
                        <PromptInputAction tooltip="Current daily pace">
                          <Button variant="outline" className="rounded-full" type="button">
                            <Clock3 className="h-4 w-4" />
                            {dailyMinutes} min/day
                          </Button>
                        </PromptInputAction>
                      </div>

                      <div className="flex items-center gap-2">
                        {stage === 'preferences' ? (
                          <Button variant="outline" type="button" onClick={handlePreferencesContinue}>
                            Continue
                          </Button>
                        ) : null}

                        {stage === 'review' ? (
                          <Button type="button" onClick={() => void handleGenerate()} disabled={!canGenerate || isGenerating}>
                            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Build path
                          </Button>
                        ) : (
                          <Button type="button" onClick={handlePromptSubmit} disabled={stage !== 'preferences' ? !draft.trim() : false}>
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                        )}
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

function PreviewStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof BookOpen;
}) {
  return (
    <div className="rounded-[1.15rem] border border-[var(--card-border)] bg-[var(--card-bg-solid)] px-4 py-3">
      <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function PreferenceGroup({
  title,
  items,
  isSelected,
  onToggle,
  labelFor,
  multiple = false,
}: {
  title: string;
  items: string[];
  isSelected: (value: string) => boolean;
  onToggle: (value: string) => void;
  labelFor?: (value: string) => string;
  multiple?: boolean;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-tertiary)]">{multiple ? 'Pick any that matter' : 'Pick one'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onToggle(item)}
            className={cn(
              'rounded-full border px-3 py-2 text-sm transition-colors',
              isSelected(item)
                ? 'border-[var(--accent-blue)] bg-[var(--documents-bg)] text-[var(--documents)]'
                : 'border-[var(--card-border)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--card-border-hover)] hover:text-[var(--text-primary)]'
            )}
          >
            {labelFor ? labelFor(item) : item}
          </button>
        ))}
      </div>
    </div>
  );
}

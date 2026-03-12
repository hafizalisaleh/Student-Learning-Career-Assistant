'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  BookOpen,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Globe,
  Loader2,
  Lock,
  PlayCircle,
  RotateCcw,
  Square,
  Sparkles,
  Target,
  ArrowUp,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { api } from '@/lib/api';
import type {
  LearningPath,
  LearningPathChatMessage,
  LearningPathChatSource,
  LearningLessonSummary,
  LearningPathUnit,
} from '@/lib/types';
import { PageLoader } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChatContainerContent, ChatContainerRoot, ChatContainerScrollAnchor } from '@/components/ui/chat-container';
import { Message, MessageContent } from '@/components/ui/message';
import { PromptInput, PromptInputActions, PromptInputTextarea } from '@/components/ui/prompt-input';
import { ScrollButton } from '@/components/ui/scroll-button';
import { cn } from '@/lib/utils';

type WorkspaceMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  sources?: LearningPathChatSource[];
  usedLiveTools?: boolean;
};

type StoredWorkspaceState = {
  selectedLessonId: string | null;
  selectedUnitId: string | null;
  selectedModel: string;
  messages: WorkspaceMessage[];
};

const CHAT_MODELS = [
  {
    id: 'openai/gpt-oss-20b',
    label: 'Fast',
    description: 'Quick iteration for lesson planning and short answers.',
    icon: Zap,
  },
  {
    id: 'openai/gpt-oss-120b',
    label: 'Deep',
    description: 'Best for nuanced coaching and curriculum tradeoffs.',
    icon: BrainCircuit,
  },
  {
    id: 'groq/compound-mini',
    label: 'Live Web',
    description: 'Uses Groq web tools when fresh context is needed.',
    icon: Globe,
  },
] as const;

function createAssistantIntro(path: LearningPath): WorkspaceMessage {
  return {
    id: 'intro',
    role: 'assistant',
    content: `Copilot for **${path.title}**.\n\nAsk for a summary, a practical rewrite, or what to study next.`,
    model: 'workspace',
    sources: [],
    usedLiveTools: false,
  };
}

function normalizeStoredMessages(raw: unknown): WorkspaceMessage[] {
  if (!Array.isArray(raw)) return [];

  const messages: WorkspaceMessage[] = [];

  for (const item of raw) {
    const message = item as Partial<WorkspaceMessage>;
    if (
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string' &&
      message.content.trim()
    ) {
      messages.push({
        id: typeof message.id === 'string' ? message.id : crypto.randomUUID(),
        role: message.role,
        content: message.content,
        model: typeof message.model === 'string' ? message.model : undefined,
        sources: Array.isArray(message.sources)
          ? message.sources.filter(
              (source): source is LearningPathChatSource =>
                Boolean(source) &&
                typeof source.label === 'string' &&
                typeof source.detail === 'string'
            )
          : [],
        usedLiveTools: Boolean(message.usedLiveTools),
      });
    }
  }

  return messages;
}

function buildQuickPrompts(
  path: LearningPath | null,
  selectedUnit: LearningPathUnit | null,
  selectedLesson: LearningLessonSummary | null
): string[] {
  if (!path) return [];

  if (selectedLesson) {
    return [
      `Explain ${selectedLesson.title} in plain language.`,
      `Give me a practical checklist for ${selectedLesson.title}.`,
      `What is the fastest way to master ${selectedLesson.title}?`,
      `Quiz me on ${selectedLesson.title}.`,
    ];
  }

  if (selectedUnit) {
    return [
      `Summarize the whole ${selectedUnit.title} unit.`,
      `What should I focus on first in ${selectedUnit.title}?`,
      `Make ${selectedUnit.title} more practical.`,
      `What mistakes should I avoid in ${selectedUnit.title}?`,
    ];
  }

  return [
    `What should I study first in ${path.title}?`,
    `Make this curriculum more practical.`,
    `What can I skip if I only have ${path.daily_minutes} minutes a day?`,
    'Turn this path into a weekly plan.',
  ];
}

export default function LearningPathDetailPage() {
  const params = useParams<{ id: string }>();
  const [path, setPath] = useState<LearningPath | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('openai/gpt-oss-120b');
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);

  const storageKey = useMemo(() => `learning-path-workspace:${params.id}`, [params.id]);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        const result = await api.getLearningPath(params.id);
        setPath(result);
      } catch (error) {
        console.error('Failed to load learning path', error);
        toast.error('Failed to load learning path');
      } finally {
        setIsLoading(false);
      }
    }

    if (params.id) {
      load();
    }
  }, [params.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setIsHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<StoredWorkspaceState>;
      setSelectedLessonId(typeof parsed.selectedLessonId === 'string' ? parsed.selectedLessonId : null);
      setSelectedUnitId(typeof parsed.selectedUnitId === 'string' ? parsed.selectedUnitId : null);
      setSelectedModel(
        typeof parsed.selectedModel === 'string' && CHAT_MODELS.some((model) => model.id === parsed.selectedModel)
          ? parsed.selectedModel
          : 'openai/gpt-oss-120b'
      );
      setMessages(normalizeStoredMessages(parsed.messages));
    } catch (error) {
      console.warn('Failed to restore learning workspace state', error);
    } finally {
      setIsHydrated(true);
    }
  }, [storageKey]);

  const lessons = useMemo(() => path?.units.flatMap((unit) => unit.lessons) ?? [], [path]);

  const selectedLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === selectedLessonId) ?? null,
    [lessons, selectedLessonId]
  );

  const selectedUnit = useMemo(() => {
    if (!path) return null;
    if (selectedLesson) {
      return path.units.find((unit) => unit.id === selectedLesson.unit_id) ?? null;
    }
    if (selectedUnitId) {
      return path.units.find((unit) => unit.id === selectedUnitId) ?? null;
    }
    return null;
  }, [path, selectedLesson, selectedUnitId]);

  const quickPrompts = useMemo(
    () => buildQuickPrompts(path, selectedUnit, selectedLesson),
    [path, selectedUnit, selectedLesson]
  );

  const totalMinutes = useMemo(() => {
    return lessons.reduce((sum, lesson) => sum + lesson.duration_minutes, 0);
  }, [lessons]);

  useEffect(() => {
    if (!path || !isHydrated) return;

    if (!selectedLessonId && !selectedUnitId) {
      if (path.units[0]) {
        setSelectedUnitId(path.units[0].id);
      }
    }

    if (messages.length === 0) {
      setMessages([createAssistantIntro(path)]);
    }
  }, [isHydrated, lessons, messages.length, path, selectedLessonId, selectedUnitId]);

  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') return;

    const payload: StoredWorkspaceState = {
      selectedLessonId,
      selectedUnitId,
      selectedModel,
      messages,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [isHydrated, messages, selectedLessonId, selectedModel, selectedUnitId, storageKey]);

  const selectedModelMeta = CHAT_MODELS.find((model) => model.id === selectedModel) ?? CHAT_MODELS[1];

  async function submitPrompt(promptOverride?: string) {
    if (!path || isSending) return;

    const content = (promptOverride ?? draft).trim();
    if (!content) return;

    const nextMessages: WorkspaceMessage[] = [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content,
      },
    ];

    setMessages(nextMessages);
    setDraft('');
    setIsSending(true);

    try {
      const response = await api.chatLearningPath(path.id, {
        messages: nextMessages.map<LearningPathChatMessage>((message) => ({
          role: message.role,
          content: message.content,
        })),
        model: selectedModel,
        lesson_id: selectedLessonId,
        unit_id: selectedLesson ? selectedLesson.unit_id : selectedUnitId,
      });

      setMessages([
        ...nextMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.answer,
          model: response.model,
          sources: response.sources,
          usedLiveTools: response.used_live_tools,
        },
      ]);
    } catch (error) {
      console.error('Failed to chat with learning path assistant', error);
      toast.error('Failed to send your question');
      setMessages(messages);
    } finally {
      setIsSending(false);
    }
  }

  function resetChat() {
    if (!path) return;
    setMessages([createAssistantIntro(path)]);
    toast.success('Chat reset');
  }

  if (isLoading || !isHydrated) {
    return <PageLoader />;
  }

  if (!path) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-[var(--card-border)] p-8 text-center text-[var(--text-tertiary)]">
        Learning path not found.
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100svh-10.5rem)] min-h-[38rem] overflow-hidden rounded-[1.6rem] border border-[var(--card-border)] bg-[var(--bg-primary)] shadow-[var(--card-shadow)]">
      <PanelGroup orientation="horizontal">
        <Panel defaultSize={48} minSize={30} className="border-r border-[var(--card-border)]">
          <div className="flex h-full min-h-0 flex-col bg-[var(--bg-primary)]">
            <div className="border-b border-[var(--card-border)] bg-[var(--bg-secondary)] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/dashboard/learn"
                    className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to paths
                  </Link>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="documents" size="sm">
                        <Sparkles className="h-3.5 w-3.5" />
                        {path.source_mode}
                      </Badge>
                      <Badge variant="default" size="sm">
                        {path.goal_depth}
                      </Badge>
                      <Badge variant="default" size="sm">
                        {path.total_lessons} lessons
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="text-lg font-semibold tracking-[-0.03em] text-[var(--text-primary)] md:text-xl">{path.title}</h1>
                      <p className="mt-1 line-clamp-2 max-w-xl text-sm text-[var(--text-secondary)]">{path.tagline}</p>
                    </div>
                    <div className="hidden shrink-0 rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)] lg:block">
                      Select unit • Open lesson
                    </div>
                  </div>
                </div>
                </div>

              <div className="mt-3 rounded-[1rem] border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                      Curriculum
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {path.completed_lessons}/{path.total_lessons} lessons completed · {path.daily_minutes} min/day · {totalMinutes} min total
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                      {path.completion_percentage}%
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-tertiary)]">
                  <div
                    className="h-1.5 rounded-full bg-[var(--primary)]"
                    style={{ width: `${path.completion_percentage}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-3">
                {path.units.map((unit) => (
                  <UnitRail
                    key={unit.id}
                    pathId={path.id}
                    unit={unit}
                    isSelected={selectedUnit?.id === unit.id}
                    onSelectUnit={() => {
                      setSelectedUnitId(unit.id);
                      setSelectedLessonId(null);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-[var(--bg-secondary)] transition-all hover:bg-[var(--primary)]/30 active:bg-[var(--primary)]/50" />

        <Panel defaultSize={52} minSize={30}>
          <div className="flex h-full min-h-0 flex-col bg-[var(--bg-primary)]">
            <div className="flex items-center gap-1 border-b border-[var(--card-border)] bg-[var(--bg-secondary)] p-2">
              {CHAT_MODELS.map((model) => {
                const Icon = model.icon;
                const active = selectedModel === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => setSelectedModel(model.id)}
                    className={cn(
                      'flex-1 rounded-lg py-2 text-sm font-medium transition-all',
                      active
                        ? 'bg-[var(--card-bg)] text-[var(--primary)] ring-1 ring-[var(--card-border)] shadow-sm'
                        : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                    )}
                    title={model.description}
                  >
                    <span className="inline-flex items-center justify-center gap-2">
                      <Icon className="h-4 w-4" />
                      {model.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative flex-1 overflow-hidden">
              <div className="flex h-full min-h-0 flex-col bg-[var(--bg-secondary)]/30">
                <div className="border-b border-[var(--card-border)] bg-[var(--bg-secondary)] px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                        AI Assistant
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                        {selectedLesson
                          ? selectedLesson.title
                          : selectedUnit
                            ? selectedUnit.title
                            : 'Curriculum copilot'}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {selectedLesson
                          ? selectedLesson.objective
                          : selectedUnit
                            ? selectedUnit.objective
                            : 'Ask to shorten, deepen, simplify, or re-sequence this curriculum.'}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={resetChat}>
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </Button>
                  </div>
                </div>

                <ChatContainerRoot className="relative min-h-0 flex-1 overflow-y-auto bg-[var(--bg-secondary)]/30">
                  <ChatContainerContent className="space-y-4 p-4">
                    {messages.length === 0 && (
                      <div className="mx-auto flex h-full max-w-sm flex-col items-center justify-center space-y-4 pt-20 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
                          <Sparkles className="h-7 w-7" />
                        </div>
                        <h3 className="font-semibold text-[var(--text-primary)]">Your curriculum copilot</h3>
                        <p className="text-sm text-[var(--text-tertiary)]">
                          Select a lesson on the left, then ask for examples, simplifications, revisions, or a tighter sequence.
                        </p>
                      </div>
                    )}

                    {messages.map((message) => (
                      <Message
                        key={message.id}
                        className={cn('max-w-[92%]', message.role === 'user' ? 'ml-auto flex-row-reverse' : '')}
                      >
                        {message.role === 'assistant' && (
                          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]">
                            <Bot className="h-4 w-4 text-white" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <MessageContent
                            markdown={message.role === 'assistant'}
                            className={cn(
                              'group relative rounded-2xl px-4 py-3',
                              message.role === 'user'
                                ? 'chat-user-bubble bg-[linear-gradient(135deg,var(--primary),var(--highlight))] text-white shadow-[var(--shadow-glow-blue)]'
                                : 'border border-[var(--card-border)] bg-[var(--card-bg)]'
                            )}
                          >
                            {message.content}
                          </MessageContent>

                          {message.role === 'assistant' && message.sources && message.sources.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2 pl-1">
                              {message.sources.map((source, index) =>
                                source.url ? (
                                  <a
                                    key={`${message.id}-source-${index}`}
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex max-w-[17rem] items-center gap-2 rounded-full border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                                  >
                                    <span className="truncate">
                                      <span className="font-semibold text-[var(--text-primary)]">{source.label}</span>
                                      {': '}
                                      {source.detail}
                                    </span>
                                  </a>
                                ) : (
                                  <div
                                    key={`${message.id}-source-${index}`}
                                    className="inline-flex max-w-[17rem] items-center gap-2 rounded-full border border-[var(--card-border)] bg-[var(--bg-base)] px-3 py-1.5 text-xs text-[var(--text-secondary)]"
                                  >
                                    <span className="truncate">
                                      <span className="font-semibold text-[var(--text-primary)]">{source.label}</span>
                                      {': '}
                                      {source.detail}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          ) : null}

                          {message.role === 'assistant' && message.model ? (
                            <div className="mt-2 pl-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                              {CHAT_MODELS.find((model) => model.id === message.model)?.label ?? 'AI coach'}
                              {message.usedLiveTools ? ' · live tools' : ''}
                            </div>
                          ) : null}
                        </div>
                        {message.role === 'user' && (
                          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--bg-secondary)]">
                            <BookOpen className="h-4 w-4 text-[var(--text-tertiary)]" />
                          </div>
                        )}
                      </Message>
                    ))}

                    {isSending && (
                      <Message className="max-w-[92%]">
                        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)]">
                          <Bot className="h-4 w-4 animate-pulse text-white" />
                        </div>
                        <MessageContent className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-[var(--text-tertiary)]" />
                            <span className="text-sm text-[var(--text-secondary)]">Thinking through the curriculum...</span>
                          </div>
                        </MessageContent>
                      </Message>
                    )}

                    <ChatContainerScrollAnchor />
                    <div className="absolute bottom-4 right-4">
                      <ScrollButton
                        className="border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-primary)] shadow-sm hover:bg-[var(--bg-secondary)]"
                        hover-bg="var(--bg-secondary)"
                      />
                    </div>
                  </ChatContainerContent>
                </ChatContainerRoot>

                <div className="sticky bottom-0 z-10 border-t border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--card-bg-solid)_88%,transparent)] p-3 backdrop-blur-xl">
                  <div className="mb-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{selectedModelMeta.label}</span>
                    {' · '}
                    {selectedModel === 'groq/compound-mini' ? 'fresh web context' : 'course guidance'}
                    {' · '}
                    remembers this workspace.
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => submitPrompt(prompt)}
                        className="rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  <div className="mt-1 flex rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-1 shadow-sm">
                    <PromptInput
                      value={draft}
                      onValueChange={setDraft}
                      onSubmit={() => {
                        if (draft.trim()) submitPrompt();
                      }}
                      isLoading={isSending}
                      className="flex flex-1 flex-row items-end border-none bg-transparent p-0 shadow-none"
                    >
                      <PromptInputTextarea
                        placeholder={
                          selectedLesson
                            ? `Ask about ${selectedLesson.title}...`
                            : selectedUnit
                              ? `Ask about ${selectedUnit.title}...`
                              : 'Ask how to refine this curriculum...'
                        }
                        disabled={isSending}
                        className="min-h-[40px] max-h-40 flex-1 border-none bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-0"
                      />
                      <PromptInputActions className="pb-1 pr-1">
                        <Button
                          type="button"
                          onClick={() => {
                            if (!isSending && draft.trim()) {
                              submitPrompt();
                            }
                          }}
                          variant="default"
                          size="icon"
                          className="h-8 w-8 rounded-full bg-[var(--primary)] text-white hover:bg-[var(--primary)]/90"
                          disabled={!isSending && !draft.trim()}
                        >
                          {isSending ? <Square className="h-4 w-4 fill-current" /> : <ArrowUp className="h-5 w-5" />}
                        </Button>
                      </PromptInputActions>
                    </PromptInput>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

function UnitRail({
  pathId,
  unit,
  isSelected,
  onSelectUnit,
}: {
  pathId: string;
  unit: LearningPathUnit;
  isSelected: boolean;
  onSelectUnit: () => void;
}) {
  const completedLessons = unit.lessons.filter((lesson) => lesson.is_completed).length;

  return (
    <div
      className={cn(
        'rounded-[1.5rem] border p-3.5 transition-colors',
        isSelected ? 'border-[var(--primary)] bg-[var(--documents-bg)]' : 'border-[var(--card-border)] bg-[var(--bg-base)]'
      )}
    >
      <button type="button" onClick={onSelectUnit} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              Unit {unit.order_index}
            </p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{unit.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{unit.objective}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" size="sm">
              {completedLessons}/{unit.lessons.length}
            </Badge>
            {isSelected ? (
              <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />
            ) : (
              <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" />
            )}
          </div>
        </div>
      </button>

      {isSelected ? (
      <div className="mt-3 space-y-2 border-l border-dashed border-[var(--card-border)] pl-4">
        {unit.lessons.map((lesson) => {
          const isLocked = lesson.is_locked;
          const isCompleted = lesson.is_completed;
          const Icon = isCompleted ? CheckCircle2 : isLocked ? Lock : PlayCircle;

          const content = (
            <>
              <div
                className={cn(
                  'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border',
                  isCompleted
                    ? 'border-[var(--success-border)] bg-[var(--notes-bg)] text-[var(--success)]'
                    : isLocked
                      ? 'border-[var(--card-border)] text-[var(--text-tertiary)]'
                      : 'border-[var(--accent-blue)] bg-[var(--documents-bg)] text-[var(--accent-blue)]'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--text-primary)]">{lesson.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{lesson.objective}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-tertiary)]">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    {lesson.duration_minutes} min
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Target className="h-3.5 w-3.5" />
                    D{lesson.difficulty}
                  </span>
                </div>
              </div>
            </>
          );

          const className = cn(
            'flex w-full items-start gap-3 rounded-[1.15rem] border px-3 py-2.5 text-left transition-colors',
            isLocked
              ? 'cursor-not-allowed border-[var(--card-border)] bg-transparent opacity-60'
              : 'border-[var(--card-border)] bg-transparent hover:border-[var(--card-border-hover)] hover:bg-[var(--bg-elevated)]'
          );

          if (isLocked) {
            return (
              <div key={lesson.id} className={className}>
                {content}
              </div>
            );
          }

          return (
            <Link key={lesson.id} href={`/dashboard/learn/${pathId}/lessons/${lesson.id}`} className={className}>
              {content}
            </Link>
          );
        })}
      </div>
      ) : (
        <div className="mt-3 text-xs text-[var(--text-tertiary)]">
          {unit.lessons.length} lesson{unit.lessons.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  BrainCircuit,
  CircleDot,
  FileText,
  GitBranch,
  MessagesSquare,
  NotebookPen,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

type EvolutionFilter =
  | 'focus'
  | 'rising'
  | 'needs-work'
  | 'verified'
  | 'unverified'
  | 'mastered'
  | 'recent';

interface EvolutionSignals {
  exposure: number;
  depth: number;
  notes: number;
  quiz: number;
  breadth: number;
  recency: number;
}

interface EvolutionTimelinePoint {
  date: string;
  level: number;
  score: number;
  trigger?: string | null;
  signals?: Partial<EvolutionSignals>;
}

interface EvolutionConceptInfo {
  id: string;
  canonical_name: string;
  aliases?: string[];
  domain?: string | null;
  current_level: number;
  current_score: number;
  signal_breakdown?: Partial<EvolutionSignals>;
  document_count?: number;
  note_count?: number;
  quiz_accuracy?: number | null;
  first_seen?: string | null;
  last_updated?: string | null;
  recommendation?: string | null;
}

interface EvolutionConceptSummary {
  concept: EvolutionConceptInfo;
  timeline: EvolutionTimelinePoint[];
}

interface EvolutionTimelineResponse {
  concepts: EvolutionConceptSummary[];
  total_concepts: number;
  domain_summary: Record<string, { avg_level: number; concept_count: number }>;
}

interface ConceptDocument {
  id: string;
  title: string;
  depth_score?: number | null;
  linked_at?: string | null;
}

interface RelatedConcept {
  id: string;
  name: string;
  relationship_type: string;
  strength?: number | null;
}

interface EvolutionConceptDetail {
  concept: EvolutionConceptInfo;
  timeline: EvolutionTimelinePoint[];
  documents: ConceptDocument[];
  related_concepts: RelatedConcept[];
}

interface KnowledgeEvolutionPanelProps {
  evolutionData: EvolutionTimelineResponse;
  onRefresh?: () => Promise<void> | void;
}

type LoopKey = 'documents' | 'notes' | 'quizzes' | 'ai';

const SIGNAL_META: Array<{
  key: keyof EvolutionSignals;
  label: string;
  color: string;
}> = [
  { key: 'exposure', label: 'Exposure', color: 'var(--documents)' },
  { key: 'depth', label: 'Depth', color: 'var(--notes)' },
  { key: 'notes', label: 'Notes', color: 'var(--quizzes)' },
  { key: 'quiz', label: 'Quiz', color: 'var(--career)' },
  { key: 'breadth', label: 'Breadth', color: 'var(--progress)' },
  { key: 'recency', label: 'Recency', color: 'var(--highlight)' },
];

const LOOP_META: Array<{
  key: LoopKey;
  label: string;
  href: string;
  color: string;
  description: string;
  icon: typeof FileText;
}> = [
  {
    key: 'documents',
    label: 'Documents',
    href: '/dashboard/documents',
    color: 'var(--documents)',
    description: 'Uploads and source coverage raise exposure and breadth.',
    icon: FileText,
  },
  {
    key: 'notes',
    label: 'Notes',
    href: '/dashboard/notes',
    color: 'var(--notes)',
    description: 'Notes and rewritten explanations build depth.',
    icon: NotebookPen,
  },
  {
    key: 'quizzes',
    label: 'Quizzes',
    href: '/dashboard/quizzes',
    color: 'var(--quizzes)',
    description: 'Quiz results are your strongest mastery verification.',
    icon: ShieldCheck,
  },
  {
    key: 'ai',
    label: 'AI & Review',
    href: '/dashboard/ask',
    color: 'var(--progress)',
    description: 'Recent questioning and revision keep knowledge active.',
    icon: MessagesSquare,
  },
];

const FILTER_OPTIONS: Array<{ value: EvolutionFilter; label: string }> = [
  { value: 'focus', label: 'Focus concepts' },
  { value: 'rising', label: 'Rising now' },
  { value: 'needs-work', label: 'Needs reinforcement' },
  { value: 'verified', label: 'Verified by quizzes' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'mastered', label: 'Mastered' },
  { value: 'recent', label: 'Recently active' },
];

function normalizeSignals(signals?: Partial<EvolutionSignals> | null): EvolutionSignals {
  return {
    exposure: signals?.exposure ?? 0,
    depth: signals?.depth ?? 0,
    notes: signals?.notes ?? 0,
    quiz: signals?.quiz ?? 0,
    breadth: signals?.breadth ?? 0,
    recency: signals?.recency ?? 0,
  };
}

function formatDateLabel(value?: string | null) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRelativeDate(value?: string | null) {
  if (!value) return 'Recently updated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  const now = Date.now();
  const diffDays = Math.max(0, Math.round((now - date.getTime()) / 86400000));
  if (diffDays === 0) return 'Updated today';
  if (diffDays === 1) return 'Updated yesterday';
  if (diffDays < 7) return `Updated ${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7) || 1;
    return `Updated ${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }
  return `Updated ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function getConfidenceScore(signals: EvolutionSignals) {
  return Math.round(
    (
      signals.exposure * 0.2 +
      signals.depth * 0.24 +
      signals.notes * 0.18 +
      signals.quiz * 0.22 +
      signals.breadth * 0.1 +
      signals.recency * 0.06
    ) * 100
  );
}

function getMomentum(summary: EvolutionConceptSummary) {
  const timeline = summary.timeline || [];
  if (timeline.length < 2) {
    return {
      label: 'new',
      deltaLevel: 0,
      deltaScore: 0,
      icon: Sparkles,
      tone: 'info' as const,
    };
  }

  const current = timeline[timeline.length - 1];
  const previous = timeline[timeline.length - 2];
  const deltaLevel = current.level - previous.level;
  const deltaScore = current.score - previous.score;

  if (deltaLevel > 0 || deltaScore >= 0.08) {
    return {
      label: 'rising',
      deltaLevel,
      deltaScore,
      icon: TrendingUp,
      tone: 'success' as const,
    };
  }

  if (deltaLevel < 0 || deltaScore <= -0.08) {
    return {
      label: 'falling',
      deltaLevel,
      deltaScore,
      icon: TrendingDown,
      tone: 'error' as const,
    };
  }

  return {
    label: 'steady',
    deltaLevel,
    deltaScore,
    icon: CircleDot,
    tone: 'warning' as const,
  };
}

function getVelocity(summary?: EvolutionConceptSummary | null) {
  if (!summary?.timeline?.length || summary.timeline.length < 2) return 0;
  const first = summary.timeline[0];
  const last = summary.timeline[summary.timeline.length - 1];
  const start = new Date(first.date).getTime();
  const end = new Date(last.date).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return 0;
  }
  const days = Math.max(1, Math.round((end - start) / 86400000));
  return Number(((last.level - first.level) / days).toFixed(2));
}

function getLevelVariant(level: number) {
  if (level >= 4) return 'success' as const;
  if (level >= 3) return 'info' as const;
  if (level >= 2) return 'warning' as const;
  return 'default' as const;
}

function getFilterMatch(summary: EvolutionConceptSummary, filter: EvolutionFilter) {
  const signals = normalizeSignals(summary.concept.signal_breakdown);
  const momentum = getMomentum(summary);

  switch (filter) {
    case 'rising':
      return momentum.label === 'rising';
    case 'needs-work':
      return summary.concept.current_level <= 2 || getConfidenceScore(signals) < 45;
    case 'verified':
      return signals.quiz >= 0.5;
    case 'unverified':
      return signals.quiz === 0;
    case 'mastered':
      return summary.concept.current_level >= 4;
    case 'recent':
      return signals.recency >= 0.7;
    case 'focus':
    default:
      return true;
  }
}

function getWeakestSignal(signals: EvolutionSignals) {
  return SIGNAL_META.filter((item) => item.key !== 'recency').sort(
    (a, b) => signals[a.key] - signals[b.key]
  )[0];
}

function getActionLabel(concept: EvolutionConceptInfo, signals: EvolutionSignals) {
  if (concept.recommendation) return concept.recommendation;
  const weakest = getWeakestSignal(signals);
  if (!weakest) return 'Keep reinforcing this concept with fresh examples.';
  if (weakest.key === 'quiz') return 'Use a quiz to verify this concept under recall pressure.';
  if (weakest.key === 'notes') return 'Write notes in your own words to consolidate this concept.';
  if (weakest.key === 'exposure') return 'Read another source where this concept appears in a different context.';
  if (weakest.key === 'breadth') return 'Connect this concept to related topics across your materials.';
  return 'Revisit this concept in the AI assistant and compare it with a new example.';
}

function summarizeTrigger(trigger?: string | null) {
  switch (trigger) {
    case 'document_upload':
      return 'Raised by document intake';
    case 'quiz_attempt':
      return 'Moved by quiz evidence';
    case 'note_update':
      return 'Strengthened through notes';
    case 'manual_recalculate':
      return 'Refreshed from the full evidence stack';
    default:
      return 'Updated from your study activity';
  }
}

function getSignalChangeSummary(current: EvolutionTimelinePoint, previous?: EvolutionTimelinePoint) {
  if (!previous) {
    return 'First recorded checkpoint for this concept.';
  }

  const currentSignals = normalizeSignals(current.signals);
  const previousSignals = normalizeSignals(previous.signals);
  const changes = SIGNAL_META.map((item) => ({
    label: item.label,
    delta: currentSignals[item.key] - previousSignals[item.key],
  }))
    .filter((item) => Math.abs(item.delta) >= 0.05)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  if (!changes.length) {
    return 'Signals stayed broadly stable at this checkpoint.';
  }

  return changes
    .slice(0, 2)
    .map((item) => `${item.label} ${item.delta > 0 ? 'rose' : 'fell'} by ${Math.abs(item.delta).toFixed(2)}`)
    .join(' • ');
}

function getLoopScore(signals: EvolutionSignals, key: LoopKey) {
  switch (key) {
    case 'documents':
      return (signals.exposure + signals.breadth) / 2;
    case 'notes':
      return (signals.depth + signals.notes) / 2;
    case 'quizzes':
      return signals.quiz;
    case 'ai':
      return signals.recency;
    default:
      return 0;
  }
}

function getLoopCta(key: LoopKey) {
  switch (key) {
    case 'documents':
      return 'Open Documents';
    case 'notes':
      return 'Open Notes';
    case 'quizzes':
      return 'Open Quizzes';
    case 'ai':
      return 'Open AI Assistant';
    default:
      return 'Open';
  }
}

function getStoryLead(
  concept: EvolutionConceptInfo,
  summary: EvolutionConceptSummary | null,
  weakestSignal?: { label: string } | undefined
) {
  const velocity = getVelocity(summary);
  const momentum = summary ? getMomentum(summary) : null;
  const parts = [
    `${concept.canonical_name} is currently sitting at Level ${concept.current_level}.`,
  ];

  if (momentum?.label === 'rising') {
    parts.push('It is moving upward right now.');
  } else if (momentum?.label === 'falling') {
    parts.push('It has started to cool down and needs reinforcement.');
  } else if (momentum?.label === 'steady') {
    parts.push('It is stable, but not expanding quickly.');
  }

  if (velocity > 0) {
    parts.push(`Your learning velocity is ${velocity.toFixed(2)} levels per day across the tracked checkpoints.`);
  }

  if (weakestSignal) {
    parts.push(`${weakestSignal.label} is the weakest part of the loop right now.`);
  }

  return parts.join(' ');
}

export function KnowledgeEvolutionPanel({
  evolutionData,
  onRefresh,
}: KnowledgeEvolutionPanelProps) {
  const [conceptQuery, setConceptQuery] = useState('');
  const [filter, setFilter] = useState<EvolutionFilter>('focus');
  const [domainFilter, setDomainFilter] = useState('all');
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [selectedConceptDetail, setSelectedConceptDetail] = useState<EvolutionConceptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const allConcepts = Array.isArray(evolutionData?.concepts) ? evolutionData.concepts : [];
  const domainOptions = Array.from(
    new Set(allConcepts.map((item) => item.concept?.domain || 'General'))
  ).sort();

  const visibleConcepts = useMemo(() => {
    return allConcepts
      .filter((item) => {
        const concept = item.concept;
        if (!concept) return false;

        const matchesQuery =
          !conceptQuery.trim() ||
          concept.canonical_name.toLowerCase().includes(conceptQuery.toLowerCase()) ||
          (concept.aliases || []).some((alias) =>
            alias.toLowerCase().includes(conceptQuery.toLowerCase())
          );

        const matchesDomain =
          domainFilter === 'all' || (concept.domain || 'General') === domainFilter;

        return matchesQuery && matchesDomain && getFilterMatch(item, filter);
      })
      .sort((a, b) => {
        const momentumDiff = getMomentum(b).deltaScore - getMomentum(a).deltaScore;
        if (filter === 'recent') {
          return (b.concept.last_updated || '').localeCompare(a.concept.last_updated || '');
        }
        if (filter === 'mastered') {
          return b.concept.current_level - a.concept.current_level || momentumDiff;
        }
        return momentumDiff || b.concept.current_level - a.concept.current_level;
      });
  }, [allConcepts, conceptQuery, domainFilter, filter]);

  const fallbackConcept = visibleConcepts[0] || allConcepts[0] || null;
  const selectedConceptSummary =
    allConcepts.find((item) => item.concept?.id === selectedConceptId) || fallbackConcept;

  const topDomainEntry = Object.entries(evolutionData.domain_summary || {}).sort(
    (a, b) => (b[1]?.concept_count || 0) - (a[1]?.concept_count || 0)
  )[0];

  const averageLevel = allConcepts.length
    ? (
        allConcepts.reduce((acc, item) => acc + (item.concept?.current_level || 0), 0) /
        allConcepts.length
      ).toFixed(1)
    : '0.0';

  const risingCount = allConcepts.filter((item) => getMomentum(item).label === 'rising').length;
  const reinforcementCount = allConcepts.filter((item) => {
    const signals = normalizeSignals(item.concept?.signal_breakdown);
    return item.concept?.current_level <= 2 || getConfidenceScore(signals) < 45;
  }).length;

  const systemLoopAverages = useMemo(() => {
    if (!allConcepts.length) {
      return {
        documents: 0,
        notes: 0,
        quizzes: 0,
        ai: 0,
      };
    }

    const totals = allConcepts.reduce(
      (acc, item) => {
        const signals = normalizeSignals(item.concept.signal_breakdown);
        acc.documents += getLoopScore(signals, 'documents');
        acc.notes += getLoopScore(signals, 'notes');
        acc.quizzes += getLoopScore(signals, 'quizzes');
        acc.ai += getLoopScore(signals, 'ai');
        return acc;
      },
      { documents: 0, notes: 0, quizzes: 0, ai: 0 }
    );

    return {
      documents: totals.documents / allConcepts.length,
      notes: totals.notes / allConcepts.length,
      quizzes: totals.quizzes / allConcepts.length,
      ai: totals.ai / allConcepts.length,
    };
  }, [allConcepts]);

  useEffect(() => {
    if (!allConcepts.length) {
      setSelectedConceptId(null);
      return;
    }

    if (selectedConceptId && allConcepts.some((item) => item.concept?.id === selectedConceptId)) {
      return;
    }

    if (fallbackConcept?.concept?.id) {
      setSelectedConceptId(fallbackConcept.concept.id);
    }
  }, [selectedConceptId, fallbackConcept, allConcepts]);

  useEffect(() => {
    if (!selectedConceptId) {
      setSelectedConceptDetail(null);
      return;
    }

    let active = true;

    const loadConceptDetail = async () => {
      try {
        setDetailLoading(true);
        const detail = await api.getEvolutionConceptDetail(selectedConceptId);
        if (active) {
          setSelectedConceptDetail(detail);
        }
      } catch (error: any) {
        if (!active) return;
        setSelectedConceptDetail(null);
        toast.error(error?.response?.data?.detail || 'Failed to load concept detail');
      } finally {
        if (active) {
          setDetailLoading(false);
        }
      }
    };

    loadConceptDetail();

    return () => {
      active = false;
    };
  }, [selectedConceptId]);

  const selectedConcept = selectedConceptDetail?.concept || selectedConceptSummary?.concept || null;
  const selectedTimeline =
    (selectedConceptDetail?.timeline && selectedConceptDetail.timeline.length
      ? selectedConceptDetail.timeline
      : selectedConceptSummary?.timeline) || [];
  const selectedSignals = normalizeSignals(selectedConcept?.signal_breakdown);
  const selectedDocuments = selectedConceptDetail?.documents || [];
  const selectedRelated = selectedConceptDetail?.related_concepts || [];
  const selectedMomentum = selectedConceptSummary ? getMomentum(selectedConceptSummary) : null;
  const confidenceScore = selectedConcept ? getConfidenceScore(selectedSignals) : 0;
  const weakestSignal = getWeakestSignal(selectedSignals);
  const evidenceCount =
    selectedDocuments.length +
    (selectedSignals.notes > 0 ? 1 : 0) +
    (selectedSignals.quiz > 0 ? 1 : 0);
  const selectedVelocity = getVelocity(selectedConceptSummary);

  const focusConcepts = visibleConcepts.slice(0, 12);

  const timelineChartData = selectedTimeline.map((point) => ({
    date: formatDateLabel(point.date),
    level: point.level,
    score: Math.round(point.score * 100),
  }));

  const timelineMoments = [...selectedTimeline]
    .reverse()
    .slice(0, 4)
    .map((point, index, reversed) => {
      const originalIndex = selectedTimeline.length - 1 - index;
      const previous = originalIndex > 0 ? selectedTimeline[originalIndex - 1] : undefined;
      return {
        point,
        previous,
        key: `${point.date}-${index}`,
        isLast: index === reversed.length - 1,
      };
    });

  const selectedLoopCards = LOOP_META.map((item) => ({
    ...item,
    score: getLoopScore(selectedSignals, item.key),
    libraryAverage: systemLoopAverages[item.key],
  }));

  const conceptWatchlist = visibleConcepts.slice(0, 8);

  const domainCards = Object.entries(evolutionData.domain_summary || {})
    .sort((a, b) => (b[1]?.concept_count || 0) - (a[1]?.concept_count || 0))
    .map(([domain, info]) => ({
      domain,
      avgLevel: info.avg_level,
      conceptCount: info.concept_count,
      concepts: allConcepts
        .filter((item) => (item.concept.domain || 'General') === domain)
        .slice(0, 4)
        .map((item) => item.concept),
    }));

  const handleRecalculate = async () => {
    try {
      setRecalculating(true);
      await api.recalculateEvolution();
      if (onRefresh) {
        await onRefresh();
      }
      toast.success('Knowledge evolution recalculated');
    } catch (error: any) {
      toast.error(error?.response?.data?.detail || 'Failed to recalculate knowledge evolution');
    } finally {
      setRecalculating(false);
    }
  };

  if (!allConcepts.length) {
    return null;
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[var(--progress)]">
            <GitBranch className="h-4 w-4" />
            <span className="text-sm font-medium tracking-[0.14em] uppercase">
              Knowledge Evolution
            </span>
          </div>
          <h2 className="mt-2 font-serif text-3xl tracking-[-0.04em] text-[var(--text-primary)]">
            Progress that explains the rest of the app
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
            Documents create exposure, Notes add depth, Quizzes verify mastery, and AI keeps
            concepts warm. This view shows how those other tabs change actual understanding over
            time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info" size="lg">
            {evolutionData.total_concepts} tracked
          </Badge>
          {topDomainEntry && (
            <Badge variant="documents" size="lg">
              Largest cluster: {topDomainEntry[0]}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRecalculate}
            isLoading={recalculating}
          >
            <Sparkles className="h-4 w-4" />
            Recalculate
          </Button>
        </div>
      </div>

      <Card variant="glow" hover="none" padding="none" className="overflow-hidden">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[1.1fr_.9fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricStrip
                label="Tracked concepts"
                value={String(evolutionData.total_concepts)}
                helpText="Active knowledge units from your material"
                tone="var(--documents)"
              />
              <MetricStrip
                label="Average mastery"
                value={averageLevel}
                helpText="Current mean level across concepts"
                tone="var(--notes)"
              />
              <MetricStrip
                label="Needs reinforcement"
                value={String(reinforcementCount)}
                helpText="Low confidence or low mastery concepts"
                tone="var(--warning)"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  value={conceptQuery}
                  onChange={(event) => setConceptQuery(event.target.value)}
                  placeholder="Search concept, alias, or domain"
                  className="pl-11"
                />
              </div>

              <Select value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}>
                <option value="all">All domains</option>
                {domainOptions.map((domain) => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              {FILTER_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="xs"
                  variant={filter === option.value ? 'default' : 'outline'}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <LoopOverviewCard
              label="Documents"
              value={systemLoopAverages.documents}
              tone="var(--documents)"
              description="How much your library is broadening concepts."
              icon={FileText}
            />
            <LoopOverviewCard
              label="Notes"
              value={systemLoopAverages.notes}
              tone="var(--notes)"
              description="How much rewritten understanding is being captured."
              icon={NotebookPen}
            />
            <LoopOverviewCard
              label="Quizzes"
              value={systemLoopAverages.quizzes}
              tone="var(--quizzes)"
              description="How much recall is actually being verified."
              icon={ShieldCheck}
            />
            <LoopOverviewCard
              label="AI & Review"
              value={systemLoopAverages.ai}
              tone="var(--progress)"
              description="How warm your concepts stay after asking and revising."
              icon={BrainCircuit}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl tracking-[-0.03em] text-[var(--text-primary)]">
              Focus concepts
            </h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Pick a concept to inspect how your work across tabs moved it.
            </p>
          </div>
          <Badge variant="warning" size="lg">
            {risingCount} rising now
          </Badge>
        </div>

        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max gap-3">
            {focusConcepts.map((item) => {
              const concept = item.concept;
              const momentum = getMomentum(item);
              const MomentumIcon = momentum.icon;
              const selected = selectedConceptId === concept.id;
              const confidence = getConfidenceScore(normalizeSignals(concept.signal_breakdown));

              return (
                <button
                  key={concept.id}
                  type="button"
                  onClick={() => setSelectedConceptId(concept.id)}
                  className={cn(
                    'w-[17rem] rounded-[1.5rem] border px-4 py-4 text-left transition-all duration-200',
                    selected
                      ? 'border-[var(--accent-blue)] bg-[var(--primary-subtle)] shadow-[var(--shadow-glow-blue)]'
                      : 'border-[var(--card-border)] bg-[var(--bg-elevated)] hover:border-[var(--card-border-hover)] hover:-translate-y-0.5'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-[var(--text-primary)]">
                        {concept.canonical_name}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {concept.domain || 'General'}
                      </p>
                    </div>
                    <Badge variant={getLevelVariant(concept.current_level)} size="sm">
                      L{concept.current_level}
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1">
                      <MomentumIcon className="h-3.5 w-3.5" />
                      {momentum.label}
                    </span>
                    <span>{confidence}% confidence</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card variant="glow" hover="none" padding="none" className="xl:col-span-8 overflow-hidden">
          {selectedConcept ? (
            <>
              <CardHeader className="space-y-4 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="info" size="sm">
                        Selected concept
                      </Badge>
                      {selectedConcept.domain && (
                        <Badge variant="default" size="sm">
                          {selectedConcept.domain}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-4xl">{selectedConcept.canonical_name}</CardTitle>
                    <CardDescription className="max-w-3xl text-sm leading-7">
                      {getStoryLead(selectedConcept, selectedConceptSummary, weakestSignal)}
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getLevelVariant(selectedConcept.current_level)} size="lg">
                      Mastery L{selectedConcept.current_level}
                    </Badge>
                    <Badge variant={selectedMomentum?.tone || 'default'} size="lg">
                      {selectedMomentum?.label || 'steady'}
                    </Badge>
                    <Badge
                      variant={
                        confidenceScore >= 70
                          ? 'success'
                          : confidenceScore >= 45
                            ? 'warning'
                            : 'error'
                      }
                      size="lg"
                    >
                      Confidence {confidenceScore}%
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricPill
                    label="Learning velocity"
                    value={selectedVelocity > 0 ? `+${selectedVelocity.toFixed(2)}` : 'Stable'}
                    helper="Levels gained per day across checkpoints"
                    tone="var(--progress)"
                  />
                  <MetricPill
                    label="Evidence"
                    value={`${evidenceCount}`}
                    helper="Documents + notes + quizzes feeding this score"
                    tone="var(--documents)"
                  />
                  <MetricPill
                    label="Weakest loop"
                    value={weakestSignal?.label || '—'}
                    helper="Best place to intervene next"
                    tone="var(--warning)"
                  />
                  <MetricPill
                    label="Last touch"
                    value={formatDateLabel(selectedConcept.last_updated)}
                    helper={formatRelativeDate(selectedConcept.last_updated)}
                    tone="var(--notes)"
                  />
                </div>
              </CardHeader>

              <CardContent className="space-y-5 p-6 pt-0">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {selectedLoopCards.map((item) => (
                    <LoopLaneCard
                      key={item.key}
                      label={item.label}
                      description={item.description}
                      href={item.href}
                      score={item.score}
                      libraryAverage={item.libraryAverage}
                      tone={item.color}
                      icon={item.icon}
                      isWeakest={weakestSignal?.label.toLowerCase() === item.label.toLowerCase()}
                    />
                  ))}
                </div>

                <div className="rounded-[1.5rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        What changed over time
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Every checkpoint is a proof point from uploads, notes, quizzes, or recalculation.
                      </p>
                    </div>
                    <Badge variant="documents" size="sm">
                      {selectedTimeline.length} checkpoints
                    </Badge>
                  </div>

                  {detailLoading ? (
                    <div className="flex min-h-[16rem] items-center justify-center">
                      <LoadingSpinner size="lg" />
                    </div>
                  ) : selectedTimeline.length ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={timelineChartData}>
                        <defs>
                          <linearGradient id="evolutionArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.34} />
                            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                        <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} />
                        <YAxis
                          domain={[1, 5]}
                          ticks={[1, 2, 3, 4, 5]}
                          stroke="var(--text-muted)"
                          fontSize={11}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--card-bg-solid)',
                            border: '1px solid var(--card-border)',
                            borderRadius: '16px',
                            fontSize: '12px',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="level"
                          stroke="var(--primary)"
                          fill="url(#evolutionArea)"
                          strokeWidth={3}
                          dot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="rounded-[1.4rem] border border-dashed border-[var(--card-border)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
                      This concept only has one checkpoint so far. More work in other tabs will build the timeline.
                    </div>
                  )}
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex min-h-[18rem] items-center justify-center text-sm text-[var(--text-secondary)]">
              Select a concept from the rail to inspect its evolution.
            </CardContent>
          )}
        </Card>

        <Card variant="elevated" hover="none" padding="none" className="xl:col-span-4 overflow-hidden">
          <CardHeader className="space-y-3 p-6">
            <div className="flex items-center gap-2 text-[var(--progress)]">
              <BrainCircuit className="h-4 w-4" />
              <span className="text-sm font-medium tracking-[0.14em] uppercase">
                Cross-tab loop
              </span>
            </div>
            <CardTitle className="text-2xl">How this concept actually improves</CardTitle>
            <CardDescription className="leading-7">
              This is the learning loop your other tabs are contributing to. Weak sections tell you
              exactly where to go next.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 p-6 pt-0">
            {selectedLoopCards.map((item, index) => (
              <div
                key={item.key}
                className={cn(
                  'rounded-[1.35rem] border p-4',
                  weakestSignal?.label.toLowerCase() === item.label.toLowerCase()
                    ? 'border-[var(--warning-border)] bg-[var(--warning-bg)]'
                    : 'border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)]'
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)', color: item.color }}
                  >
                    <item.icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {index + 1}. {item.label}
                        </span>
                        {weakestSignal?.label.toLowerCase() === item.label.toLowerCase() && (
                          <Badge variant="warning" size="sm">
                            Weakest link
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs font-medium text-[var(--text-secondary)]">
                        {Math.round(item.score * 100)}%
                      </span>
                    </div>

                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                      {item.description}
                    </p>

                    <div className="mt-3">
                      <SignalBar
                        label="Current"
                        value={item.score}
                        color={item.color}
                        compact
                      />
                      <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                        <span>Library average {Math.round(item.libraryAverage * 100)}%</span>
                        <Link
                          href={item.href}
                          className="inline-flex items-center gap-1 font-medium text-[var(--primary)]"
                        >
                          {getLoopCta(item.key)}
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card variant="elevated" hover="none" padding="none" className="xl:col-span-7 overflow-hidden">
          <CardHeader className="space-y-3 p-6">
            <CardTitle className="text-2xl">Evidence trail</CardTitle>
            <CardDescription>
              Use the last few checkpoints to explain exactly why the level moved.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-6 pt-0">
            {detailLoading ? (
              <div className="flex min-h-[12rem] items-center justify-center">
                <LoadingSpinner size="lg" />
              </div>
            ) : timelineMoments.length ? (
              timelineMoments.map(({ point, previous, key, isLast }) => {
                const deltaLevel = previous ? point.level - previous.level : 0;
                const deltaScore = previous ? point.score - previous.score : point.score;

                return (
                  <div key={key} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-subtle)] text-sm font-semibold text-[var(--primary)]">
                        {point.level}
                      </div>
                      {!isLast && <div className="mt-2 h-full w-px bg-[var(--card-border)]" />}
                    </div>

                    <div className="flex-1 rounded-[1.3rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_76%,transparent)] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {summarizeTrigger(point.trigger)}
                          </p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {formatDateLabel(point.date)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {deltaLevel !== 0 && (
                            <Badge variant={deltaLevel > 0 ? 'success' : 'warning'} size="sm">
                              {deltaLevel > 0 ? '+' : ''}
                              {deltaLevel} level
                            </Badge>
                          )}
                          <Badge variant="default" size="sm">
                            Score {(point.score * 100).toFixed(0)}%
                          </Badge>
                        </div>
                      </div>

                      <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                        {getSignalChangeSummary(point, previous)}
                      </p>

                      <p className="mt-2 text-xs text-[var(--text-muted)]">
                        Score shift {deltaScore >= 0 ? '+' : ''}
                        {(deltaScore * 100).toFixed(0)} points.
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[1.25rem] border border-dashed border-[var(--card-border)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                No checkpoint history is available for this concept yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card variant="elevated" hover="none" padding="none" className="xl:col-span-5 overflow-hidden">
          <CardHeader className="space-y-3 p-6">
            <CardTitle className="text-2xl">Sources and connections</CardTitle>
            <CardDescription>
              Evidence comes from linked documents first, then from concept relationships.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-6 pt-0">
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Linked documents
              </p>
              {selectedDocuments.length ? (
                selectedDocuments.slice(0, 4).map((document) => (
                  <Link
                    key={document.id}
                    href={`/dashboard/documents/${document.id}`}
                    className="block rounded-[1.2rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4 transition-all duration-200 hover:border-[var(--card-border-hover)] hover:-translate-y-0.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-[var(--documents)]" />
                          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                            {document.title}
                          </p>
                        </div>
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                          Linked {formatDateLabel(document.linked_at || selectedConcept?.last_updated)}
                        </p>
                      </div>
                      <Badge variant="documents" size="sm">
                        Depth {Math.round((document.depth_score || 0) * 100)}%
                      </Badge>
                    </div>
                  </Link>
                ))
              ) : (
                <div className="rounded-[1.2rem] border border-dashed border-[var(--card-border)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                  No linked documents recorded for this concept yet.
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Connected concepts
              </p>
              {selectedRelated.length ? (
                selectedRelated.slice(0, 5).map((related) => (
                  <div
                    key={related.id}
                    className="flex items-center justify-between rounded-[1.1rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-[var(--progress)]" />
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                          {related.name}
                        </p>
                      </div>
                      <p className="mt-1 text-xs capitalize text-[var(--text-muted)]">
                        {related.relationship_type.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <Badge variant="info" size="sm">
                      {(related.strength || 0).toFixed(2)}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.2rem] border border-dashed border-[var(--card-border)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                  No related concepts have been recorded yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card variant="elevated" hover="none" padding="none">
          <CardHeader className="space-y-3 p-6">
            <CardTitle className="text-2xl">Domain clusters</CardTitle>
            <CardDescription>
              Keep unrelated PDFs separated and inspect concept groups by subject.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-6 pt-0">
            {domainCards.map((domain) => (
              <Collapsible key={domain.domain} defaultOpen={domain.domain === topDomainEntry?.[0]}>
                <div className="rounded-[1.25rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)]">
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">{domain.domain}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {domain.conceptCount} concepts • average level {domain.avgLevel}
                      </p>
                    </div>
                    <Badge variant="default" size="sm">
                      Expand
                    </Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-[var(--card-border)] px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        {domain.concepts.map((concept) => (
                          <button
                            key={concept.id}
                            type="button"
                            onClick={() => setSelectedConceptId(concept.id)}
                            className={cn(
                              'rounded-full border px-3 py-1.5 text-xs transition-all duration-200',
                              selectedConceptId === concept.id
                                ? 'border-[var(--accent-blue)] bg-[var(--primary-subtle)] text-[var(--primary)]'
                                : 'border-[var(--card-border)] text-[var(--text-secondary)] hover:border-[var(--card-border-hover)] hover:text-[var(--text-primary)]'
                            )}
                          >
                            {concept.canonical_name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </CardContent>
        </Card>

        <Card variant="elevated" hover="none" padding="none">
          <CardHeader className="space-y-3 p-6">
            <CardTitle className="text-2xl">Concept watchlist</CardTitle>
            <CardDescription>
              A compact board of the concepts most likely to benefit from your next action.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 p-6 pt-0 sm:grid-cols-2">
            {conceptWatchlist.map((item) => {
              const concept = item.concept;
              const signals = normalizeSignals(concept.signal_breakdown);
              const weakest = getWeakestSignal(signals);
              const momentum = getMomentum(item);
              const confidence = getConfidenceScore(signals);
              const cta =
                weakest?.label === 'Quiz'
                  ? '/dashboard/quizzes'
                  : weakest?.label === 'Notes'
                    ? '/dashboard/notes'
                    : weakest?.label === 'Exposure' || weakest?.label === 'Breadth'
                      ? '/dashboard/documents'
                      : '/dashboard/ask';

              return (
                <div
                  key={concept.id}
                  className="rounded-[1.25rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_76%,transparent)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-[var(--text-primary)]">
                        {concept.canonical_name}
                      </p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {concept.domain || 'General'}
                      </p>
                    </div>
                    <Badge variant={getLevelVariant(concept.current_level)} size="sm">
                      L{concept.current_level}
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                    <span className="capitalize">{momentum.label}</span>
                    <span>{confidence}% confidence</span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
                    {getActionLabel(concept, signals)}
                  </p>

                  <CardFooter className="mt-4 flex items-center justify-between px-0 pt-3">
                    <Badge variant="warning" size="sm">
                      Weakest: {weakest?.label || 'Recency'}
                    </Badge>
                    <Link
                      href={cta}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)]"
                    >
                      Open next step
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </CardFooter>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function SignalBar({
  label,
  value,
  color,
  compact = false,
}: {
  label: string;
  value: number;
  color: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('space-y-1.5', compact && 'space-y-1')}>
      <div className="flex items-center justify-between text-sm text-[var(--text-secondary)]">
        <span>{label}</span>
        <span className="text-xs text-[var(--text-muted)]">{Math.round(value * 100)}%</span>
      </div>
      <div className={cn('rounded-full bg-[var(--bg-secondary)]', compact ? 'h-1.5' : 'h-2')}>
        <div
          className={cn('rounded-full transition-all', compact ? 'h-1.5' : 'h-2')}
          style={{ width: `${Math.max(3, value * 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_76%,transparent)] p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold" style={{ color: tone }}>
        {value}
      </p>
      <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">{helper}</p>
    </div>
  );
}

function MetricStrip({
  label,
  value,
  helpText,
  tone,
}: {
  label: string;
  value: string;
  helpText: string;
  tone: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold" style={{ color: tone }}>
        {value}
      </p>
      <p className="mt-2 text-xs leading-6 text-[var(--text-secondary)]">{helpText}</p>
    </div>
  );
}

function LoopOverviewCard({
  label,
  value,
  tone,
  description,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: string;
  description: string;
  icon: typeof FileText;
}) {
  return (
    <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold" style={{ color: tone }}>
            {Math.round(value * 100)}%
          </p>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-2xl"
          style={{ backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)', color: tone }}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-6 text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}

function LoopLaneCard({
  label,
  description,
  href,
  score,
  libraryAverage,
  tone,
  icon: Icon,
  isWeakest,
}: {
  label: string;
  description: string;
  href: string;
  score: number;
  libraryAverage: number;
  tone: string;
  icon: typeof FileText;
  isWeakest: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-[1.35rem] border p-4',
        isWeakest
          ? 'border-[var(--warning-border)] bg-[var(--warning-bg)]'
          : 'border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_76%,transparent)]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)', color: tone }}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
        <Badge variant={isWeakest ? 'warning' : 'default'} size="sm">
          {Math.round(score * 100)}%
        </Badge>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      </div>

      <div className="mt-4">
        <SignalBar label="Contribution" value={score} color={tone} compact />
        <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>Library average {Math.round(libraryAverage * 100)}%</span>
          <Link href={href} className="inline-flex items-center gap-1 font-medium text-[var(--primary)]">
            Open
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

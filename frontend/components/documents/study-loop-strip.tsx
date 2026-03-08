'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  type StudyLoopCounts,
  getStudyLoopCompletion,
  getStudyLoopNextStep,
  getStudyLoopSteps,
} from '@/lib/study-loop';

interface StudyLoopStripProps {
  readyForGeneration: boolean;
  counts: StudyLoopCounts;
  compact?: boolean;
  title?: string;
  className?: string;
  actionSlot?: ReactNode;
}

const STEP_ICONS = {
  source: FileText,
  summary: Sparkles,
  notes: BookOpen,
  quiz: ClipboardCheck,
  verify: Target,
} as const;

export function StudyLoopStrip({
  readyForGeneration,
  counts,
  compact = false,
  title = 'Study loop',
  className,
  actionSlot,
}: StudyLoopStripProps) {
  const steps = getStudyLoopSteps(readyForGeneration, counts);
  const nextStep = getStudyLoopNextStep(readyForGeneration, counts);
  const completion = getStudyLoopCompletion(readyForGeneration, counts);

  return (
    <div
      className={cn(
        'rounded-[1.4rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_76%,transparent)]',
        compact ? 'p-3.5' : 'p-5',
        className
      )}
    >
      <div className={cn('flex items-start gap-3', compact ? 'flex-col' : 'flex-col lg:flex-row lg:items-center lg:justify-between')}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
            {title}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className={cn('font-medium text-[var(--text-primary)]', compact ? 'text-sm' : 'text-base')}>
              {nextStep.label}
            </p>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-blue-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-blue)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {completion}% complete
            </span>
          </div>
          <p className={cn('mt-2 text-[var(--text-secondary)]', compact ? 'text-xs leading-5' : 'text-sm leading-6')}>
            {nextStep.description}
          </p>
        </div>

        {!compact && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            <StatPill label="Summaries" value={counts.summaries} />
            <StatPill label="Notes" value={counts.notes} />
            <StatPill label="Quizzes" value={counts.quizzes} />
            <StatPill label="Attempts" value={counts.quizAttempts} />
          </div>
        )}
      </div>

      <div className={cn('mt-4 grid gap-2', compact ? 'grid-cols-2 xl:grid-cols-5' : 'grid-cols-1 md:grid-cols-5')}>
        {steps.map((step) => {
          const Icon = STEP_ICONS[step.key as keyof typeof STEP_ICONS];
          return (
            <div
              key={step.key}
              className={cn(
                'rounded-[1rem] border px-3 py-3 transition-colors',
                step.done
                  ? 'border-[var(--success-border)] bg-[var(--success-bg)]'
                  : step.active
                    ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-subtle)]'
                    : 'border-[var(--card-border)] bg-[var(--bg-secondary)]'
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full',
                    step.done
                      ? 'bg-[color:color-mix(in_srgb,var(--success)_16%,transparent)] text-[var(--success)]'
                      : step.active
                        ? 'bg-[color:color-mix(in_srgb,var(--accent-blue)_18%,transparent)] text-[var(--accent-blue)]'
                        : 'bg-[var(--accent)] text-[var(--text-tertiary)]'
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)]">
                    {step.label}
                  </p>
                </div>
              </div>
              {!compact && (
                <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
                  {step.description}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {!compact && actionSlot ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--card-border)] pt-4">
          {actionSlot}
        </div>
      ) : null}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-full border border-[var(--card-border)] bg-[var(--bg-secondary)] px-2.5 py-1">
      {value} {label}
    </span>
  );
}

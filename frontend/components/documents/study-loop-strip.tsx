'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2 } from 'lucide-react';
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
        compact ? 'p-3.5' : 'p-4',
        className
      )}
    >
      <div className={cn('flex items-start gap-3', compact ? 'flex-col' : 'flex-col lg:flex-row lg:items-center lg:justify-between')}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
            {title}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-blue-subtle)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-blue)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {completion}% done
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--card-border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)]">
              Next: {nextStep.label}
            </span>
          </div>
          {!compact && (
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {nextStep.description}
            </p>
          )}
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

      <div className="mt-4 overflow-x-auto">
        <div className={cn('relative grid min-w-[420px] grid-cols-5 gap-0', !compact && 'min-w-0')}>
          <div className="absolute left-[10%] right-[10%] top-5 h-px bg-[var(--card-border)]" />
          {steps.map((step, index) => (
            <div key={step.key} className="relative z-10 flex flex-col items-center px-1 text-center">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-colors',
                  step.done
                    ? 'border-transparent bg-[var(--text-primary)] text-[var(--bg-primary)]'
                    : step.active
                      ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'border-[var(--card-border)] bg-[var(--bg-secondary)] text-[var(--text-tertiary)]'
                )}
              >
                {index + 1}
              </div>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-primary)]">
                {step.label}
              </p>
              {!compact && (
                <p className="mt-1 max-w-[8rem] text-[11px] leading-4 text-[var(--text-secondary)]">
                  {step.description}
                </p>
              )}
            </div>
          ))}
        </div>
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

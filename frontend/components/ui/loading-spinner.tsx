'use client';

import { Loader2, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({ size = 'md', className, fullScreen = false }: LoadingSpinnerProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  const spinner = (
    <span
      className={cn(
        'relative inline-flex items-center justify-center rounded-full border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_82%,transparent)] text-[var(--primary)] shadow-[var(--card-shadow)]',
        size === 'sm' && 'h-7 w-7',
        size === 'md' && 'h-10 w-10',
        size === 'lg' && 'h-14 w-14',
        className
      )}
    >
      <Loader2 className={cn('animate-spin', sizes[size])} />
    </span>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm z-50">
        {spinner}
      </div>
    );
  }

  return spinner;
}

// Skeleton loader for content
interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'skeleton',
        className
      )}
    />
  );
}

// Page loading state
export function PageLoader() {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-5">
      <div className="relative">
        <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.8rem] border border-[var(--card-border)] bg-[linear-gradient(135deg,var(--primary-light),color-mix(in_srgb,var(--bg-elevated)_72%,transparent))] shadow-[var(--shadow-glow-blue)]">
          <GraduationCap className="h-8 w-8 text-[var(--primary)]" />
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--bg-primary)] bg-[var(--bg-elevated)]">
          <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)]" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
          Preparing workspace
        </p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Loading your content...</p>
      </div>
    </div>
  );
}

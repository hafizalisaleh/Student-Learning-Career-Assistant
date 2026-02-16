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
    <Loader2 className={cn('animate-spin text-[var(--primary)]', sizes[size], className)} />
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
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl bg-[var(--primary-light)] flex items-center justify-center animate-pulse">
          <GraduationCap className="h-8 w-8 text-[var(--primary)]" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[var(--bg-elevated)] rounded-full flex items-center justify-center border-2 border-[var(--bg-primary)]">
          <Loader2 className="h-3 w-3 animate-spin text-[var(--primary)]" />
        </div>
      </div>
      <p className="text-[var(--text-secondary)] text-sm font-medium">Loading your content...</p>
    </div>
  );
}

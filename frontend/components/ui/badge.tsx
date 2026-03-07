'use client';

import { ReactNode, HTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 font-medium rounded-full border tracking-[0.08em] uppercase',
  {
    variants: {
      variant: {
        default: 'border-[var(--card-border)] bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]',
        info: 'border-[var(--info-border)] bg-[var(--info-bg)] text-[var(--info)]',
        success: 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]',
        warning: 'border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]',
        error: 'border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error)]',
        documents: 'border-[var(--accent-blue-subtle)] bg-[var(--documents-bg)] text-[var(--documents)]',
        notes: 'border-[var(--success-border)] bg-[var(--notes-bg)] text-[var(--notes)]',
        summaries: 'border-[var(--accent-purple-subtle)] bg-[var(--summaries-bg)] text-[var(--summaries)]',
        quizzes: 'border-[var(--warning-border)] bg-[var(--quizzes-bg)] text-[var(--quizzes)]',
        career: 'border-[var(--accent-pink-subtle)] bg-[var(--career-bg)] text-[var(--career)]',
      },
      size: {
        sm: 'px-2.5 py-1 text-[10px]',
        md: 'px-3 py-1.5 text-[10px]',
        lg: 'px-3.5 py-1.5 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  children: ReactNode;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size, className }))}
        {...props}
      >
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export { Badge, badgeVariants };

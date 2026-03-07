'use client';

import { SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-[var(--text-primary)] mb-2"
          >
            {label}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          className={cn(
            'w-full rounded-2xl px-4 py-3.5',
            'bg-[color:color-mix(in_srgb,var(--bg-elevated)_80%,transparent)] text-[var(--text-primary)]',
            'border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            error
              ? 'border-[var(--error)] focus:ring-[var(--error-subtle)] focus:border-[var(--error)]'
              : 'border-[var(--card-border)] hover:border-[var(--card-border-hover)] hover:bg-[var(--card-bg-solid)] focus:ring-[var(--accent-blue-subtle)] focus:border-[var(--accent-blue)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p className="mt-2 text-sm text-[var(--error)]">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export { Select };

'use client';

import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, type = 'text', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[var(--text-primary)] mb-2"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          type={type}
          className={cn(
            'w-full rounded-2xl px-4 py-3.5',
            'bg-[color:color-mix(in_srgb,var(--bg-elevated)_80%,transparent)] text-[var(--text-primary)]',
            'border shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-200',
            'placeholder:text-[var(--text-tertiary)]',
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            error
              ? 'border-[var(--error)] focus:ring-[var(--error-subtle)] focus:border-[var(--error)]'
              : 'border-[var(--card-border)] hover:border-[var(--card-border-hover)] hover:bg-[var(--card-bg-solid)] focus:ring-[var(--accent-blue-subtle)] focus:border-[var(--accent-blue)]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
          {...props}
        />
        {hint && !error && (
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">{hint}</p>
        )}
        {error && (
          <p className="mt-2 text-sm text-[var(--error)]">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };

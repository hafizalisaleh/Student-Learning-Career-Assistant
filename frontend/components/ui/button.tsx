'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] text-[var(--text-inverse)] hover:shadow-[var(--shadow-glow-blue)] focus-visible:ring-[var(--accent-blue)]',
        secondary:
          'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--card-border)] hover:bg-[var(--bg-tertiary)] hover:border-[var(--card-border-hover)] focus-visible:ring-[var(--accent-purple)]',
        outline:
          'bg-transparent border border-[var(--accent-blue)] text-[var(--accent-blue)] hover:bg-[var(--accent-blue-subtle)] focus-visible:ring-[var(--accent-blue)]',
        ghost:
          'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] focus-visible:ring-[var(--accent-blue)]',
        danger:
          'bg-[var(--error)] text-white hover:opacity-90 focus-visible:ring-[var(--error)]',
        success:
          'bg-[var(--accent-green)] text-[var(--text-inverse)] hover:opacity-90 focus-visible:ring-[var(--accent-green)]',
      },
      size: {
        sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
        md: 'px-4 py-2 text-base rounded-xl gap-2',
        lg: 'px-6 py-3 text-lg rounded-xl gap-2',
        icon: 'p-2 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants };

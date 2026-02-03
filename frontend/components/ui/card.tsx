'use client';

import { ReactNode, forwardRef, HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  'rounded-2xl border transition-all duration-200',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--card-bg)] backdrop-blur-xl border-[var(--card-border)] hover:border-[var(--card-border-hover)]',
        solid:
          'bg-[var(--card-bg-solid)] border-[var(--card-border)] hover:border-[var(--card-border-hover)]',
        elevated:
          'bg-[var(--bg-elevated)] border-[var(--card-border)] hover:border-[var(--card-border-hover)] shadow-lg',
        outline:
          'bg-transparent border-[var(--card-border)] hover:border-[var(--card-border-hover)]',
        glow:
          'bg-[var(--card-bg)] backdrop-blur-xl border-[var(--card-border)] hover:border-[var(--accent-blue)] hover:shadow-[var(--shadow-glow-blue)]',
      },
      hover: {
        none: '',
        lift: 'hover:-translate-y-1',
        scale: 'hover:scale-[1.02]',
        glow: 'hover:shadow-[var(--shadow-glow-blue)]',
      },
      padding: {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      hover: 'lift',
      padding: 'md',
    },
  }
);

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  children: ReactNode;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className, variant, hover, padding, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant, hover, padding, className }))}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

interface CardSubComponentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

const CardHeader = forwardRef<HTMLDivElement, CardSubComponentProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('pb-4 border-b border-[var(--card-border)]', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardHeader.displayName = 'CardHeader';

const CardTitle = forwardRef<HTMLHeadingElement, CardSubComponentProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <h3
        ref={ref as React.Ref<HTMLHeadingElement>}
        className={cn('text-lg font-semibold text-[var(--text-primary)]', className)}
        {...props}
      >
        {children}
      </h3>
    );
  }
);

CardTitle.displayName = 'CardTitle';

const CardDescription = forwardRef<HTMLParagraphElement, CardSubComponentProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <p
        ref={ref as React.Ref<HTMLParagraphElement>}
        className={cn('text-sm text-[var(--text-secondary)] mt-1', className)}
        {...props}
      >
        {children}
      </p>
    );
  }
);

CardDescription.displayName = 'CardDescription';

const CardContent = forwardRef<HTMLDivElement, CardSubComponentProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('text-[var(--text-primary)]', className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardContent.displayName = 'CardContent';

const CardFooter = forwardRef<HTMLDivElement, CardSubComponentProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'pt-4 mt-4 border-t border-[var(--card-border)] text-[var(--text-secondary)]',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, cardVariants };

'use client';

import { ReactNode, forwardRef, HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Bento Grid Container
const bentoGridVariants = cva('grid gap-4', {
  variants: {
    columns: {
      2: 'grid-cols-1 sm:grid-cols-2',
      3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    },
    gap: {
      sm: 'gap-3',
      md: 'gap-4',
      lg: 'gap-6',
    },
  },
  defaultVariants: {
    columns: 4,
    gap: 'md',
  },
});

interface BentoGridProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof bentoGridVariants> {
  children: ReactNode;
}

const BentoGrid = forwardRef<HTMLDivElement, BentoGridProps>(
  ({ children, className, columns, gap, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(bentoGridVariants({ columns, gap, className }))}
        {...props}
      >
        {children}
      </div>
    );
  }
);

BentoGrid.displayName = 'BentoGrid';

// Bento Card with size variants
const bentoCardVariants = cva(
  'rounded-2xl border bg-[var(--card-bg)] backdrop-blur-xl border-[var(--card-border)] transition-all duration-200 hover:border-[var(--card-border-hover)] hover:-translate-y-0.5 overflow-hidden',
  {
    variants: {
      size: {
        sm: 'col-span-1 row-span-1',
        md: 'col-span-1 sm:col-span-2 row-span-1',
        lg: 'col-span-1 sm:col-span-2 row-span-2',
        wide: 'col-span-1 sm:col-span-2 lg:col-span-3 row-span-1',
        tall: 'col-span-1 row-span-2',
        hero: 'col-span-1 sm:col-span-2 lg:col-span-3 row-span-2',
        full: 'col-span-1 sm:col-span-2 lg:col-span-4 row-span-1',
      },
      accent: {
        none: '',
        blue: 'bg-gradient-to-br from-[var(--accent-blue-subtle)] to-transparent border-[rgba(0,212,255,0.2)]',
        purple: 'bg-gradient-to-br from-[var(--accent-purple-subtle)] to-transparent border-[rgba(168,85,247,0.2)]',
        green: 'bg-gradient-to-br from-[var(--accent-green-subtle)] to-transparent border-[rgba(34,211,167,0.2)]',
        amber: 'bg-gradient-to-br from-[var(--accent-amber-subtle)] to-transparent border-[rgba(251,191,36,0.2)]',
        pink: 'bg-gradient-to-br from-[var(--accent-pink-subtle)] to-transparent border-[rgba(244,114,182,0.2)]',
      },
      padding: {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
      },
    },
    defaultVariants: {
      size: 'sm',
      accent: 'none',
      padding: 'md',
    },
  }
);

interface BentoCardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof bentoCardVariants> {
  children: ReactNode;
}

const BentoCard = forwardRef<HTMLDivElement, BentoCardProps>(
  ({ children, className, size, accent, padding, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(bentoCardVariants({ size, accent, padding, className }))}
        {...props}
      >
        {children}
      </div>
    );
  }
);

BentoCard.displayName = 'BentoCard';

// Stat Card Component for dashboard stats
interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  icon: ReactNode;
  label: string;
  value: string | number;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  accent?: 'blue' | 'purple' | 'green' | 'amber' | 'pink';
}

const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  ({ icon, label, value, trend, accent = 'blue', className, ...props }, ref) => {
    const accentColors = {
      blue: {
        bg: 'bg-[var(--accent-blue-subtle)]',
        text: 'text-[var(--accent-blue)]',
        glow: 'group-hover:shadow-[var(--shadow-glow-blue)]',
      },
      purple: {
        bg: 'bg-[var(--accent-purple-subtle)]',
        text: 'text-[var(--accent-purple)]',
        glow: 'group-hover:shadow-[var(--shadow-glow-purple)]',
      },
      green: {
        bg: 'bg-[var(--accent-green-subtle)]',
        text: 'text-[var(--accent-green)]',
        glow: 'group-hover:shadow-[var(--shadow-glow-green)]',
      },
      amber: {
        bg: 'bg-[var(--accent-amber-subtle)]',
        text: 'text-[var(--accent-amber)]',
        glow: '',
      },
      pink: {
        bg: 'bg-[var(--accent-pink-subtle)]',
        text: 'text-[var(--accent-pink)]',
        glow: '',
      },
    };

    const colors = accentColors[accent];

    return (
      <div
        ref={ref}
        className={cn(
          'group p-6 rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)]',
          'transition-all duration-200 hover:border-[var(--card-border-hover)] hover:-translate-y-0.5',
          colors.glow,
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between">
          <div className={cn('p-3 rounded-xl', colors.bg)}>
            <div className={cn('w-6 h-6', colors.text)}>{icon}</div>
          </div>
          {trend && (
            <span
              className={cn(
                'text-sm font-medium px-2 py-1 rounded-lg',
                trend.isPositive
                  ? 'text-[var(--accent-green)] bg-[var(--accent-green-subtle)]'
                  : 'text-[var(--error)] bg-[var(--error-subtle)]'
              )}
            >
              {trend.isPositive ? '+' : ''}{trend.value}%
            </span>
          )}
        </div>
        <div className="mt-4">
          <p className="text-sm text-[var(--text-secondary)]">{label}</p>
          <p className="text-3xl font-bold text-[var(--text-primary)] mt-1">{value}</p>
        </div>
      </div>
    );
  }
);

StatCard.displayName = 'StatCard';

export { BentoGrid, BentoCard, StatCard, bentoGridVariants, bentoCardVariants };

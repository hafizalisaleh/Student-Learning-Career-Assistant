'use client';

import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-[1.8rem] border border-dashed border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_82%,transparent)] p-12 text-center shadow-[var(--card-shadow)]">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[1.4rem] border border-[var(--card-border)] bg-[var(--accent)] text-[var(--primary)]">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-serif text-2xl tracking-[-0.04em] text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

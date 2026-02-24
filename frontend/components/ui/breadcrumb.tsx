import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface BreadcrumbProps {
    items: BreadcrumbItem[];
    className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
    return (
        <nav className={cn("flex items-center space-x-2 text-sm text-[var(--text-muted)]", className)} aria-label="Breadcrumb">
            <Link
                href="/dashboard"
                className="hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
            >
                <Home className="h-4 w-4" />
            </Link>

            {items.map((item, index) => (
                <div key={index} className="flex items-center space-x-2">
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)] opacity-50" />
                    {item.href ? (
                        <Link
                            href={item.href}
                            className="hover:text-[var(--text-primary)] transition-colors font-medium"
                        >
                            {item.label}
                        </Link>
                    ) : (
                        <span className="text-[var(--text-primary)] font-semibold truncate max-w-[200px]">
                            {item.label}
                        </span>
                    )}
                </div>
            ))}
        </nav>
    );
}

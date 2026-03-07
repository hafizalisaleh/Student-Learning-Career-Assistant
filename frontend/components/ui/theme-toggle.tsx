'use client';

import { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check localStorage or system preference
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const applyTheme = (t: 'light' | 'dark') => {
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  if (!mounted) {
    return (
      <button className={cn(
        "h-11 w-11 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[var(--card-shadow)]",
        className
      )}>
        <div className="w-5 h-5 mx-auto" />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative flex h-11 w-11 items-center justify-center rounded-2xl transition-all duration-300",
        "bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[var(--card-shadow)]",
        "hover:-translate-y-0.5 hover:border-[var(--card-border-hover)] hover:bg-[var(--card-bg-solid)]",
        "focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2",
        className
      )}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <div className="relative w-5 h-5">
        {/* Sun icon */}
        <Sun
          className={cn(
            "absolute inset-0 w-5 h-5 text-amber-500 transition-all duration-300",
            theme === 'light'
              ? "opacity-100 rotate-0 scale-100"
              : "opacity-0 rotate-90 scale-0"
          )}
        />
        {/* Moon icon */}
        <Moon
          className={cn(
            "absolute inset-0 w-5 h-5 text-blue-400 transition-all duration-300",
            theme === 'dark'
              ? "opacity-100 rotate-0 scale-100"
              : "opacity-0 -rotate-90 scale-0"
          )}
        />
      </div>
    </button>
  );
}

// Compact toggle for sidebar
export function ThemeToggleCompact({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  const applyTheme = (t: 'light' | 'dark') => {
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
  };

  if (!mounted) return null;

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2.5 rounded-2xl transition-colors",
        "text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)]",
        "hover:bg-[rgba(255,255,255,0.08)]",
        className
      )}
    >
      {theme === 'light' ? (
        <>
          <Moon className="w-4 h-4" />
          <span className="text-sm">Dark Mode</span>
        </>
      ) : (
        <>
          <Sun className="w-4 h-4" />
          <span className="text-sm">Light Mode</span>
        </>
      )}
    </button>
  );
}

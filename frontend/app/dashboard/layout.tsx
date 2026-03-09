'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import {
  BookOpen,
  Briefcase,
  ChevronDown,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle, ThemeToggleCompact } from '@/components/ui/theme-toggle';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
}

const navigation = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Overview, momentum, and next-study actions.',
  },
  {
    name: 'Documents',
    href: '/dashboard/documents',
    icon: FileText,
    description: 'Your source library, extraction status, and study workspaces.',
  },
  {
    name: 'Notes',
    href: '/dashboard/notes',
    icon: BookOpen,
    description: 'Captured insights and revision material.',
  },
  {
    name: 'Summaries',
    href: '/dashboard/summaries',
    icon: Sparkles,
    description: 'Condensed document outputs and revision snapshots.',
  },
  {
    name: 'Quizzes',
    href: '/dashboard/quizzes',
    icon: ClipboardCheck,
    description: 'Knowledge checks, attempts, and revision loops.',
  },
  {
    name: 'AI Assistant',
    href: '/dashboard/ask',
    icon: Mic,
    description: 'Question answering, voice mode, and grounded retrieval.',
  },
  {
    name: 'Knowledge Graph',
    href: '/dashboard/knowledge-graph',
    icon: Network,
    description: 'Connected concepts across your learning material.',
  },
  {
    name: 'Progress',
    href: '/dashboard/progress',
    icon: TrendingUp,
    description: 'Streaks, quiz performance, and learning momentum.',
  },
  {
    name: 'Career',
    href: '/dashboard/career',
    icon: Briefcase,
    description: 'Career recommendations and job-prep workflows.',
  },
];

const bottomNavItems = [
  { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Docs', href: '/dashboard/documents', icon: FileText },
  { name: 'AI', href: '/dashboard/ask', icon: Mic, highlight: true },
  { name: 'Graph', href: '/dashboard/knowledge-graph', icon: Network },
  { name: 'Career', href: '/dashboard/career', icon: Briefcase },
];

const workspaceNav = {
  name: 'Study Workspace',
  href: '/dashboard/documents',
  icon: FileText,
  description: 'Read the source, inspect pages, and ask grounded questions in context.',
};

function isNavPathActive(itemHref: string, pathname: string | null) {
  if (!pathname) return false;
  if (pathname.startsWith('/dashboard/workspace')) {
    return itemHref === workspaceNav.href;
  }
  if (itemHref === '/dashboard') return pathname === '/dashboard';
  return pathname.startsWith(itemHref);
}

function getActiveNav(pathname: string | null) {
  if (!pathname) return navigation[0];
  if (pathname.startsWith('/dashboard/workspace')) {
    return workspaceNav;
  }
  return navigation.find((item) => isNavPathActive(item.href, pathname)) || navigation[0];
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const activeNav = useMemo(() => getActiveNav(pathname), [pathname]);
  const friendlyDate = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date()),
    []
  );

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('sidebar-collapsed');
    if (saved === 'true') setIsSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '\\') {
        event.preventDefault();
        setIsSidebarCollapsed((current) => {
          const nextState = !current;
          localStorage.setItem('sidebar-collapsed', String(nextState));
          return nextState;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleSidebar = () => {
    const nextState = !isSidebarCollapsed;
    setIsSidebarCollapsed(nextState);
    localStorage.setItem('sidebar-collapsed', String(nextState));
  };

  const handleLogout = () => {
    logout();
    toast.success('Signed out');
    router.push('/login');
  };

  const getUserInitials = () => {
    if (!user) return 'SL';
    if (user.first_name && user.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    if (user.first_name) return user.first_name[0].toUpperCase();
    if (user.email) return user.email[0].toUpperCase();
    return 'SL';
  };

  const getUserLabel = () => {
    if (!user) return 'Study User';
    if (user.first_name) return user.first_name;
    return user.email?.split('@')[0] || 'Study User';
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="floating-shape shape-1" />
        <div className="floating-shape shape-2" />
        <div className="floating-shape shape-3" />
      </div>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-[var(--bg-overlay)] backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col overflow-y-auto overscroll-contain border-r border-[var(--sidebar-border)] bg-[linear-gradient(180deg,#0d1524_0%,#162033_58%,#1b2740_100%)] px-4 py-4 transition-all duration-300',
          isSidebarCollapsed ? 'w-[96px]' : 'w-[280px]',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex min-h-full flex-col gap-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:pb-4">
          <div className="rounded-[28px] border border-[var(--sidebar-border)] bg-white/6 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.22)] backdrop-blur-xl">
            <div className={cn('flex items-center', isSidebarCollapsed ? 'justify-center' : 'justify-between gap-3')}>
              <Link href="/dashboard" className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--bg-elevated)] shadow-md">
                  <img src="/logo.png" alt="SLCA" className="h-8 w-8 object-contain" />
                </div>
                {!isSidebarCollapsed && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sidebar-text-muted)]">
                      Study OS
                    </p>
                    <p className="font-serif text-xl tracking-[-0.03em] text-[var(--sidebar-text)]">
                      SLCA
                    </p>
                  </div>
                )}
              </Link>

              <button
                onClick={toggleSidebar}
                className={cn(
                  'hidden rounded-2xl border border-[var(--sidebar-border)] bg-white/6 p-2 text-[var(--sidebar-text-muted)] transition-colors hover:text-[var(--sidebar-text)] lg:inline-flex',
                  isSidebarCollapsed && 'absolute right-4 top-4'
                )}
                title="Toggle Sidebar (Cmd+\)"
              >
                {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>

              <button
                className="rounded-2xl border border-[var(--sidebar-border)] bg-white/6 p-2 text-[var(--sidebar-text-muted)] lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!isSidebarCollapsed && (
              <div className="mt-4 rounded-[22px] border border-white/8 bg-white/6 p-4">
                <p className="editorial-kicker text-[var(--sidebar-text-muted)]">
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--highlight)]" />
                  Research Workstation
                </p>
                <p className="mt-3 text-sm leading-6 text-[var(--sidebar-text)]">
                  Read, extract, generate, quiz, and ask grounded questions from one place.
                </p>
              </div>
            )}
          </div>

          <div className="px-1">
            {!isSidebarCollapsed && (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--sidebar-text-muted)]">
                Workbench
              </p>
            )}
            <nav className="space-y-1.5">
              {navigation.map((item) => {
                const active = isNavPathActive(item.href, pathname);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn('rail-nav-link', active && 'active', isSidebarCollapsed && 'justify-center px-0')}
                    onClick={() => setSidebarOpen(false)}
                    title={isSidebarCollapsed ? item.name : undefined}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {!isSidebarCollapsed && (
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="truncate text-xs text-[var(--sidebar-text-muted)]">{item.description}</p>
                      </div>
                    )}
                  </Link>
                );
              })}
            </nav>
            {!isSidebarCollapsed && (
              <p className="px-3 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-text-muted)] lg:hidden">
                Scroll for account controls
              </p>
            )}
          </div>

          <div className="mt-auto space-y-3">
            <div className={cn('rounded-[26px] border border-[var(--sidebar-border)] bg-white/6 shadow-[0_20px_48px_rgba(0,0,0,0.18)] backdrop-blur-xl', isSidebarCollapsed ? 'p-2.5' : 'p-3.5')}>
              <div className={cn('flex items-center gap-3', isSidebarCollapsed && 'justify-center')}>
                <div className="relative shrink-0">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),var(--highlight))] font-semibold text-[var(--primary-foreground)] shadow-lg">
                    {mounted ? getUserInitials() : 'SL'}
                  </div>
                  <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-[var(--sidebar-bg)] bg-[var(--success)]" />
                </div>

                {!isSidebarCollapsed && (
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--sidebar-text)]">{getUserLabel()}</p>
                    <p className="truncate text-xs text-[var(--sidebar-text-muted)]">{user?.email || 'signed in'}</p>
                  </div>
                )}
              </div>

              <div className={cn('mt-3 flex items-center gap-2', isSidebarCollapsed && 'flex-col')}>
                {isSidebarCollapsed ? (
                  <>
                    <ThemeToggle className="h-10 w-10 rounded-2xl border-white/10 bg-white/6 text-[var(--sidebar-text)]" />
                    <button
                      onClick={handleLogout}
                      className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--sidebar-border)] bg-white/6 text-[var(--sidebar-text-muted)] transition-colors hover:text-[var(--sidebar-text)]"
                      title="Sign Out"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <ThemeToggleCompact className="flex-1" />
                    <Button variant="ghost" size="sm" className="h-10 rounded-2xl px-3 text-[var(--sidebar-text-muted)] hover:bg-white/10 hover:text-[var(--sidebar-text)]" onClick={handleLogout}>
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div
        className={cn(
          'transition-[padding] duration-300',
          isSidebarCollapsed ? 'lg:pl-[96px]' : 'lg:pl-[280px]'
        )}
      >
        <header className="sticky top-0 z-30 px-4 pt-4 lg:px-6">
          <div className="dashboard-panel overflow-visible">
            <div className="panel-content flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_72%,transparent)] text-[var(--text-secondary)] lg:hidden"
                >
                  <Menu className="h-5 w-5" />
                </button>

                <div>
                  <p className="editorial-kicker">
                    <span className="inline-block h-2 w-2 rounded-full bg-[var(--highlight)]" />
                    Learning cockpit
                  </p>
                  <h1 className="mt-2 font-serif text-3xl tracking-[-0.04em] text-[var(--text-primary)] sm:text-[2.35rem]">
                    {activeNav.name}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                    {activeNav.description}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
                <div className="signal-pill hidden xl:inline-flex">
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--success)]" />
                  Workspace live
                </div>
                <div className="signal-pill hidden md:inline-flex">{friendlyDate}</div>
                <ThemeToggle />

                <div className="relative z-40" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen((open) => !open)}
                    className="flex items-center gap-3 rounded-[1.25rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_72%,transparent)] px-3 py-2.5 shadow-[var(--card-shadow)] transition-colors hover:border-[var(--card-border-hover)] hover:bg-[var(--card-bg-solid)]"
                    aria-expanded={profileOpen}
                  >
                    <div className="relative shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary),var(--highlight))] font-semibold text-[var(--primary-foreground)]">
                        {mounted ? getUserInitials() : 'SL'}
                      </div>
                      <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[var(--bg-elevated)] bg-[var(--success)]" />
                    </div>
                    <div className="hidden min-w-0 text-left sm:block">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">{getUserLabel()}</p>
                      <p className="truncate text-xs text-[var(--text-tertiary)]">{user?.email || 'Signed in'}</p>
                    </div>
                    <ChevronDown className={cn('h-4 w-4 text-[var(--text-muted)] transition-transform', profileOpen && 'rotate-180')} />
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[290px] rounded-[1.6rem] border border-[var(--card-border-hover)] bg-[var(--card-bg-solid)] p-3 shadow-[0_32px_80px_rgba(17,25,40,0.22)] backdrop-blur-xl">
                      <div className="rounded-[1.25rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4">
                        <p className="editorial-kicker">
                          <span className="inline-block h-2 w-2 rounded-full bg-[var(--highlight)]" />
                          Account
                        </p>
                        <p className="mt-3 font-serif text-xl tracking-[-0.03em] text-[var(--text-primary)]">{getUserLabel()}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{user?.email || 'Signed in'}</p>
                      </div>

                      <div className="mt-3 space-y-2">
                        <Link href="/dashboard/documents" className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text-primary)]" onClick={() => setProfileOpen(false)}>
                          <FileText className="h-4 w-4" />
                          Open document library
                        </Link>
                        <Link href="/dashboard/ask" className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--text-primary)]" onClick={() => setProfileOpen(false)}>
                          <Mic className="h-4 w-4" />
                          Ask the AI assistant
                        </Link>
                        <button
                          onClick={handleLogout}
                          className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm text-[var(--error)] transition-colors hover:bg-[var(--error-bg)]"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 pb-24 pt-5 lg:px-6 lg:pb-8">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-4 bottom-4 z-30 rounded-[1.6rem] border border-[var(--card-border)] bg-[var(--card-bg)] p-2 shadow-[var(--card-shadow)] backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-around">
          {bottomNavItems.map((item) => {
            const active = isNavPathActive(item.href, pathname);
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex min-w-[58px] flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] transition-colors',
                  item.highlight
                    ? active
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[var(--shadow-glow-blue)]'
                      : 'bg-[var(--sidebar-bg)] text-white'
                    : active
                      ? 'bg-[var(--primary-light)] text-[var(--primary)]'
                      : 'text-[var(--text-muted)]'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

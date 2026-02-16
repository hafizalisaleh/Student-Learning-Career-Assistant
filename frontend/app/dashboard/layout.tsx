'use client';

import { ReactNode, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  Brain,
  ClipboardCheck,
  TrendingUp,
  Briefcase,
  User,
  LogOut,
  Menu,
  X,
  GraduationCap,
  Mic,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Documents', href: '/dashboard/documents', icon: FileText },
  { name: 'AI Assistant', href: '/dashboard/ask', icon: Mic },
  { name: 'Notes', href: '/dashboard/notes', icon: BookOpen },
  { name: 'Summaries', href: '/dashboard/summaries', icon: Brain },
  { name: 'Quizzes', href: '/dashboard/quizzes', icon: ClipboardCheck },
  { name: 'Progress', href: '/dashboard/progress', icon: TrendingUp },
  { name: 'Career', href: '/dashboard/career', icon: Briefcase },
];

const bottomNavItems = [
  { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Docs', href: '/dashboard/documents', icon: FileText },
  { name: 'AI', href: '/dashboard/ask', icon: Mic, highlight: true },
  { name: 'Quiz', href: '/dashboard/quizzes', icon: ClipboardCheck },
  { name: 'More', href: '#more', icon: Menu },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    logout();
    toast.success('Logged out');
    router.push('/login');
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname?.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]" suppressHydrationWarning>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-[var(--bg-overlay)] z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-56 sidebar flex flex-col',
          'transform transition-transform duration-200',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--sidebar-border)]">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-white/10">
              <GraduationCap className="h-5 w-5 text-white" />
            </div>
            <span className="text-base font-semibold text-white">SLCA</span>
          </Link>
          <button
            className="lg:hidden p-1.5 rounded-md hover:bg-white/10 text-[var(--sidebar-text-muted)]"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navigation.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn('sidebar-nav-item', active && 'active')}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className="h-4 w-4" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="border-t border-[var(--sidebar-border)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              {mounted && user ? (
                <p className="text-sm font-medium text-white truncate">
                  {user.first_name || user.email?.split('@')[0]}
                </p>
              ) : (
                <div className="h-4 w-20 bg-white/10 rounded animate-pulse" />
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-[var(--sidebar-text-muted)] hover:text-white hover:bg-white/10 h-8"
            onClick={handleLogout}
          >
            <LogOut className="h-3.5 w-3.5 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="lg:pl-56 pb-16 lg:pb-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between px-3 py-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-[var(--sidebar-bg)]">
                <GraduationCap className="h-4 w-4 text-white" />
              </div>
              <span className="text-base font-semibold text-[var(--text-primary)]">SLCA</span>
            </Link>
            <div className="w-8" />
          </div>
        </header>

        {/* Content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-[var(--card-border)]">
        <div className="flex items-center justify-around py-1.5">
          {bottomNavItems.map((item) => {
            const active = item.href === '#more' ? false : isActive(item.href);
            const Icon = item.icon;

            if (item.href === '#more') {
              return (
                <button
                  key={item.name}
                  onClick={() => setSidebarOpen(true)}
                  className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-[var(--text-muted)]"
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px]">{item.name}</span>
                </button>
              );
            }

            if ((item as any).highlight) {
              return (
                <Link key={item.name} href={item.href} className="flex flex-col items-center gap-0.5 px-3 py-1 -mt-3">
                  <div className={cn(
                    'p-2.5 rounded-full shadow-md',
                    active ? 'bg-[var(--primary)]' : 'bg-[var(--sidebar-bg)]'
                  )}>
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-[10px] text-[var(--text-secondary)]">{item.name}</span>
                </Link>
              );
            }

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-3 py-1.5',
                  active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px]">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

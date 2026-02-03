'use client';

import { ReactNode } from 'react';
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
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Documents', href: '/dashboard/documents', icon: FileText },
  { name: 'Notes', href: '/dashboard/notes', icon: BookOpen },
  { name: 'Summaries', href: '/dashboard/summaries', icon: Brain },
  { name: 'Quizzes', href: '/dashboard/quizzes', icon: ClipboardCheck },
  { name: 'Progress', href: '/dashboard/progress', icon: TrendingUp },
  { name: 'Career', href: '/dashboard/career', icon: Briefcase },
];

// Bottom nav shows fewer items on mobile
const bottomNavItems = [
  { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Docs', href: '/dashboard/documents', icon: FileText },
  { name: 'Notes', href: '/dashboard/notes', icon: BookOpen },
  { name: 'Quiz', href: '/dashboard/quizzes', icon: ClipboardCheck },
  { name: 'More', href: '#more', icon: Menu },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    router.push('/login');
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname?.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-72 bg-[var(--bg-secondary)] border-r border-[var(--card-border)]',
          'transform transition-transform duration-300 ease-out',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--card-border)]">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)]">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-[var(--text-primary)]">SLCA</span>
          </Link>
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          {navigation.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)] border border-[rgba(0,212,255,0.2)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                )}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className={cn('h-5 w-5', active && 'drop-shadow-[0_0_8px_var(--accent-blue-glow)]')} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-[var(--card-border)] p-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] mb-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[var(--accent-purple)] to-[var(--accent-pink)] flex items-center justify-center">
              <User className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                {user?.first_name && user?.last_name
                  ? `${user.first_name} ${user.last_name}`
                  : user?.email}
              </p>
              <p className="text-xs text-[var(--text-tertiary)] truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-[var(--error)] hover:bg-[var(--error-subtle)]"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main content wrapper */}
      <div className="lg:pl-72 pb-20 lg:pb-0">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-[var(--bg-secondary)]/80 backdrop-blur-xl border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)]">
                <GraduationCap className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-[var(--text-primary)]">SLCA</span>
            </Link>
            <div className="w-9" /> {/* Spacer for centering */}
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-screen p-4 lg:p-8">{children}</main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-secondary)]/90 backdrop-blur-xl border-t border-[var(--card-border)] safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-2">
          {bottomNavItems.map((item) => {
            const active = item.href === '#more' ? false : isActive(item.href);
            const Icon = item.icon;

            if (item.href === '#more') {
              return (
                <button
                  key={item.name}
                  onClick={() => setSidebarOpen(true)}
                  className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{item.name}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors',
                  active
                    ? 'text-[var(--accent-blue)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                )}
              >
                <Icon className={cn('h-5 w-5', active && 'drop-shadow-[0_0_8px_var(--accent-blue-glow)]')} />
                <span className="text-xs font-medium">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Safe area padding for iOS */}
      <style jsx global>{`
        .safe-area-bottom {
          padding-bottom: env(safe-area-inset-bottom, 0.5rem);
        }
      `}</style>
    </div>
  );
}

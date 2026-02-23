'use client';

import { ReactNode, useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import {
  LayoutDashboard,
  FileText,
  TrendingUp,
  Briefcase,
  User,
  LogOut,
  Menu,
  X,
  Mic,
  ChevronDown,
  Settings,
  Camera,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle, ThemeToggleCompact } from '@/components/ui/theme-toggle';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface DashboardLayoutProps {
  children: ReactNode;
}

// Consolidated navigation - removed Notes, Summaries, Quizzes (available in Documents)
const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Documents', href: '/dashboard/documents', icon: FileText },
  { name: 'Voice Control', href: '/dashboard/ask', icon: Mic },
  { name: 'Progress', href: '/dashboard/progress', icon: TrendingUp },
  { name: 'Career', href: '/dashboard/career', icon: Briefcase },
];

const bottomNavItems = [
  { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Docs', href: '/dashboard/documents', icon: FileText },
  { name: 'Voice', href: '/dashboard/ask', icon: Mic, highlight: true },
  { name: 'Progress', href: '/dashboard/progress', icon: TrendingUp },
  { name: 'Career', href: '/dashboard/career', icon: Briefcase },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  const getUserInitials = () => {
    if (!user) return 'U';
    if (user.first_name && user.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    if (user.first_name) return user.first_name[0].toUpperCase();
    if (user.email) return user.email[0].toUpperCase();
    return 'U';
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
            <img src="/logo.png" alt="SLCA" className="h-8 w-8 object-contain bg-white rounded-md p-0.5" />
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

        {/* Sidebar footer */}
        <div className="border-t border-[var(--sidebar-border)] p-3 space-y-1">
          <ThemeToggleCompact />
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
        {/* Desktop header with profile */}
        <header className="hidden lg:flex sticky top-0 z-30 bg-[var(--bg-primary)] border-b border-[var(--card-border)] items-center justify-end px-6 py-2 gap-3">
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Profile dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all",
                "hover:bg-[var(--bg-secondary)]",
                profileOpen && "bg-[var(--bg-secondary)]"
              )}
            >
              {/* Profile avatar */}
              <div className="relative">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center text-white text-sm font-medium">
                  {mounted && user ? getUserInitials() : '...'}
                </div>
                {/* Online indicator */}
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
              </div>

              {mounted && user && (
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {user.first_name || user.email?.split('@')[0]}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] truncate max-w-[120px]">
                    {user.email}
                  </p>
                </div>
              )}

              <ChevronDown className={cn(
                "h-4 w-4 text-[var(--text-muted)] transition-transform",
                profileOpen && "rotate-180"
              )} />
            </button>

            {/* Dropdown menu */}
            {profileOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-[var(--card-bg)] rounded-xl shadow-lg border border-[var(--card-border)] py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* User info header */}
                <div className="px-4 py-3 border-b border-[var(--card-border)]">
                  <div className="flex items-center gap-3">
                    <div className="relative group">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center text-white text-lg font-medium">
                        {mounted && user ? getUserInitials() : '...'}
                      </div>
                      {/* Upload photo overlay */}
                      <button className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="h-4 w-4 text-white" />
                      </button>
                    </div>
                    <div className="flex-1 min-w-0">
                      {mounted && user && (
                        <>
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {user.first_name} {user.last_name}
                          </p>
                          <p className="text-xs text-[var(--text-muted)] truncate">
                            {user.email}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Menu items */}
                <div className="py-1">
                  <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <User className="h-4 w-4" />
                    View Profile
                  </button>
                  <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <Camera className="h-4 w-4" />
                    Change Photo
                  </button>
                  <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                </div>

                {/* Divider */}
                <div className="border-t border-[var(--card-border)] my-1" />

                {/* Switch account */}
                <div className="py-1">
                  <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors">
                    <UserPlus className="h-4 w-4" />
                    Add Another Account
                  </button>
                </div>

                {/* Divider */}
                <div className="border-t border-[var(--card-border)] my-1" />

                {/* Sign out */}
                <div className="py-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--error)] hover:bg-[var(--error-bg)] transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-[var(--bg-primary)] border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between px-3 py-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/dashboard" className="flex items-center gap-2">
              <img src="/logo.png" alt="SLCA" className="h-7 w-7 object-contain" />
              <span className="text-base font-semibold text-[var(--text-primary)]">SLCA</span>
            </Link>
            {/* Mobile profile button */}
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="relative"
            >
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center text-white text-sm font-medium">
                {mounted && user ? getUserInitials() : '...'}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />
            </button>
          </div>

          {/* Mobile profile dropdown */}
          {profileOpen && (
            <div className="absolute right-3 top-14 w-64 bg-[var(--card-bg)] rounded-xl shadow-lg border border-[var(--card-border)] py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="px-4 py-3 border-b border-[var(--card-border)]">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center text-white font-medium">
                    {mounted && user ? getUserInitials() : '...'}
                  </div>
                  <div className="flex-1 min-w-0">
                    {mounted && user && (
                      <>
                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                          {user.first_name} {user.last_name}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] truncate">
                          {user.email}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="py-1">
                <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]">
                  <Camera className="h-4 w-4" />
                  Change Photo
                </button>
                <button className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]">
                  <UserPlus className="h-4 w-4" />
                  Add Account
                </button>
              </div>
              <div className="border-t border-[var(--card-border)] my-1" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--error)] hover:bg-[var(--error-bg)]"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </header>

        {/* Content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>

      {/* Mobile bottom nav - consolidated */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[var(--bg-primary)] border-t border-[var(--card-border)]">
        <div className="flex items-center justify-around py-1.5">
          {bottomNavItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

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

'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';
import { PageLoader } from '@/components/ui/loading-spinner';
import {
  FileText,
  BookOpen,
  Brain,
  ClipboardCheck,
  TrendingUp,
  Flame,
  Upload,
  Briefcase,
  Sparkles,
  Clock,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import type { UserProgress, ActivityLog } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setIsLoading(true);
        const [progressData, activityData] = await Promise.all([
          api.getProgressOverview(),
          api.getActivityLog(),
        ]);
        setProgress(progressData);
        const activities = Array.isArray(activityData) ? activityData : [];
        setActivities(activities.slice(0, 5));
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        setActivities([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  if (isLoading) {
    return <PageLoader />;
  }

  const stats = [
    {
      name: 'Documents',
      value: progress?.total_documents || 0,
      icon: FileText,
      accent: 'blue' as const,
      href: '/dashboard/documents',
    },
    {
      name: 'Notes',
      value: progress?.total_notes || 0,
      icon: BookOpen,
      accent: 'green' as const,
      href: '/dashboard/notes',
    },
    {
      name: 'Summaries',
      value: progress?.total_summaries || 0,
      icon: Brain,
      accent: 'purple' as const,
      href: '/dashboard/summaries',
    },
    {
      name: 'Quizzes',
      value: progress?.total_quizzes_generated || 0,
      icon: ClipboardCheck,
      accent: 'amber' as const,
      href: '/dashboard/quizzes',
    },
  ];

  const quickActions = [
    { name: 'Upload', icon: Upload, href: '/dashboard/documents', accent: 'blue' as const },
    { name: 'Notes', icon: BookOpen, href: '/dashboard/notes/new', accent: 'green' as const },
    { name: 'Quiz', icon: ClipboardCheck, href: '/dashboard/quizzes', accent: 'amber' as const },
    { name: 'Career', icon: Briefcase, href: '/dashboard/career', accent: 'purple' as const },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">
          Welcome back, {user?.first_name || 'Student'}!
        </h1>
        <p className="text-[var(--text-secondary)] mt-1">
          Here&apos;s what&apos;s happening with your learning today.
        </p>
      </div>

      {/* Stats Grid - Bento Style */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.name} {...stat} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Study Stats - Takes 2 columns */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Study Streak Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-[var(--accent-amber-subtle)] to-transparent border border-[rgba(251,191,36,0.2)]">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-[var(--accent-amber-subtle)]">
                  <Flame className="h-6 w-6 text-[var(--accent-amber)]" />
                </div>
                <div>
                  <p className="text-sm text-[var(--text-secondary)]">Study Streak</p>
                  <p className="text-3xl font-bold text-[var(--text-primary)]">
                    {progress?.study_streak_days || 0} <span className="text-lg font-normal">days</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Quiz Score Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-[var(--accent-green-subtle)] to-transparent border border-[rgba(34,211,167,0.2)]">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-[var(--accent-green-subtle)]">
                  <TrendingUp className="h-6 w-6 text-[var(--accent-green)]" />
                </div>
                <div>
                  <p className="text-sm text-[var(--text-secondary)]">Average Quiz Score</p>
                  <p className="text-3xl font-bold text-[var(--text-primary)]">
                    {progress?.average_quiz_score?.toFixed(0) || '0'}
                    <span className="text-lg font-normal">%</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-6 rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {quickActions.map((action) => (
                <QuickActionButton key={action.name} {...action} />
              ))}
            </div>
          </div>

          {/* AI Insights Teaser */}
          <Link href="/dashboard/progress">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-[var(--accent-purple-subtle)] to-[var(--accent-blue-subtle)] border border-[rgba(168,85,247,0.2)] hover:border-[rgba(168,85,247,0.4)] transition-all cursor-pointer group">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-[var(--accent-purple-subtle)]">
                  <Sparkles className="h-6 w-6 text-[var(--accent-purple)]" />
                </div>
                <div className="flex-1">
                  <p className="text-lg font-semibold text-[var(--text-primary)]">AI Insights Available</p>
                  <p className="text-sm text-[var(--text-secondary)]">
                    View personalized recommendations to improve your learning
                  </p>
                </div>
                <div className="text-[var(--accent-purple)] group-hover:translate-x-1 transition-transform">
                  →
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Recent Activity */}
        <div className="p-6 rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Recent Activity</h3>
            <Clock className="h-4 w-4 text-[var(--text-tertiary)]" />
          </div>

          {activities.length === 0 ? (
            <div className="text-center py-12">
              <div className="p-4 rounded-full bg-[var(--bg-elevated)] inline-block mb-4">
                <FileText className="h-8 w-8 text-[var(--text-tertiary)]" />
              </div>
              <p className="text-[var(--text-secondary)]">No recent activity</p>
              <p className="text-sm text-[var(--text-tertiary)] mt-1">
                Start by uploading a document!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => {
                const description = getActivityDescription(activity);
                const Icon = getActivityIconComponent(activity.activity_type);
                const accent = getActivityAccent(activity.activity_type);

                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] hover:bg-[var(--bg-tertiary)] transition-colors"
                  >
                    <div className={cn(
                      'h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0',
                      accent.bg
                    )}>
                      <Icon className={cn('h-4 w-4', accent.text)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text-primary)] font-medium truncate">
                        {description}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {formatRelativeTime(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  name,
  value,
  icon: Icon,
  accent,
  href,
}: {
  name: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: 'blue' | 'green' | 'purple' | 'amber';
  href: string;
}) {
  const accentStyles = {
    blue: {
      bg: 'bg-[var(--accent-blue-subtle)]',
      text: 'text-[var(--accent-blue)]',
      glow: 'group-hover:shadow-[var(--shadow-glow-blue)]',
    },
    green: {
      bg: 'bg-[var(--accent-green-subtle)]',
      text: 'text-[var(--accent-green)]',
      glow: 'group-hover:shadow-[var(--shadow-glow-green)]',
    },
    purple: {
      bg: 'bg-[var(--accent-purple-subtle)]',
      text: 'text-[var(--accent-purple)]',
      glow: 'group-hover:shadow-[var(--shadow-glow-purple)]',
    },
    amber: {
      bg: 'bg-[var(--accent-amber-subtle)]',
      text: 'text-[var(--accent-amber)]',
      glow: '',
    },
  };

  const styles = accentStyles[accent];

  return (
    <Link href={href}>
      <div className={cn(
        'group p-5 rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)]',
        'transition-all duration-200 hover:border-[var(--card-border-hover)] hover:-translate-y-0.5',
        styles.glow
      )}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-[var(--text-secondary)]">{name}</p>
            <p className="text-3xl font-bold text-[var(--text-primary)] mt-1">{value}</p>
          </div>
          <div className={cn('p-2.5 rounded-xl', styles.bg)}>
            <Icon className={cn('h-5 w-5', styles.text)} />
          </div>
        </div>
      </div>
    </Link>
  );
}

function QuickActionButton({
  name,
  icon: Icon,
  href,
  accent,
}: {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  accent: 'blue' | 'green' | 'purple' | 'amber';
}) {
  const accentStyles = {
    blue: 'hover:bg-[var(--accent-blue-subtle)] hover:text-[var(--accent-blue)] hover:border-[rgba(0,212,255,0.3)]',
    green: 'hover:bg-[var(--accent-green-subtle)] hover:text-[var(--accent-green)] hover:border-[rgba(34,211,167,0.3)]',
    purple: 'hover:bg-[var(--accent-purple-subtle)] hover:text-[var(--accent-purple)] hover:border-[rgba(168,85,247,0.3)]',
    amber: 'hover:bg-[var(--accent-amber-subtle)] hover:text-[var(--accent-amber)] hover:border-[rgba(251,191,36,0.3)]',
  };

  return (
    <Link href={href}>
      <Button
        variant="secondary"
        className={cn(
          'w-full h-auto py-4 flex-col gap-2 border-[var(--card-border)]',
          accentStyles[accent]
        )}
      >
        <Icon className="h-5 w-5" />
        <span className="text-sm">{name}</span>
      </Button>
    </Link>
  );
}

function getActivityDescription(activity: ActivityLog): string {
  const details = activity.activity_details || {};

  switch (activity.activity_type) {
    case 'upload':
      return `Uploaded: ${details.filename || 'New document'}`;
    case 'note':
      return `Created note: ${details.title || 'New note'}`;
    case 'summary':
      return `Generated summary`;
    case 'quiz':
      return `Generated quiz`;
    case 'quiz_attempt':
      const score = details.score !== undefined ? ` - ${details.score}%` : '';
      return `Completed quiz${score}`;
    case 'resume_uploaded':
      return `Uploaded resume`;
    case 'resume_analyzed':
      return `Analyzed resume - ${details.ats_score || 0}% ATS`;
    default:
      return 'Activity recorded';
  }
}

function getActivityIconComponent(type: string) {
  switch (type) {
    case 'upload':
      return FileText;
    case 'quiz':
    case 'quiz_attempt':
      return ClipboardCheck;
    case 'note':
      return BookOpen;
    case 'summary':
      return Brain;
    case 'resume_uploaded':
    case 'resume_analyzed':
      return Briefcase;
    default:
      return FileText;
  }
}

function getActivityAccent(type: string) {
  switch (type) {
    case 'upload':
      return { bg: 'bg-[var(--accent-blue-subtle)]', text: 'text-[var(--accent-blue)]' };
    case 'quiz':
    case 'quiz_attempt':
      return { bg: 'bg-[var(--accent-amber-subtle)]', text: 'text-[var(--accent-amber)]' };
    case 'note':
      return { bg: 'bg-[var(--accent-green-subtle)]', text: 'text-[var(--accent-green)]' };
    case 'summary':
      return { bg: 'bg-[var(--accent-purple-subtle)]', text: 'text-[var(--accent-purple)]' };
    case 'resume_uploaded':
    case 'resume_analyzed':
      return { bg: 'bg-[var(--accent-pink-subtle)]', text: 'text-[var(--accent-pink)]' };
    default:
      return { bg: 'bg-[var(--bg-elevated)]', text: 'text-[var(--text-secondary)]' };
  }
}

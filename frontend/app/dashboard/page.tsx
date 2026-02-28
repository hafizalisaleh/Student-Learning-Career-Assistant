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
  Flame,
  Upload,
  Briefcase,
  Clock,
  ArrowRight,
  Target,
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
    { name: 'Documents', value: progress?.total_documents || 0, icon: FileText, color: 'documents' },
    { name: 'Notes', value: progress?.total_notes || 0, icon: BookOpen, color: 'notes' },
    { name: 'Summaries', value: progress?.total_summaries || 0, icon: Brain, color: 'summaries' },
    { name: 'Quizzes', value: progress?.total_quizzes_generated || 0, icon: ClipboardCheck, color: 'quizzes' },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Welcome back, {user?.first_name || 'Student'}
          </h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            Here&apos;s your learning overview
          </p>
        </div>
        <Link href="/dashboard/documents">
          <Button variant="default" size="sm">
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Button>
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.name} className="stat-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="stat-value">{stat.value}</p>
                  <p className="stat-label">{stat.name}</p>
                </div>
                <div className={cn('icon-wrapper-sm', `icon-${stat.color}`)}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Progress Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="icon-wrapper icon-quizzes">
                  <Flame className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-tertiary)]">Study Streak</p>
                  <p className="text-lg font-semibold text-[var(--text-primary)]">
                    {progress?.study_streak_days || 0} <span className="text-sm font-normal text-[var(--text-tertiary)]">days</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="icon-wrapper icon-notes">
                  <Target className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs text-[var(--text-tertiary)]">Avg Score</p>
                  <p className="text-lg font-semibold text-[var(--text-primary)]">
                    {progress?.average_quiz_score?.toFixed(0) || '0'}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card p-4">
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Quick Actions</h3>
            <div className="grid grid-cols-4 gap-2">
              <QuickAction href="/dashboard/documents" icon={Upload} label="Upload" />
              <QuickAction href="/dashboard/notes/new" icon={BookOpen} label="Notes" />
              <QuickAction href="/dashboard/quizzes" icon={ClipboardCheck} label="Quiz" />
              <QuickAction href="/dashboard/career" icon={Briefcase} label="Career" />
            </div>
          </div>
        </div>

        {/* Right Column - Activity */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-[var(--text-secondary)]">Recent Activity</h3>
            <Clock className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          </div>

          {activities.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-10 h-10 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mx-auto mb-2">
                <FileText className="h-5 w-5 text-[var(--text-muted)]" />
              </div>
              <p className="text-sm text-[var(--text-tertiary)]">No activity yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
              <Link href="/dashboard/progress" className="block">
                <button className="w-full text-xs text-[var(--text-tertiary)] hover:text-[var(--primary)] py-2 flex items-center justify-center gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <Link href={href}>
      <div className="flex flex-col items-center gap-1.5 p-3 rounded-md hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer">
        <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />
        <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      </div>
    </Link>
  );
}

function ActivityItem({ activity }: { activity: ActivityLog }) {
  const description = getActivityDescription(activity);
  const Icon = getActivityIconComponent(activity.activity_type);

  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-[var(--card-border)] last:border-0">
      <div className="w-7 h-7 rounded-md bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0">
        <Icon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--text-primary)] truncate">{description}</p>
        <p className="text-xs text-[var(--text-muted)]">{formatRelativeTime(activity.timestamp)}</p>
      </div>
    </div>
  );
}

function getActivityDescription(activity: ActivityLog): string {
  const details = activity.activity_details || {};

  switch (activity.activity_type) {
    case 'UPLOAD':
      return `Uploaded: ${details.filename || 'Document'}`;
    case 'NOTE':
      return `Created note: ${details.title || 'Note'}`;
    case 'SUMMARY':
      return `Generated summary`;
    case 'QUIZ':
      return `Generated quiz`;
    case 'QUIZ_ATTEMPT':
      const score = details.score !== undefined ? ` - ${details.score}%` : '';
      return `Completed quiz${score}`;
    case 'RESUME_UPLOADED':
      return `Uploaded resume`;
    case 'RESUME_ANALYZED':
      return `Analyzed resume`;
    default:
      return 'Activity recorded';
  }
}

function getActivityIconComponent(type: string) {
  switch (type) {
    case 'UPLOAD': return FileText;
    case 'QUIZ':
    case 'QUIZ_ATTEMPT': return ClipboardCheck;
    case 'NOTE': return BookOpen;
    case 'SUMMARY': return Brain;
    case 'RESUME_UPLOADED':
    case 'RESUME_ANALYZED': return Briefcase;
    default: return FileText;
  }
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';
import { PageLoader } from '@/components/ui/loading-spinner';
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Brain,
  ClipboardCheck,
  Clock3,
  FileText,
  Flame,
  Sparkles,
  Target,
  Upload,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import type { ActivityLog, UserProgress } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
        setActivities(Array.isArray(activityData) ? activityData.slice(0, 6) : []);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        setActivities([]);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  const stats = useMemo(
    () => [
      {
        name: 'Documents',
        value: progress?.total_documents || 0,
        icon: FileText,
        color: 'documents',
        href: '/dashboard/documents',
        note: 'Sources indexed',
      },
      {
        name: 'Notes',
        value: progress?.total_notes || 0,
        icon: BookOpen,
        color: 'notes',
        href: '/dashboard/notes',
        note: 'Study material captured',
      },
      {
        name: 'Summaries',
        value: progress?.total_summaries || 0,
        icon: Brain,
        color: 'summaries',
        href: '/dashboard/summaries',
        note: 'Condensed revisions',
      },
      {
        name: 'Quizzes',
        value: progress?.total_quizzes_generated || 0,
        icon: ClipboardCheck,
        color: 'quizzes',
        href: '/dashboard/quizzes',
        note: 'Checks generated',
      },
    ],
    [progress]
  );

  const latestActivity = activities[0];
  const streak = progress?.study_streak_days || 0;
  const averageScore = progress?.average_quiz_score?.toFixed(0) || '0';
  const attemptedQuizzes = progress?.total_quizzes_attempted || 0;

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <section className="grid gap-5 xl:grid-cols-[1.65fr_0.95fr]">
        <div className="dashboard-panel overflow-hidden">
          <div className="panel-content flex h-full flex-col justify-between gap-8 p-6 lg:p-8">
            <div className="max-w-3xl">
              <p className="editorial-kicker">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--primary)]" />
                Knowledge desk
              </p>
              <h2 className="display-balance mt-4 font-serif text-4xl tracking-[-0.05em] text-[var(--text-primary)] sm:text-5xl">
                Welcome back, {user?.first_name || 'Student'}.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
                Turn your best sources into guided learning paths. Build short, sequential lessons from documents and live research, then move through them one step at a time.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href="/dashboard/documents">
                  <Button size="lg">
                    <Upload className="h-4 w-4" />
                    Add study material
                  </Button>
                </Link>
                <Link href="/dashboard/learn">
                  <Button variant="outline" size="lg">
                    <Sparkles className="h-4 w-4" />
                    Create learning path
                  </Button>
                </Link>
                <Badge variant="documents" size="lg">
                  {stats[0].value} indexed sources
                </Badge>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="metric-tile">
                <p className="editorial-kicker">
                  <Flame className="h-3.5 w-3.5 text-[var(--quizzes)]" />
                  Streak
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                  {streak}
                  <span className="ml-2 text-sm font-medium text-[var(--text-tertiary)]">days</span>
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Keep momentum by revisiting one concept today.</p>
              </div>

              <div className="metric-tile">
                <p className="editorial-kicker">
                  <Target className="h-3.5 w-3.5 text-[var(--notes)]" />
                  Average quiz score
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                  {averageScore}
                  <span className="ml-2 text-sm font-medium text-[var(--text-tertiary)]">%</span>
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Based on {attemptedQuizzes} quiz attempt{attemptedQuizzes === 1 ? '' : 's'}.</p>
              </div>

              <div className="metric-tile">
                <p className="editorial-kicker">
                  <Clock3 className="h-3.5 w-3.5 text-[var(--highlight)]" />
                  Latest activity
                </p>
                <p className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                  {latestActivity ? getActivityDescription(latestActivity) : 'No recent activity'}
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  {latestActivity ? formatRelativeTime(latestActivity.timestamp) : 'Start by uploading a document.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-content flex h-full flex-col gap-4 p-6">
            <div>
              <p className="editorial-kicker">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--highlight)]" />
                Session pulse
              </p>
              <h3 className="mt-3 font-serif text-2xl tracking-[-0.04em] text-[var(--text-primary)]">
                What the desk is telling you
              </h3>
            </div>

            <div className="space-y-3">
              <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Recommended next step</p>
                <p className="mt-2 text-base font-medium text-[var(--text-primary)]">
                  {stats[0].value === 0
                    ? 'Upload a strong source document.'
                    : stats[1].value === 0
                      ? 'Turn your best document into notes.'
                      : 'Create a learning path from your strongest source.'}
                </p>
              </div>

              <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Coverage</p>
                <p className="mt-2 text-base font-medium text-[var(--text-primary)]">
                  {stats[0].value} documents, {stats[1].value} notes, {stats[2].value} summaries.
                </p>
              </div>

              <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Path posture</p>
                <p className="mt-2 text-base font-medium text-[var(--text-primary)]">Best when your library is recent, clean, and ready to sequence.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.name} href={stat.href} className="dashboard-panel group overflow-hidden">
              <div className="panel-content p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                      {stat.name}
                    </p>
                    <p className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-[var(--text-primary)]">
                      {stat.value}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{stat.note}</p>
                  </div>
                  <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl', `icon-${stat.color}`)}>
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
                <div className="mt-6 flex items-center gap-2 text-sm text-[var(--text-secondary)] transition-colors group-hover:text-[var(--primary)]">
                  Open {stat.name.toLowerCase()}
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="dashboard-panel">
          <div className="panel-content p-6 lg:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="editorial-kicker">
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--notes)]" />
                  Quick actions
                </p>
                <h3 className="mt-3 font-serif text-2xl tracking-[-0.04em] text-[var(--text-primary)]">
                  Move the study loop forward
                </h3>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <QuickAction href="/dashboard/documents" icon={Upload} label="Upload source" note="Bring in PDFs, links, slides, and notes." />
              <QuickAction href="/dashboard/notes/new" icon={BookOpen} label="Draft notes" note="Convert understanding into reusable study material." />
              <QuickAction href="/dashboard/quizzes" icon={ClipboardCheck} label="Run a quiz" note="Check recall and weak spots quickly." />
              <QuickAction href="/dashboard/career" icon={Briefcase} label="Career prep" note="Turn learning progress into job-ready actions." />
            </div>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-content p-6 lg:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="editorial-kicker">
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--progress)]" />
                  Activity timeline
                </p>
                <h3 className="mt-3 font-serif text-2xl tracking-[-0.04em] text-[var(--text-primary)]">
                  Recent movement
                </h3>
              </div>
              <Link href="/dashboard/progress" className="text-sm text-[var(--primary)] hover:underline">
                View progress
              </Link>
            </div>

            {activities.length === 0 ? (
              <div className="mt-6 rounded-[1.35rem] border border-dashed border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_74%,transparent)] p-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-secondary)]">
                  <FileText className="h-5 w-5 text-[var(--text-muted)]" />
                </div>
                <p className="mt-4 text-base font-medium text-[var(--text-primary)]">No activity yet</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Upload a document to start building your learning trail.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {activities.map((activity, index) => (
                  <ActivityItem key={activity.id} activity={activity} isFirst={index === 0} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  note,
}: {
  href: string;
  icon: any;
  label: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--card-border-hover)] hover:shadow-[var(--card-shadow)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--primary)]">
            <Icon className="h-5 w-5" />
          </div>
          <p className="mt-4 text-base font-medium text-[var(--text-primary)]">{label}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{note}</p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 text-[var(--text-muted)]" />
      </div>
    </Link>
  );
}

function ActivityItem({ activity, isFirst }: { activity: ActivityLog; isFirst: boolean }) {
  const description = getActivityDescription(activity);
  const Icon = getActivityIconComponent(activity.activity_type);

  return (
    <div
      className={cn(
        'rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4',
        isFirst && 'shadow-[var(--card-shadow)]'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--primary)]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-[var(--text-primary)]">{description}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{formatRelativeTime(activity.timestamp)}</p>
        </div>
      </div>
    </div>
  );
}

function getActivityDescription(activity: ActivityLog): string {
  const details = activity.activity_details || {};

  switch (activity.activity_type) {
    case 'UPLOAD':
      return `Uploaded ${details.filename || 'a document'}`;
    case 'NOTE':
      return `Created note ${details.title ? `"${details.title}"` : ''}`.trim();
    case 'SUMMARY':
      return 'Generated a summary';
    case 'QUIZ':
      return 'Generated a quiz';
    case 'QUIZ_ATTEMPT':
      return `Completed a quiz${details.score !== undefined ? ` at ${details.score}%` : ''}`;
    case 'RESUME_UPLOADED':
      return 'Uploaded a resume';
    case 'RESUME_ANALYZED':
      return 'Analyzed a resume';
    default:
      return 'Activity recorded';
  }
}

function getActivityIconComponent(type: string) {
  switch (type) {
    case 'UPLOAD':
      return FileText;
    case 'QUIZ':
    case 'QUIZ_ATTEMPT':
      return ClipboardCheck;
    case 'NOTE':
      return BookOpen;
    case 'SUMMARY':
      return Brain;
    case 'RESUME_UPLOADED':
    case 'RESUME_ANALYZED':
      return Briefcase;
    default:
      return FileText;
  }
}

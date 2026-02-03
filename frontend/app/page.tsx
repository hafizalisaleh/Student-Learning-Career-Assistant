'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import {
  BookOpen,
  Brain,
  TrendingUp,
  FileText,
  GraduationCap,
  Sparkles,
  Briefcase,
  ClipboardCheck,
  ArrowRight,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return <LoadingSpinner fullScreen />;
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden">
      {/* Background mesh gradient */}
      <div className="absolute inset-0 bg-[var(--gradient-mesh)] pointer-events-none" />

      {/* Floating orbs */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-[var(--accent-blue)] rounded-full blur-[128px] opacity-20 pointer-events-none" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-[var(--accent-purple)] rounded-full blur-[128px] opacity-20 pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 border-b border-[var(--card-border)] bg-[var(--bg-secondary)]/80 backdrop-blur-xl sticky top-0">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-[var(--accent-blue)] to-[var(--accent-purple)]">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold text-[var(--text-primary)]">SLCA</span>
          </div>
          <div className="flex gap-3">
            <Link href="/login">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/register">
              <Button variant="primary">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 container mx-auto px-4 py-24 text-center">
        <div className="max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--accent-blue-subtle)] border border-[rgba(0,212,255,0.2)] mb-8">
            <Sparkles className="h-4 w-4 text-[var(--accent-blue)]" />
            <span className="text-sm font-medium text-[var(--accent-blue)]">AI-Powered Learning Platform</span>
          </div>

          {/* Main headline */}
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            <span className="text-[var(--text-primary)]">Learn Smarter with </span>
            <span className="gradient-text">AI Assistance</span>
          </h1>

          <p className="text-xl text-[var(--text-secondary)] mb-10 max-w-2xl mx-auto leading-relaxed">
            Transform your learning journey with AI-powered notes, summaries, quizzes, and career guidance.
            Upload any document and master the content faster.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto">
                Start Learning Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                Sign In
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6">
            <StatItem value="10K+" label="Active Students" />
            <StatItem value="50K+" label="Documents Processed" />
            <StatItem value="100K+" label="Quizzes Generated" />
            <StatItem value="95%" label="Satisfaction Rate" />
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section className="relative z-10 container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-4">
            Powerful Features
          </h2>
          <p className="text-[var(--text-secondary)] text-lg max-w-2xl mx-auto">
            Everything you need to accelerate your learning journey
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Large feature card */}
          <FeatureCard
            icon={<FileText className="h-8 w-8" />}
            title="Smart Document Processing"
            description="Upload PDFs, Word docs, PowerPoints, or paste URLs. Support for YouTube videos and web articles."
            accent="blue"
            className="lg:col-span-2"
          />

          <FeatureCard
            icon={<BookOpen className="h-8 w-8" />}
            title="AI-Generated Notes"
            description="Automatically generate structured, comprehensive notes from any content."
            accent="green"
          />

          <FeatureCard
            icon={<Brain className="h-8 w-8" />}
            title="Intelligent Summaries"
            description="Get brief, detailed, or bullet-point summaries in seconds."
            accent="purple"
          />

          <FeatureCard
            icon={<ClipboardCheck className="h-8 w-8" />}
            title="Interactive Quizzes"
            description="AI generates custom quizzes with multiple question types and instant feedback."
            accent="amber"
          />

          <FeatureCard
            icon={<TrendingUp className="h-8 w-8" />}
            title="Progress Tracking"
            description="Track your learning journey with detailed analytics and insights."
            accent="pink"
          />

          <FeatureCard
            icon={<Briefcase className="h-8 w-8" />}
            title="Career Guidance"
            description="Resume analysis, career recommendations, and interview preparation."
            accent="green"
            className="lg:col-span-2"
          />
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 container mx-auto px-4 py-20">
        <div className="relative overflow-hidden rounded-3xl p-12 text-center bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)]">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 mb-6">
              <Zap className="h-4 w-4 text-white" />
              <span className="text-sm font-medium text-white">Join Today</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
              Ready to Transform Your Learning?
            </h2>
            <p className="text-xl mb-8 text-white/80 max-w-2xl mx-auto">
              Join thousands of students already learning smarter with SLCA
            </p>
            <Link href="/register">
              <Button
                size="lg"
                className="bg-white text-[var(--accent-purple)] hover:bg-white/90 border-0"
              >
                Get Started Now - It&apos;s Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--card-border)] bg-[var(--bg-secondary)] py-8 mt-8">
        <div className="container mx-auto px-4 text-center text-[var(--text-tertiary)]">
          <p>&copy; 2024 SLCA. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-3xl font-bold gradient-text">{value}</p>
      <p className="text-sm text-[var(--text-tertiary)] mt-1">{label}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  accent = 'blue',
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  accent?: 'blue' | 'purple' | 'green' | 'amber' | 'pink';
  className?: string;
}) {
  const accentStyles = {
    blue: {
      bg: 'bg-[var(--accent-blue-subtle)]',
      text: 'text-[var(--accent-blue)]',
      border: 'hover:border-[rgba(0,212,255,0.3)]',
    },
    purple: {
      bg: 'bg-[var(--accent-purple-subtle)]',
      text: 'text-[var(--accent-purple)]',
      border: 'hover:border-[rgba(168,85,247,0.3)]',
    },
    green: {
      bg: 'bg-[var(--accent-green-subtle)]',
      text: 'text-[var(--accent-green)]',
      border: 'hover:border-[rgba(34,211,167,0.3)]',
    },
    amber: {
      bg: 'bg-[var(--accent-amber-subtle)]',
      text: 'text-[var(--accent-amber)]',
      border: 'hover:border-[rgba(251,191,36,0.3)]',
    },
    pink: {
      bg: 'bg-[var(--accent-pink-subtle)]',
      text: 'text-[var(--accent-pink)]',
      border: 'hover:border-[rgba(244,114,182,0.3)]',
    },
  };

  const styles = accentStyles[accent];

  return (
    <div
      className={cn(
        'p-6 rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)]',
        'transition-all duration-300 hover:-translate-y-1',
        styles.border,
        className
      )}
    >
      <div className={cn('inline-flex p-3 rounded-xl mb-4', styles.bg)}>
        <div className={styles.text}>{icon}</div>
      </div>
      <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
      <p className="text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}

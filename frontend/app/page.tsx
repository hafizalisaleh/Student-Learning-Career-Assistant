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
  Briefcase,
  ClipboardCheck,
  ArrowRight,
  MessageSquare,
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
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="border-b border-[var(--card-border)] bg-[var(--bg-elevated)] sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-[var(--primary)]">
              <GraduationCap className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-semibold text-[var(--text-primary)]">SLCA</span>
          </div>
          <div className="flex gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button variant="primary" size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12 md:py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-2xl md:text-3xl font-semibold text-[var(--text-primary)] mb-3">
            Smart Learning Content Assistant
          </h1>
          <p className="text-[var(--text-secondary)] mb-6 max-w-lg mx-auto">
            Upload your study materials and let AI help you learn. Generate notes, summaries, quizzes, and track your progress.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/register">
              <Button>
                Get Started
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline">Sign in</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-12 border-t border-[var(--card-border)]">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] text-center mb-8">
          Features
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
          <FeatureCard
            icon={FileText}
            title="Document Upload"
            description="Upload PDFs, Word docs, PowerPoints, or paste URLs and YouTube links."
          />
          <FeatureCard
            icon={BookOpen}
            title="AI Notes"
            description="Generate structured study notes from your documents automatically."
          />
          <FeatureCard
            icon={Brain}
            title="Smart Summaries"
            description="Get concise summaries in different formats - brief, detailed, or bullet points."
          />
          <FeatureCard
            icon={ClipboardCheck}
            title="Practice Quizzes"
            description="Create quizzes from your content with multiple question types."
          />
          <FeatureCard
            icon={MessageSquare}
            title="AI Assistant"
            description="Ask questions about your documents and get accurate answers."
          />
          <FeatureCard
            icon={TrendingUp}
            title="Progress Tracking"
            description="Monitor your learning with analytics and performance insights."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-md mx-auto text-center card p-8">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Ready to start learning?
          </h2>
          <p className="text-sm text-[var(--text-tertiary)] mb-4">
            Create a free account and upload your first document.
          </p>
          <Link href="/register">
            <Button>
              Create Account
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--card-border)] py-4 mt-8">
        <div className="container mx-auto px-4 text-center text-xs text-[var(--text-muted)]">
          SLCA - Smart Learning Content Assistant
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <div className="card p-4">
      <div className="w-8 h-8 rounded-md bg-[var(--primary-light)] flex items-center justify-center mb-3">
        <Icon className="h-4 w-4 text-[var(--primary)]" />
      </div>
      <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">{title}</h3>
      <p className="text-xs text-[var(--text-tertiary)]">{description}</p>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import {
  Brain,
  TrendingUp,
  FileText,
  Briefcase,
  ClipboardCheck,
  ArrowRight,
  Mic,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function HomePage() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const features = [
    {
      icon: FileText,
      title: 'Smart Documents',
      description: 'Upload and organize your study materials',
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      icon: Brain,
      title: 'AI-Powered Learning',
      description: 'Generate notes, summaries & quizzes',
      gradient: 'from-violet-500 to-purple-500',
    },
    {
      icon: Mic,
      title: 'Voice Control',
      description: 'Hands-free interaction with AI',
      gradient: 'from-rose-500 to-pink-500',
    },
    {
      icon: TrendingUp,
      title: 'Track Progress',
      description: 'Monitor your learning journey',
      gradient: 'from-emerald-500 to-teal-500',
    },
    {
      icon: Briefcase,
      title: 'Career Tools',
      description: 'Resume analysis & job matching',
      gradient: 'from-orange-500 to-amber-500',
    },
    {
      icon: ClipboardCheck,
      title: 'Practice Quizzes',
      description: 'Test your knowledge effectively',
      gradient: 'from-indigo-500 to-blue-500',
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] relative overflow-hidden">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[var(--bg-primary)]" />
        {/* Soft gradient orbs */}
        {mounted && (
          <>
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-br from-blue-500/5 to-violet-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-tr from-emerald-500/5 to-cyan-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3" />
          </>
        )}
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-[var(--card-border)] bg-[var(--bg-primary)]/80 backdrop-blur-md sticky top-0">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="SLCA" className="h-8 w-8 object-contain" />
            <span className="text-lg font-semibold text-[var(--text-primary)]">SLCA</span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
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
      <section className="relative z-10 container mx-auto px-4 py-20 md:py-28">
        <div className="max-w-2xl mx-auto text-center">
          <div
            className={cn(
              "transition-all duration-700",
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            )}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-violet-500/10 border border-blue-500/20 text-sm font-medium text-[var(--primary)] mb-6">
              <Sparkles className="w-4 h-4" />
              AI-Powered Learning Platform
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[var(--text-primary)] mb-6 leading-tight tracking-tight">
              Transform How You
              <span className="bg-gradient-to-r from-blue-500 to-violet-500 bg-clip-text text-transparent"> Learn</span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg text-[var(--text-secondary)] mb-10 max-w-lg mx-auto leading-relaxed">
              Upload your study materials and let AI help you master any subject with intelligent notes, summaries, and quizzes.
            </p>
          </div>

          {/* CTA Buttons */}
          <div
            className={cn(
              "flex flex-col sm:flex-row gap-4 justify-center transition-all duration-700 delay-200",
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
            )}
          >
            <Link href="/register">
              <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 shadow-lg shadow-blue-500/25 border-0">
                Start Learning Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="w-full sm:w-auto">
                Sign in
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 container mx-auto px-4 py-16">
        <div
          className={cn(
            "text-center mb-12 transition-all duration-700 delay-300",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
          )}
        >
          <h2 className="text-2xl md:text-3xl font-bold text-[var(--text-primary)] mb-3">
            Everything You Need
          </h2>
          <p className="text-[var(--text-tertiary)] max-w-md mx-auto">
            Powerful tools designed for effective learning
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              gradient={feature.gradient}
              delay={index * 80 + 400}
              mounted={mounted}
            />
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section
        className={cn(
          "relative z-10 container mx-auto px-4 py-20 transition-all duration-700 delay-700",
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        )}
      >
        <div className="max-w-md mx-auto">
          <div className="relative p-8 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-xl overflow-hidden">
            {/* Gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-violet-500/5" />

            <div className="relative text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-white flex items-center justify-center shadow-lg">
                <img src="/logo.png" alt="SLCA" className="h-10 w-10 object-contain" />
              </div>
              <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">
                Ready to excel?
              </h2>
              <p className="text-[var(--text-tertiary)] mb-6">
                Join thousands of students learning smarter.
              </p>
              <Link href="/register">
                <Button className="w-full bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 shadow-lg shadow-blue-500/25 border-0">
                  Create Free Account
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--card-border)] bg-[var(--bg-primary)]/80 backdrop-blur-sm py-6 mt-8">
        <div className="container mx-auto px-4 text-center text-sm text-[var(--text-muted)]">
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
  gradient,
  delay,
  mounted,
}: {
  icon: any;
  title: string;
  description: string;
  gradient: string;
  delay: number;
  mounted: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative p-5 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]",
        "transition-all duration-300 cursor-pointer",
        "hover:shadow-lg hover:border-[var(--card-border-hover)] hover:-translate-y-1",
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      )}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Icon */}
      <div className={cn(
        "w-11 h-11 rounded-xl flex items-center justify-center mb-4",
        "bg-gradient-to-br shadow-lg transition-transform duration-300 group-hover:scale-110",
        gradient
      )}>
        <Icon className="h-5 w-5 text-white" />
      </div>

      {/* Content */}
      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1.5 group-hover:text-[var(--primary)] transition-colors">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
        {description}
      </p>

      {/* Hover arrow */}
      <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
        <ArrowRight className="h-4 w-4 text-[var(--primary)]" />
      </div>
    </div>
  );
}

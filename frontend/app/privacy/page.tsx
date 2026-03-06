import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)] px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-[var(--text-primary)]">Privacy Policy</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          SLCA stores your account information and the content you upload so it can generate study materials,
          analytics, and career guidance inside your workspace.
        </p>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          Uploaded documents and resumes may be processed by integrated AI services to provide summaries, quizzes,
          and recommendations. Only upload content you are comfortable processing through those services.
        </p>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          You can remove your content by deleting documents, notes, quizzes, or resumes from the dashboard.
        </p>

        <Link href="/register" className="mt-8 inline-flex">
          <Button variant="secondary">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to sign up
          </Button>
        </Link>
      </div>
    </main>
  );
}

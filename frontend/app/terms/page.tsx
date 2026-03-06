import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-primary)] px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] p-8 shadow-sm">
        <h1 className="text-3xl font-semibold text-[var(--text-primary)]">Terms of Service</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          SLCA is provided for personal learning and career-development use. You are responsible for the files
          and information you upload, and you should avoid submitting confidential or sensitive material unless
          you understand how it will be processed.
        </p>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          Generated notes, summaries, quizzes, and recommendations are assistance tools. Review the output before
          relying on it for academic, professional, or employment decisions.
        </p>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          Misuse of the service, including uploading harmful content or attempting to access another user&apos;s data,
          is not permitted.
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

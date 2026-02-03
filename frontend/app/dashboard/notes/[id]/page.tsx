'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { LoadingSpinner, PageLoader } from '@/components/ui/loading-spinner';
import { ArrowLeft, Download, Trash2, Calendar, Tag, FileText } from 'lucide-react';
import type { Note } from '@/lib/types';
import { formatDate, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ViewNotePage() {
  const router = useRouter();
  const params = useParams();
  const noteId = params.id as string;

  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (noteId) {
      fetchNote();
    }
  }, [noteId]);

  async function fetchNote() {
    try {
      setIsLoading(true);
      const notes = await api.getNotes();
      const foundNote = notes.find((n: Note) => n.id.toString() === noteId);

      if (foundNote) {
        setNote(foundNote);
      } else {
        toast.error('Note not found');
        router.push('/dashboard/notes');
      }
    } catch (error) {
      console.error('Failed to load note:', error);
      toast.error('Failed to load note');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDownloadDocx() {
    if (!note) return;

    try {
      setIsDownloading(true);
      const blob = await api.exportNoteDocx(note.id);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${note.title.replace(/[^a-z0-9]/gi, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Document downloaded successfully');
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download document');
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleDelete() {
    if (!note) return;

    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      await api.deleteNote(note.id);
      toast.success('Note deleted successfully');
      router.push('/dashboard/notes');
    } catch (error) {
      toast.error('Failed to delete note');
    }
  }

  if (isLoading) {
    return <PageLoader />;
  }

  if (!note) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--text-secondary)]">Note not found</p>
        <Link href="/dashboard/notes">
          <Button variant="primary" className="mt-4">
            Back to Notes
          </Button>
        </Link>
      </div>
    );
  }

  const noteDate = note.created_at || note.generated_at;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link href="/dashboard/notes">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">{note.title}</h1>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-[var(--text-secondary)]">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(noteDate)}
              </span>
              {note.note_type && (
                <span className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  {note.note_type.charAt(0).toUpperCase() + note.note_type.slice(1)} Notes
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleDownloadDocx}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download DOCX
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={handleDelete}
            className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tags */}
      {note.tags && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {note.tags.map((tag, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)] text-sm rounded-full"
            >
              <Tag className="h-3 w-3" />
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Note Content */}
      <div className="p-6 rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)]">
        <div className="prose prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({node, ...props}) => <h1 className="text-3xl font-bold mt-8 mb-4 text-[var(--text-primary)]" {...props} />,
              h2: ({node, ...props}) => <h2 className="text-2xl font-bold mt-6 mb-3 text-[var(--text-primary)]" {...props} />,
              h3: ({node, ...props}) => <h3 className="text-xl font-semibold mt-4 mb-2 text-[var(--text-primary)]" {...props} />,
              p: ({node, ...props}) => <p className="mb-4 text-[var(--text-secondary)] leading-relaxed" {...props} />,
              ul: ({node, ...props}) => <ul className="list-disc list-inside mb-4 space-y-2 text-[var(--text-secondary)]" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-4 space-y-2 text-[var(--text-secondary)]" {...props} />,
              li: ({node, ...props}) => <li className="ml-4" {...props} />,
              strong: ({node, ...props}) => <strong className="font-bold text-[var(--text-primary)]" {...props} />,
              em: ({node, ...props}) => <em className="italic" {...props} />,
              code: ({node, inline, ...props}: any) =>
                inline ?
                  <code className="bg-[var(--bg-elevated)] text-[var(--accent-amber)] px-1.5 py-0.5 rounded text-sm font-mono" {...props} /> :
                  <code className="block bg-[var(--bg-primary)] text-[var(--text-primary)] p-4 rounded-lg overflow-x-auto text-sm font-mono my-4 border border-[var(--card-border)]" {...props} />,
              blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-[var(--accent-purple)] pl-4 italic text-[var(--text-secondary)] my-4" {...props} />,
              table: ({node, ...props}) => (
                <div className="overflow-x-auto my-6">
                  <table className="min-w-full divide-y divide-[var(--card-border)] border border-[var(--card-border)] rounded-lg" {...props} />
                </div>
              ),
              thead: ({node, ...props}) => <thead className="bg-[var(--bg-elevated)]" {...props} />,
              tbody: ({node, ...props}) => <tbody className="bg-[var(--bg-tertiary)] divide-y divide-[var(--card-border)]" {...props} />,
              tr: ({node, ...props}) => <tr {...props} />,
              th: ({node, ...props}) => <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider border border-[var(--card-border)]" {...props} />,
              td: ({node, ...props}) => <td className="px-6 py-4 text-sm text-[var(--text-secondary)] border border-[var(--card-border)]" {...props} />,
              a: ({node, ...props}) => <a className="text-[var(--accent-blue)] hover:underline" {...props} />,
            }}
          >
            {note.content}
          </ReactMarkdown>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex justify-between items-center pt-6 border-t border-[var(--card-border)]">
        <Link href="/dashboard/notes">
          <Button variant="secondary">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Notes
          </Button>
        </Link>

        <Button
          variant="primary"
          onClick={handleDownloadDocx}
          disabled={isDownloading}
        >
          {isDownloading ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              Downloading...
            </>
          ) : (
            <>
              <Download className="h-4 w-4 mr-2" />
              Download as DOCX
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

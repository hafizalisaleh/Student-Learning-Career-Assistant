'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { LoadingSpinner, PageLoader } from '@/components/ui/loading-spinner';
import { ArrowLeft, Download, Trash2, Calendar, Tag, FileText, Eye, X, FileDown } from 'lucide-react';
import type { Note } from '@/lib/types';
import { formatDate, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export default function ViewNotePage() {
  const router = useRouter();
  const params = useParams();
  const noteId = params.id as string;

  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

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

  async function handleDownloadMarkdown() {
    if (!note) return;

    try {
      setIsDownloading(true);
      const blob = await api.exportNoteMarkdown(note.id);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${note.title.replace(/[^a-z0-9]/gi, '_')}.md`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Markdown file downloaded successfully');
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download markdown file');
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleDownloadPdf() {
    if (!note || !previewRef.current) return;

    try {
      setIsGeneratingPdf(true);
      toast.loading('Generating PDF...', { id: 'pdf-gen' });

      // Dynamically import html2pdf to avoid SSR issues
      const html2pdf = (await import('html2pdf.js')).default;

      const element = previewRef.current;
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `${note.title.replace(/[^a-z0-9]/gi, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait'
        },
        pagebreak: { mode: 'avoid-all', before: '.page-break' }
      };

      await html2pdf().set(opt).from(element).save();
      toast.success('PDF downloaded successfully', { id: 'pdf-gen' });
    } catch (error) {
      console.error('PDF generation failed:', error);
      toast.error('Failed to generate PDF', { id: 'pdf-gen' });
    } finally {
      setIsGeneratingPdf(false);
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

  // Markdown components for rendering
  const markdownComponents = {
    h1: ({node, ...props}: any) => <h1 className="text-3xl font-bold mt-8 mb-4 text-[var(--text-primary)]" {...props} />,
    h2: ({node, ...props}: any) => <h2 className="text-2xl font-bold mt-6 mb-3 text-[var(--text-primary)]" {...props} />,
    h3: ({node, ...props}: any) => <h3 className="text-xl font-semibold mt-4 mb-2 text-[var(--text-primary)]" {...props} />,
    p: ({node, ...props}: any) => <p className="mb-4 text-[var(--text-secondary)] leading-relaxed" {...props} />,
    ul: ({node, ...props}: any) => <ul className="list-disc list-inside mb-4 space-y-2 text-[var(--text-secondary)]" {...props} />,
    ol: ({node, ...props}: any) => <ol className="list-decimal list-inside mb-4 space-y-2 text-[var(--text-secondary)]" {...props} />,
    li: ({node, ...props}: any) => <li className="ml-4" {...props} />,
    strong: ({node, ...props}: any) => <strong className="font-bold text-[var(--text-primary)]" {...props} />,
    em: ({node, ...props}: any) => <em className="italic" {...props} />,
    code: ({node, inline, ...props}: any) =>
      inline ?
        <code className="bg-[var(--bg-elevated)] text-[var(--accent-amber)] px-1.5 py-0.5 rounded text-sm font-mono" {...props} /> :
        <code className="block bg-[var(--bg-primary)] text-[var(--text-primary)] p-4 rounded-lg overflow-x-auto text-sm font-mono my-4 border border-[var(--card-border)]" {...props} />,
    blockquote: ({node, ...props}: any) => <blockquote className="border-l-4 border-[var(--accent-purple)] pl-4 italic text-[var(--text-secondary)] my-4" {...props} />,
    table: ({node, ...props}: any) => (
      <div className="overflow-x-auto my-6">
        <table className="min-w-full divide-y divide-[var(--card-border)] border border-[var(--card-border)] rounded-lg" {...props} />
      </div>
    ),
    thead: ({node, ...props}: any) => <thead className="bg-[var(--bg-elevated)]" {...props} />,
    tbody: ({node, ...props}: any) => <tbody className="bg-[var(--bg-tertiary)] divide-y divide-[var(--card-border)]" {...props} />,
    tr: ({node, ...props}: any) => <tr {...props} />,
    th: ({node, ...props}: any) => <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider border border-[var(--card-border)]" {...props} />,
    td: ({node, ...props}: any) => <td className="px-6 py-4 text-sm text-[var(--text-secondary)] border border-[var(--card-border)]" {...props} />,
    a: ({node, ...props}: any) => <a className="text-[var(--accent-blue)] hover:underline" {...props} />,
  };

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

        <div className="flex gap-2 flex-wrap">
          <Button
            variant="secondary"
            onClick={() => setShowPreview(true)}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button
            variant="secondary"
            onClick={handleDownloadMarkdown}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Markdown
              </>
            )}
          </Button>
          <Button
            variant="secondary"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
          >
            {isGeneratingPdf ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                PDF
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

      {/* Note Content - Used for PDF generation */}
      <div
        ref={previewRef}
        className="p-6 rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)]"
      >
        <div className="prose prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={markdownComponents}
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

        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={handleDownloadMarkdown}
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
                Download Markdown
              </>
            )}
          </Button>
          <Button
            variant="primary"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
          >
            {isGeneratingPdf ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Generating...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-2" />
                Download PDF
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-[var(--bg-primary)] border border-[var(--card-border)] shadow-2xl">
            {/* Modal Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-[var(--card-border)] bg-[var(--bg-primary)]">
              <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">Preview: {note.title}</h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  This is how your note will look when exported
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadMarkdown}
                  disabled={isDownloading}
                >
                  <Download className="h-4 w-4 mr-1" />
                  MD
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={isGeneratingPdf}
                >
                  <FileDown className="h-4 w-4 mr-1" />
                  PDF
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6">
              {/* Preview styled like a document */}
              <div className="bg-white text-gray-900 rounded-lg shadow-lg p-8 min-h-[600px]">
                <h1 className="text-3xl font-bold text-gray-900 mb-2 border-b-2 border-blue-600 pb-4">
                  {note.title}
                </h1>
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
                  <span>Type: {note.note_type?.charAt(0).toUpperCase() + note.note_type?.slice(1)}</span>
                  <span>|</span>
                  <span>Generated: {formatDate(noteDate)}</span>
                </div>

                <div className="prose prose-lg max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      h1: ({node, ...props}) => <h1 className="text-2xl font-bold mt-6 mb-3 text-gray-900" {...props} />,
                      h2: ({node, ...props}) => <h2 className="text-xl font-bold mt-5 mb-2 text-gray-900" {...props} />,
                      h3: ({node, ...props}) => <h3 className="text-lg font-semibold mt-4 mb-2 text-gray-800" {...props} />,
                      p: ({node, ...props}) => <p className="mb-3 text-gray-700 leading-relaxed" {...props} />,
                      ul: ({node, ...props}) => <ul className="list-disc list-inside mb-3 space-y-1 text-gray-700" {...props} />,
                      ol: ({node, ...props}) => <ol className="list-decimal list-inside mb-3 space-y-1 text-gray-700" {...props} />,
                      li: ({node, ...props}) => <li className="ml-4" {...props} />,
                      strong: ({node, ...props}) => <strong className="font-bold text-gray-900" {...props} />,
                      em: ({node, ...props}) => <em className="italic" {...props} />,
                      code: ({node, inline, ...props}: any) =>
                        inline ?
                          <code className="bg-gray-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono" {...props} /> :
                          <code className="block bg-gray-100 text-gray-800 p-4 rounded-lg overflow-x-auto text-sm font-mono my-4 border border-gray-200" {...props} />,
                      blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-600 my-4" {...props} />,
                      table: ({node, ...props}) => (
                        <div className="overflow-x-auto my-4">
                          <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg" {...props} />
                        </div>
                      ),
                      thead: ({node, ...props}) => <thead className="bg-gray-50" {...props} />,
                      tbody: ({node, ...props}) => <tbody className="bg-white divide-y divide-gray-200" {...props} />,
                      tr: ({node, ...props}) => <tr {...props} />,
                      th: ({node, ...props}) => <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase border border-gray-200" {...props} />,
                      td: ({node, ...props}) => <td className="px-4 py-2 text-sm text-gray-700 border border-gray-200" {...props} />,
                      a: ({node, ...props}) => <a className="text-blue-600 hover:underline" {...props} />,
                    }}
                  >
                    {note.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

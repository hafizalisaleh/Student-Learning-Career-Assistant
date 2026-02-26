'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { LoadingSpinner, PageLoader } from '@/components/ui/loading-spinner';
import { ArrowLeft, Download, Trash2, Calendar, Tag, FileText, Edit3, Eye, Check, Copy, FileDown } from 'lucide-react';
import type { Document, Note } from '@/lib/types';
import { formatDate, cn, extractTextFromBlockNote } from '@/lib/utils';
import toast from 'react-hot-toast';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Breadcrumb, BreadcrumbItem } from '@/components/ui/breadcrumb';

const BlockEditor = dynamic(() => import('@/components/editor/block-editor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <LoadingSpinner size="lg" />
    </div>
  ),
});

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export default function ViewNotePage() {
  const router = useRouter();
  const params = useParams();
  const noteId = params.id as string;

  const [note, setNote] = useState<Note | null>(null);
  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloadingDocx, setIsDownloadingDocx] = useState(false);
  const [isDownloadingMarkdown, setIsDownloadingMarkdown] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const exportContentRef = useRef<HTMLDivElement | null>(null);

  const isBlockNote = note?.content_format === 'blocknote';
  const isStudyNote = note?.note_type === 'study';

  useEffect(() => {
    if (noteId) fetchNote();
  }, [noteId]);

  async function fetchNote() {
    try {
      setIsLoading(true);
      const data = await api.getNote(noteId);
      setNote(data);
      setEditTitle(data.title);
      setEditContent(data.content);

      if (data.document_id) {
        try {
          const doc = await api.getDocument(data.document_id);
          setDocument(doc);
        } catch (e) {
          console.warn('Could not fetch document for breadcrumbs', e);
        }
      }
    } catch (error) {
      console.error('Failed to load note:', error);
      toast.error('Note not found');
      router.push('/dashboard/notes');
    } finally {
      setIsLoading(false);
    }
  }

  // Debounced auto-save
  const debouncedSave = useCallback(
    (title: string, content: string, contentFormat?: Note['content_format']) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus('unsaved');
      saveTimerRef.current = setTimeout(async () => {
        try {
          setSaveStatus('saving');
          const updateData: { title: string; content: string; content_format?: Note['content_format'] } = { title, content };
          if (contentFormat) updateData.content_format = contentFormat;
          await api.updateNote(noteId, updateData);
          setSaveStatus('saved');
          setNote(prev => prev ? {
            ...prev,
            title,
            content,
            content_format: contentFormat || prev.content_format,
          } : null);
        } catch (error) {
          console.error('Auto-save failed:', error);
          setSaveStatus('error');
        }
      }, 1500);
    },
    [noteId]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleTitleChange = (value: string) => {
    setEditTitle(value);
    debouncedSave(value, editContent, isEditing ? 'blocknote' : undefined);
  };

  const handleBlockEditorChange = (json: string) => {
    setEditContent(json);
    debouncedSave(editTitle, json, 'blocknote');
  };

  const enterEditMode = () => {
    setEditTitle(note?.title || '');
    setEditContent(note?.content || '');
    setIsEditing(true);
    setSaveStatus('saved');
  };

  const exitEditMode = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (saveStatus === 'unsaved') {
      api.updateNote(noteId, {
        title: editTitle,
        content: editContent,
        content_format: 'blocknote',
      })
        .then(() => {
          setNote(prev => prev ? { ...prev, title: editTitle, content: editContent, content_format: 'blocknote' } : null);
        })
        .catch(err => console.error('Final save failed:', err));
    }
    setIsEditing(false);
    setSaveStatus('saved');
  };

  const copyContent = () => {
    if (!note) return;
    const contentToCopy = note.content_format === 'blocknote'
      ? extractTextFromBlockNote(note.content)
      : (note.content || editContent);
    navigator.clipboard.writeText(contentToCopy);
    toast.success('Content copied to clipboard');
  };

  async function handleDownloadDocx() {
    if (!note) return;
    try {
      setIsDownloadingDocx(true);
      const blob = await api.exportNoteDocx(note.id);
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${note.title.replace(/[^a-z0-9]/gi, '_')}.docx`;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
      toast.success('Document downloaded successfully');
    } catch (error) {
      toast.error('Failed to download document');
    } finally {
      setIsDownloadingDocx(false);
    }
  }

  async function handleDownloadMarkdown() {
    if (!note) return;
    try {
      setIsDownloadingMarkdown(true);
      const blob = await api.exportNoteMarkdown(note.id);
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `${note.title.replace(/[^a-z0-9]/gi, '_')}.md`;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
      toast.success('Markdown downloaded successfully');
    } catch (error) {
      toast.error('Failed to download markdown');
    } finally {
      setIsDownloadingMarkdown(false);
    }
  }

  async function handleDownloadPdf() {
    if (!note || !exportContentRef.current) return;
    try {
      setIsGeneratingPdf(true);
      toast.loading('Generating PDF...', { id: 'pdf-gen' });

      const html2pdf = (await import('html2pdf.js')).default;
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `${note.title.replace(/[^a-z0-9]/gi, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      };

      await html2pdf().set(opt).from(exportContentRef.current).save();
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

  if (isLoading) return <PageLoader />;

  if (!note) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--text-secondary)]">Note not found</p>
        <Link href="/dashboard/notes">
          <Button variant="primary" className="mt-4">Back to Notes</Button>
        </Link>
      </div>
    );
  }

  const noteDate = note.created_at || note.generated_at;

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'Notes', href: '/dashboard/notes' }
  ];
  if (document) {
    breadcrumbItems.unshift({ label: 'Documents', href: '/dashboard/documents' });
    breadcrumbItems.splice(1, 0, { label: document.title, href: `/dashboard/documents/${document.id}` });
  }
  breadcrumbItems.push({ label: note.title });

  const saveStatusIndicator = () => {
    if (!isEditing && !isStudyNote) return null;
    if (saveStatus === 'saved' && !isEditing) return null;
    const statusMap = {
      saved: { text: 'Saved', className: 'text-[var(--success)]' },
      saving: { text: 'Saving...', className: 'text-[var(--text-tertiary)]' },
      unsaved: { text: 'Unsaved changes', className: 'text-[var(--warning)]' },
      error: { text: 'Save failed', className: 'text-[var(--error)]' },
    };
    const status = statusMap[saveStatus];
    return (
      <span className={cn('text-xs flex items-center gap-1', status.className)}>
        {saveStatus === 'saved' && <Check className="h-3 w-3" />}
        {saveStatus === 'saving' && <LoadingSpinner size="sm" />}
        {status.text}
      </span>
    );
  };

  const noteTypeLabel = note.note_type === 'study' ? 'Study Notes' :
    `${(note.note_type || 'structured').charAt(0).toUpperCase() + (note.note_type || 'structured').slice(1)} Notes`;

  // For study notes, always show the block editor (editable)
  // For AI notes, show markdown view by default, block editor when editing
  const showBlockEditor = isEditing || isStudyNote || isBlockNote;
  const canMarkdownExports = !isStudyNote && !showBlockEditor;

  const markdownComponents = {
    h1: ({ ...props }) => <h1 className="text-2xl font-bold mt-8 mb-4 text-[var(--text-primary)]" {...props} />,
    h2: ({ ...props }) => <h2 className="text-xl font-bold mt-6 mb-3 text-[var(--text-primary)]" {...props} />,
    h3: ({ ...props }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-[var(--text-primary)]" {...props} />,
    p: ({ ...props }) => <p className="mb-4 text-[var(--text-secondary)] leading-relaxed" {...props} />,
    ul: ({ ...props }) => <ul className="list-disc list-inside mb-4 space-y-2 text-[var(--text-secondary)]" {...props} />,
    ol: ({ ...props }) => <ol className="list-decimal list-inside mb-4 space-y-2 text-[var(--text-secondary)]" {...props} />,
    li: ({ ...props }) => <li className="ml-4" {...props} />,
    strong: ({ ...props }) => <strong className="font-bold text-[var(--text-primary)]" {...props} />,
    code: ({ className, ...props }: { className?: string; [key: string]: any }) =>
      className
        ? <code className={`block bg-[var(--bg-primary)] text-[var(--text-primary)] p-4 rounded-lg overflow-x-auto text-sm font-mono my-4 border border-[var(--card-border)] ${className}`} {...props} />
        : <code className="bg-[var(--bg-elevated)] text-[var(--accent-amber)] px-1.5 py-0.5 rounded text-sm font-mono" {...props} />,
    blockquote: ({ ...props }) => <blockquote className="border-l-4 border-[var(--primary)] pl-4 italic text-[var(--text-secondary)] my-4" {...props} />,
    table: ({ ...props }) => (
      <div className="overflow-x-auto my-6">
        <table className="min-w-full divide-y divide-[var(--card-border)] border border-[var(--card-border)] rounded-lg" {...props} />
      </div>
    ),
    thead: ({ ...props }) => <thead className="bg-[var(--bg-elevated)]" {...props} />,
    tbody: ({ ...props }) => <tbody className="bg-[var(--bg-tertiary)] divide-y divide-[var(--card-border)]" {...props} />,
    th: ({ ...props }) => <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider border border-[var(--card-border)]" {...props} />,
    td: ({ ...props }) => <td className="px-6 py-4 text-sm text-[var(--text-secondary)] border border-[var(--card-border)]" {...props} />,
    a: ({ ...props }) => <a className="text-[var(--accent-blue)] hover:underline" {...props} />,
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Breadcrumb items={breadcrumbItems} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex-1">
          {isEditing || isStudyNote ? (
            <input
              type="text"
              value={editTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="text-xl font-semibold text-[var(--text-primary)] bg-transparent border-b-2 border-[var(--primary)] outline-none w-full pb-1"
              placeholder="Note title..."
            />
          ) : (
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">{note.title}</h1>
          )}
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-[var(--text-secondary)]">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatDate(noteDate)}
            </span>
            <span className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              {noteTypeLabel}
            </span>
            {saveStatusIndicator()}
          </div>
        </div>

        <div className="flex gap-2">
          {!isStudyNote && (
            <Button
              variant={isEditing ? 'primary' : 'secondary'}
              size="sm"
              onClick={isEditing ? exitEditMode : enterEditMode}
            >
              {isEditing ? (
                <><Eye className="h-4 w-4 mr-2" />View</>
              ) : (
                <><Edit3 className="h-4 w-4 mr-2" />Edit</>
              )}
            </Button>
          )}
          {!isBlockNote && (
            <Button variant="ghost" size="sm" onClick={copyContent}>
              <Copy className="h-4 w-4" />
            </Button>
          )}
          {canMarkdownExports && (
            <>
              <Button variant="secondary" size="sm" onClick={handleDownloadMarkdown} disabled={isDownloadingMarkdown}>
                {isDownloadingMarkdown ? <LoadingSpinner size="sm" /> : <Download className="h-4 w-4" />}
              </Button>
              <Button variant="secondary" size="sm" onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? <LoadingSpinner size="sm" /> : <FileDown className="h-4 w-4" />}
              </Button>
            </>
          )}
          {!isStudyNote && (
            <Button variant="secondary" size="sm" onClick={handleDownloadDocx} disabled={isDownloadingDocx}>
              {isDownloadingDocx ? <LoadingSpinner size="sm" /> : <Download className="h-4 w-4" />}
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tags */}
      {note.tags && note.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {note.tags.map((tag, index) => (
            <span key={index} className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)] text-sm rounded-full">
              <Tag className="h-3 w-3" />
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Note Content */}
      <div
        ref={showBlockEditor ? null : exportContentRef}
        className={cn(
          'rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)]',
          showBlockEditor ? 'p-2' : 'p-6'
        )}
      >
        {showBlockEditor ? (
          <BlockEditor
            initialContent={isBlockNote ? note.content : undefined}
            markdownContent={!isBlockNote && isEditing ? note.content : undefined}
            onChange={handleBlockEditorChange}
            editable={isEditing || isStudyNote}
          />
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={markdownComponents}
            >
              {note.content}
            </ReactMarkdown>
          </div>
        )}
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
          {canMarkdownExports && (
            <>
              <Button variant="secondary" onClick={handleDownloadMarkdown} disabled={isDownloadingMarkdown}>
                {isDownloadingMarkdown ? (
                  <><LoadingSpinner size="sm" className="mr-2" />Downloading...</>
                ) : (
                  <><Download className="h-4 w-4 mr-2" />Markdown</>
                )}
              </Button>
              <Button variant="secondary" onClick={handleDownloadPdf} disabled={isGeneratingPdf}>
                {isGeneratingPdf ? (
                  <><LoadingSpinner size="sm" className="mr-2" />Generating...</>
                ) : (
                  <><FileDown className="h-4 w-4 mr-2" />PDF</>
                )}
              </Button>
            </>
          )}
          {!isStudyNote && (
            <Button variant="primary" onClick={handleDownloadDocx} disabled={isDownloadingDocx}>
              {isDownloadingDocx ? (
                <><LoadingSpinner size="sm" className="mr-2" />Downloading...</>
              ) : (
                <><Download className="h-4 w-4 mr-2" />Download as DOCX</>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

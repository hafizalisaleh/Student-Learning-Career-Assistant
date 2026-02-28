'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Plus, Search, BookOpen, Trash2, Calendar, Tag, Download, Sparkles, Edit3, ExternalLink, FileText } from 'lucide-react';
import type { Note } from '@/lib/types';
import { formatDate, truncateText, extractTextFromBlockNote, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import Link from 'next/link';

type NoteFilter = 'all' | 'ai' | 'study';
type ApiLikeError = { message?: string; response?: { data?: { detail?: string } } };

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<NoteFilter>('all');

  useEffect(() => {
    fetchNotes();
  }, []);

  async function fetchNotes() {
    try {
      setIsLoading(true);
      const data = await api.getNotes();
      setNotes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load notes:', error);
      toast.error('Failed to load notes');
      setNotes([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      await api.deleteNote(id);
      toast.success('Note deleted successfully');
      setNotes(notes.filter((note) => note.id !== id));
    } catch (error) {
      toast.error('Failed to delete note');
    }
  }

  const getErrorMessage = (error: unknown, fallback: string) => {
    const typedError = error as ApiLikeError;
    return typedError.response?.data?.detail || typedError.message || fallback;
  };

  async function handleDownloadDocx(id: string, title: string) {
    try {
      toast.loading('Preparing DOCX download...', { id: 'docx-download' });
      const blob = await api.exportNoteDocx(id);
      if (!blob || blob.size === 0) throw new Error('Received empty DOCX file');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
      toast.success('DOCX downloaded successfully', { id: 'docx-download' });
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'Failed to download DOCX');
      toast.error(errorMessage, { id: 'docx-download' });
    }
  }

  async function handleDownloadMarkdown(id: string, title: string) {
    try {
      toast.loading('Preparing Markdown download...', { id: 'md-download' });
      const blob = await api.exportNoteMarkdown(id);
      if (!blob || blob.size === 0) throw new Error('Received empty Markdown file');

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]/gi, '_')}.md`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);

      toast.success('Markdown downloaded successfully', { id: 'md-download' });
    } catch (error) {
      const errorMessage = getErrorMessage(error, 'Failed to download Markdown');
      toast.error(errorMessage, { id: 'md-download' });
    }
  }

  const getContentPreview = (note: Note): string => {
    if (note.content_format === 'blocknote') {
      return extractTextFromBlockNote(note.content);
    }
    return note.content;
  };

  const filteredNotes = notes
    .filter(note => {
      if (typeFilter === 'ai') return note.note_type !== 'study';
      if (typeFilter === 'study') return note.note_type === 'study';
      return true;
    })
    .filter(note =>
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getContentPreview(note).toLowerCase().includes(searchQuery.toLowerCase())
    );

  const aiCount = notes.filter(n => n.note_type !== 'study').length;
  const studyCount = notes.filter(n => n.note_type === 'study').length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Notes</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">AI-generated and personal study notes</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/notes/new?type=study">
            <Button variant="secondary" size="sm">
              <Edit3 className="h-4 w-4 mr-2" />
              Study Note
            </Button>
          </Link>
          <Link href="/dashboard/notes/new">
            <Button variant="default" size="sm">
              <Sparkles className="h-4 w-4 mr-2" />
              AI Notes
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex p-0.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--card-border)]">
          {([
            { key: 'all', label: `All (${notes.length})` },
            { key: 'ai', label: `AI Generated (${aiCount})` },
            { key: 'study', label: `Study (${studyCount})` },
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setTypeFilter(tab.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                typeFilter === tab.key
                  ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
          <Input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={searchQuery ? 'No notes found' : 'No notes yet'}
          description={searchQuery ? 'Try a different search term' : 'Create your first note to get started'}
          action={
            !searchQuery ? (
              <Link href="/dashboard/notes/new">
                <Button variant="default">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Note
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => {
            const isStudy = note.note_type === 'study';
            const preview = getContentPreview(note);
            return (
              <Link key={note.id} href={`/dashboard/notes/${note.id}`}>
                <Card className="hover:shadow-lg transition-all hover:border-[var(--primary)] cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base line-clamp-1">{note.title}</CardTitle>
                      <Badge variant={isStudy ? 'info' : 'notes'} size="sm">
                        {isStudy ? 'Study' : (note.note_type || 'AI')}
                      </Badge>
                    </div>
                    <CardDescription className="flex items-center gap-2 text-xs">
                      <Calendar className="h-3 w-3" />
                      {formatDate(note.created_at || note.generated_at)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-[var(--text-secondary)] text-sm mb-3 line-clamp-3">
                      {truncateText(preview, 150)}
                    </p>

                    {note.tags && note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {note.tags.slice(0, 3).map((tag, index) => (
                          <Badge key={index} variant="notes" size="sm">
                            <Tag className="h-2.5 w-2.5 mr-0.5" />
                            {tag}
                          </Badge>
                        ))}
                        {note.tags.length > 3 && (
                          <span className="text-xs text-[var(--text-tertiary)]">+{note.tags.length - 3}</span>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2" onClick={(e) => e.preventDefault()}>
                      <Button variant="secondary" size="sm" className="flex-1" onClick={(e) => {
                        e.preventDefault();
                        window.location.href = `/dashboard/notes/${note.id}`;
                      }}>
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Open
                      </Button>
                      {!isStudy && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Download Markdown"
                            onClick={(e) => {
                              e.preventDefault();
                              handleDownloadMarkdown(note.id, note.title);
                            }}
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Download DOCX"
                            onClick={(e) => {
                              e.preventDefault();
                              handleDownloadDocx(note.id, note.title);
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button variant="destructive" size="sm" onClick={(e) => {
                        e.preventDefault();
                        handleDelete(note.id);
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

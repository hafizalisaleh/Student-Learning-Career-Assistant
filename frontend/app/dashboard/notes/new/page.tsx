'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/api';
import { createNoteSchema, type CreateNoteFormData } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner, PageLoader } from '@/components/ui/loading-spinner';
import { ArrowLeft, Sparkles, FileText, List, BookOpen, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import type { Document } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Breadcrumb, BreadcrumbItem } from '@/components/ui/breadcrumb';
import { useSearchParams } from 'next/navigation';

export default function NewNotePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <NewNoteContent />
    </Suspense>
  );
}

function NewNoteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const docIdFromQuery = searchParams.get('document');
  const isStudyMode = searchParams.get('type') === 'study';

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [noteType, setNoteType] = useState<'structured' | 'bullet' | 'detailed'>('structured');
  const [studyTitle, setStudyTitle] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateNoteFormData>({
    resolver: zodResolver(createNoteSchema),
  });

  useEffect(() => {
    async function fetchDocuments() {
      try {
        setIsLoadingDocs(true);
        const data = await api.getDocuments();

        const docsArray = Array.isArray(data) ? data : [];
        const completedDocs = docsArray.filter((doc) =>
          doc.processing_status?.toLowerCase() === 'completed'
        );

        setDocuments(completedDocs);

        // If doc ID in query, pre-select it
        if (docIdFromQuery) {
          const doc = completedDocs.find(d => d.id === docIdFromQuery);
          if (doc) {
            setSelectedDoc(doc);
            setValue('document_id', doc.id);
          }
        }
      } catch (error) {
        console.error('Failed to load documents:', error);
        toast.error('Failed to load documents');
      } finally {
        setIsLoadingDocs(false);
      }
    }
    fetchDocuments();
  }, [docIdFromQuery, setValue]);

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const onSubmit = async (data: CreateNoteFormData) => {
    if (!data.document_id) {
      toast.error('Please select a document');
      return;
    }

    try {
      setIsLoading(true);
      const noteData = {
        title: data.title,
        document_id: data.document_id,
        note_type: noteType,
        additional_context: additionalContext || undefined,
        tags: tags.length > 0 ? tags : undefined,
      };

      toast.loading('Generating AI-powered notes... This may take a moment', {
        id: 'generating',
        duration: 30000,
      });

      await api.createNote(noteData);

      toast.dismiss('generating');
      toast.success('Notes generated successfully!');
      router.push('/dashboard/notes');
    } catch (error: any) {
      toast.dismiss('generating');
      console.error('Error creating note:', error);
      toast.error(error.response?.data?.detail || 'Failed to generate notes');
    } finally {
      setIsLoading(false);
    }
  };

  const noteTypeOptions = [
    {
      value: 'structured',
      label: 'Structured Notes',
      icon: FileText,
      description: 'Organized with headings, sections, and clear structure',
    },
    {
      value: 'bullet',
      label: 'Bullet Points',
      icon: List,
      description: 'Concise bullet-point format for quick review',
    },
    {
      value: 'detailed',
      label: 'Detailed Notes',
      icon: BookOpen,
      description: 'Comprehensive notes with examples and explanations',
    },
  ];

  const handleCreateStudyNote = async () => {
    if (!selectedDoc) {
      toast.error('Please select a document');
      return;
    }
    if (!studyTitle.trim()) {
      toast.error('Please enter a title');
      return;
    }
    try {
      setIsLoading(true);
      const result = await api.createStudyNote({
        title: studyTitle,
        document_id: selectedDoc.id,
        content: '[]',
      });
      toast.success('Study note created!');
      router.push(`/dashboard/notes/${result.id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create study note');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoadingDocs) {
    return <PageLoader />;
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: 'Notes', href: '/dashboard/notes' }
  ];

  if (selectedDoc) {
    breadcrumbItems.unshift({ label: 'Documents', href: '/dashboard/documents' });
    breadcrumbItems.splice(1, 0, { label: selectedDoc.title, href: `/dashboard/documents/${selectedDoc.id}` });
  }

  breadcrumbItems.push({ label: isStudyMode ? 'New Study Note' : 'Generate AI Notes' });

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Breadcrumb items={breadcrumbItems} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {isStudyMode ? 'New Study Note' : 'Generate AI Notes'}
          </h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {isStudyMode ? 'Create a personal study note linked to a document' : 'Create comprehensive notes from your documents using AI'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard/notes')}
            className="md:hidden"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
      </div>

      {/* Study Note Creation */}
      {isStudyMode ? (
        <div className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] space-y-6">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Select Document <span className="text-red-400">*</span>
            </label>
            <select
              className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] text-[var(--text-primary)]"
              value={selectedDoc?.id || ''}
              onChange={(e) => {
                const doc = documents.find(d => d.id === e.target.value);
                setSelectedDoc(doc || null);
              }}
            >
              <option value="">-- Choose a document --</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>{doc.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Note Title <span className="text-red-400">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g., My study notes on Chapter 3"
              value={studyTitle}
              onChange={(e) => setStudyTitle(e.target.value)}
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="default"
              onClick={handleCreateStudyNote}
              disabled={isLoading || !selectedDoc || !studyTitle.trim()}
              className="flex-1"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Create Study Note
            </Button>
            <Link href="/dashboard/notes" className="flex-1">
              <Button type="button" variant="secondary" className="w-full" disabled={isLoading}>
                Cancel
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="p-6 rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)]">
              <div className="flex items-center gap-2 mb-6">
                <Sparkles className="h-5 w-5 text-[var(--accent-blue)]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Note Configuration</h2>
              </div>

              <div className="space-y-6">
                {/* Document Selection */}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Select Document <span className="text-red-400">*</span>
                  </label>
                  <select
                    className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] text-[var(--text-primary)]"
                    {...register('document_id')}
                  >
                    <option value="">-- Choose a document --</option>
                    {documents.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title}
                      </option>
                    ))}
                  </select>
                  {errors.document_id && (
                    <p className="mt-1 text-sm text-red-400">{errors.document_id.message}</p>
                  )}
                  {documents.length === 0 && (
                    <p className="mt-2 text-sm text-[var(--text-tertiary)]">
                      No documents available. Please{' '}
                      <Link href="/dashboard/documents" className="text-[var(--accent-blue)] hover:underline">
                        upload a document
                      </Link>{' '}
                      first.
                    </p>
                  )}
                </div>

                {/* Title */}
                <Input
                  label="Note Title"
                  placeholder="e.g., Introduction to Machine Learning - Chapter 1"
                  error={errors.title?.message}
                  required
                  {...register('title')}
                />

                {/* Note Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                    Note Type <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {noteTypeOptions.map((option) => {
                      const Icon = option.icon;
                      const isSelected = noteType === option.value;
                      return (
                        <div
                          key={option.value}
                          onClick={() => setNoteType(option.value as any)}
                          className={cn(
                            'cursor-pointer border-2 rounded-xl p-4 transition-all',
                            isSelected
                              ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-subtle)]'
                              : 'border-[var(--card-border)] hover:border-[var(--card-border-hover)] bg-[var(--bg-elevated)]'
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <Icon
                              className={cn(
                                'h-5 w-5 mt-1',
                                isSelected ? 'text-[var(--accent-blue)]' : 'text-[var(--text-tertiary)]'
                              )}
                            />
                            <div className="flex-1">
                              <div
                                className={cn(
                                  'font-medium mb-1',
                                  isSelected ? 'text-[var(--accent-blue)]' : 'text-[var(--text-primary)]'
                                )}
                              >
                                {option.label}
                              </div>
                              <p
                                className={cn(
                                  'text-sm',
                                  isSelected ? 'text-[var(--accent-blue)]' : 'text-[var(--text-tertiary)]'
                                )}
                              >
                                {option.description}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Additional Context */}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Additional Context (Optional)
                  </label>
                  <textarea
                    className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] min-h-[120px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
                    placeholder="Add any specific instructions, focus areas, or additional context you want incorporated into the notes..."
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                  />
                  <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                    Examples: "Focus on key formulas", "Include real-world examples", "Emphasize historical context"
                  </p>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                    Tags (Optional)
                  </label>
                  <div className="flex gap-2 mb-3">
                    <Input
                      type="text"
                      placeholder="Add a tag (e.g., Machine Learning)"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      className="flex-1"
                    />
                    <Button type="button" onClick={handleAddTag} variant="secondary">
                      Add
                    </Button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)] text-sm rounded-full"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="hover:text-[var(--text-primary)] ml-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                type="submit"
                variant="default"
                disabled={isLoading || documents.length === 0}
                className="flex-1"
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Generating Notes...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate AI Notes
                  </>
                )}
              </Button>
              <Link href="/dashboard/notes" className="flex-1">
                <Button type="button" variant="secondary" className="w-full" disabled={isLoading}>
                  Cancel
                </Button>
              </Link>
            </div>

            {/* Info Box */}
            <div className="p-5 rounded-xl bg-gradient-to-r from-[var(--accent-blue-subtle)] to-[var(--accent-purple-subtle)] border border-[rgba(0,212,255,0.2)]">
              <div className="flex gap-3">
                <Sparkles className="h-5 w-5 text-[var(--accent-blue)] flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium mb-2 text-[var(--text-primary)]">AI-Powered Note Generation</p>
                  <ul className="list-disc list-inside space-y-1 text-[var(--text-secondary)]">
                    <li>Automatically extracts and organizes key information</li>
                    <li>Creates structured notes with headings and sections</li>
                    <li>Incorporates your additional context and preferences</li>
                    <li>Generates comprehensive, study-ready notes</li>
                    <li>Download as DOCX for offline access</li>
                  </ul>
                </div>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

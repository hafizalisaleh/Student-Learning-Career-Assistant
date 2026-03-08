'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner, PageLoader } from '@/components/ui/loading-spinner';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  CloudUpload,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  FileType,
  Image,
  Layers3,
  Link as LinkIcon,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
  Youtube,
} from 'lucide-react';
import type { Document } from '@/lib/types';
import {
  getDocumentStatusDescription,
  isDocumentReadyForGeneration,
} from '@/lib/document-status';
import { formatDate, formatFileSize } from '@/lib/utils';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { Note, Quiz, QuizResult, Summary } from '@/lib/types';
import { StudyLoopStrip } from '@/components/documents/study-loop-strip';
import {
  createEmptyStudyLoopCounts,
  getStudyLoopNextStep,
  type StudyLoopCounts,
} from '@/lib/study-loop';

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'success' | 'background' | 'error';

const UPLOAD_POLL_INTERVAL_MS = 1500;
const UPLOAD_TIMEOUT_MS = 60000;

function supportsStudyWorkspace(contentType?: string) {
  return contentType?.toLowerCase() === 'pdf';
}

function getDeleteConfirmationMessage(doc: Document) {
  return [
    `Delete "${doc.title}"?`,
    '',
    'This will also remove the uploaded file, extracted text, vector chunks, and any related study content linked to this document.',
    '',
    'Related notes, summaries, and single-document quizzes may also be deleted.',
  ].join('\n');
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [studyLoopByDocument, setStudyLoopByDocument] = useState<Record<string, StudyLoopCounts>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [url, setUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileSize, setUploadFileSize] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploadStatusMessage, setUploadStatusMessage] = useState('');

  useEffect(() => {
    fetchDocuments();
    fetchLibraryArtifacts();
  }, []);

  useEffect(() => {
    const refreshLibraryState = () => {
      fetchDocuments(false);
      fetchLibraryArtifacts();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshLibraryState();
      }
    };

    window.addEventListener('focus', refreshLibraryState);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', refreshLibraryState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const hasActiveProcessing = documents.some((doc) => {
      const status = doc.processing_status?.toLowerCase();
      return status === 'pending' || status === 'processing';
    });

    if (!hasActiveProcessing) {
      return;
    }

    const interval = window.setInterval(() => {
      fetchDocuments(false);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [documents]);

  async function fetchDocuments(showLoader: boolean = true) {
    try {
      if (showLoader) setIsLoading(true);
      const data = await api.getDocuments();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast.error('Failed to load documents');
      setDocuments([]);
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }

  async function fetchLibraryArtifacts() {
    try {
      const [notesData, summariesData, quizzesData, attemptHistory] = await Promise.all([
        api.getNotes(),
        api.getSummaries(),
        api.getQuizzes(),
        api.getQuizAttemptHistory(),
      ]);

      const nextState: Record<string, StudyLoopCounts> = {};

      const ensureCounts = (documentId: string) => {
        if (!nextState[documentId]) {
          nextState[documentId] = createEmptyStudyLoopCounts();
        }
        return nextState[documentId];
      };

      (Array.isArray(notesData) ? (notesData as Note[]) : []).forEach((note) => {
        if (!note.document_id) return;
        ensureCounts(note.document_id).notes += 1;
      });

      (Array.isArray(summariesData) ? (summariesData as Summary[]) : []).forEach((summary) => {
        if (!summary.document_id) return;
        ensureCounts(summary.document_id).summaries += 1;
      });

      (Array.isArray(quizzesData) ? (quizzesData as Quiz[]) : []).forEach((quiz) => {
        const references =
          quiz.document_references?.length
            ? quiz.document_references
            : ((quiz as any).document_id ? [(quiz as any).document_id] : []);

        references.forEach((documentId) => {
          ensureCounts(documentId).quizzes += 1;
        });
      });

      const quizReferenceMap = new Map<string, string[]>();
      (Array.isArray(quizzesData) ? (quizzesData as Quiz[]) : []).forEach((quiz) => {
        const references =
          quiz.document_references?.length
            ? quiz.document_references
            : ((quiz as any).document_id ? [(quiz as any).document_id] : []);
        quizReferenceMap.set(quiz.id, references);
      });

      (Array.isArray(attemptHistory) ? (attemptHistory as QuizResult[]) : []).forEach((attempt) => {
        const references = quizReferenceMap.get(attempt.quiz_id) || [];
        references.forEach((documentId) => {
          const counts = ensureCounts(documentId);
          counts.quizAttempts += 1;
          counts.bestQuizScore = Math.max(
            Number(counts.bestQuizScore ?? 0),
            Number(attempt.score ?? 0)
          );
        });
      });

      setStudyLoopByDocument(nextState);
    } catch (error) {
      console.error('Failed to load study loop artifacts:', error);
    }
  }

  async function waitForDocumentReady(documentId: string) {
    const startedAt = Date.now();
    let progressFloor = 92;

    while (Date.now() - startedAt < UPLOAD_TIMEOUT_MS) {
      const document = await api.getDocument(documentId);
      const status = document.processing_status?.toLowerCase();

      if (status === 'failed') {
        throw new Error(
          document.doc_metadata?.error ||
          document.doc_metadata?.note ||
          'Document processing failed after upload'
        );
      }

      setUploadStatusMessage(getDocumentStatusDescription(document));
      setUploadProgress((current) => {
        const next = Math.min(99, Math.max(current, progressFloor));
        progressFloor = Math.min(99, next + Math.random() * 4 + 1);
        return next;
      });

      if (isDocumentReadyForGeneration(document)) {
        return document;
      }

      await new Promise((resolve) => setTimeout(resolve, UPLOAD_POLL_INTERVAL_MS));
    }

    return null;
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setUploadFileName(file.name);
    setUploadFileSize(file.size);
    setUploadStatus('uploading');
    setUploadProgress(0);
    setUploadError('');
    setUploadStatusMessage('Uploading your document...');
    setShowUploadModal(true);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + Math.random() * 15;
      });
    }, 200);

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const uploadedDocument = await api.uploadDocument(formData);

      clearInterval(progressInterval);
      setUploadProgress(92);
      setUploadStatus('processing');
      setUploadStatusMessage('Preparing your document...');

      const readyDocument = await waitForDocumentReady(uploadedDocument.id);
      await fetchDocuments(false);
      event.target.value = '';

      if (readyDocument) {
        setUploadProgress(100);
        setUploadStatus('success');
        setUploadStatusMessage(getDocumentStatusDescription(readyDocument));

        setTimeout(() => {
          setShowUploadModal(false);
          setUploadStatus('idle');
          setUploadStatusMessage('');
        }, 2000);
      } else {
        setUploadProgress(100);
        setUploadStatus('background');
        setUploadStatusMessage('Upload finished. Final processing is continuing in the background.');
      }
    } catch (error: any) {
      clearInterval(progressInterval);
      console.error('Upload error:', error);
      setUploadStatus('error');
      setUploadError(error.response?.data?.detail || error.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  }

  const closeUploadModal = () => {
    if (uploadStatus !== 'uploading' && uploadStatus !== 'processing') {
      setShowUploadModal(false);
      setUploadStatus('idle');
      setUploadError('');
      setUploadStatusMessage('');
    }
  };

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setUploadFileName(url);
    setUploadFileSize(0);
    setUploadStatus('uploading');
    setUploadProgress(0);
    setUploadError('');
    setUploadStatusMessage('Submitting your link...');
    setShowUploadModal(true);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 85) {
          clearInterval(progressInterval);
          return 85;
        }
        return prev + Math.random() * 10;
      });
    }, 300);

    try {
      setIsUploading(true);
      const uploadedDocument = await api.processUrl(url);

      clearInterval(progressInterval);
      setUploadProgress(92);
      setUploadStatus('processing');
      setUploadStatusMessage('Preparing your document...');

      const readyDocument = await waitForDocumentReady(uploadedDocument.id);
      setUrl('');
      setShowUrlInput(false);
      await fetchDocuments(false);

      if (readyDocument) {
        setUploadProgress(100);
        setUploadStatus('success');
        setUploadStatusMessage(getDocumentStatusDescription(readyDocument));

        setTimeout(() => {
          setShowUploadModal(false);
          setUploadStatus('idle');
          setUploadStatusMessage('');
        }, 2000);
      } else {
        setUploadProgress(100);
        setUploadStatus('background');
        setUploadStatusMessage('Upload finished. Final processing is continuing in the background.');
      }
    } catch (error: any) {
      clearInterval(progressInterval);
      console.error('URL processing error:', error);
      setUploadStatus('error');
      setUploadError(error.response?.data?.detail || error.message || 'Failed to process URL');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(id: string) {
    const documentToDelete = documents.find((doc) => doc.id === id);
    const confirmationMessage = documentToDelete
      ? getDeleteConfirmationMessage(documentToDelete)
      : 'Delete this document and its related study content?';

    if (!confirm(confirmationMessage)) return;

    try {
      const result = await api.deleteDocument(id);
      toast.success(result?.warnings?.length ? 'Document deleted with cleanup warnings' : 'Document deleted successfully');
      (result?.warnings || []).forEach((warning: string) => toast.error(warning));
      setDocuments(documents.filter((doc) => doc.id !== id));
      await fetchLibraryArtifacts();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete document');
    }
  }

  const filteredDocuments = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const readyCount = documents.filter((doc) => isDocumentReadyForGeneration(doc)).length;
  const processingCount = documents.filter((doc) => {
    const status = doc.processing_status?.toLowerCase();
    return status === 'pending' || status === 'processing';
  }).length;
  const studyReadyCount = documents.filter((doc) => supportsStudyWorkspace(doc.content_type)).length;

  const getTypeIcon = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'YOUTUBE':
        return <Youtube className="h-5 w-5" />;
      case 'PDF':
        return <FileText className="h-5 w-5" />;
      case 'IMAGE':
        return <Image className="h-5 w-5" />;
      case 'EXCEL':
        return <FileSpreadsheet className="h-5 w-5" />;
      case 'DOCX':
      case 'PPT':
        return <FileType className="h-5 w-5" />;
      default:
        return <File className="h-5 w-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'YOUTUBE':
        return 'bg-[var(--error-bg)] text-[var(--error)]';
      case 'PDF':
        return 'bg-[var(--accent-amber-subtle)] text-[var(--accent-amber)]';
      case 'IMAGE':
        return 'bg-[var(--accent-pink-subtle)] text-[var(--accent-pink)]';
      case 'EXCEL':
        return 'bg-[var(--accent-green-subtle)] text-[var(--accent-green)]';
      case 'DOCX':
      case 'PPT':
        return 'bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)]';
      default:
        return 'bg-[var(--accent)] text-[var(--text-secondary)]';
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || 'pending';
    switch (statusLower) {
      case 'completed':
        return 'border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)]';
      case 'processing':
        return 'border-[var(--info-border)] bg-[var(--info-bg)] text-[var(--info)]';
      case 'failed':
        return 'border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error)]';
      default:
        return 'border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning)]';
    }
  };

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-[1.55fr_0.95fr]">
        <div className="dashboard-panel overflow-hidden">
          <div className="panel-content p-6 lg:p-8">
            <p className="editorial-kicker">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--documents)]" />
              Source library
            </p>
            <h1 className="display-balance mt-4 font-serif text-4xl tracking-[-0.05em] text-[var(--text-primary)] sm:text-5xl">
              Build a document base your AI can actually reason over.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--text-secondary)]">
              Keep papers, slides, links, and text files in one archive, then move straight into summaries, notes, quizzes, and grounded questions.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                size="lg"
              >
                {isUploading ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-1" />
                    Uploading
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload source
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowUrlInput(!showUrlInput)}
                disabled={isUploading}
              >
                <LinkIcon className="h-4 w-4" />
                Add URL
              </Button>
              <Badge variant="documents" size="lg">
                {documents.length} total sources
              </Badge>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.jpg,.jpeg,.png"
              onChange={handleFileUpload}
              disabled={isUploading}
            />

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="metric-tile">
                <p className="editorial-kicker">
                  <Layers3 className="h-3.5 w-3.5 text-[var(--documents)]" />
                  Ready for study
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{readyCount}</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Documents already prepared for workspace and generation.</p>
              </div>

              <div className="metric-tile">
                <p className="editorial-kicker">
                  <Clock3 className="h-3.5 w-3.5 text-[var(--progress)]" />
                  In preparation
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{processingCount}</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">Uploads still being extracted, indexed, or enriched.</p>
              </div>

              <div className="metric-tile">
                <p className="editorial-kicker">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--quizzes)]" />
                  Study desk ready
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{studyReadyCount}</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">PDF sources that can open directly in the workspace.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-content flex h-full flex-col gap-5 p-6">
            <div>
              <p className="editorial-kicker">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--highlight)]" />
                Library controls
              </p>
              <h2 className="mt-3 font-serif text-2xl tracking-[-0.04em] text-[var(--text-primary)]">
                Search, filter, and jump back into work
              </h2>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <Input
                type="text"
                placeholder="Search your document archive..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-14"
              />
            </div>

            <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_76%,transparent)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Library note</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Strong outputs depend on clean sources. Favor complete PDFs, stable article URLs, and well-labeled files.
              </p>
            </div>

            <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_76%,transparent)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Visible now</p>
              <p className="mt-2 text-base font-medium text-[var(--text-primary)]">
                {filteredDocuments.length} matching document{filteredDocuments.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {showUrlInput && (
        <div className="dashboard-panel">
          <div className="panel-content p-4 lg:p-5">
            <form onSubmit={handleUrlSubmit} className="flex flex-col gap-3 lg:flex-row">
              <Input
                type="url"
                placeholder="Paste a YouTube video or article URL..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isUploading}
                className="flex-1"
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={isUploading || !url.trim()}>
                  {isUploading ? <LoadingSpinner size="sm" /> : 'Process link'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowUrlInput(false);
                    setUrl('');
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {filteredDocuments.length === 0 ? (
        <div className="dashboard-panel">
          <div className="panel-content p-16 text-center">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-[1.6rem] bg-[var(--accent)]">
              <FileText className="h-7 w-7 text-[var(--text-tertiary)]" />
            </div>
            <h3 className="mt-6 font-serif text-3xl tracking-[-0.04em] text-[var(--text-primary)]">
              {searchQuery ? 'No documents found' : 'No documents yet'}
            </h3>
            <p className="mx-auto mt-3 max-w-lg text-base leading-7 text-[var(--text-secondary)]">
              {searchQuery ? 'Try a different search term.' : 'Upload your first document to start building a usable study library.'}
            </p>
            {!searchQuery && (
              <Button className="mt-6" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Upload document
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className={cn(
          'grid grid-cols-1 gap-4',
          filteredDocuments.length === 1
            ? 'max-w-5xl'
            : 'xl:grid-cols-2 2xl:grid-cols-3'
        )}>
          {filteredDocuments.map((doc) => {
            const isSingleDocumentCard = filteredDocuments.length === 1;
            const canOpenWorkspace = supportsStudyWorkspace(doc.content_type);
            const readyForGeneration = isDocumentReadyForGeneration(doc);
            const studyLoopCounts = studyLoopByDocument[doc.id] || createEmptyStudyLoopCounts();
            const nextStep = getStudyLoopNextStep(readyForGeneration, studyLoopCounts);

            return (
              <div key={doc.id} className="dashboard-panel group overflow-hidden">
                <div className="panel-content flex h-full flex-col">
                  <div className={cn(
                    'relative overflow-hidden border-b border-[var(--card-border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--documents-bg)_84%,transparent),color-mix(in_srgb,var(--accent)_60%,transparent))]',
                    isSingleDocumentCard ? 'min-h-[240px]' : 'min-h-[168px] p-5 flex items-end'
                  )}>
                    {doc.thumbnail_path ? (
                      <img
                        src={api.getDocumentThumbnailUrl(doc.id)}
                        alt={`Preview of ${doc.title}`}
                        className="absolute inset-0 h-full w-full object-cover object-top opacity-85"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : null}
                    <div
                      className={cn(
                        'absolute inset-0',
                        isSingleDocumentCard
                          ? 'bg-[linear-gradient(180deg,rgba(10,16,24,0.04),rgba(10,16,24,0.32)_58%,rgba(10,16,24,0.72))]'
                          : 'bg-[linear-gradient(180deg,rgba(10,16,24,0.02),rgba(10,16,24,0.78))]'
                      )}
                    />
                    {isSingleDocumentCard ? (
                      <div className="absolute inset-x-0 bottom-0 p-5">
                        <div className="flex items-end justify-between gap-3">
                          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[rgba(10,16,24,0.42)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 backdrop-blur-md">
                            <span className={cn('flex h-8 w-8 items-center justify-center rounded-2xl border border-white/15 shadow-lg', getTypeColor(doc.content_type))}>
                              {getTypeIcon(doc.content_type)}
                            </span>
                            {doc.content_type}
                          </div>
                          <span className={cn('rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] backdrop-blur-sm', getStatusBadge(doc.processing_status), 'border-white/20 bg-white/10 text-white')}>
                            {doc.processing_status?.toLowerCase() || 'pending'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="relative flex items-center gap-3 rounded-[1.4rem] bg-[rgba(10,16,24,0.32)] px-3 py-3 backdrop-blur-md">
                        <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 shadow-lg backdrop-blur-sm', getTypeColor(doc.content_type))}>
                          {getTypeIcon(doc.content_type)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/75">
                            {doc.content_type}
                          </p>
                          <p className="truncate text-lg font-medium text-white">
                            {doc.title}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    {isSingleDocumentCard ? (
                      <div className="mb-4 flex items-start gap-3">
                        <div className={cn('mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--card-border)] shadow-sm', getTypeColor(doc.content_type))}>
                          {getTypeIcon(doc.content_type)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                            {doc.content_type} source
                          </p>
                          <h3 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)]">
                            {doc.title}
                          </h3>
                          {doc.original_filename && doc.original_filename !== doc.title ? (
                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                              {doc.original_filename}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-[var(--text-secondary)]">{formatDate(doc.created_at)}</p>
                      {!isSingleDocumentCard ? (
                        <span className={cn('rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]', getStatusBadge(doc.processing_status))}>
                          {doc.processing_status?.toLowerCase() || 'pending'}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[1.15rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_72%,transparent)] p-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Type</p>
                        <p className="mt-2 text-sm font-medium text-[var(--text-primary)] uppercase">{doc.content_type}</p>
                      </div>
                      <div className="rounded-[1.15rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_72%,transparent)] p-3.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Size</p>
                        <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                          {doc.file_size ? formatFileSize(doc.file_size) : 'Unknown'}
                        </p>
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
                      {getDocumentStatusDescription(doc)}
                    </p>

                    <div className="mt-4">
                      <StudyLoopStrip
                        compact
                        title="Document study loop"
                        readyForGeneration={readyForGeneration}
                        counts={studyLoopCounts}
                      />
                    </div>

                    <div className="mt-3 rounded-[1.15rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_74%,transparent)] px-3.5 py-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                        Next step
                      </p>
                      <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                        {nextStep.label}
                      </p>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--card-border)] pt-4">
                      {canOpenWorkspace && readyForGeneration ? (
                        <Link href={`/dashboard/workspace?id=${doc.id}`} className="flex-1">
                          <Button variant="default" size="sm" className="w-full">
                            <Sparkles className="h-4 w-4" />
                            Open study desk
                          </Button>
                        </Link>
                      ) : (
                        <Link href={`/dashboard/documents/${doc.id}`} className="flex-1">
                          <Button variant="default" size="sm" className="w-full">
                            <FileText className="h-4 w-4" />
                            View dossier
                          </Button>
                        </Link>
                      )}

                      <Link href={`/dashboard/documents/${doc.id}`}>
                        <Button variant="outline" size="sm">
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </Link>

                      {doc.file_url && (
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc.id)}
                        className="text-[var(--error)] hover:text-[var(--error)] hover:bg-[var(--error-bg)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeUploadModal}
          />

          <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] shadow-2xl zoom-in-95">
            <div className="relative bg-[linear-gradient(135deg,var(--primary),var(--highlight),var(--accent-purple))] p-6">
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
              <div className="relative flex items-center gap-4">
                <div className="rounded-[1.2rem] bg-white/18 p-3 backdrop-blur-sm">
                  {uploadStatus === 'success' ? (
                    <CheckCircle2 className="h-8 w-8 text-white" />
                  ) : uploadStatus === 'background' ? (
                    <CloudUpload className="h-8 w-8 text-white" />
                  ) : uploadStatus === 'error' ? (
                    <AlertCircle className="h-8 w-8 text-white" />
                  ) : (
                    <CloudUpload className="h-8 w-8 text-white" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-serif text-2xl tracking-[-0.03em] text-white">
                    {uploadStatus === 'uploading' && 'Uploading source'}
                    {uploadStatus === 'processing' && 'Preparing source'}
                    {uploadStatus === 'success' && 'Upload complete'}
                    {uploadStatus === 'background' && 'Still processing'}
                    {uploadStatus === 'error' && 'Upload failed'}
                  </h2>
                  <p className="truncate text-sm text-white/80">{uploadFileName}</p>
                </div>
                {(uploadStatus === 'success' || uploadStatus === 'background' || uploadStatus === 'error') && (
                  <button
                    onClick={closeUploadModal}
                    className="rounded-xl p-2 transition-colors hover:bg-white/20"
                  >
                    <X className="h-5 w-5 text-white" />
                  </button>
                )}
              </div>
            </div>

            <div className="bg-[var(--card-bg-solid)] p-6">
              <div className="mb-4 flex items-center gap-3 rounded-[1.35rem] bg-[var(--bg-secondary)] p-4">
                <div className="rounded-xl bg-[var(--bg-tertiary)] p-2.5">
                  {uploadFileName.startsWith('http') ? (
                    <LinkIcon className="h-5 w-5 text-[var(--text-secondary)]" />
                  ) : (
                    <FileText className="h-5 w-5 text-[var(--text-secondary)]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">{uploadFileName}</p>
                  {uploadFileSize > 0 && (
                    <p className="text-xs text-[var(--text-tertiary)]">{formatFileSize(uploadFileSize)}</p>
                  )}
                  {uploadFileName.startsWith('http') && (
                    <p className="text-xs text-[var(--text-tertiary)]">Web content</p>
                  )}
                </div>
              </div>

              {(uploadStatus === 'uploading' || uploadStatus === 'processing') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">
                      {uploadStatus === 'uploading' ? 'Uploading...' : 'Processing...'}
                    </span>
                    <span className="font-medium text-[var(--text-primary)]">{Math.round(uploadProgress)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-tertiary)]">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--highlight))] transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  {uploadStatus === 'processing' && (
                    <p className="mt-2 text-center text-xs text-[var(--text-tertiary)]">
                      {uploadStatusMessage || 'Extracting content and creating embeddings...'}
                    </p>
                  )}
                </div>
              )}

              {uploadStatus === 'success' && (
                <div className="py-4 text-center">
                  <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--success-bg)]">
                    <CheckCircle2 className="h-8 w-8 text-[var(--success)]" />
                  </div>
                  <p className="font-medium text-[var(--text-primary)]">Document uploaded successfully.</p>
                  <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                    {uploadStatusMessage || 'Your document is ready to use.'}
                  </p>
                </div>
              )}

              {uploadStatus === 'background' && (
                <div className="py-4 text-center">
                  <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-blue-subtle)]">
                    <CloudUpload className="h-8 w-8 text-[var(--accent-blue)]" />
                  </div>
                  <p className="font-medium text-[var(--text-primary)]">Upload finished successfully.</p>
                  <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                    {uploadStatusMessage || 'Your document is still being prepared in the background.'}
                  </p>
                </div>
              )}

              {uploadStatus === 'error' && (
                <div className="py-4 text-center">
                  <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--error-bg)]">
                    <AlertCircle className="h-8 w-8 text-[var(--error)]" />
                  </div>
                  <p className="font-medium text-[var(--text-primary)]">Upload failed</p>
                  <p className="mt-1 text-sm text-[var(--error)]">{uploadError}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-4"
                    onClick={() => {
                      setShowUploadModal(false);
                      setUploadStatus('idle');
                      fileInputRef.current?.click();
                    }}
                  >
                    Try again
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

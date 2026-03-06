'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner, PageLoader } from '@/components/ui/loading-spinner';
import {
  Upload,
  FileText,
  Trash2,
  ExternalLink,
  Search,
  Link as LinkIcon,
  Youtube,
  File,
  Image,
  FileSpreadsheet,
  FileType,
  X,
  CheckCircle2,
  AlertCircle,
  CloudUpload,
  Sparkles,
} from 'lucide-react';
import type { Document } from '@/lib/types';
import {
  getDocumentStatusDescription,
  isDocumentReadyForGeneration,
} from '@/lib/document-status';
import { formatDate, formatFileSize } from '@/lib/utils';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [url, setUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileSize, setUploadFileSize] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploadStatusMessage, setUploadStatusMessage] = useState('');


  useEffect(() => {
    fetchDocuments();
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
      if (showLoader) {
        setIsLoading(true);
      }
      const data = await api.getDocuments();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast.error('Failed to load documents');
      setDocuments([]);
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
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

    // Show upload modal
    setUploadFileName(file.name);
    setUploadFileSize(file.size);
    setUploadStatus('uploading');
    setUploadProgress(0);
    setUploadError('');
    setUploadStatusMessage('Uploading your document...');
    setShowUploadModal(true);

    // Simulate progress
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

      // Upload
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

    // Show upload modal for URL processing
    setUploadFileName(url);
    setUploadFileSize(0);
    setUploadStatus('uploading');
    setUploadProgress(0);
    setUploadError('');
    setUploadStatusMessage('Submitting your link...');
    setShowUploadModal(true);

    // Simulate progress
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
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete document');
    }
  }

  const filteredDocuments = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
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
    switch (type) {
      case 'YOUTUBE':
        return 'text-[var(--error)] bg-[var(--error-bg)]';
      case 'PDF':
        return 'text-[var(--accent-amber)] bg-[var(--accent-amber-subtle)]';
      case 'IMAGE':
        return 'text-[var(--accent-pink)] bg-[var(--accent-pink-subtle)]';
      case 'EXCEL':
        return 'text-[var(--accent-green)] bg-[var(--accent-green-subtle)]';
      case 'DOCX':
      case 'PPT':
        return 'text-[var(--accent-blue)] bg-[var(--accent-blue-subtle)]';
      default:
        return 'text-[var(--text-secondary)] bg-[var(--bg-elevated)]';
    }
  };

  const getStatusBadge = (status: string) => {
    const statusLower = status?.toLowerCase() || 'pending';
    switch (statusLower) {
      case 'completed':
        return 'bg-[var(--accent-green-subtle)] text-[var(--accent-green)] border-[rgba(34,211,167,0.3)]';
      case 'processing':
        return 'bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)] border-[rgba(0,212,255,0.3)]';
      case 'failed':
        return 'bg-[var(--error-bg)] text-[var(--error)] border-[var(--error-border)]';
      default:
        return 'bg-[var(--accent-amber-subtle)] text-[var(--accent-amber)] border-[rgba(251,191,36,0.3)]';
    }
  };

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Documents</h1>
          <p className="text-sm text-[var(--text-tertiary)]">Upload and manage your learning materials</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            variant="secondary"
            onClick={() => setShowUrlInput(!showUrlInput)}
            disabled={isUploading}
            className="flex-1 sm:flex-none h-10"
          >
            <LinkIcon className="h-4 w-4 mr-2" />
            <span className="whitespace-nowrap">Add URL</span>
          </Button>
          <Button
            variant="default"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="flex-1 sm:flex-none h-10 shadow-lg shadow-blue-500/20"
          >
            {isUploading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                <span className="whitespace-nowrap">Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                <span className="whitespace-nowrap">Upload File</span>
              </>
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.pptx,.txt,.md,.csv,.xlsx,.jpg,.jpeg,.png"
            onChange={handleFileUpload}
            disabled={isUploading}
          />
        </div>
      </div>

      {/* URL Input */}
      {showUrlInput && (
        <div className="p-4 rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)]">
          <form onSubmit={handleUrlSubmit} className="flex gap-3">
            <Input
              type="url"
              placeholder="Paste YouTube video URL or web article URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isUploading}
              className="flex-1"
            />
            <Button type="submit" disabled={isUploading || !url.trim()}>
              {isUploading ? <LoadingSpinner size="sm" /> : 'Process'}
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
          </form>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]" />
        <Input
          type="text"
          placeholder="Search documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-12"
        />
      </div>

      {/* Documents Grid */}
      {filteredDocuments.length === 0 ? (
        <div className="p-16 rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)] text-center">
          <div className="p-4 rounded-full bg-[var(--bg-elevated)] inline-block mb-4">
            <FileText className="h-8 w-8 text-[var(--text-tertiary)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            {searchQuery ? 'No documents found' : 'No documents yet'}
          </h3>
          <p className="text-[var(--text-secondary)] mb-6">
            {searchQuery
              ? 'Try a different search term'
              : 'Upload your first document to get started'}
          </p>
          {!searchQuery && (
            <Button
              variant="default"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => {
            const canOpenWorkspace = supportsStudyWorkspace(doc.content_type);
            const readyForGeneration = isDocumentReadyForGeneration(doc);

            return (
              <div
                key={doc.id}
                className="group rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)] hover:border-[var(--card-border-hover)] transition-all duration-200 overflow-hidden"
              >
              {/* Thumbnail Preview */}
              {doc.thumbnail_path && (
                <div className="relative w-full h-40 bg-[var(--bg-secondary)] border-b border-[var(--card-border)] overflow-hidden">
                  <img
                    src={api.getDocumentThumbnailUrl(doc.id)}
                    alt={`Preview of ${doc.title}`}
                    className="w-full h-full object-cover object-top"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}

              <div className="p-5">
                {/* Header */}
                <div className="flex items-start gap-3 mb-4">
                  <div className={cn('p-2.5 rounded-xl', getTypeColor(doc.content_type))}>
                    {getTypeIcon(doc.content_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-[var(--text-primary)] truncate">
                      {doc.title}
                    </h3>
                    <p className="text-sm text-[var(--text-tertiary)]">
                      {formatDate(doc.created_at)}
                    </p>
                  </div>
                </div>

                {/* Info */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Type</span>
                    <span className="font-medium text-[var(--text-primary)] uppercase text-xs">
                      {doc.content_type}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Status</span>
                    <span className={cn(
                      'px-2 py-0.5 rounded-full text-xs font-medium border',
                      getStatusBadge(doc.processing_status)
                    )}>
                      {doc.processing_status?.toLowerCase() || 'pending'}
                    </span>
                  </div>
                  {doc.file_size && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Size</span>
                      <span className="text-[var(--text-primary)]">
                        {formatFileSize(doc.file_size)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-3 border-t border-[var(--card-border)]">
                  {canOpenWorkspace && readyForGeneration ? (
                    <Link href={`/dashboard/workspace?id=${doc.id}`} className="flex-1">
                      <Button variant="default" size="sm" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 border-0 hover:from-blue-700 hover:to-indigo-700">
                        <Sparkles className="h-4 w-4 mr-2" />
                        Open Workspace
                      </Button>
                    </Link>
                  ) : (
                    <Link href={`/dashboard/documents/${doc.id}`} className="flex-1">
                      <Button variant="default" size="sm" className="w-full">
                        <FileText className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </Link>
                  )}
                  {canOpenWorkspace && readyForGeneration && (
                    <Link href={`/dashboard/documents/${doc.id}`} title="View Details">
                      <Button variant="secondary" size="sm">
                        <FileText className="h-4 w-4" />
                      </Button>
                    </Link>
                  )}
                  {doc.file_url && (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
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
            );
          })}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={closeUploadModal}
          />

          {/* Modal */}
          <div className="relative w-full max-w-md overflow-hidden rounded-3xl shadow-2xl zoom-in-95">
            {/* Gradient Header */}
            <div className="relative bg-gradient-to-r from-blue-500 via-violet-500 to-purple-500 p-6">
              <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
              <div className="relative flex items-center gap-4">
                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
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
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-white">
                    {uploadStatus === 'uploading' && 'Uploading Document'}
                    {uploadStatus === 'processing' && 'Processing Document'}
                    {uploadStatus === 'success' && 'Upload Complete!'}
                    {uploadStatus === 'background' && 'Still Processing'}
                    {uploadStatus === 'error' && 'Upload Failed'}
                  </h2>
                  <p className="text-sm text-white/80 truncate max-w-[250px]">
                    {uploadFileName}
                  </p>
                </div>
                {(uploadStatus === 'success' || uploadStatus === 'background' || uploadStatus === 'error') && (
                  <button
                    onClick={closeUploadModal}
                    className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                  >
                    <X className="h-5 w-5 text-white" />
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="bg-[var(--card-bg)] p-6">
              {/* File Info */}
              <div className="flex items-center gap-3 p-4 bg-[var(--bg-secondary)] rounded-xl mb-4">
                <div className="p-2 bg-[var(--bg-tertiary)] rounded-lg">
                  {uploadFileName.startsWith('http') ? (
                    <LinkIcon className="h-5 w-5 text-[var(--text-secondary)]" />
                  ) : (
                    <FileText className="h-5 w-5 text-[var(--text-secondary)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {uploadFileName}
                  </p>
                  {uploadFileSize > 0 && (
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {formatFileSize(uploadFileSize)}
                    </p>
                  )}
                  {uploadFileName.startsWith('http') && (
                    <p className="text-xs text-[var(--text-tertiary)]">
                      Web content
                    </p>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {(uploadStatus === 'uploading' || uploadStatus === 'processing') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">
                      {uploadStatus === 'uploading' ? 'Uploading...' : 'Processing...'}
                    </span>
                    <span className="text-[var(--text-primary)] font-medium">
                      {Math.round(uploadProgress)}%
                    </span>
                  </div>
                  <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  {uploadStatus === 'processing' && (
                    <p className="text-xs text-[var(--text-tertiary)] text-center mt-2">
                      {uploadStatusMessage || 'Extracting content and creating embeddings...'}
                    </p>
                  )}
                </div>
              )}

              {/* Success State */}
              {uploadStatus === 'success' && (
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-[var(--success-bg)] flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-[var(--success)]" />
                  </div>
                  <p className="text-[var(--text-primary)] font-medium">
                    Document uploaded successfully!
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">
                    {uploadStatusMessage || 'Your document is ready to use'}
                  </p>
                </div>
              )}

              {uploadStatus === 'background' && (
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-[var(--accent-blue-subtle)] flex items-center justify-center">
                    <CloudUpload className="h-8 w-8 text-[var(--accent-blue)]" />
                  </div>
                  <p className="text-[var(--text-primary)] font-medium">
                    Upload finished successfully
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">
                    {uploadStatusMessage || 'Your document is still being prepared in the background.'}
                  </p>
                </div>
              )}

              {/* Error State */}
              {uploadStatus === 'error' && (
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-[var(--error-bg)] flex items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-[var(--error)]" />
                  </div>
                  <p className="text-[var(--text-primary)] font-medium">
                    Upload failed
                  </p>
                  <p className="text-sm text-[var(--error)] mt-1">
                    {uploadError}
                  </p>
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
                    Try Again
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

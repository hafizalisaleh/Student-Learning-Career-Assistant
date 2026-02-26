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
import { formatDate, formatFileSize } from '@/lib/utils';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'success' | 'error';

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


  useEffect(() => {
    fetchDocuments();
  }, []);


  async function fetchDocuments() {
    try {
      setIsLoading(true);
      const data = await api.getDocuments();
      setDocuments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast.error('Failed to load documents');
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
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
      await api.uploadDocument(formData);

      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadStatus('processing');

      // Brief processing state
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setUploadStatus('success');
      await fetchDocuments();
      event.target.value = '';

      // Auto close after success
      setTimeout(() => {
        setShowUploadModal(false);
        setUploadStatus('idle');
      }, 2000);
    } catch (error: any) {
      clearInterval(progressInterval);
      console.error('Upload error:', error);
      setUploadStatus('error');
      setUploadError(error.response?.data?.detail || 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  }

  const closeUploadModal = () => {
    if (uploadStatus !== 'uploading' && uploadStatus !== 'processing') {
      setShowUploadModal(false);
      setUploadStatus('idle');
      setUploadError('');
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
      await api.processUrl(url);

      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadStatus('processing');

      await new Promise((resolve) => setTimeout(resolve, 1000));

      setUploadStatus('success');
      setUrl('');
      setShowUrlInput(false);
      await fetchDocuments();

      // Auto close after success
      setTimeout(() => {
        setShowUploadModal(false);
        setUploadStatus('idle');
      }, 2000);
    } catch (error: any) {
      clearInterval(progressInterval);
      console.error('URL processing error:', error);
      setUploadStatus('error');
      setUploadError(error.response?.data?.detail || 'Failed to process URL');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      await api.deleteDocument(id);
      toast.success('Document deleted successfully');
      setDocuments(documents.filter((doc) => doc.id !== id));
    } catch (error) {
      toast.error('Failed to delete document');
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
        return 'text-red-400 bg-red-400/10';
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
        return 'bg-red-500/10 text-red-400 border-red-500/30';
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
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setShowUrlInput(!showUrlInput)}
            disabled={isUploading}
          >
            <LinkIcon className="h-4 w-4 mr-2" />
            Add URL
          </Button>
          <Button
            variant="primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload File
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
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Document
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocuments.map((doc) => (
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
                <Link href={`/dashboard/workspace?id=${doc.id}`} className="flex-1">
                  <Button variant="primary" size="sm" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 border-0">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Open Workspace
                  </Button>
                </Link>
                <Link href={`/dashboard/documents/${doc.id}`} title="View Details">
                  <Button variant="secondary" size="sm">
                    <FileText className="h-4 w-4" />
                  </Button>
                </Link>
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
                  className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              </div>
            </div>
          ))}
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
                    {uploadStatus === 'error' && 'Upload Failed'}
                  </h2>
                  <p className="text-sm text-white/80 truncate max-w-[250px]">
                    {uploadFileName}
                  </p>
                </div>
                {(uploadStatus === 'success' || uploadStatus === 'error') && (
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
                      Extracting content and creating embeddings...
                    </p>
                  )}
                </div>
              )}

              {/* Success State */}
              {uploadStatus === 'success' && (
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  </div>
                  <p className="text-[var(--text-primary)] font-medium">
                    Document uploaded successfully!
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">
                    Your document is ready to use
                  </p>
                </div>
              )}

              {/* Error State */}
              {uploadStatus === 'error' && (
                <div className="text-center py-4">
                  <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
                    <AlertCircle className="h-8 w-8 text-red-500" />
                  </div>
                  <p className="text-[var(--text-primary)] font-medium">
                    Upload failed
                  </p>
                  <p className="text-sm text-red-400 mt-1">
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

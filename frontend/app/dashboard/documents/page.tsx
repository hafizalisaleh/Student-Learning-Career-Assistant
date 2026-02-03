'use client';

import { useEffect, useState, useRef } from 'react';
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
} from 'lucide-react';
import type { Document } from '@/lib/types';
import { formatDate, formatFileSize } from '@/lib/utils';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [url, setUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      await api.uploadDocument(formData);
      toast.success('Document uploaded successfully!');
      await fetchDocuments();
      event.target.value = '';
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.detail || 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleUrlSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    try {
      setIsUploading(true);
      await api.processUrl(url);
      toast.success('URL content processed successfully!');
      setUrl('');
      setShowUrlInput(false);
      await fetchDocuments();
    } catch (error: any) {
      console.error('URL processing error:', error);
      toast.error(error.response?.data?.detail || 'Failed to process URL');
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
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Documents</h1>
          <p className="text-[var(--text-secondary)] mt-1">Upload and manage your learning materials</p>
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
              className="group p-5 rounded-2xl bg-[var(--card-bg)] backdrop-blur-xl border border-[var(--card-border)] hover:border-[var(--card-border-hover)] transition-all duration-200"
            >
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
              <div className="flex gap-2 pt-3 border-t border-[var(--card-border)]">
                {doc.file_url && (
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button variant="secondary" size="sm" className="w-full">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View
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
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { LoadingSpinner, PageLoader } from '@/components/ui/loading-spinner';
import {
  ArrowLeft,
  FileText,
  Network,
  Download,
  RefreshCw,
  Sparkles,
  BookOpen,
  Brain,
  ClipboardCheck,
  ExternalLink,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Document } from '@/lib/types';
import { formatDate, formatFileSize } from '@/lib/utils';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import mermaid from 'mermaid';

type TabType = 'info' | 'mindmap';

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;

  const [document, setDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('info');

  // Mind map state
  const [mindmapCode, setMindmapCode] = useState<string>('');
  const [isGeneratingMindmap, setIsGeneratingMindmap] = useState(false);
  const [mindmapStyle, setMindmapStyle] = useState<'simple' | 'default' | 'detailed'>('default');
  const [zoom, setZoom] = useState(1);
  const mindmapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDocument();
  }, [documentId]);

  useEffect(() => {
    // Initialize mermaid
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      mindmap: {
        padding: 20,
        useMaxWidth: true,
      },
      themeVariables: {
        primaryColor: '#3b82f6',
        primaryTextColor: '#fff',
        primaryBorderColor: '#60a5fa',
        lineColor: '#64748b',
        secondaryColor: '#1e293b',
        tertiaryColor: '#0f172a',
      },
    });
  }, []);

  useEffect(() => {
    if (mindmapCode && mindmapRef.current) {
      renderMindmap();
    }
  }, [mindmapCode]);

  const fetchDocument = async () => {
    try {
      setIsLoading(true);
      const data = await api.getDocument(documentId);
      setDocument(data);
    } catch (error) {
      console.error('Failed to load document:', error);
      toast.error('Failed to load document');
      router.push('/dashboard/documents');
    } finally {
      setIsLoading(false);
    }
  };

  const generateMindmap = async () => {
    try {
      setIsGeneratingMindmap(true);
      toast.loading('Generating mind map...', { id: 'mindmap' });

      const result = await api.getDocumentMindmap(documentId, mindmapStyle);
      setMindmapCode(result.mermaid_code);

      toast.dismiss('mindmap');
      toast.success('Mind map generated!');
    } catch (error: any) {
      console.error('Mind map generation error:', error);
      toast.dismiss('mindmap');
      toast.error(error.response?.data?.detail || 'Failed to generate mind map');
    } finally {
      setIsGeneratingMindmap(false);
    }
  };

  const renderMindmap = async () => {
    if (!mindmapRef.current || !mindmapCode) return;

    try {
      // Clear previous content
      mindmapRef.current.innerHTML = '';

      // Generate unique ID for this render
      const id = `mindmap-${Date.now()}`;

      // Render the mermaid diagram
      const { svg } = await mermaid.render(id, mindmapCode);
      mindmapRef.current.innerHTML = svg;
    } catch (error) {
      console.error('Mermaid render error:', error);
      // Show error message in the container
      if (mindmapRef.current) {
        mindmapRef.current.innerHTML = `
          <div class="text-center p-8">
            <p class="text-red-400 mb-4">Failed to render mind map</p>
            <pre class="text-xs text-left bg-[var(--bg-elevated)] p-4 rounded-lg overflow-auto max-h-64">${mindmapCode}</pre>
          </div>
        `;
      }
    }
  };

  const downloadMindmap = () => {
    if (!mindmapRef.current) return;

    const svg = mindmapRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document?.title || 'mindmap'}.svg`;
    a.click();

    URL.revokeObjectURL(url);
    toast.success('Mind map downloaded!');
  };

  if (isLoading) {
    return <PageLoader />;
  }

  if (!document) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/documents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{document.title}</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {document.content_type} | {formatDate(document.created_at)}
            {document.file_size && ` | ${formatFileSize(document.file_size)}`}
          </p>
        </div>
        {document.file_url && (
          <a href={document.file_url} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              Open Source
            </Button>
          </a>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--card-border)]">
        <button
          onClick={() => setActiveTab('info')}
          className={cn(
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'info'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          )}
        >
          <FileText className="h-4 w-4 inline mr-2" />
          Document Info
        </button>
        <button
          onClick={() => {
            setActiveTab('mindmap');
            if (!mindmapCode) {
              generateMindmap();
            }
          }}
          className={cn(
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'mindmap'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          )}
        >
          <Network className="h-4 w-4 inline mr-2" />
          Mind Map
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Document Info Card */}
          <div className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Details</h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Status</dt>
                <dd className="text-[var(--text-primary)] capitalize">{document.processing_status?.toLowerCase()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Type</dt>
                <dd className="text-[var(--text-primary)]">{document.content_type}</dd>
              </div>
              {document.file_size && (
                <div className="flex justify-between">
                  <dt className="text-[var(--text-secondary)]">Size</dt>
                  <dd className="text-[var(--text-primary)]">{formatFileSize(document.file_size)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">Uploaded</dt>
                <dd className="text-[var(--text-primary)]">{formatDate(document.created_at)}</dd>
              </div>
            </dl>
          </div>

          {/* Quick Actions Card */}
          <div className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)]">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <Link href={`/dashboard/summaries/new?document=${documentId}`}>
                <Button variant="secondary" className="w-full">
                  <Brain className="h-4 w-4 mr-2" />
                  Summary
                </Button>
              </Link>
              <Link href={`/dashboard/notes/new?document=${documentId}`}>
                <Button variant="secondary" className="w-full">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Notes
                </Button>
              </Link>
              <Link href={`/dashboard/quizzes/new?document=${documentId}`}>
                <Button variant="secondary" className="w-full">
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Quiz
                </Button>
              </Link>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setActiveTab('mindmap');
                  if (!mindmapCode) generateMindmap();
                }}
              >
                <Network className="h-4 w-4 mr-2" />
                Mind Map
              </Button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'mindmap' && (
        <div className="space-y-4">
          {/* Mind Map Controls */}
          <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
            <div className="flex items-center gap-2">
              <label className="text-sm text-[var(--text-secondary)]">Style:</label>
              <select
                value={mindmapStyle}
                onChange={(e) => setMindmapStyle(e.target.value as any)}
                className="px-3 py-1.5 text-sm bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-lg text-[var(--text-primary)]"
              >
                <option value="simple">Simple</option>
                <option value="default">Default</option>
                <option value="detailed">Detailed</option>
              </select>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={generateMindmap}
              disabled={isGeneratingMindmap}
            >
              {isGeneratingMindmap ? (
                <LoadingSpinner size="sm" className="mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Regenerate
            </Button>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm text-[var(--text-secondary)] w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setZoom(Math.min(2, zoom + 0.1))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            {mindmapCode && (
              <Button variant="secondary" size="sm" onClick={downloadMindmap}>
                <Download className="h-4 w-4 mr-2" />
                Download SVG
              </Button>
            )}
          </div>

          {/* Mind Map Container */}
          <div className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] min-h-[500px] overflow-auto">
            {isGeneratingMindmap ? (
              <div className="flex flex-col items-center justify-center h-96">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-[var(--text-secondary)]">
                  <Sparkles className="h-4 w-4 inline mr-2" />
                  Generating mind map with AI...
                </p>
              </div>
            ) : mindmapCode ? (
              <div
                ref={mindmapRef}
                className="mermaid-container flex items-center justify-center"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-96 text-center">
                <Network className="h-16 w-16 text-[var(--text-tertiary)] mb-4" />
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                  Generate a Mind Map
                </h3>
                <p className="text-[var(--text-secondary)] mb-6 max-w-md">
                  Create a visual representation of the key topics and concepts in this document.
                </p>
                <Button variant="primary" onClick={generateMindmap}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Mind Map
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

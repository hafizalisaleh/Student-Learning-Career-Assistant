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
  GitBranch,
  Workflow,
  Database,
  Circle,
  Boxes,
} from 'lucide-react';
import type { Document } from '@/lib/types';
import { formatDate, formatFileSize } from '@/lib/utils';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import mermaid from 'mermaid';

type TabType = 'info' | 'mindmap' | 'diagrams';
type DiagramType = 'flowchart' | 'sequence' | 'er' | 'state' | 'class';

const DIAGRAM_TYPES: { type: DiagramType; label: string; icon: any; description: string }[] = [
  { type: 'flowchart', label: 'Flowchart', icon: Workflow, description: 'Process & workflow visualization' },
  { type: 'sequence', label: 'Sequence', icon: GitBranch, description: 'Interaction & communication flow' },
  { type: 'er', label: 'ER Diagram', icon: Database, description: 'Entity relationships' },
  { type: 'state', label: 'State', icon: Circle, description: 'States & transitions' },
  { type: 'class', label: 'Class', icon: Boxes, description: 'Structure & hierarchy' },
];

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

  // Diagram state
  const [selectedDiagramType, setSelectedDiagramType] = useState<DiagramType>('flowchart');
  const [diagramCode, setDiagramCode] = useState<string>('');
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);
  const [diagramZoom, setDiagramZoom] = useState(1);
  const diagramRef = useRef<HTMLDivElement>(null);
  const [generatedDiagrams, setGeneratedDiagrams] = useState<Record<DiagramType, string>>({} as any);

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

  useEffect(() => {
    if (diagramCode && diagramRef.current) {
      renderDiagram();
    }
  }, [diagramCode]);

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

  const generateDiagram = async (type: DiagramType) => {
    // Check if already generated
    if (generatedDiagrams[type]) {
      setDiagramCode(generatedDiagrams[type]);
      setSelectedDiagramType(type);
      return;
    }

    try {
      setIsGeneratingDiagram(true);
      setSelectedDiagramType(type);
      toast.loading(`Generating ${type} diagram...`, { id: 'diagram' });

      const result = await api.getDocumentDiagram(documentId, type);
      const code = result.mermaid_code;

      setDiagramCode(code);
      setGeneratedDiagrams(prev => ({ ...prev, [type]: code }));

      toast.dismiss('diagram');
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} diagram generated!`);
    } catch (error: any) {
      console.error('Diagram generation error:', error);
      toast.dismiss('diagram');
      toast.error(error.response?.data?.detail || 'Failed to generate diagram');
    } finally {
      setIsGeneratingDiagram(false);
    }
  };

  const renderDiagram = async () => {
    if (!diagramRef.current || !diagramCode) return;

    try {
      diagramRef.current.innerHTML = '';
      const id = `diagram-${Date.now()}`;
      const { svg } = await mermaid.render(id, diagramCode);
      diagramRef.current.innerHTML = svg;
    } catch (error) {
      console.error('Mermaid render error:', error);
      if (diagramRef.current) {
        diagramRef.current.innerHTML = `
          <div class="text-center p-8">
            <p class="text-red-400 mb-4">Failed to render diagram</p>
            <pre class="text-xs text-left bg-[var(--bg-elevated)] p-4 rounded-lg overflow-auto max-h-64">${diagramCode}</pre>
          </div>
        `;
      }
    }
  };

  const downloadDiagram = () => {
    if (!diagramRef.current) return;

    const svg = diagramRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document?.title || 'diagram'}-${selectedDiagramType}.svg`;
    a.click();

    URL.revokeObjectURL(url);
    toast.success('Diagram downloaded!');
  };

  const regenerateDiagram = async () => {
    // Clear cached version to force regeneration
    setGeneratedDiagrams(prev => {
      const copy = { ...prev };
      delete copy[selectedDiagramType];
      return copy;
    });
    setDiagramCode('');
    await generateDiagram(selectedDiagramType);
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
        <button
          onClick={() => setActiveTab('diagrams')}
          className={cn(
            'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'diagrams'
              ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
              : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          )}
        >
          <Workflow className="h-4 w-4 inline mr-2" />
          Diagrams
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
              <Button
                variant="secondary"
                className="w-full col-span-2"
                onClick={() => setActiveTab('diagrams')}
              >
                <Workflow className="h-4 w-4 mr-2" />
                Diagrams
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

      {activeTab === 'diagrams' && (
        <div className="space-y-4">
          {/* Diagram Type Selector */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {DIAGRAM_TYPES.map(({ type, label, icon: Icon, description }) => (
              <button
                key={type}
                onClick={() => generateDiagram(type)}
                disabled={isGeneratingDiagram}
                className={cn(
                  'p-4 rounded-xl border-2 transition-all text-left',
                  selectedDiagramType === type && diagramCode
                    ? 'border-[var(--accent-blue)] bg-[var(--accent-blue)]/10'
                    : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-[var(--accent-blue)]/50',
                  generatedDiagrams[type] && 'ring-2 ring-green-500/30'
                )}
              >
                <Icon className={cn(
                  'h-6 w-6 mb-2',
                  selectedDiagramType === type && diagramCode
                    ? 'text-[var(--accent-blue)]'
                    : 'text-[var(--text-secondary)]'
                )} />
                <div className="font-medium text-[var(--text-primary)] text-sm">{label}</div>
                <div className="text-xs text-[var(--text-tertiary)] mt-1">{description}</div>
                {generatedDiagrams[type] && (
                  <div className="text-xs text-green-400 mt-2">✓ Generated</div>
                )}
              </button>
            ))}
          </div>

          {/* Diagram Controls */}
          {diagramCode && (
            <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <span className="font-medium text-[var(--text-primary)]">
                  {DIAGRAM_TYPES.find(d => d.type === selectedDiagramType)?.label}
                </span>
                Diagram
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={regenerateDiagram}
                disabled={isGeneratingDiagram}
              >
                {isGeneratingDiagram ? (
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
                  onClick={() => setDiagramZoom(Math.max(0.5, diagramZoom - 0.1))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm text-[var(--text-secondary)] w-12 text-center">
                  {Math.round(diagramZoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDiagramZoom(Math.min(2, diagramZoom + 0.1))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </div>

              <Button variant="secondary" size="sm" onClick={downloadDiagram}>
                <Download className="h-4 w-4 mr-2" />
                Download SVG
              </Button>
            </div>
          )}

          {/* Diagram Container */}
          <div className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] min-h-[500px] overflow-auto">
            {isGeneratingDiagram ? (
              <div className="flex flex-col items-center justify-center h-96">
                <LoadingSpinner size="lg" />
                <p className="mt-4 text-[var(--text-secondary)]">
                  <Sparkles className="h-4 w-4 inline mr-2" />
                  Generating {selectedDiagramType} diagram with AI...
                </p>
              </div>
            ) : diagramCode ? (
              <div
                ref={diagramRef}
                className="mermaid-container flex items-center justify-center"
                style={{ transform: `scale(${diagramZoom})`, transformOrigin: 'top center' }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-96 text-center">
                <Workflow className="h-16 w-16 text-[var(--text-tertiary)] mb-4" />
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                  Generate a Diagram
                </h3>
                <p className="text-[var(--text-secondary)] mb-6 max-w-md">
                  Select a diagram type above to visualize your document content.
                  Each diagram offers a different perspective on the information.
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {DIAGRAM_TYPES.slice(0, 3).map(({ type, label, icon: Icon }) => (
                    <Button
                      key={type}
                      variant="secondary"
                      size="sm"
                      onClick={() => generateDiagram(type)}
                    >
                      <Icon className="h-4 w-4 mr-2" />
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

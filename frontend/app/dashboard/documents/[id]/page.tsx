'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  ClipboardCheck,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  GitBranch,
  Workflow,
  Database,
  Circle,
  Boxes,
  X,
  Edit3,
  Check,
  Copy,
  RotateCcw,
  Info,
  Lightbulb,
  Share2,
  Trash2,
  MessageSquare,
  Zap,
  Play,
  Send,
  Wand2,
} from 'lucide-react';
import type { Document, Note, Summary } from '@/lib/types';
import { formatDate, formatFileSize } from '@/lib/utils';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { Breadcrumb } from '@/components/ui/breadcrumb';
// Dynamic import - mermaid is 66MB, only load when needed
let mermaidInstance: typeof import('mermaid').default | null = null;
const getMermaid = async () => {
  if (!mermaidInstance) {
    const m = await import('mermaid');
    mermaidInstance = m.default;
  }
  return mermaidInstance;
};
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type TabType = 'content' | 'info' | 'notes' | 'summaries' | 'mindmap' | 'diagrams';
type SummaryLength = 'short' | 'medium' | 'detailed';
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
  const [activeTab, setActiveTab] = useState<TabType>('content');

  // Artifacts state
  const [notes, setNotes] = useState<Note[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [isLoadingArtifacts, setIsLoadingArtifacts] = useState(false);

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
  const [generatedDiagrams, setGeneratedDiagrams] = useState<Record<DiagramType, string>>({} as Record<DiagramType, string>);

  // Summary modal state
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryLength, setSummaryLength] = useState<SummaryLength>('short');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummary, setEditedSummary] = useState('');
  const [summaryGenerated, setSummaryGenerated] = useState(false);

  // Revision state
  const [revisionPrompt, setRevisionPrompt] = useState('');
  const [isRevising, setIsRevising] = useState(false);
  const [revisionHistory, setRevisionHistory] = useState<string[]>([]);

  // Quick Action states
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  useEffect(() => {
    if (documentId) {
      fetchDocument();
      fetchArtifacts();
    }
  }, [documentId]);

  async function fetchDocument() {
    try {
      setIsLoading(true);
      const data = await api.getDocument(documentId);
      setDocument(data);
    } catch (error) {
      console.error('Failed to load document:', error);
      toast.error('Document not found');
      router.push('/dashboard/documents');
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchArtifacts() {
    try {
      setIsLoadingArtifacts(true);
      const [notesData, summariesData] = await Promise.all([
        api.getNotesByDocument(documentId),
        api.getSummariesByDocument(documentId)
      ]);
      setNotes(notesData || []);
      setSummaries(summariesData || []);
    } catch (error) {
      console.error('Failed to load artifacts:', error);
    } finally {
      setIsLoadingArtifacts(false);
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this document? All associated notes and summaries will also be deleted.')) return;

    try {
      await api.deleteDocument(documentId);
      toast.success('Document deleted successfully');
      router.push('/dashboard/documents');
    } catch (error) {
      toast.error('Failed to delete document');
    }
  };

  const handleGenerateSummary = async (length: SummaryLength) => {
    try {
      setIsGeneratingSummary(true);
      await api.generateSummary({
        document_id: documentId,
        summary_length: length,
      });
      toast.success('Summary generated successfully');
      fetchArtifacts();
      setActiveTab('summaries');
    } catch (error) {
      toast.error('Failed to generate summary');
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    toast.loading('Generating all artifacts...', { id: 'generate-all' });

    try {
      // Run summary, notes generation, and mindmap in parallel
      const results = await Promise.allSettled([
        api.generateSummary({ document_id: documentId, summary_length: 'medium' }),
        api.createNote({ document_id: documentId, title: `${document?.title || 'Document'} - Study Notes`, note_type: 'structured' }),
        api.getDocumentMindmap(documentId, 'default'),
      ]);

      const [summaryResult, notesResult, mindmapResult] = results;

      if (mindmapResult.status === 'fulfilled') {
        setMindmapCode(mindmapResult.value.mermaid_code);
      }

      // Refresh artifacts list
      await fetchArtifacts();

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      toast.dismiss('generate-all');
      toast.success(`Generated ${succeeded}/3 artifacts successfully!`);
    } catch (error) {
      toast.dismiss('generate-all');
      toast.error('Some generations failed');
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleQuickQuiz = () => {
    router.push(`/dashboard/quizzes/new?document=${documentId}`);
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

  // Initialize mermaid lazily when needed
  const initMermaid = async () => {
    const mermaid = await getMermaid();
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      mindmap: {
        padding: 20,
        useMaxWidth: true,
      },
      flowchart: {
        htmlLabels: true,
        curve: 'basis',
      },
      themeVariables: {
        primaryColor: '#4B6A9B',
        primaryTextColor: '#FFFFFF',
        primaryBorderColor: '#3D5A87',
        secondaryColor: '#5C8A72',
        secondaryTextColor: '#FFFFFF',
        secondaryBorderColor: '#4A7560',
        tertiaryColor: '#8B7355',
        tertiaryTextColor: '#FFFFFF',
        tertiaryBorderColor: '#745F47',
        quaternaryColor: '#7B8794',
        lineColor: '#52525B',
        background: '#FFFFFF',
        mainBkg: '#FFFFFF',
        nodeBkg: '#E8EEF4',
        nodeBorder: '#4B6A9B',
        nodeTextColor: '#1a1a1a',
        clusterBkg: '#F5F7FA',
        clusterBorder: '#4B6A9B',
        textColor: '#1a1a1a',
        actorBkg: '#E8EEF4',
        actorBorder: '#4B6A9B',
        actorTextColor: '#1a1a1a',
        actorLineColor: '#52525B',
        signalColor: '#52525B',
        signalTextColor: '#1a1a1a',
        labelBoxBkgColor: '#FFFFFF',
        labelBoxBorderColor: '#4B6A9B',
        labelTextColor: '#1a1a1a',
        loopTextColor: '#1a1a1a',
        noteBkgColor: '#FDF8F0',
        noteTextColor: '#1a1a1a',
        noteBorderColor: '#B8860B',
        activationBkgColor: '#E8EEF4',
        activationBorderColor: '#4B6A9B',
        classText: '#1a1a1a',
        labelColor: '#1a1a1a',
        altBackground: '#F5F7FA',
        attributeBackgroundColorOdd: '#FFFFFF',
        attributeBackgroundColorEven: '#F5F7FA',
        pie1: '#4B6A9B',
        pie2: '#5C8A72',
        pie3: '#8B7355',
        pie4: '#7B8794',
        pie5: '#6B7B8C',
        pieTextColor: '#FFFFFF',
        pieTitleTextColor: '#1a1a1a',
        pieSectionTextColor: '#FFFFFF',
        pieStrokeColor: '#FFFFFF',
        fontFamily: 'Inter, -apple-system, sans-serif',
        fontSize: '14px',
      },
    });
  };

  const renderMindmap = useCallback(async () => {
    if (!mindmapRef.current || !mindmapCode) return;

    try {
      // Clear previous content
      mindmapRef.current.innerHTML = '';

      // Initialize and get mermaid instance
      await initMermaid();
      const mermaid = await getMermaid();

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
  }, [mindmapCode]);

  const renderDiagram = useCallback(async () => {
    if (!diagramRef.current || !diagramCode) return;

    try {
      diagramRef.current.innerHTML = '';

      // Initialize and get mermaid instance
      await initMermaid();
      const mermaid = await getMermaid();

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
  }, [diagramCode]);

  useEffect(() => {
    if (mindmapCode && mindmapRef.current) {
      renderMindmap();
    }
  }, [mindmapCode, renderMindmap]);

  useEffect(() => {
    if (diagramCode && diagramRef.current) {
      renderDiagram();
    }
  }, [diagramCode, renderDiagram]);

  const downloadMindmap = () => {
    if (!mindmapRef.current) return;

    const svg = mindmapRef.current.querySelector('svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const a = window.document.createElement('a');
    a.href = url;
    a.download = `${document?.title || 'mindmap'}-mindmap.svg`;
    a.click();

    URL.revokeObjectURL(url);
    toast.success('Mind map downloaded!');
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

  const generateDiagram = async (type: DiagramType) => {
    // Check if already cached
    if (generatedDiagrams[type]) {
      setSelectedDiagramType(type);
      setDiagramCode(generatedDiagrams[type]);
      return;
    }

    try {
      setSelectedDiagramType(type);
      setIsGeneratingDiagram(true);
      toast.loading(`Generating ${type} diagram...`, { id: 'diagram' });

      const result = await api.getDocumentDiagram(documentId, type);
      const code = result.mermaid_code;

      setDiagramCode(code);
      setGeneratedDiagrams(prev => ({ ...prev, [type]: code }));

      toast.dismiss('diagram');
      toast.success('Diagram generated!');
    } catch (error: any) {
      console.error('Diagram generation error:', error);
      toast.dismiss('diagram');
      toast.error(error.response?.data?.detail || 'Failed to generate diagram');
    } finally {
      setIsGeneratingDiagram(false);
    }
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

  // Summary functions
  const openSummaryModal = () => {
    setShowSummaryModal(true);
    setSummaryText('');
    setSummaryGenerated(false);
    setIsEditingSummary(false);
  };

  const closeSummaryModal = () => {
    setShowSummaryModal(false);
    setSummaryText('');
    setSummaryGenerated(false);
    setIsEditingSummary(false);
  };

  const generateSummary = async () => {
    try {
      setIsGeneratingSummary(true);
      setSummaryText('');
      setSummaryGenerated(false);

      const result = await api.generateSummary({
        document_id: documentId,
        summary_length: summaryLength,
      });

      // Simulate typing effect for the summary
      const fullText = result.summary_text;
      let currentIndex = 0;
      const chunkSize = 3;

      const typeText = () => {
        if (currentIndex < fullText.length) {
          const nextChunk = fullText.slice(currentIndex, currentIndex + chunkSize);
          setSummaryText(prev => prev + nextChunk);
          currentIndex += chunkSize;
          setTimeout(typeText, 10);
        } else {
          setSummaryGenerated(true);
          setIsGeneratingSummary(false);
        }
      };

      typeText();
    } catch (error: any) {
      console.error('Summary generation error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to generate summary';
      toast.error(errorMessage);
      setIsGeneratingSummary(false);
    }
  };

  const startEditSummary = () => {
    setEditedSummary(summaryText);
    setIsEditingSummary(true);
  };

  const saveEditedSummary = () => {
    setSummaryText(editedSummary);
    setIsEditingSummary(false);
    toast.success('Summary updated!');
  };

  const cancelEditSummary = () => {
    setIsEditingSummary(false);
    setEditedSummary('');
  };

  const copySummary = () => {
    navigator.clipboard.writeText(summaryText);
    toast.success('Summary copied to clipboard!');
  };

  const regenerateSummary = () => {
    setSummaryText('');
    setSummaryGenerated(false);
    generateSummary();
  };

  const handleRevision = async (
    currentContent: string,
    contentType: 'mindmap' | 'diagram' | 'summary',
    onSuccess: (revised: string) => void,
  ) => {
    if (!revisionPrompt.trim()) return;

    setIsRevising(true);
    toast.loading('Revising...', { id: 'revision' });

    try {
      const result = await api.reviseContent({
        current_content: currentContent,
        revision_prompt: revisionPrompt.trim(),
        content_type: contentType,
        document_title: document?.title || '',
      });

      if (result.success) {
        // Save current version to history for undo
        setRevisionHistory(prev => [...prev, currentContent]);
        onSuccess(result.revised_content);
        setRevisionPrompt('');
        toast.dismiss('revision');
        toast.success('Revision applied!');
      } else {
        toast.dismiss('revision');
        toast.error(result.error || 'Revision failed');
      }
    } catch (error: any) {
      toast.dismiss('revision');
      toast.error(error.response?.data?.detail || 'Revision failed');
    } finally {
      setIsRevising(false);
    }
  };

  const undoRevision = (
    contentType: 'mindmap' | 'diagram' | 'summary',
    restoreFn: (content: string) => void,
  ) => {
    if (revisionHistory.length === 0) return;
    const previous = revisionHistory[revisionHistory.length - 1];
    setRevisionHistory(prev => prev.slice(0, -1));
    restoreFn(previous);
    toast.success('Revision undone');
  };

  if (isLoading) {
    return <PageLoader />;
  }

  if (!document) {
    return null;
  }

  const tabs = [
    { id: 'content', label: 'Content', icon: FileText },
    { id: 'info', label: 'Details', icon: Info },
    { id: 'notes', label: `Notes (${notes.length})`, icon: Lightbulb },
    { id: 'summaries', label: `Summaries (${summaries.length})`, icon: Sparkles },
    { id: 'mindmap', label: 'Mind Map', icon: Share2 },
    { id: 'diagrams', label: 'Diagrams', icon: Workflow },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: 'Documents', href: '/dashboard/documents' },
          { label: document.title },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{document.title}</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {document.content_type} | {formatDate(document.created_at)}
            {document.file_size && ` | ${formatFileSize(document.file_size)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {document.file_url && (
            <a href={document.file_url} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Source
              </Button>
            </a>
          )}
          <Link href={`/dashboard/workspace?id=${documentId}`}>
            <Button variant="secondary" size="sm">
              <Play className="h-4 w-4 mr-2" />
              Study
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard/documents')}
            className="md:hidden"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
      </div>

      {/* Quick Actions Bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--card-border)]">
        <Button
          variant="default"
          size="sm"
          onClick={handleGenerateAll}
          disabled={isGeneratingAll}
        >
          {isGeneratingAll ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              Generating...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Generate All
            </>
          )}
        </Button>

        <div className="h-5 w-px bg-[var(--card-border)]" />

        <Button variant="ghost" size="sm" onClick={openSummaryModal}>
          <Sparkles className="h-4 w-4 mr-1.5" />
          Summary
        </Button>
        <Link href={`/dashboard/notes/new?document=${documentId}`}>
          <Button variant="ghost" size="sm">
            <BookOpen className="h-4 w-4 mr-1.5" />
            Notes
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={handleQuickQuiz}>
          <ClipboardCheck className="h-4 w-4 mr-1.5" />
          Quiz
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setActiveTab('mindmap'); if (!mindmapCode) generateMindmap(); }}>
          <Share2 className="h-4 w-4 mr-1.5" />
          Mind Map
        </Button>

        <div className="ml-auto hidden sm:flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleDelete} className="text-[var(--error)] hover:bg-[var(--error-bg)]">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--card-border)] overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabType);
                if (tab.id === 'mindmap' && !mindmapCode) generateMindmap();
                if (tab.id === 'diagrams' && !diagramCode) generateDiagram(selectedDiagramType);
              }}
              className={cn(
                'flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-[var(--accent-blue)] text-[var(--accent-blue)] bg-[var(--accent-blue-subtle)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'content' && (
          <div className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Extracted Content</h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => {
                  navigator.clipboard.writeText(document.extracted_text || '');
                  toast.success('Content copied to clipboard');
                }}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Text
                </Button>
              </div>
            </div>

            <div className="prose prose-sm max-w-none text-[var(--text-primary)] leading-relaxed">
              {document.extracted_text ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {document.extracted_text}
                </ReactMarkdown>
              ) : (
                <div className="text-center py-12">
                  <p className="text-[var(--text-secondary)]">No content has been extracted from this document yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'info' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                <Button variant="secondary" className="w-full" onClick={openSummaryModal}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Summary
                </Button>
                <Link href={`/dashboard/notes/new?document=${documentId}`} className="w-full">
                  <Button variant="secondary" className="w-full">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Notes
                  </Button>
                </Link>
                <Button variant="secondary" className="w-full" onClick={handleQuickQuiz}>
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Quiz
                </Button>
                <Link href={`/dashboard/workspace?id=${documentId}`} className="w-full">
                  <Button variant="secondary" className="w-full">
                    <Play className="h-4 w-4 mr-2" />
                    Study Mode
                  </Button>
                </Link>
                <Button variant="secondary" className="w-full" onClick={() => { setActiveTab('mindmap'); if (!mindmapCode) generateMindmap(); }}>
                  <Network className="h-4 w-4 mr-2" />
                  Mind Map
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => { setActiveTab('diagrams'); if (!diagramCode) generateDiagram(selectedDiagramType); }}>
                  <Workflow className="h-4 w-4 mr-2" />
                  Diagrams
                </Button>
              </div>
              <div className="mt-4 pt-4 border-t border-[var(--card-border)]">
                <Button variant="destructive" size="sm" className="w-full" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Document
                </Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Associated Notes</h3>
              <Link href={`/dashboard/notes/new?document=${documentId}`}>
                <Button variant="default" size="sm">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate New Notes
                </Button>
              </Link>
            </div>

            {isLoadingArtifacts ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : notes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {notes.map((note) => (
                  <Link key={note.id} href={`/dashboard/notes/${note.id}`}>
                    <div className="p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--accent-blue)] transition-all group">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-blue)]">{note.title}</h4>
                        <span className="text-xs text-[var(--text-tertiary)]">{formatDate(note.created_at || note.generated_at)}</span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mt-2">
                        {note.content.substring(0, 150)}...
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 rounded-2xl bg-[var(--card-bg)] border border-dashed border-[var(--card-border)]">
                <BookOpen className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-4" />
                <p className="text-[var(--text-secondary)] mb-4">No notes generated for this document yet.</p>
                <Link href={`/dashboard/notes/new?document=${documentId}`}>
                  <Button variant="secondary" size="sm">
                    Create First Note
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {activeTab === 'summaries' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Document Summaries</h3>
              <Button variant="default" size="sm" onClick={openSummaryModal}>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate New Summary
              </Button>
            </div>

            {isLoadingArtifacts ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : summaries.length > 0 ? (
              <div className="space-y-4">
                {summaries.map((summary) => (
                  <div key={summary.id} className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)]">
                    <div className="flex items-center justify-between mb-4">
                      <span className="px-2 py-1 bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)] text-xs rounded-full uppercase font-medium">
                        {summary.summary_length} Summary
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-tertiary)]">{formatDate(summary.generated_at)}</span>
                        <Button variant="ghost" size="sm" onClick={() => {
                          navigator.clipboard.writeText(summary.summary_text);
                          toast.success('Summary copied');
                        }}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="prose prose-sm max-w-none text-[var(--text-primary)]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {summary.summary_text}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 rounded-2xl bg-[var(--card-bg)] border border-dashed border-[var(--card-border)]">
                <Sparkles className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-4" />
                <p className="text-[var(--text-secondary)] mb-4">No summaries available for this document.</p>
                <Button variant="secondary" size="sm" onClick={openSummaryModal}>
                  Generate First Summary
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'mindmap' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-sm">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-[var(--text-secondary)]">Style:</label>
                <select
                  value={mindmapStyle}
                  onChange={(e) => setMindmapStyle(e.target.value as any)}
                  className="px-3 py-1.5 text-sm bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)]"
                >
                  <option value="simple">Simple</option>
                  <option value="default">Default</option>
                  <option value="detailed">Detailed</option>
                </select>
              </div>

              <div className="h-6 w-[1px] bg-[var(--card-border)] mx-1" />

              <Button
                variant="secondary"
                size="sm"
                onClick={generateMindmap}
                disabled={isGeneratingMindmap}
                className="bg-[var(--bg-elevated)] border-[var(--card-border)]"
              >
                {isGeneratingMindmap ? (
                  <LoadingSpinner size="sm" className="mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Regenerate
              </Button>

              <div className="flex items-center gap-1 ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs font-medium text-[var(--text-secondary)] w-10 text-center">
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
                <Button variant="secondary" size="sm" onClick={downloadMindmap} className="bg-[var(--bg-elevated)] border-[var(--card-border)]">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              )}
            </div>

            <div className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] min-h-[500px] overflow-auto flex items-center justify-center relative">
              {isGeneratingMindmap ? (
                <div className="flex flex-col items-center justify-center">
                  <LoadingSpinner size="lg" />
                  <p className="mt-4 text-[var(--text-secondary)] animate-pulse">Generating your mind map...</p>
                </div>
              ) : mindmapCode ? (
                <div
                  ref={mindmapRef}
                  className="mermaid-container transition-transform duration-200"
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center max-w-md">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--accent-blue-subtle)] flex items-center justify-center mb-4">
                    <Share2 className="h-8 w-8 text-[var(--accent-blue)]" />
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Visualize your Document</h3>
                  <p className="text-[var(--text-secondary)] mb-6">Create a visual mind map to help you understand complex relationships and key concepts faster.</p>
                  <Button variant="default" onClick={generateMindmap}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Mind Map
                  </Button>
                </div>
              )}
            </div>

            {/* Revision Bar for Mind Map */}
            {mindmapCode && !isGeneratingMindmap && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
                <Wand2 className="h-4 w-4 text-[var(--accent-violet)] shrink-0" />
                <input
                  type="text"
                  value={revisionPrompt}
                  onChange={(e) => setRevisionPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isRevising) {
                      handleRevision(mindmapCode, 'mindmap', (revised) => setMindmapCode(revised));
                    }
                  }}
                  placeholder="Revise: e.g. &quot;Add more detail to the Neural Networks branch&quot;"
                  disabled={isRevising}
                  className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)]"
                />
                <Button
                  variant="default"
                  size="sm"
                  disabled={isRevising || !revisionPrompt.trim()}
                  onClick={() => handleRevision(mindmapCode, 'mindmap', (revised) => setMindmapCode(revised))}
                  className="bg-[var(--accent-violet)] hover:bg-[var(--accent-violet)]/90 border-0"
                >
                  {isRevising ? <LoadingSpinner size="sm" /> : <Send className="h-4 w-4" />}
                </Button>
                {revisionHistory.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => undoRevision('mindmap', (content) => setMindmapCode(content))}
                    title="Undo last revision"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'diagrams' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {DIAGRAM_TYPES.map(({ type, label, icon: Icon, description }) => (
                <button
                  key={type}
                  onClick={() => generateDiagram(type)}
                  disabled={isGeneratingDiagram}
                  className={cn(
                    'p-4 rounded-xl border-2 transition-all text-left flex flex-col gap-2',
                    selectedDiagramType === type && diagramCode
                      ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-subtle)]'
                      : 'border-[var(--card-border)] bg-[var(--card-bg)] hover:border-[var(--accent-blue)]/50'
                  )}
                >
                  <Icon className={cn(
                    'h-5 w-5',
                    selectedDiagramType === type && diagramCode ? 'text-[var(--accent-blue)]' : 'text-[var(--text-secondary)]'
                  )} />
                  <div>
                    <div className="font-semibold text-sm text-[var(--text-primary)]">{label}</div>
                    <div className="text-[10px] text-[var(--text-tertiary)] line-clamp-1">{description}</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="p-6 rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] min-h-[500px] overflow-auto flex items-center justify-center relative">
              {isGeneratingDiagram ? (
                <div className="flex flex-col items-center justify-center">
                  <div className="relative">
                    <LoadingSpinner size="lg" />
                    <Workflow className="h-5 w-5 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[var(--accent-blue)]" />
                  </div>
                  <p className="mt-4 text-[var(--text-secondary)] animate-pulse">Creating {selectedDiagramType}...</p>
                </div>
              ) : diagramCode ? (
                <div className="flex flex-col items-center w-full">
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDiagramZoom(Math.max(0.5, diagramZoom - 0.1))}
                    >
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-xs font-medium text-[var(--text-secondary)]">{Math.round(diagramZoom * 100)}%</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDiagramZoom(Math.min(2, diagramZoom + 0.1))}
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={downloadDiagram}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={regenerateDiagram}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                  <div
                    ref={diagramRef}
                    className="mermaid-container transition-transform duration-200"
                    style={{ transform: `scale(${diagramZoom})`, transformOrigin: 'center center' }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center max-w-md">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--accent-blue-subtle)] flex items-center justify-center mb-4">
                    <Workflow className="h-8 w-8 text-[var(--accent-blue)]" />
                  </div>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Technical Diagrams</h3>
                  <p className="text-[var(--text-secondary)] mb-6">Select a diagram type above to automatically bridge the gap between text and technical structure.</p>
                </div>
              )}
            </div>

            {/* Revision Bar for Diagrams */}
            {diagramCode && !isGeneratingDiagram && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
                <Wand2 className="h-4 w-4 text-[var(--accent-violet)] shrink-0" />
                <input
                  type="text"
                  value={revisionPrompt}
                  onChange={(e) => setRevisionPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isRevising) {
                      handleRevision(diagramCode, 'diagram', (revised) => {
                        setDiagramCode(revised);
                        setGeneratedDiagrams(prev => ({ ...prev, [selectedDiagramType]: revised }));
                      });
                    }
                  }}
                  placeholder="Revise: e.g. &quot;Add error handling paths to the flowchart&quot;"
                  disabled={isRevising}
                  className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)]"
                />
                <Button
                  variant="default"
                  size="sm"
                  disabled={isRevising || !revisionPrompt.trim()}
                  onClick={() => handleRevision(diagramCode, 'diagram', (revised) => {
                    setDiagramCode(revised);
                    setGeneratedDiagrams(prev => ({ ...prev, [selectedDiagramType]: revised }));
                  })}
                  className="bg-[var(--accent-violet)] hover:bg-[var(--accent-violet)]/90 border-0"
                >
                  {isRevising ? <LoadingSpinner size="sm" /> : <Send className="h-4 w-4" />}
                </Button>
                {revisionHistory.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => undoRevision('diagram', (content) => {
                      setDiagramCode(content);
                      setGeneratedDiagrams(prev => ({ ...prev, [selectedDiagramType]: content }));
                    })}
                    title="Undo last revision"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary Generation Modal Components */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between bg-[var(--bg-elevated)]">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[var(--accent-blue)]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">AI Summary Generator</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={closeSummaryModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-6">
              {!summaryGenerated && !isGeneratingSummary && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-[var(--text-secondary)] flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Choose summary length
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {(['short', 'medium', 'detailed'] as SummaryLength[]).map((len) => (
                        <button
                          key={len}
                          onClick={() => setSummaryLength(len)}
                          className={cn(
                            'p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-1',
                            summaryLength === len
                              ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)]'
                              : 'border-[var(--card-border)] text-[var(--text-secondary)] hover:border-[var(--accent-blue)]/30'
                          )}
                        >
                          <span className="font-bold capitalize">{len}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {(isGeneratingSummary || summaryText) && (
                <div className="space-y-4">
                  <div className="min-h-[200px] p-6 rounded-xl bg-[var(--bg-elevated)] border border-[var(--card-border)] relative">
                    {isGeneratingSummary && (
                      <div className="absolute top-3 right-3 flex items-center gap-2 text-xs text-[var(--accent-blue)]">
                        <div className="w-2 h-2 bg-[var(--accent-blue)] rounded-full animate-pulse" />
                        Generating...
                      </div>
                    )}

                    {isEditingSummary ? (
                      <textarea
                        value={editedSummary}
                        onChange={(e) => setEditedSummary(e.target.value)}
                        className="w-full h-64 bg-transparent border-none focus:ring-0 text-sm text-[var(--text-primary)] leading-relaxed resize-none"
                      />
                    ) : (
                      <div className="prose prose-sm max-w-none text-[var(--text-primary)]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {summaryText || 'Waiting to start...'}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Revision Bar for Summary */}
              {summaryGenerated && !isEditingSummary && !isGeneratingSummary && (
                <div className="flex items-center gap-2 mt-4">
                  <Wand2 className="h-4 w-4 text-[var(--accent-violet)] shrink-0" />
                  <input
                    type="text"
                    value={revisionPrompt}
                    onChange={(e) => setRevisionPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isRevising) {
                        handleRevision(summaryText, 'summary', (revised) => {
                          setSummaryText(revised);
                        });
                      }
                    }}
                    placeholder='Revise: e.g. "Make it more concise" or "Add examples"'
                    disabled={isRevising}
                    className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-lg text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-violet)]"
                  />
                  <Button
                    variant="default"
                    size="sm"
                    disabled={isRevising || !revisionPrompt.trim()}
                    onClick={() => handleRevision(summaryText, 'summary', (revised) => {
                      setSummaryText(revised);
                    })}
                    className="bg-[var(--accent-violet)] hover:bg-[var(--accent-violet)]/90 border-0"
                  >
                    {isRevising ? <LoadingSpinner size="sm" /> : <Send className="h-4 w-4" />}
                  </Button>
                  {revisionHistory.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => undoRevision('summary', (content) => setSummaryText(content))}
                      title="Undo last revision"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 bg-[var(--bg-elevated)] border-t border-[var(--card-border)] flex items-center justify-between">
              <div className="flex gap-2">
                {summaryGenerated && !isEditingSummary && (
                  <>
                    <Button variant="ghost" size="sm" onClick={copySummary}>
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                    <Button variant="ghost" size="sm" onClick={startEditSummary}>
                      <Edit3 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={regenerateSummary}>
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Retry
                    </Button>
                  </>
                )}
                {isEditingSummary && (
                  <>
                    <Button variant="ghost" size="sm" onClick={cancelEditSummary}>Cancel</Button>
                    <Button variant="default" size="sm" onClick={saveEditedSummary}>
                      <Check className="h-4 w-4 mr-1" />
                      Save
                    </Button>
                  </>
                )}
              </div>

              <div className="flex gap-2">
                {!summaryGenerated && !isGeneratingSummary && (
                  <Button variant="default" onClick={generateSummary}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate
                  </Button>
                )}
                {summaryGenerated && !isEditingSummary && (
                  <Button variant="default" onClick={closeSummaryModal}>Done</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

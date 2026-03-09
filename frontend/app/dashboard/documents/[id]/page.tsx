'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
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
  Plus,
  Calendar,
  Target,
} from 'lucide-react';
import type { Document, Note, Quiz, QuizResult, Summary, TableOfContentsItem, TableOfContentsResponse } from '@/lib/types';
import { formatDate, formatFileSize, getDifficultyBadgeClass } from '@/lib/utils';
import {
  getDocumentStatusDescription,
  isDocumentFailed,
  isDocumentReadyForGeneration,
} from '@/lib/document-status';
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
import { StudyLoopStrip } from '@/components/documents/study-loop-strip';
import {
  getStudyLoopNextStep,
} from '@/lib/study-loop';

type TabType = 'content' | 'info' | 'notes' | 'quizzes' | 'summaries' | 'mindmap' | 'diagrams';
type SummaryLength = 'short' | 'medium' | 'detailed';
type DiagramType = 'flowchart' | 'sequence' | 'er' | 'state' | 'class';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function AuthenticatedArtifactImage({ src, alt }: { src: string; alt?: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let nextObjectUrl: string | null = null;

    const loadImage = async () => {
      try {
        setFailed(false);
        const response = await api.get(src, { responseType: 'blob' });
        nextObjectUrl = URL.createObjectURL(response.data);
        if (active) {
          setObjectUrl(nextObjectUrl);
        } else {
          URL.revokeObjectURL(nextObjectUrl);
        }
      } catch (error) {
        console.error('Failed to load document artifact image:', error);
        if (active) {
          setFailed(true);
          setObjectUrl(null);
        }
      }
    };

    setObjectUrl(null);
    loadImage();

    return () => {
      active = false;
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [src]);

  if (objectUrl) {
    return (
      <span className="my-4 block">
        <img
          src={objectUrl}
          alt={alt || 'Document artifact'}
          className="h-auto max-w-full rounded-lg border border-[var(--card-border)]"
          loading="lazy"
        />
      </span>
    );
  }

  return (
    <span className="my-4 flex min-h-24 items-center justify-center rounded-lg border border-[var(--card-border)] bg-[var(--bg-elevated)] px-4 text-sm text-[var(--text-secondary)]">
      {failed ? (alt || 'Image unavailable') : 'Loading image...'}
    </span>
  );
}

function supportsStudyWorkspace(contentType?: string) {
  return contentType?.toLowerCase() === 'pdf';
}

function formatArtifactCount(count: number, singular: string, plural: string = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function resolveDocumentArtifactUrl(documentId: string, filePath: string | undefined, rawPath?: string | null) {
  const source = (rawPath || '').trim();
  if (!source) return source;
  if (/^(https?:|data:)/i.test(source)) return source;

  let relativePath = '';
  if (filePath) {
    const doclingRoot = `${filePath}.docling/`;
    if (source.startsWith(doclingRoot)) {
      relativePath = source.slice(doclingRoot.length);
    }
  }

  if (!relativePath && source.includes('.docling/')) {
    relativePath = source.split('.docling/')[1] || '';
  }

  if (!relativePath && source.startsWith('full_artifacts/')) {
    relativePath = source;
  }

  if (!relativePath) {
    return source;
  }

  const encodedRelativePath = relativePath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');

  return `${API_URL}/api/documents/${documentId}/artifacts/${encodedRelativePath}`;
}

function slugifyHeading(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

function extractTextValue(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractTextValue).join('');
  }
  if (!node || typeof node !== 'object') {
    return '';
  }
  if ('props' in node) {
    return extractTextValue((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return '';
}

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
  const [tableOfContents, setTableOfContents] = useState<TableOfContentsResponse | null>(null);
  const [isLoadingToc, setIsLoadingToc] = useState(false);
  const [selectedTocId, setSelectedTocId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('content');

  // Artifacts state
  const [notes, setNotes] = useState<Note[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizAttemptsById, setQuizAttemptsById] = useState<Record<string, QuizResult[]>>({});
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
      fetchTableOfContents();
    }
  }, [documentId]);

  useEffect(() => {
    const browserDocument = globalThis.document;
    const refreshDetailState = () => {
      fetchDocument(false);
      fetchArtifacts();
      fetchTableOfContents(false);
    };

    const handleVisibilityChange = () => {
      if (browserDocument.visibilityState === 'visible') {
        refreshDetailState();
      }
    };

    window.addEventListener('focus', refreshDetailState);
    browserDocument.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', refreshDetailState);
      browserDocument.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [documentId]);

  useEffect(() => {
    if (!documentId || !document) {
      return;
    }

    if (isDocumentReadyForGeneration(document) || isDocumentFailed(document)) {
      return;
    }

    const interval = window.setInterval(() => {
      fetchDocument(false);
    }, 2500);

    return () => window.clearInterval(interval);
  }, [
    document,
    documentId,
  ]);

  async function fetchDocument(showLoader: boolean = true) {
    try {
      if (showLoader) {
        setIsLoading(true);
      }
      const data = await api.getDocument(documentId);
      setDocument(data);
    } catch (error) {
      console.error('Failed to load document:', error);
      toast.error('Document not found');
      router.push('/dashboard/documents');
    } finally {
      if (showLoader) {
        setIsLoading(false);
      }
    }
  }

  async function fetchTableOfContents(showLoader: boolean = true) {
    try {
      if (showLoader) {
        setIsLoadingToc(true);
      }
      const data = await api.getDocumentTableOfContents(documentId);
      setTableOfContents(data);
    } catch (error) {
      console.error('Failed to load document TOC:', error);
      setTableOfContents(null);
    } finally {
      if (showLoader) {
        setIsLoadingToc(false);
      }
    }
  }

  async function fetchArtifacts() {
    try {
      setIsLoadingArtifacts(true);
      const [notesData, summariesData, quizzesData, attemptHistory] = await Promise.all([
        api.getNotesByDocument(documentId),
        api.getSummariesByDocument(documentId),
        api.getQuizzes(),
        api.getQuizAttemptHistory(),
      ]);
      setNotes(notesData || []);
      setSummaries(summariesData || []);

      // Filter quizzes by document ID
      const filteredQuizzes = (quizzesData || []).filter((quiz: Quiz) => {
        const references = quiz.document_references?.length
          ? quiz.document_references
          : ((quiz as any).document_id ? [(quiz as any).document_id] : []);
        return references.some((ref: string) => ref === documentId);
      });
      setQuizzes(filteredQuizzes);

      const attemptsByQuiz: Record<string, QuizResult[]> = {};
      filteredQuizzes.forEach((quiz: Quiz) => {
        attemptsByQuiz[quiz.id] = [];
      });

      (Array.isArray(attemptHistory) ? (attemptHistory as QuizResult[]) : []).forEach((attempt) => {
        if (attemptsByQuiz[attempt.quiz_id]) {
          attemptsByQuiz[attempt.quiz_id].push(attempt);
        }
      });

      Object.values(attemptsByQuiz).forEach((attempts) => {
        attempts.sort((a, b) => {
          const aTime = new Date(a.completed_at).getTime();
          const bTime = new Date(b.completed_at).getTime();
          return bTime - aTime;
        });
      });

      setQuizAttemptsById(attemptsByQuiz);
    } catch (error) {
      console.error('Failed to load artifacts:', error);
    } finally {
      setIsLoadingArtifacts(false);
    }
  }

  const handleDelete = async () => {
    const quizDeleteCount = quizzes.filter((quiz) => (quiz.document_references?.length || 0) <= 1).length;
    const quizDetachCount = quizzes.length - quizDeleteCount;
    const relatedArtifacts: string[] = [];

    if (notes.length > 0) {
      relatedArtifacts.push(formatArtifactCount(notes.length, 'note'));
    }
    if (summaries.length > 0) {
      relatedArtifacts.push(formatArtifactCount(summaries.length, 'summary'));
    }
    if (quizDeleteCount > 0) {
      relatedArtifacts.push(formatArtifactCount(quizDeleteCount, 'quiz'));
    }
    if (quizDetachCount > 0) {
      relatedArtifacts.push(`remove this document from ${formatArtifactCount(quizDetachCount, 'multi-document quiz', 'multi-document quizzes')}`);
    }

    const artifactLine = relatedArtifacts.length > 0
      ? `This will also affect ${relatedArtifacts.join(', ')}.`
      : 'This will also remove extracted text, vector chunks, and any linked study content for this document.';

    if (!confirm([
      `Delete "${document?.title || 'this document'}"?`,
      '',
      artifactLine,
      '',
      'The uploaded file, thumbnail, extracted text, and embeddings will be removed as well.',
    ].join('\n'))) return;

    try {
      const result = await api.deleteDocument(documentId);
      toast.success(result?.warnings?.length ? 'Document deleted with cleanup warnings' : 'Document deleted successfully');
      (result?.warnings || []).forEach((warning: string) => toast.error(warning));
      router.push('/dashboard/documents');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete document');
    }
  };

  const handleGenerateSummary = async (length: SummaryLength) => {
    if (!isDocumentReadyForGeneration(document)) {
      toast.error(getDocumentStatusDescription(document) || 'This document is still being prepared.');
      return;
    }

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
    if (!isDocumentReadyForGeneration(document)) {
      toast.error(getDocumentStatusDescription(document) || 'This document is still being prepared.');
      return;
    }

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
    if (!isDocumentReadyForGeneration(document)) {
      toast.error(getDocumentStatusDescription(document) || 'This document is still being prepared.');
      return;
    }

    setActiveTab('quizzes');
  };

  const generateMindmap = async () => {
    if (!isDocumentReadyForGeneration(document)) {
      toast.error(getDocumentStatusDescription(document) || 'This document is still being prepared.');
      return;
    }

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
            <p class="text-[var(--error)] mb-4">Failed to render mind map</p>
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
            <p class="text-[var(--error)] mb-4">Failed to render diagram</p>
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
    if (!isDocumentReadyForGeneration(document)) {
      toast.error(getDocumentStatusDescription(document) || 'This document is still being prepared.');
      return;
    }

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
    if (!isDocumentReadyForGeneration(document)) {
      toast.error(getDocumentStatusDescription(document) || 'This document is still being prepared.');
      return;
    }

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

  const canOpenWorkspace = supportsStudyWorkspace(document.content_type);
  const readyForGeneration = isDocumentReadyForGeneration(document);
  const statusDescription = getDocumentStatusDescription(document);
  const completedAttempts = Object.values(quizAttemptsById).flat();
  const bestQuizScore = completedAttempts.length > 0
    ? Math.max(...completedAttempts.map((attempt) => Number(attempt.score ?? 0)))
    : null;
  const studyLoopCounts = {
    summaries: summaries.length,
    notes: notes.length,
    quizzes: quizzes.length,
    quizAttempts: completedAttempts.length,
    bestQuizScore,
  };
  const nextStep = getStudyLoopNextStep(readyForGeneration, studyLoopCounts);
  const firstQuiz = quizzes[0];
  const followUpDifficulty =
    bestQuizScore == null
      ? 'medium'
      : bestQuizScore < 50
        ? 'easy'
        : bestQuizScore < 80
          ? 'medium'
          : 'hard';
  const followUpQuestionCount =
    bestQuizScore == null
      ? 6
      : bestQuizScore < 50
        ? 5
        : bestQuizScore < 80
          ? 6
          : 8;
  const followUpHref = `/dashboard/quizzes/new?document=${documentId}&mode=followup&difficulty=${followUpDifficulty}&count=${followUpQuestionCount}${firstQuiz ? `&sourceQuiz=${firstQuiz.id}` : ''}`;

  const renderStudyLoopAction = () => {
    if (!readyForGeneration) {
      return (
        <span className="text-sm text-[var(--text-secondary)]">
          The source is still being prepared. Study actions will unlock automatically once processing finishes.
        </span>
      );
    }

    switch (nextStep.action) {
      case 'summary':
        return (
          <>
            <Button variant="default" size="sm" onClick={openSummaryModal}>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate summary
            </Button>
            {canOpenWorkspace && (
              <Link href={`/dashboard/workspace?id=${documentId}`}>
                <Button variant="outline" size="sm">
                  <Play className="h-4 w-4 mr-2" />
                  Open study desk
                </Button>
              </Link>
            )}
          </>
        );
      case 'notes':
        return (
          <>
            <Link href={`/dashboard/notes/new?document=${documentId}`}>
              <Button variant="default" size="sm">
                <BookOpen className="h-4 w-4 mr-2" />
                Create notes
              </Button>
            </Link>
            {canOpenWorkspace && (
              <Link href={`/dashboard/workspace?id=${documentId}`}>
                <Button variant="outline" size="sm">
                  <Play className="h-4 w-4 mr-2" />
                  Open study desk
                </Button>
              </Link>
            )}
          </>
        );
      case 'quiz':
        return (
          <>
            <Link href={`/dashboard/quizzes/new?document=${documentId}`}>
              <Button variant="default" size="sm">
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Generate quiz
              </Button>
            </Link>
            <Link href={`/dashboard/notes/new?document=${documentId}&type=study`}>
              <Button variant="outline" size="sm">
                <BookOpen className="h-4 w-4 mr-2" />
                Add study note
              </Button>
            </Link>
          </>
        );
      case 'attempt':
        return (
          <>
            {firstQuiz ? (
              <Link href={`/dashboard/quizzes/${firstQuiz.id}`}>
                <Button variant="default" size="sm">
                  <Target className="h-4 w-4 mr-2" />
                  Take quiz
                </Button>
              </Link>
            ) : null}
            {canOpenWorkspace && (
              <Link href={`/dashboard/workspace?id=${documentId}`}>
                <Button variant="outline" size="sm">
                  <Play className="h-4 w-4 mr-2" />
                  Review in study desk
                </Button>
              </Link>
            )}
          </>
        );
      case 'review':
        return (
          <>
            {canOpenWorkspace && (
              <Link href={`/dashboard/workspace?id=${documentId}`}>
                <Button variant="default" size="sm">
                  <Play className="h-4 w-4 mr-2" />
                  Resume study desk
                </Button>
              </Link>
            )}
            <Link href={followUpHref}>
              <Button variant="outline" size="sm">
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Build follow-up quiz
              </Button>
            </Link>
          </>
        );
      default:
        return null;
    }
  };

  const tabs = [
    { id: 'content', label: 'Content', icon: FileText },
    { id: 'info', label: 'Details', icon: Info },
    { id: 'notes', label: `Notes (${notes.length})`, icon: Lightbulb },
    { id: 'quizzes', label: `Quizzes (${quizzes.length})`, icon: ClipboardCheck },
    { id: 'summaries', label: `Summaries (${summaries.length})`, icon: Sparkles },
    { id: 'mindmap', label: 'Mind Map', icon: Share2 },
    { id: 'diagrams', label: 'Diagrams', icon: Workflow },
  ];

  const formatSectionPages = (item: TableOfContentsItem) => {
    if (!item.pages?.length) return 'No page info';
    if (item.page_start === item.page_end) return `Page ${item.page_start}`;
    return `Pages ${item.page_start}-${item.page_end}`;
  };

  const askAboutSection = (item: TableOfContentsItem) => {
    const params = new URLSearchParams({
      document: documentId,
      question: `Explain the section "${item.label}" from ${document?.title || 'this document'}.`,
      sectionTitle: item.label,
      sectionPages: item.pages.join(','),
    });
    router.push(`/dashboard/ask?${params.toString()}`);
  };

  const scrollToSection = (item: TableOfContentsItem) => {
    setSelectedTocId(item.id);
    if (tableOfContents?.source === 'pages') {
      return;
    }
    const anchor = window.document.getElementById(`section-${slugifyHeading(item.label)}`);
    anchor?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const renderTocItems = (items: TableOfContentsItem[], depth: number = 0): ReactNode =>
    items.map((item) => (
      <div key={item.id} className="space-y-2">
        <button
          type="button"
          onClick={() => scrollToSection(item)}
          className={cn(
            'w-full rounded-[1rem] border px-3 py-3 text-left transition-all',
            selectedTocId === item.id
              ? 'border-[var(--primary)] bg-[var(--primary-light)]'
              : 'border-[var(--card-border)] bg-[var(--card-bg-solid)] hover:border-[var(--card-border-hover)]'
          )}
          style={{ marginLeft: depth * 12 }}
        >
          <p className="text-sm font-medium text-[var(--text-primary)]">{item.label}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">{formatSectionPages(item)}</p>
        </button>
        <div className="flex items-center justify-between gap-2 px-1" style={{ marginLeft: depth * 12 }}>
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
            {formatSectionPages(item)}
          </span>
          <Button variant="ghost" size="sm" onClick={() => askAboutSection(item)}>
            <MessageSquare className="h-4 w-4 mr-2" />
            Ask
          </Button>
        </div>
        {item.children?.length ? renderTocItems(item.children, depth + 1) : null}
      </div>
    ));

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
          {canOpenWorkspace && readyForGeneration ? (
            <Link href={`/dashboard/workspace?id=${documentId}`}>
              <Button variant="secondary" size="sm">
                <Play className="h-4 w-4 mr-2" />
                Study
              </Button>
            </Link>
          ) : canOpenWorkspace ? (
            <Button variant="secondary" size="sm" disabled>
              <Play className="h-4 w-4 mr-2" />
              Study
            </Button>
          ) : null}
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

      {!readyForGeneration && (
        <div className={cn(
          'rounded-2xl border px-4 py-3 text-sm',
          isDocumentFailed(document)
            ? 'border-[var(--error-border)] bg-[var(--error-bg)] text-[var(--error)]'
            : 'border-[var(--card-border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
        )}>
          {statusDescription || 'This document is still being prepared.'}
        </div>
      )}

      <StudyLoopStrip
        title="Document study pipeline"
        readyForGeneration={readyForGeneration}
        counts={studyLoopCounts}
        actionSlot={renderStudyLoopAction()}
      />

      {/* Quick Actions Bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--card-border)]">
        <Button
          variant="default"
          size="sm"
          onClick={handleGenerateAll}
          disabled={isGeneratingAll || !readyForGeneration}
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

        <Button variant="ghost" size="sm" onClick={openSummaryModal} disabled={!readyForGeneration}>
          <Sparkles className="h-4 w-4 mr-1.5" />
          Summary
        </Button>
        {readyForGeneration ? (
          <Link href={`/dashboard/notes/new?document=${documentId}`}>
            <Button variant="ghost" size="sm">
              <BookOpen className="h-4 w-4 mr-1.5" />
              Notes
            </Button>
          </Link>
        ) : (
          <Button variant="ghost" size="sm" disabled>
            <BookOpen className="h-4 w-4 mr-1.5" />
            Notes
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={handleQuickQuiz} disabled={!readyForGeneration}>
          <ClipboardCheck className="h-4 w-4 mr-1.5" />
          Quiz
        </Button>
        <Button variant="ghost" size="sm" disabled={!readyForGeneration} onClick={() => { setActiveTab('mindmap'); if (!mindmapCode) generateMindmap(); }}>
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
          <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)] animate-in fade-in slide-in-from-bottom-2 duration-300">
            <aside className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5 xl:sticky xl:top-28 xl:max-h-[calc(100vh-180px)] xl:overflow-y-auto">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Table of Contents</h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {!tableOfContents
                      ? 'Outline will appear once extraction finishes.'
                      : tableOfContents.source === 'contents'
                      ? 'Read from the document outline.'
                      : tableOfContents.source === 'headings'
                        ? 'Built from detected headings.'
                        : 'Built from page ranges because no headings were found.'}
                  </p>
                </div>
                {tableOfContents?.count ? (
                  <span className="signal-pill">{tableOfContents.count}</span>
                ) : null}
              </div>

              <div className="mt-5 space-y-4">
                {isLoadingToc ? (
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <LoadingSpinner size="sm" />
                    Loading outline...
                  </div>
                ) : tableOfContents?.items?.length ? (
                  renderTocItems(tableOfContents.items)
                ) : (
                  <p className="text-sm leading-6 text-[var(--text-secondary)]">
                    No outline is available yet. If extraction just finished, refresh once processing settles.
                  </p>
                )}
              </div>
            </aside>

            <div className="rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-6 min-w-0">
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

              <div className="prose prose-sm max-w-none text-[var(--text-primary)] leading-relaxed min-w-0">
                {document.extracted_text ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children, ...props }) => {
                        const label = extractTextValue(children);
                        return <h1 id={`section-${slugifyHeading(label)}`} {...props}>{children}</h1>;
                      },
                      h2: ({ children, ...props }) => {
                        const label = extractTextValue(children);
                        return <h2 id={`section-${slugifyHeading(label)}`} {...props}>{children}</h2>;
                      },
                      h3: ({ children, ...props }) => {
                        const label = extractTextValue(children);
                        return <h3 id={`section-${slugifyHeading(label)}`} {...props}>{children}</h3>;
                      },
                      h4: ({ children, ...props }) => {
                        const label = extractTextValue(children);
                        return <h4 id={`section-${slugifyHeading(label)}`} {...props}>{children}</h4>;
                      },
                      h5: ({ children, ...props }) => {
                        const label = extractTextValue(children);
                        return <h5 id={`section-${slugifyHeading(label)}`} {...props}>{children}</h5>;
                      },
                      h6: ({ children, ...props }) => {
                        const label = extractTextValue(children);
                        return <h6 id={`section-${slugifyHeading(label)}`} {...props}>{children}</h6>;
                      },
                      img: ({ src, alt }) => {
                        const resolvedSrc = resolveDocumentArtifactUrl(documentId, document.file_path, typeof src === 'string' ? src : '');
                        return <AuthenticatedArtifactImage src={resolvedSrc} alt={alt || 'Document artifact'} />;
                      },
                      a: ({ href, children, ...props }) => {
                        const resolvedHref = resolveDocumentArtifactUrl(documentId, document.file_path, typeof href === 'string' ? href : '');
                        return (
                          <a
                            {...props}
                            href={resolvedHref}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {children}
                          </a>
                        );
                      },
                    }}
                  >
                    {document.extracted_text}
                  </ReactMarkdown>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-[var(--text-secondary)]">No content has been extracted from this document yet.</p>
                  </div>
                )}
              </div>
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
                <Button variant="secondary" className="w-full" onClick={openSummaryModal} disabled={!readyForGeneration}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Summary
                </Button>
                {readyForGeneration ? (
                  <Link href={`/dashboard/notes/new?document=${documentId}`} className="w-full">
                    <Button variant="secondary" className="w-full">
                      <BookOpen className="h-4 w-4 mr-2" />
                      Notes
                    </Button>
                  </Link>
                ) : (
                  <Button variant="secondary" className="w-full" disabled>
                    <BookOpen className="h-4 w-4 mr-2" />
                    Notes
                  </Button>
                )}
                <Button variant="secondary" className="w-full" onClick={handleQuickQuiz} disabled={!readyForGeneration}>
                  <ClipboardCheck className="h-4 w-4 mr-2" />
                  Quiz
                </Button>
                {canOpenWorkspace && readyForGeneration ? (
                  <Link href={`/dashboard/workspace?id=${documentId}`} className="w-full">
                    <Button variant="secondary" className="w-full">
                      <Play className="h-4 w-4 mr-2" />
                      Study Mode
                    </Button>
                  </Link>
                ) : canOpenWorkspace ? (
                  <Button variant="secondary" className="w-full" disabled>
                    <Play className="h-4 w-4 mr-2" />
                    Study Mode
                  </Button>
                ) : (
                  <div className="col-span-2 rounded-xl border border-dashed border-[var(--card-border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                    Study workspace is currently available for PDF documents only.
                  </div>
                )}
                <Button variant="secondary" className="w-full" onClick={() => { setActiveTab('mindmap'); if (!mindmapCode) generateMindmap(); }} disabled={!readyForGeneration}>
                  <Network className="h-4 w-4 mr-2" />
                  Mind Map
                </Button>
                <Button variant="secondary" className="w-full" onClick={() => { setActiveTab('diagrams'); if (!diagramCode) generateDiagram(selectedDiagramType); }} disabled={!readyForGeneration}>
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
              {readyForGeneration ? (
                <Link href={`/dashboard/notes/new?document=${documentId}`}>
                  <Button variant="default" size="sm">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate New Notes
                  </Button>
                </Link>
              ) : (
                <Button variant="default" size="sm" disabled>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate New Notes
                </Button>
              )}
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
                {readyForGeneration ? (
                  <Link href={`/dashboard/notes/new?document=${documentId}`}>
                    <Button variant="secondary" size="sm">
                      Create First Note
                    </Button>
                  </Link>
                ) : (
                  <Button variant="secondary" size="sm" disabled>
                    Create First Note
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'quizzes' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Document Quizzes</h3>
              {readyForGeneration ? (
                <Link href={`/dashboard/quizzes/new?document=${documentId}`}>
                  <Button variant="default" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Generate New Quiz
                  </Button>
                </Link>
              ) : (
                <Button variant="default" size="sm" disabled>
                  <Plus className="h-4 w-4 mr-2" />
                  Generate New Quiz
                </Button>
              )}
            </div>

            {isLoadingArtifacts ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner size="lg" />
              </div>
            ) : quizzes.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {quizzes.map((quiz) => (
                  <div key={quiz.id} className="p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] hover:border-[var(--accent-blue)] transition-all group flex flex-col">
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent-blue)] line-clamp-1">{quiz.title}</h4>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-medium uppercase",
                        getDifficultyBadgeClass((quiz as any).difficulty || quiz.difficulty_level || 'medium')
                      )}>
                        {(quiz as any).difficulty || quiz.difficulty_level || 'Medium'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] mb-4">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatDate(quiz.created_at)}
                    </div>

                    <div className="mt-auto pt-2">
                      <Link href={`/dashboard/quizzes/${quiz.id}`} className="block">
                        <Button variant="secondary" size="sm" className="w-full">
                          <Play className="h-3.5 w-3.5 mr-2" />
                          Take Quiz
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 rounded-2xl bg-[var(--card-bg)] border border-dashed border-[var(--card-border)]">
                <ClipboardCheck className="h-12 w-12 text-[var(--text-tertiary)] mx-auto mb-4" />
                <p className="text-[var(--text-secondary)] mb-4">No quizzes generated for this document yet.</p>
                {readyForGeneration ? (
                  <Link href={`/dashboard/quizzes/new?document=${documentId}`}>
                    <Button variant="secondary" size="sm">
                      Generate First Quiz
                    </Button>
                  </Link>
                ) : (
                  <Button variant="secondary" size="sm" disabled>
                    Generate First Quiz
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'summaries' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Document Summaries</h3>
              <Button variant="default" size="sm" onClick={openSummaryModal} disabled={!readyForGeneration}>
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

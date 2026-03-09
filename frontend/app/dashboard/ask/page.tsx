'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { VoiceChat } from '@/components/voice/VoiceChat';
import {
  MessageSquare,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Trash2,
  Keyboard,
  Volume2,
  Copy,
  Sparkles,
  ShieldCheck,
  Search,
  Braces,
  Upload,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  ArrowUp,
  Square,
  Bot,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { Document } from '@/lib/types';
import { isDocumentReadyForGeneration } from '@/lib/document-status';
import { cn } from '@/lib/utils';
import { CitedMarkdown, SourceCard } from '@/components/ui/cited-markdown';
import { PromptInput, PromptInputTextarea, PromptInputActions, PromptInputAction } from "@/components/ui/prompt-input";
import { ScrollButton } from "@/components/ui/scroll-button";
import { ChatContainerRoot, ChatContainerContent, ChatContainerScrollAnchor } from "@/components/ui/chat-container";
import { Message, MessageContent } from "@/components/ui/message";
import { Tool } from "@/components/ui/tool";
import { AnswerActions } from '@/components/ai/answer-actions';

type RAGMode = 'structured_output' | 'file_search' | 'nli_verification';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  timestamp: Date;
  mode?: RAGMode;
  groundingMetadata?: any;
  verifiedCitations?: VerifiedCitation[];
  verificationSummary?: VerificationSummary;
}

interface Source {
  text: string;
  metadata: Record<string, any>;
  similarity?: number;
}

interface VerifiedCitation {
  source_index: number;
  claim: string;
  source_quote: string;
  is_supported: boolean | null;
  confidence: number;
  reasoning: string;
}

interface VerificationSummary {
  total: number;
  verified: number;
  failed: number;
  score: number;
}

interface SectionScope {
  documentId?: string;
  title?: string;
  pages: number[];
}

const MODE_CONFIG = {
  structured_output: {
    label: 'Structured Output',
    icon: Braces,
    description: 'ChromaDB + JSON schema enforced citations',
    color: 'var(--documents)',
  },
  file_search: {
    label: 'File Search Tool',
    icon: Search,
    description: 'Google managed RAG with API-level grounding',
    color: 'var(--summaries)',
  },
  nli_verification: {
    label: 'NLI Verification',
    icon: ShieldCheck,
    description: 'Double-verified citations with fact-checking',
    color: 'var(--notes)',
  },
} as const;

function AskDocumentsPageContent() {
  const searchParams = useSearchParams();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [vectorStats, setVectorStats] = useState<any>(null);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [activeMode, setActiveMode] = useState<'text' | 'voice'>('text');
  const [ragMode, setRagMode] = useState<RAGMode>('structured_output');
  const [fileSearchIndexing, setFileSearchIndexing] = useState(false);
  const [fileSearchStatus, setFileSearchStatus] = useState<Record<string, boolean>>({});
  const [expandedVerifications, setExpandedVerifications] = useState<Set<string>>(new Set());
  const [sectionScope, setSectionScope] = useState<SectionScope | null>(null);
  const [hasAppliedInitialParams, setHasAppliedInitialParams] = useState(false);

  useEffect(() => {
    fetchDocuments();
    fetchVectorStats();
  }, []);

  // Auto-scroll handled by prompt-kit ChatContainer

  // Check file search status when document changes
  useEffect(() => {
    if (selectedDocId && ragMode === 'file_search') {
      checkFileSearchStatus(selectedDocId);
    }
  }, [selectedDocId, ragMode]);

  useEffect(() => {
    if (isLoadingDocs || hasAppliedInitialParams) {
      return;
    }

    const documentIdParam = searchParams.get('document') || '';
    const questionParam = searchParams.get('question') || '';
    const sectionTitleParam = searchParams.get('sectionTitle') || '';
    const sectionPagesParam = (searchParams.get('sectionPages') || '')
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0);

    if (documentIdParam && documents.some((doc) => doc.id === documentIdParam)) {
      setSelectedDocId(documentIdParam);
    }

    if (questionParam) {
      setQuestion(questionParam);
    }

    if (sectionTitleParam || sectionPagesParam.length > 0) {
      setSectionScope({
        documentId: documentIdParam || undefined,
        title: sectionTitleParam || undefined,
        pages: sectionPagesParam,
      });
    }

    setHasAppliedInitialParams(true);
  }, [documents, hasAppliedInitialParams, isLoadingDocs, searchParams]);

  const fetchDocuments = async () => {
    try {
      setIsLoadingDocs(true);
      const data = await api.getDocuments();
      const docsArray = Array.isArray(data) ? data : [];
      const completedDocs = docsArray.filter(
        (doc: Document) => isDocumentReadyForGeneration(doc)
      );
      setDocuments(completedDocs);
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast.error('Failed to load documents');
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const fetchVectorStats = async () => {
    try {
      const stats = await api.getVectorStats();
      setVectorStats(stats);
    } catch (error) {
      console.error('Failed to load vector stats:', error);
    }
  };

  const checkFileSearchStatus = async (docId: string) => {
    try {
      const status = await api.getFileSearchStatus(docId);
      setFileSearchStatus(prev => ({ ...prev, [docId]: status.indexed }));
    } catch (error) {
      console.error('Failed to check file search status:', error);
    }
  };

  const handleIndexForFileSearch = async () => {
    if (!selectedDocId) {
      toast.error('Please select a document first');
      return;
    }
    setFileSearchIndexing(true);
    try {
      const result = await api.indexForFileSearch(selectedDocId);
      if (result.success) {
        toast.success(result.already_existed ? 'Document already indexed' : 'Document indexed for File Search');
        setFileSearchStatus(prev => ({ ...prev, [selectedDocId]: true }));
      } else {
        toast.error(result.error || 'Indexing failed');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to index document');
    } finally {
      setFileSearchIndexing(false);
    }
  };

  const getSelectedDocName = () => {
    if (!selectedDocId) return null;
    const doc = documents.find(d => d.id === selectedDocId);
    return doc?.title || null;
  };

  const getSuggestedQuestions = () => {
    const doc = documents.find(d => d.id === selectedDocId);
    if (doc?.topics && doc.topics.length > 0) {
      const topicQuestions = doc.topics.slice(0, 2).map(
        topic => `Explain "${topic}" in detail`
      );
      return [
        ...topicQuestions,
        `What are the key takeaways from ${doc.title}?`,
        'Summarize the main arguments',
      ];
    }
    if (doc?.keywords && doc.keywords.length > 0) {
      return [
        `Define and explain: ${doc.keywords.slice(0, 3).join(', ')}`,
        `What are the key takeaways from ${doc.title}?`,
        'Summarize the main concepts',
        'List the important points',
      ];
    }
    return [
      'What are the main topics covered?',
      'Summarize the key concepts',
      'What are the important definitions?',
      'Explain the main methodology',
    ];
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!question.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: question,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuestion('');
    setIsLoading(true);

    try {
      const response = await api.ragQuery(
        question,
        selectedDocId || undefined,
        5,
        ragMode,
        sectionScope
          ? {
              sectionTitle: sectionScope.title,
              sectionPages: sectionScope.pages,
            }
          : undefined
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response.success
          ? response.answer
          : response.error || 'Failed to get answer',
        sources: response.sources || [],
        timestamp: new Date(),
        mode: response.mode || ragMode,
        groundingMetadata: response.grounding_metadata,
        verifiedCitations: response.verified_citations,
        verificationSummary: response.verification_summary,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('RAG query error:', error);
      const isQuotaError = error?.message?.includes("quota") || error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED") || error.response?.data?.detail?.includes("quota");

      if (isQuotaError) {
        toast.error("The active AI provider hit a rate limit. Please wait a moment.", { id: 'ask-quota-error' });
      }

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: isQuotaError
          ? "The active AI provider hit a rate limit. Please wait a few seconds and try again."
          : error.response?.data?.detail || 'Failed to process your question. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      if (!isQuotaError) toast.error('Failed to get answer');
    } finally {
      setIsLoading(false);
    }
  };

  const clearConversation = () => {
    setMessages([]);
    setExpandedSources(new Set());
    setExpandedVerifications(new Set());
  };

  const toggleSources = (messageId: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const toggleVerifications = (messageId: string) => {
    setExpandedVerifications(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('Copied to clipboard');
  };

  const clearSectionScope = () => {
    setSectionScope(null);
  };

  const formatSectionScope = () => {
    if (!sectionScope) return null;
    if (sectionScope.title && sectionScope.pages.length > 0) {
      return `${sectionScope.title} • pages ${sectionScope.pages.join(', ')}`;
    }
    if (sectionScope.title) {
      return sectionScope.title;
    }
    if (sectionScope.pages.length > 0) {
      return `Pages ${sectionScope.pages.join(', ')}`;
    }
    return null;
  };

  const exportChatAsMarkdown = () => {
    if (messages.length === 0) {
      toast.error('No messages to export');
      return;
    }

    const docName = getSelectedDocName();
    const header = `# AI Assistant Chat${docName ? ` — ${docName}` : ''}\n\n_Exported on ${new Date().toLocaleString()}_\n\n---\n\n`;

    const body = messages.map((msg) => {
      const time = msg.timestamp.toLocaleTimeString();
      if (msg.type === 'user') {
        return `**You** _(${time})_\n\n${msg.content}\n`;
      }
      let text = `**AI Assistant** _(${time})_`;
      if (msg.mode) {
        text += ` \`${MODE_CONFIG[msg.mode]?.label || msg.mode}\``;
      }
      text += `\n\n${msg.content}\n`;
      if (msg.sources && msg.sources.length > 0) {
        text += `\n<details><summary>Sources (${msg.sources.length})</summary>\n\n`;
        msg.sources.forEach((src, i) => {
          const page = src.metadata?.page_number || src.metadata?.page;
          text += `${i + 1}. ${src.metadata?.document_title || 'Source'}${page ? ` — Page ${page}` : ''}\n   > ${src.text.slice(0, 200)}...\n\n`;
        });
        text += `</details>\n`;
      }
      if (msg.verificationSummary) {
        text += `\n> Verification: ${msg.verificationSummary.verified}/${msg.verificationSummary.total} verified (${Math.round(msg.verificationSummary.score * 100)}%)\n`;
      }
      return text;
    }).join('\n---\n\n');

    const markdown = header + body;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Chat exported as Markdown');
  };

  const exportChatAsPDF = async () => {
    if (messages.length === 0) {
      toast.error('No messages to export');
      return;
    }

    const html2pdf = (await import('html2pdf.js')).default;

    const docName = getSelectedDocName();
    const html = `
      <div style="font-family: system-ui, -apple-system, sans-serif; padding: 20px; max-width: 700px; margin: 0 auto;">
        <h1 style="font-size: 20px; margin-bottom: 4px;">AI Assistant Chat</h1>
        ${docName ? `<p style="font-size: 13px; color: #666; margin-bottom: 4px;">Document: ${docName}</p>` : ''}
        <p style="font-size: 11px; color: #999; margin-bottom: 16px;">Exported on ${new Date().toLocaleString()}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin-bottom: 16px;" />
        ${messages.map((msg) => {
      const time = msg.timestamp.toLocaleTimeString();
      if (msg.type === 'user') {
        return `
              <div style="background: #3b82f6; color: white; padding: 12px 16px; border-radius: 12px; margin: 8px 0 8px 40px;">
                <p style="font-size: 10px; opacity: 0.7; margin-bottom: 4px;">You &bull; ${time}</p>
                <p style="font-size: 13px; margin: 0; white-space: pre-wrap;">${msg.content}</p>
              </div>`;
      }
      const modeLabel = msg.mode ? MODE_CONFIG[msg.mode]?.label || '' : '';
      return `
            <div style="background: #f3f4f6; padding: 12px 16px; border-radius: 12px; margin: 8px 40px 8px 0; border: 1px solid #e5e7eb;">
              <p style="font-size: 10px; color: #6b7280; margin-bottom: 4px;">AI Assistant &bull; ${time}${modeLabel ? ` &bull; ${modeLabel}` : ''}</p>
              <div style="font-size: 13px; margin: 0; white-space: pre-wrap;">${msg.content}</div>
              ${msg.sources && msg.sources.length > 0 ? `<p style="font-size: 10px; color: #9ca3af; margin-top: 8px;">${msg.sources.length} source(s) referenced</p>` : ''}
              ${msg.verificationSummary ? `<p style="font-size: 10px; color: #22c55e; margin-top: 4px;">Verified: ${msg.verificationSummary.verified}/${msg.verificationSummary.total} (${Math.round(msg.verificationSummary.score * 100)}%)</p>` : ''}
            </div>`;
    }).join('')}
      </div>`;

    const container = document.createElement('div');
    container.innerHTML = html;

    html2pdf().set({
      margin: [10, 10],
      filename: `chat-export-${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
    }).from(container).save();

    toast.success('Chat exported as PDF');
  };

  const selectedDocument = documents.find((doc) => doc.id === selectedDocId);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(284px,308px)_minmax(0,1fr)]">
      <aside className="dashboard-panel overflow-hidden xl:sticky xl:top-28 xl:h-[calc(100vh-156px)]">
        <div className="panel-content flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-5 lg:p-6">
          <div>
            <p className="editorial-kicker">
              <span className="inline-block h-2 w-2 rounded-full bg-[var(--highlight)]" />
              AI console
            </p>
            <h2 className="mt-3 font-serif text-3xl tracking-[-0.05em] text-[var(--text-primary)]">
              Grounded study assistant
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              Choose the source scope, pick the citation strategy, and question the library like a working research desk.
            </p>
          </div>

          <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-3">
            <div className="flex rounded-[1rem] border border-[var(--card-border)] bg-[var(--accent)] p-1">
              <button
                onClick={() => setActiveMode('text')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-[0.9rem] px-3 py-2 text-sm font-medium transition-all',
                  activeMode === 'text'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[var(--shadow-glow-blue)]'
                    : 'text-[var(--text-secondary)]'
                )}
              >
                <Keyboard className="h-4 w-4" />
                Text
              </button>
              <button
                onClick={() => setActiveMode('voice')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-[0.9rem] px-3 py-2 text-sm font-medium transition-all',
                  activeMode === 'voice'
                    ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[var(--shadow-glow-blue)]'
                    : 'text-[var(--text-secondary)]'
                )}
              >
                <Volume2 className="h-4 w-4" />
                Voice
              </button>
            </div>
          </div>

          <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
              Document scope
            </label>
            {isLoadingDocs ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <LoadingSpinner size="sm" />
                Loading documents...
              </div>
            ) : (
              <select
                value={selectedDocId}
                onChange={(e) => {
                  const nextDocId = e.target.value;
                  setSelectedDocId(nextDocId);
                  if (sectionScope && sectionScope.documentId && sectionScope.documentId !== nextDocId) {
                    setSectionScope(null);
                  }
                  if (!nextDocId) {
                    setSectionScope(null);
                  }
                }}
                className="w-full"
              >
                <option value="">All Documents</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </select>
            )}
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              {selectedDocument
                ? `Focused on “${selectedDocument.title}”.`
                : 'Searching across every document that is ready for generation.'}
            </p>
          </div>

          {sectionScope && (
            <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                    Section scope
                  </label>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {formatSectionScope()}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    Retrieval is narrowed to this section before answer generation.
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={clearSectionScope} className="shrink-0">
                  Clear
                </Button>
              </div>
            </div>
          )}

          {activeMode === 'text' && (
            <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4">
              <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                Citation mode
              </label>
              <div className="space-y-2">
                {(Object.keys(MODE_CONFIG) as RAGMode[]).map((mode) => {
                  const config = MODE_CONFIG[mode];
                  const Icon = config.icon;
                  const isActive = ragMode === mode;

                  return (
                    <button
                      key={mode}
                      onClick={() => setRagMode(mode)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-[1rem] border px-3 py-3 text-left transition-all',
                        isActive
                          ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]'
                          : 'border-[var(--card-border)] bg-[var(--card-bg-solid)] text-[var(--text-secondary)] hover:border-[var(--card-border-hover)]'
                      )}
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{config.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-inherit/80">{config.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {ragMode === 'file_search' && selectedDocId && (
                <div className="mt-4">
                  {fileSearchStatus[selectedDocId] ? (
                    <div className="flex items-center gap-2 text-sm text-[var(--success)]">
                      <CheckCircle2 className="h-4 w-4" />
                      Indexed for File Search
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleIndexForFileSearch}
                      disabled={fileSearchIndexing}
                      className="w-full justify-center"
                    >
                      {fileSearchIndexing ? (
                        <>
                          <LoadingSpinner size="sm" />
                          Indexing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Index for File Search
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {ragMode === 'file_search' && !selectedDocId && (
                <p className="mt-3 flex items-center gap-2 text-xs text-[var(--warning)]">
                  <AlertCircle className="h-3.5 w-3.5" />
                  File Search needs a specific document selected first.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Document count</p>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{documents.length}</p>
            </div>
            {vectorStats && (
              <div className="rounded-[1.35rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_78%,transparent)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Chunk inventory</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)]">{vectorStats.total_chunks || 0}</p>
              </div>
            )}
          </div>

          {messages.length > 0 && activeMode === 'text' && (
            <div className="mt-auto grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              <Button variant="outline" size="sm" onClick={exportChatAsMarkdown} className="justify-center">
                <Download className="h-4 w-4" />
                Export .md
              </Button>
              <Button variant="outline" size="sm" onClick={exportChatAsPDF} className="justify-center">
                <Download className="h-4 w-4" />
                Export .pdf
              </Button>
              <Button variant="ghost" size="sm" onClick={clearConversation} className="justify-center">
                <Trash2 className="h-4 w-4" />
                Clear session
              </Button>
            </div>
          )}
        </div>
      </aside>

      <section className="flex min-h-[calc(100vh-156px)] min-w-0 flex-col">
        <div className="dashboard-panel flex min-h-[calc(100vh-156px)] min-w-0 flex-col overflow-hidden">
          <div className="panel-content flex items-center justify-between gap-4 border-b border-[var(--card-border)] px-5 py-4 lg:px-6">
            <div>
              <p className="editorial-kicker">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--primary)]" />
                Retrieval session
              </p>
              <h3 className="mt-2 font-serif text-2xl tracking-[-0.04em] text-[var(--text-primary)]">
                {activeMode === 'voice' ? 'Voice assistant' : selectedDocument?.title || 'All documents'}
              </h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {activeMode === 'voice'
                  ? 'Speak naturally and keep the response grounded in your sources.'
                  : MODE_CONFIG[ragMode].description}
              </p>
              {activeMode === 'text' && sectionScope && formatSectionScope() && (
                <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--primary)]">
                  Section: {formatSectionScope()}
                </p>
              )}
            </div>

            {activeMode === 'text' && (
              <div className="signal-pill hidden sm:inline-flex">
                {messages.length} message{messages.length === 1 ? '' : 's'}
              </div>
            )}
          </div>

          {activeMode === 'voice' && (
            <div className="panel-content flex flex-1 flex-col items-center justify-center p-6">
              <div className="w-full max-w-xl rounded-[1.8rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_82%,transparent)] p-6 shadow-[var(--card-shadow)]">
                <VoiceChat
                  documentId={selectedDocId || undefined}
                  onTranscript={(text) => setQuestion(text)}
                  onResponse={(text) => {
                    const assistantMessage: Message = {
                      id: Date.now().toString(),
                      type: 'assistant',
                      content: text,
                      timestamp: new Date(),
                    };
                    setMessages((prev) => [...prev, assistantMessage]);
                  }}
                />
              </div>
              <p className="mt-4 max-w-md text-center text-sm leading-6 text-[var(--text-secondary)]">
                Voice mode is best for quick verbal recall checks and focused document walkthroughs.
              </p>
            </div>
          )}

          {activeMode === 'text' && (
            <>
              <ChatContainerRoot className="paper-grid relative min-h-0 flex-1 overflow-y-auto bg-transparent">
                {messages.length === 0 ? (
                  <div className="panel-content flex h-full flex-col items-center justify-center p-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[1.6rem] bg-[var(--primary-light)] text-[var(--primary)]">
                      <MessageSquare className="h-7 w-7" />
                    </div>
                    <h3 className="mt-6 font-serif text-3xl tracking-[-0.04em] text-[var(--text-primary)]">
                      Ask anything about your documents
                    </h3>
                    <p className="mt-3 max-w-xl text-base leading-7 text-[var(--text-secondary)]">
                      Ask for summaries, definitions, explanations, comparisons, or citations. The assistant will answer using retrieved source chunks from your library.
                    </p>
                    <div className="mt-6 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
                      {getSuggestedQuestions().map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setQuestion(suggestion)}
                          className="rounded-[1.2rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_80%,transparent)] px-4 py-3 text-left text-sm text-[var(--text-secondary)] transition-all hover:-translate-y-0.5 hover:border-[var(--card-border-hover)] hover:text-[var(--text-primary)]"
                        >
                          <Sparkles className="mr-2 inline h-4 w-4 text-[var(--primary)]" />
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ChatContainerContent className="panel-content space-y-5 p-5 lg:p-6">
                    {messages.map((message, index) => (
                      <div
                        key={message.id}
                        className={cn('flex', message.type === 'user' ? 'justify-end' : 'justify-start')}
                      >
                        <div
                          className={cn(
                            'group relative max-w-[86%] rounded-[1.5rem] px-4 py-4 shadow-sm',
                            message.type === 'user'
                              ? 'bg-[linear-gradient(135deg,var(--primary),var(--highlight))] text-[var(--primary-foreground)] shadow-[var(--shadow-glow-blue)]'
                              : 'border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_82%,transparent)]'
                          )}
                        >
                          {message.type === 'assistant' && message.mode && (
                            <div className="mb-3 flex items-center gap-1.5">
                              {(() => {
                                const modeKey = message.mode as RAGMode;
                                const config = MODE_CONFIG[modeKey];
                                if (!config) return null;
                                const Icon = config.icon;
                                return (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--card-border)] bg-[var(--card-bg-solid)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                    <Icon className="h-3 w-3" />
                                    {config.label}
                                  </span>
                                );
                              })()}
                            </div>
                          )}

                          {message.type === 'assistant' ? (
                            <CitedMarkdown
                              content={message.content}
                              sources={message.sources || []}
                              messageId={message.id}
                              mode={message.mode}
                              groundingMetadata={message.groundingMetadata}
                              onCitationClick={(idx) => {
                                if (!expandedSources.has(message.id)) {
                                  setExpandedSources((prev) => new Set(prev).add(message.id));
                                }
                                setTimeout(() => {
                                  const el = document.getElementById(`source-${message.id}-${idx}`);
                                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  el?.classList.add('ring-2', 'ring-[var(--primary)]');
                                  setTimeout(() => el?.classList.remove('ring-2', 'ring-[var(--primary)]'), 2000);
                                }, 100);
                              }}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                          )}

                          {message.type === 'assistant' && (
                            <AnswerActions
                              answer={message.content}
                              sources={message.sources}
                              defaultDocumentId={selectedDocId || undefined}
                              question={messages[index - 1]?.type === 'user' ? messages[index - 1]?.content : undefined}
                            />
                          )}

                          <button
                            onClick={() => copyMessage(message.content)}
                            className={cn(
                              'absolute right-2 top-2 rounded-xl p-1.5 opacity-0 transition-opacity group-hover:opacity-100',
                              message.type === 'user'
                                ? 'text-white/70 hover:bg-white/20'
                                : 'text-[var(--text-tertiary)] hover:bg-[var(--accent)]'
                            )}
                            title="Copy message"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>

                          {message.type === 'assistant' && message.verificationSummary && (
                            <div className="mt-4 border-t border-[var(--card-border)] pt-4">
                              <button
                                onClick={() => toggleVerifications(message.id)}
                                className="flex w-full items-center gap-2 text-xs"
                              >
                                <ShieldCheck className="h-3.5 w-3.5 text-[var(--notes)]" />
                                <span className="text-[var(--text-secondary)]">Verification</span>
                                <span className="font-medium text-[var(--success)]">
                                  {message.verificationSummary.verified} verified
                                </span>
                                {message.verificationSummary.failed > 0 && (
                                  <span className="font-medium text-[var(--danger)]">
                                    {message.verificationSummary.failed} failed
                                  </span>
                                )}
                                <span
                                  className={cn(
                                    'ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold',
                                    message.verificationSummary.score >= 0.8
                                      ? 'bg-[var(--success-bg)] text-[var(--success)]'
                                      : message.verificationSummary.score >= 0.5
                                        ? 'bg-[var(--warning-bg)] text-[var(--warning)]'
                                        : 'bg-[var(--danger-bg)] text-[var(--danger)]'
                                  )}
                                >
                                  {Math.round(message.verificationSummary.score * 100)}%
                                </span>
                                {expandedVerifications.has(message.id) ? (
                                  <ChevronUp className="h-3 w-3 text-[var(--text-muted)]" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
                                )}
                              </button>

                              {expandedVerifications.has(message.id) && message.verifiedCitations && (
                                <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                  {message.verifiedCitations.map((vc, idx) => (
                                    <div
                                      key={idx}
                                      className={cn(
                                        'rounded-[1rem] border p-3 text-xs',
                                        vc.is_supported
                                          ? 'border-[var(--success-border)] bg-[var(--success-bg)]'
                                          : vc.is_supported === false
                                            ? 'border-[var(--error-border)] bg-[var(--danger-bg)]'
                                            : 'border-[var(--card-border)] bg-[var(--card-bg-solid)]'
                                      )}
                                    >
                                      <div className="flex items-start gap-2">
                                        {vc.is_supported ? (
                                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--success)]" />
                                        ) : vc.is_supported === false ? (
                                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--danger)]" />
                                        ) : (
                                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
                                        )}
                                        <div className="min-w-0">
                                          <p className="truncate font-medium text-[var(--text-primary)]">
                                            [{vc.source_index}] &ldquo;{vc.claim}&rdquo;
                                          </p>
                                          <p className="mt-1 line-clamp-2 text-[var(--text-tertiary)]">{vc.reasoning}</p>
                                          {vc.confidence > 0 && (
                                            <span className="mt-1 inline-block text-[9px] text-[var(--text-muted)]">
                                              Confidence: {Math.round(vc.confidence * 100)}%
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {message.type === 'assistant' && message.sources && message.sources.length > 0 && (
                            <div className="mt-4 border-t border-[var(--card-border)] pt-4">
                              <button
                                onClick={() => toggleSources(message.id)}
                                className="flex items-center gap-2 text-xs text-[var(--primary)] hover:underline"
                              >
                                <BookOpen className="h-3.5 w-3.5" />
                                {expandedSources.has(message.id) ? 'Hide' : 'View'} {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
                                {expandedSources.has(message.id) ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                              </button>

                              {expandedSources.has(message.id) && (
                                <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                  {message.sources.map((source, idx) => (
                                    <SourceCard key={idx} source={source} index={idx} messageId={message.id} />
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <p className={cn('mt-3 text-[10px]', message.type === 'user' ? 'text-white/65' : 'text-[var(--text-muted)]')}>
                            {message.timestamp.toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}

                    {isLoading && (
                      <Message className="justify-start gap-2">
                        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)]">
                          <Bot className="h-4 w-4 animate-pulse" />
                        </div>
                        <MessageContent className="max-w-[440px] rounded-[1.4rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_82%,transparent)] px-4 py-3">
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <LoadingSpinner size="sm" />
                              <span className="text-sm font-medium text-[var(--text-secondary)]">
                                {ragMode === 'nli_verification'
                                  ? 'Analyzing and verifying citations...'
                                  : ragMode === 'file_search'
                                    ? 'Searching with File Search...'
                                    : 'Analyzing documents...'}
                              </span>
                            </div>
                            {ragMode === 'nli_verification' && (
                              <Tool
                                toolPart={{
                                  type: 'NLI Reasoning',
                                  state: 'input-streaming',
                                }}
                                className="mt-2"
                              />
                            )}
                          </div>
                        </MessageContent>
                      </Message>
                    )}

                    <ChatContainerScrollAnchor />
                    <div className="absolute bottom-4 right-4">
                      <ScrollButton className="border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-primary)] shadow-sm hover:bg-[var(--accent)]" />
                    </div>
                  </ChatContainerContent>
                )}
              </ChatContainerRoot>

              <div className="sticky bottom-0 z-10 border-t border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--card-bg-solid)_88%,transparent)] p-4 backdrop-blur-xl lg:p-5">
                <PromptInput
                  value={question}
                  onValueChange={setQuestion}
                  onSubmit={() => {
                    if (question.trim()) handleSubmit();
                  }}
                  isLoading={isLoading}
                  className="w-full rounded-[1.6rem] border border-[var(--card-border)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_82%,transparent)] px-2 py-1.5 shadow-[var(--card-shadow)]"
                >
                  <PromptInputTextarea
                    placeholder="Ask a question about your documents..."
                    disabled={isLoading}
                    className="min-h-[50px] flex-1 border-none bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:ring-0"
                  />
                  <PromptInputActions className="pb-1 pr-1">
                    <PromptInputAction tooltip={isLoading ? 'Stop generation' : 'Send message'}>
                      <Button
                        type="button"
                        onClick={() => {
                          if (!isLoading && question.trim()) {
                            handleSubmit();
                          }
                        }}
                        variant="default"
                        size="icon"
                        className="h-10 w-10 rounded-full"
                        disabled={!isLoading && !question.trim()}
                      >
                        {isLoading ? (
                          <Square className="h-4 w-4 fill-current" />
                        ) : (
                          <ArrowUp className="h-5 w-5" />
                        )}
                      </Button>
                    </PromptInputAction>
                  </PromptInputActions>
                </PromptInput>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export default function AskDocumentsPage() {
  return (
    <Suspense
      fallback={
        <div className="dashboard-panel flex min-h-[320px] items-center justify-center">
          <LoadingSpinner />
        </div>
      }
    >
      <AskDocumentsPageContent />
    </Suspense>
  );
}

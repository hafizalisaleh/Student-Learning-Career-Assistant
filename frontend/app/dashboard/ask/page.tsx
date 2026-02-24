'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { VoiceChat } from '@/components/voice/VoiceChat';
import {
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Database,
  Trash2,
  Keyboard,
  Volume2,
  Copy,
  Sparkles,
  FileText,
  ShieldCheck,
  Search,
  Braces,
  Upload,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { Document } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CitedMarkdown, SourceCard } from '@/components/ui/cited-markdown';

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

export default function AskDocumentsPage() {
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDocuments();
    fetchVectorStats();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check file search status when document changes
  useEffect(() => {
    if (selectedDocId && ragMode === 'file_search') {
      checkFileSearchStatus(selectedDocId);
    }
  }, [selectedDocId, ragMode]);

  const fetchDocuments = async () => {
    try {
      setIsLoadingDocs(true);
      const data = await api.getDocuments();
      const docsArray = Array.isArray(data) ? data : [];
      const completedDocs = docsArray.filter(
        (doc: Document) => doc.processing_status?.toLowerCase() === 'completed'
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        ragMode
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
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: error.response?.data?.detail || 'Failed to process your question. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      toast.error('Failed to get answer');
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

  return (
    <div className="h-[calc(100vh-140px)] lg:h-[calc(100vh-100px)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            AI Assistant
          </h1>
          <p className="text-sm text-[var(--text-tertiary)]">
            Ask questions about your documents
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Toggle */}
          <div className="flex p-0.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--card-border)]">
            <button
              onClick={() => setActiveMode('text')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all',
                activeMode === 'text'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              )}
            >
              <Keyboard className="h-3.5 w-3.5" />
              <span>Text</span>
            </button>
            <button
              onClick={() => setActiveMode('voice')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all',
                activeMode === 'voice'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              )}
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>Voice</span>
            </button>
          </div>

          {/* Vector Stats */}
          {vectorStats && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--card-border)]">
              <Database className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span className="text-xs text-[var(--text-secondary)]">
                {vectorStats.total_chunks || 0} chunks
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Document Selector + RAG Mode */}
      <div className="mb-3 p-3 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)]">
        <div className="flex flex-col gap-3">
          {/* Top row: Document selector + clear */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 w-full">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                <FileText className="h-3.5 w-3.5 inline mr-1.5" />
                Filter by Document (Optional)
              </label>
              {isLoadingDocs ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <LoadingSpinner size="sm" />
                  Loading...
                </div>
              ) : (
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm text-[var(--text-primary)]"
                >
                  <option value="">All Documents</option>
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {messages.length > 0 && activeMode === 'text' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearConversation}
                className="sm:mt-5"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Clear
              </Button>
            )}
          </div>

          {/* RAG Mode Selector */}
          {activeMode === 'text' && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Citation Mode
              </label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(MODE_CONFIG) as RAGMode[]).map((mode) => {
                  const config = MODE_CONFIG[mode];
                  const Icon = config.icon;
                  const isActive = ragMode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => setRagMode(mode)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                        isActive
                          ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)]'
                          : 'border-[var(--card-border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--text-primary)]'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {config.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                {MODE_CONFIG[ragMode].description}
              </p>

              {/* File Search Index Button */}
              {ragMode === 'file_search' && selectedDocId && (
                <div className="mt-2 flex items-center gap-2">
                  {fileSearchStatus[selectedDocId] ? (
                    <span className="flex items-center gap-1 text-xs text-[var(--success)]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Indexed for File Search
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleIndexForFileSearch}
                      disabled={fileSearchIndexing}
                      className="text-xs"
                    >
                      {fileSearchIndexing ? (
                        <>
                          <LoadingSpinner size="sm" />
                          Indexing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-3.5 w-3.5 mr-1" />
                          Index for File Search
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}

              {ragMode === 'file_search' && !selectedDocId && (
                <p className="mt-1.5 text-[10px] text-[var(--warning)] flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  File Search requires a specific document selected
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Voice Chat Mode */}
      {activeMode === 'voice' && (
        <div className="flex-1 flex flex-col items-center justify-center rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] p-6">
          <div className="w-full max-w-md">
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
          <p className="text-xs text-[var(--text-muted)] mt-4 text-center max-w-sm">
            Speak naturally and get instant answers about your documents.
          </p>
        </div>
      )}

      {/* Text Chat Mode */}
      {activeMode === 'text' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Chat Messages Container */}
          <div className="flex-1 overflow-y-auto rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] mb-2">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6">
                <div className="w-12 h-12 rounded-lg bg-[var(--primary-light)] flex items-center justify-center mb-3">
                  <MessageSquare className="h-6 w-6 text-[var(--primary)]" />
                </div>
                <h3 className="text-base font-medium text-[var(--text-primary)] mb-1">
                  Ask anything about your documents
                </h3>
                <p className="text-sm text-[var(--text-tertiary)] max-w-sm mb-4">
                  Questions are answered using RAG — relevant chunks from your documents generate accurate, cited answers.
                </p>
                <div className="grid grid-cols-2 gap-2 max-w-md w-full">
                  {getSuggestedQuestions().map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setQuestion(suggestion)}
                      className="px-3 py-2 text-xs text-left rounded-lg bg-[var(--bg-secondary)] border border-[var(--card-border)] hover:border-[var(--primary)] hover:bg-[var(--primary-light)] transition-all text-[var(--text-secondary)]"
                    >
                      <Sparkles className="h-3 w-3 inline mr-1 text-[var(--primary)]" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      'flex',
                      message.type === 'user' ? 'justify-end' : 'justify-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-xl px-4 py-3 group relative',
                        message.type === 'user'
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-[var(--bg-secondary)] border border-[var(--card-border)]'
                      )}
                    >
                      {/* Mode badge for assistant messages */}
                      {message.type === 'assistant' && message.mode && (
                        <div className="flex items-center gap-1.5 mb-2">
                          {(() => {
                            const modeKey = message.mode as RAGMode;
                            const config = MODE_CONFIG[modeKey];
                            if (!config) return null;
                            const Icon = config.icon;
                            return (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--card-border)]">
                                <Icon className="h-2.5 w-2.5" />
                                {config.label}
                              </span>
                            );
                          })()}
                        </div>
                      )}

                      {/* Message Content */}
                      {message.type === 'assistant' ? (
                        <CitedMarkdown
                          content={message.content}
                          sources={message.sources || []}
                          messageId={message.id}
                          mode={message.mode}
                          groundingMetadata={message.groundingMetadata}
                          onCitationClick={(idx) => {
                            if (!expandedSources.has(message.id)) {
                              setExpandedSources(prev => new Set(prev).add(message.id));
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
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      )}

                      {/* Copy button */}
                      <button
                        onClick={() => copyMessage(message.content)}
                        className={cn(
                          'absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity',
                          message.type === 'user'
                            ? 'hover:bg-white/20 text-white/70'
                            : 'hover:bg-[var(--bg-elevated)] text-[var(--text-tertiary)]'
                        )}
                        title="Copy message"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>

                      {/* NLI Verification Summary */}
                      {message.type === 'assistant' && message.verificationSummary && (
                        <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                          <button
                            onClick={() => toggleVerifications(message.id)}
                            className="flex items-center gap-2 text-xs w-full"
                          >
                            <ShieldCheck className="h-3.5 w-3.5 text-[var(--notes)]" />
                            <span className="text-[var(--text-secondary)]">
                              Verification:
                            </span>
                            <span className="text-[var(--success)] font-medium">
                              {message.verificationSummary.verified} verified
                            </span>
                            {message.verificationSummary.failed > 0 && (
                              <span className="text-[var(--danger)] font-medium">
                                {message.verificationSummary.failed} failed
                              </span>
                            )}
                            <span className={cn(
                              'ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold',
                              message.verificationSummary.score >= 0.8
                                ? 'bg-[var(--success-bg)] text-[var(--success)]'
                                : message.verificationSummary.score >= 0.5
                                  ? 'bg-[var(--warning-bg)] text-[var(--warning)]'
                                  : 'bg-[var(--danger-bg)] text-[var(--danger)]'
                            )}>
                              {Math.round(message.verificationSummary.score * 100)}%
                            </span>
                            {expandedVerifications.has(message.id) ? (
                              <ChevronUp className="h-3 w-3 text-[var(--text-muted)]" />
                            ) : (
                              <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
                            )}
                          </button>

                          {expandedVerifications.has(message.id) && message.verifiedCitations && (
                            <div className="mt-2 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                              {message.verifiedCitations.map((vc, idx) => (
                                <div
                                  key={idx}
                                  className={cn(
                                    'p-2 rounded-md text-xs border',
                                    vc.is_supported
                                      ? 'bg-[var(--success-bg)] border-[var(--success)]/20'
                                      : vc.is_supported === false
                                        ? 'bg-[var(--danger-bg)] border-[var(--danger)]/20'
                                        : 'bg-[var(--bg-elevated)] border-[var(--card-border)]'
                                  )}
                                >
                                  <div className="flex items-start gap-1.5">
                                    {vc.is_supported ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)] shrink-0 mt-0.5" />
                                    ) : vc.is_supported === false ? (
                                      <XCircle className="h-3.5 w-3.5 text-[var(--danger)] shrink-0 mt-0.5" />
                                    ) : (
                                      <AlertCircle className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 mt-0.5" />
                                    )}
                                    <div className="min-w-0">
                                      <p className="text-[var(--text-primary)] font-medium truncate">
                                        [{vc.source_index}] &ldquo;{vc.claim}&rdquo;
                                      </p>
                                      <p className="text-[var(--text-tertiary)] mt-0.5 line-clamp-2">
                                        {vc.reasoning}
                                      </p>
                                      {vc.confidence > 0 && (
                                        <span className="text-[var(--text-muted)] text-[9px]">
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

                      {/* Source Citations */}
                      {message.type === 'assistant' && message.sources && message.sources.length > 0 && (
                        <div className={cn(
                          'mt-3 pt-3 border-t border-[var(--card-border)]',
                          message.verificationSummary ? '' : ''
                        )}>
                          <button
                            onClick={() => toggleSources(message.id)}
                            className="flex items-center gap-1 text-xs text-[var(--primary)] hover:underline"
                          >
                            <BookOpen className="h-3 w-3" />
                            {expandedSources.has(message.id) ? 'Hide' : 'View'} {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
                            {expandedSources.has(message.id) ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>

                          {expandedSources.has(message.id) && (
                            <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                              {message.sources.map((source, idx) => (
                                <SourceCard
                                  key={idx}
                                  source={source}
                                  index={idx}
                                  messageId={message.id}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <p className={cn(
                        'text-[10px] mt-2',
                        message.type === 'user' ? 'text-white/60' : 'text-[var(--text-muted)]'
                      )}>
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--card-border)] rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-[var(--primary)] animate-pulse" />
                        <span className="text-sm text-[var(--text-secondary)]">
                          {ragMode === 'nli_verification'
                            ? 'Generating answer and verifying citations...'
                            : ragMode === 'file_search'
                              ? 'Searching with Google File Search...'
                              : 'Searching documents and generating answer...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="flex gap-2 shrink-0">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about your documents..."
              disabled={isLoading}
              className="flex-1 px-4 py-2.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={isLoading || !question.trim()}
              className="px-4"
            >
              {isLoading ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1.5">Ask</span>
                </>
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

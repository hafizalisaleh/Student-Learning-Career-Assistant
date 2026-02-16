'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { VoiceChat } from '@/components/voice/VoiceChat';
import {
  MessageSquare,
  Send,
  FileText,
  ChevronDown,
  BookOpen,
  Database,
  Trash2,
  Keyboard,
  Volume2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { Document } from '@/lib/types';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  timestamp: Date;
}

interface Source {
  text: string;
  metadata: Record<string, any>;
  similarity?: number;
}

export default function AskDocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [vectorStats, setVectorStats] = useState<any>(null);
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'text' | 'voice'>('text');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDocuments();
    fetchVectorStats();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
        5
      );

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: response.success
          ? response.answer
          : response.error || 'Failed to get answer',
        sources: response.sources || [],
        timestamp: new Date(),
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
  };

  const toggleSources = (messageId: string) => {
    setExpandedSources(expandedSources === messageId ? null : messageId);
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                activeMode === 'text'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <Keyboard className="h-3.5 w-3.5" />
              <span>Text</span>
            </button>
            <button
              onClick={() => setActiveMode('voice')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all ${
                activeMode === 'voice'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              }`}
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

      {/* Document Selector */}
      <div className="mb-3 p-3 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)]">
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
                className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm text-[var(--text-primary)]"
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
              variant="outline"
              size="sm"
              onClick={clearConversation}
              className="sm:mt-5"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Voice Chat Mode */}
      {activeMode === 'voice' && (
        <div className="flex-1 flex flex-col items-center justify-center card p-6">
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
                  Questions are answered using RAG - relevant chunks from your documents generate accurate answers.
                </p>
                <div className="grid grid-cols-2 gap-2 max-w-md w-full">
                  {[
                    'What are the main topics?',
                    'Summarize key concepts',
                    'Important definitions?',
                    'Explain the methodology',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setQuestion(suggestion)}
                      className="px-3 py-2 text-xs text-left rounded-md bg-[var(--bg-secondary)] border border-[var(--card-border)] hover:border-[var(--primary)] hover:bg-[var(--primary-light)] transition-all text-[var(--text-secondary)]"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-3.5 py-2.5 ${
                        message.type === 'user'
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-[var(--bg-secondary)] border border-[var(--card-border)]'
                      }`}
                    >
                      <p className={`text-sm whitespace-pre-wrap ${message.type === 'assistant' ? 'text-[var(--text-primary)]' : ''}`}>
                        {message.content}
                      </p>

                      {/* Sources */}
                      {message.type === 'assistant' && message.sources && message.sources.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-[var(--card-border)]">
                          <button
                            onClick={() => toggleSources(message.id)}
                            className="flex items-center gap-1.5 text-xs text-[var(--primary)] hover:underline"
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                            {message.sources.length} source{message.sources.length > 1 ? 's' : ''}
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${
                                expandedSources === message.id ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          {expandedSources === message.id && (
                            <div className="mt-2 space-y-2">
                              {message.sources.map((source, idx) => (
                                <div
                                  key={idx}
                                  className="p-2.5 rounded-md bg-[var(--bg-elevated)] border border-[var(--card-border)] text-xs"
                                >
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="font-medium text-[var(--primary)]">
                                      Chunk {idx + 1}
                                    </span>
                                    {source.similarity && (
                                      <span className="text-[var(--text-muted)]">
                                        {(source.similarity * 100).toFixed(1)}% match
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[var(--text-secondary)] line-clamp-3">
                                    {source.text}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <p className={`text-[10px] mt-1.5 ${message.type === 'user' ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--card-border)] rounded-lg px-3.5 py-2.5">
                      <div className="flex items-center gap-2">
                        <LoadingSpinner size="sm" />
                        <span className="text-sm text-[var(--text-secondary)]">Thinking...</span>
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
              className="flex-1 px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
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

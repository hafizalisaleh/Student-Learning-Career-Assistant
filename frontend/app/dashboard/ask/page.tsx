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
  Sparkles,
  ChevronDown,
  BookOpen,
  Database,
  Trash2,
  Mic,
  X,
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
      // Only show completed documents
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
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Header with Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-[var(--accent-purple)] to-[var(--accent-pink)]">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              AI Assistant
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Ask questions about your documents
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Mode Toggle - Text vs Voice */}
          <div className="flex p-1 rounded-xl bg-[var(--bg-elevated)] border border-[var(--card-border)]">
            <button
              onClick={() => setActiveMode('text')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeMode === 'text'
                  ? 'bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] text-white shadow-lg'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Keyboard className="h-4 w-4" />
              <span className="hidden sm:inline">Text Chat</span>
            </button>
            <button
              onClick={() => setActiveMode('voice')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeMode === 'voice'
                  ? 'bg-gradient-to-r from-[var(--accent-purple)] to-[var(--accent-pink)] text-white shadow-lg'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Volume2 className="h-4 w-4" />
              <span className="hidden sm:inline">Voice Chat</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--accent-pink)]/20 text-[var(--accent-pink)] font-semibold">NEW</span>
            </button>
          </div>

          {/* Vector Store Stats */}
          {vectorStats && (
            <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--card-border)]">
              <Database className="h-4 w-4 text-[var(--accent-blue)]" />
              <span className="text-sm text-[var(--text-secondary)]">
                {vectorStats.total_chunks || 0} chunks
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Document Selector - Common for both modes */}
      <div className="mb-4 p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              <FileText className="h-4 w-4 inline mr-2" />
              Filter by Document (Optional)
            </label>
            {isLoadingDocs ? (
              <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                <LoadingSpinner size="sm" />
                Loading documents...
              </div>
            ) : (
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="w-full px-4 py-2.5 bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] text-[var(--text-primary)]"
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
              className="sm:mt-6"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Voice Chat Mode */}
      {activeMode === 'voice' && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-full max-w-lg">
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
          <p className="text-xs text-[var(--text-tertiary)] mt-6 text-center max-w-md">
            Voice responses are powered by real-time AI. Speak naturally and get instant answers about your documents.
          </p>
        </div>
      )}

      {/* Text Chat Mode */}
      {activeMode === 'text' && (
        <>
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto mb-4 p-4 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <div className="p-4 rounded-full bg-gradient-to-br from-[var(--accent-blue)]/20 to-[var(--accent-purple)]/20 mb-4">
                  <MessageSquare className="h-12 w-12 text-[var(--accent-blue)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                  Ask anything about your documents
                </h3>
                <p className="text-[var(--text-secondary)] max-w-md mb-6">
                  Your questions are answered using RAG - relevant chunks are retrieved
                  from your indexed documents and used to generate accurate answers.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg">
                  {[
                    'What are the main topics covered?',
                    'Summarize the key concepts',
                    'What are the important definitions?',
                    'Explain the methodology used',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setQuestion(suggestion)}
                      className="px-4 py-3 text-sm text-left rounded-xl bg-[var(--bg-elevated)] border border-[var(--card-border)] hover:border-[var(--accent-blue)] hover:bg-[var(--accent-blue-subtle)] transition-all text-[var(--text-secondary)]"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                        message.type === 'user'
                          ? 'bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] text-white'
                          : 'bg-[var(--bg-elevated)] border border-[var(--card-border)]'
                      }`}
                    >
                      <p className={`whitespace-pre-wrap ${message.type === 'assistant' ? 'text-[var(--text-primary)]' : ''}`}>
                        {message.content}
                      </p>

                      {/* Sources */}
                      {message.type === 'assistant' && message.sources && message.sources.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-[var(--card-border)]">
                          <button
                            onClick={() => toggleSources(message.id)}
                            className="flex items-center gap-2 text-sm text-[var(--accent-blue)] hover:underline"
                          >
                            <BookOpen className="h-4 w-4" />
                            {message.sources.length} source{message.sources.length > 1 ? 's' : ''} used
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${
                                expandedSources === message.id ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          {expandedSources === message.id && (
                            <div className="mt-3 space-y-2">
                              {message.sources.map((source, idx) => (
                                <div
                                  key={idx}
                                  className="p-3 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-sm"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-medium text-[var(--accent-blue)]">
                                      Chunk {idx + 1}
                                    </span>
                                    {source.similarity && (
                                      <span className="text-xs text-[var(--text-tertiary)]">
                                        {(source.similarity * 100).toFixed(1)}% match
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[var(--text-secondary)] line-clamp-4">
                                    {source.text}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <p className={`text-xs mt-2 ${message.type === 'user' ? 'text-white/70' : 'text-[var(--text-tertiary)]'}`}>
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-2">
                        <LoadingSpinner size="sm" />
                        <span className="text-[var(--text-secondary)]">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="flex gap-3">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question about your documents..."
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)]"
            />
            <Button
              type="submit"
              variant="primary"
              disabled={isLoading || !question.trim()}
              className="px-6"
            >
              {isLoading ? (
                <LoadingSpinner size="sm" />
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Ask
                </>
              )}
            </Button>
          </form>

          {/* Info Footer */}
          <p className="text-xs text-[var(--text-tertiary)] mt-3 text-center">
            Powered by RAG (Retrieval Augmented Generation) - Semantic search over your indexed documents
          </p>
        </>
      )}
    </div>
  );
}

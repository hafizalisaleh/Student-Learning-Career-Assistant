'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageLoader, LoadingSpinner } from '@/components/ui/loading-spinner';
import { CitedMarkdown } from '@/components/ui/cited-markdown';
import { MindMap, MindMapControls, MindMapRef } from '@/components/ui/mindmap';
import type { MindElixirData, NodeObj } from 'mind-elixir';
import {
  Network,
  RefreshCw,
  Sparkles,
  MessageSquare,
  PanelRightClose,
  X,
  ArrowUp,
  Square,
  Send,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { PromptInput, PromptInputTextarea, PromptInputActions, PromptInputAction } from "@/components/ui/prompt-input";

// ─── Types ───────────────────────────────────────────────────────────

interface GraphApiNode {
  id: string;
  label: string;
  type: 'document' | 'topic' | 'keyword' | 'note';
  group: string;
  size: number;
  metadata?: Record<string, any>;
}

interface GraphApiLink {
  source: string;
  target: string;
  type: string;
  strength: number;
  via?: string;
}

interface GraphApiData {
  nodes: GraphApiNode[];
  links: GraphApiLink[];
  stats: {
    documents: number;
    topics: number;
    keywords: number;
    notes: number;
    total_links: number;
  };
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{ text: string; metadata: Record<string, any>; similarity?: number }>;
  nodeLabel?: string;
  nodeType?: string;
}

// ─── Transform graph data → MindElixir tree ─────────────────────────

function graphToMindMap(data: GraphApiData): MindElixirData {
  const { nodes, links } = data;

  // Build adjacency: source → targets grouped by link type
  const childrenOf = new Map<string, Map<string, string[]>>();
  for (const link of links) {
    if (!childrenOf.has(link.source)) childrenOf.set(link.source, new Map());
    const byType = childrenOf.get(link.source)!;
    if (!byType.has(link.type)) byType.set(link.type, []);
    byType.get(link.type)!.push(link.target);
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build children for a node
  function buildChildren(nodeId: string, depth: number): NodeObj[] {
    if (depth > 3) return []; // prevent infinite recursion
    const linksByType = childrenOf.get(nodeId);
    if (!linksByType) return [];

    const children: NodeObj[] = [];

    // Process link types in order: topics first, notes, then keywords
    const typeOrder = ['has_topic', 'has_note', 'has_keyword'];
    for (const linkType of typeOrder) {
      const targetIds = linksByType.get(linkType);
      if (!targetIds) continue;

      for (const targetId of targetIds) {
        const targetNode = nodeMap.get(targetId);
        if (!targetNode) continue;

        const child: NodeObj = {
          id: targetNode.id,
          topic: targetNode.type === 'keyword' ? `#${targetNode.label}` : targetNode.label,
          children: buildChildren(targetId, depth + 1),
        };

        children.push(child);
      }
    }

    return children;
  }

  // Get document nodes
  const docNodes = nodes.filter((n) => n.type === 'document');

  if (docNodes.length === 0) {
    return {
      nodeData: {
        id: 'root',
        topic: 'Knowledge Graph',
        children: [],
      },
    };
  }

  if (docNodes.length === 1) {
    // Single document → it's the root
    const doc = docNodes[0];
    return {
      nodeData: {
        id: doc.id,
        topic: doc.label,
        children: buildChildren(doc.id, 0),
      },
    };
  }

  // Multiple documents → virtual root
  const rootChildren: NodeObj[] = docNodes.map((doc) => ({
    id: doc.id,
    topic: doc.label,
    children: buildChildren(doc.id, 0),
  }));

  return {
    nodeData: {
      id: 'root',
      topic: 'Knowledge Graph',
      children: rootChildren,
    },
  };
}

// ─── Find parent document for a node ─────────────────────────────────

function findParentDocId(nodeId: string, links: GraphApiLink[], nodes: GraphApiNode[]): string | undefined {
  // Find direct parent
  for (const link of links) {
    if (link.target === nodeId) {
      const parentNode = nodes.find((n) => n.id === link.source);
      if (parentNode?.type === 'document') {
        return parentNode.id.replace(/^doc-/, '');
      }
      // Recurse to find grandparent document
      const result = findParentDocId(link.source, links, nodes);
      if (result) return result;
    }
  }
  return undefined;
}

// ─── Main Component ──────────────────────────────────────────────────

export default function KnowledgeGraphPage() {
  const router = useRouter();
  const mindMapRef = useRef<MindMapRef>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [rawData, setRawData] = useState<GraphApiData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const chatPanelRef = useRef<HTMLDivElement>(null);

  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: chatInput,
    };

    setChatMessages((prev) => [...prev, userMsg]);
    const currentInput = chatInput;
    setChatInput('');
    setChatLoading(true);

    try {
      const response = await api.ragQuery(currentInput, undefined, 5, 'structured_output');

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.answer || 'No answer available.',
        sources: response.sources || [],
      };

      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (error: any) {
      console.error('AI query failed:', error);
      const isQuotaError = error?.message?.includes("quota") || error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED");

      if (isQuotaError) {
        toast.error("Gemini API limit reached. Please wait a moment.", { id: 'kg-quota-error' });
      }

      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: isQuotaError
          ? "API quota exceeded. Please wait a few seconds and try again."
          : 'Failed to get AI response. Please try again.',
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, setChatMessages, setChatInput, setChatLoading]);

  // ─── Fetch graph data ───────────────────────────────────────────────

  const fetchGraph = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api.getKnowledgeGraph();
      setRawData(data);
      setChatMessages([]);
      setChatOpen(false);
    } catch (error) {
      console.error('Failed to load knowledge graph:', error);
      toast.error('Failed to load knowledge graph');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // ─── Transform data to mindmap format ───────────────────────────────

  const mindMapData = useMemo(() => {
    if (!rawData || rawData.nodes.length === 0) return null;
    return graphToMindMap(rawData);
  }, [rawData]);

  // ─── Ask AI about a node ────────────────────────────────────────────

  const askAIAboutNode = useCallback(async (topic: string) => {
    if (!rawData) return;

    // Find the node and its parent document
    const node = rawData.nodes.find((n) => n.label === topic || `#${n.label}` === topic);
    const nodeType = node?.type || 'topic';
    const cleanTopic = topic.replace(/^#/, '');

    const docId = node ? findParentDocId(node.id, rawData.links, rawData.nodes) : undefined;

    // Build contextual prompt
    let prompt: string;
    if (nodeType === 'document') {
      prompt = `Summarize the key concepts and main topics from "${cleanTopic}". What are the most important takeaways?`;
    } else if (nodeType === 'topic') {
      prompt = `Explain what my documents say about "${cleanTopic}". Provide a detailed explanation with specific details from the sources.`;
    } else if (nodeType === 'keyword') {
      prompt = `What do my documents say about "${cleanTopic}"? Explain its significance and how it relates to the broader topics covered.`;
    } else {
      prompt = `Explain the concept of "${cleanTopic}" based on my documents.`;
    }

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
      nodeLabel: cleanTopic,
      nodeType,
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatOpen(true);
    setChatLoading(true);

    try {
      const response = await api.ragQuery(prompt, docId, 5, 'structured_output');

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.answer || 'No answer available.',
        sources: response.sources || [],
        nodeLabel: cleanTopic,
        nodeType,
      };

      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (error: any) {
      console.error('AI query failed:', error);
      const isQuotaError = error?.message?.includes("quota") || error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED");

      if (isQuotaError) {
        toast.error("Gemini API limit reached. Please wait a moment.", { id: 'kg-quota-error' });
      }

      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: isQuotaError
          ? "API quota exceeded. Please wait a few seconds and try again."
          : 'Failed to get AI response. Please try again.',
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }

    // Scroll chat to bottom
    setTimeout(() => {
      chatPanelRef.current?.scrollTo({ top: chatPanelRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, [rawData]);

  // ─── Handle node selection → Ask AI ─────────────────────────────────

  const handleNodeSelect = useCallback((nodes: any[]) => {
    if (nodes.length === 1) {
      const selectedNode = nodes[0];
      const topic = selectedNode.topic;
      if (topic && topic !== 'Knowledge Graph') {
        askAIAboutNode(topic);
      }
    }
  }, [askAIAboutNode]);

  // ─── Render ─────────────────────────────────────────────────────────

  if (isLoading) {
    return <PageLoader />;
  }

  const hasData = rawData && rawData.nodes.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Knowledge Graph
          </h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            {rawData?.stats
              ? `Based on ${rawData.stats.documents} document${rawData.stats.documents !== 1 ? 's' : ''}. Click any node to ask AI about it.`
              : 'Explore connections between your documents, topics, and notes.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchGraph}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* MindMap + Chat Split Container */}
      <div className="flex rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden h-[calc(100vh-200px)] min-h-[500px]">
        {/* MindMap area */}
        <div className={cn('relative transition-all duration-300', chatOpen ? 'flex-1 min-w-0' : 'w-full')}>
          <div className="h-[calc(100vh-240px)] min-h-[500px]">
            {hasData && mindMapData ? (
              <MindMap
                ref={mindMapRef}
                data={mindMapData}
                readonly
                direction={2}
                contextMenu={false}
                nodeMenu={false}
                keypress={false}
                fit
                onSelectNodes={handleNodeSelect}
                className="h-full"
              >
                <MindMapControls
                  position="bottom-left"
                  showExport
                  showZoom
                  showFit
                />
              </MindMap>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-[var(--accent-violet-subtle)] flex items-center justify-center mb-4">
                  <Network className="h-8 w-8 text-[var(--accent-violet)]" />
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                  No Graph Data
                </h3>
                <p className="text-sm text-[var(--text-secondary)] max-w-md">
                  Upload documents and generate notes to see your personal knowledge graph.
                  Topics and keywords are automatically extracted and linked.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Chat Panel */}
        <div
          className={cn(
            'border-l border-[var(--card-border)] bg-[var(--bg-primary)] transition-all duration-300 flex flex-col',
            chatOpen ? 'w-[380px] opacity-100' : 'w-0 opacity-0 border-l-0'
          )}
          onWheel={(e) => e.stopPropagation()}
        >
          {chatOpen && (
            <>
              {/* Chat header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)] shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[var(--primary)]" />
                  <span className="text-sm font-medium text-[var(--text-primary)]">AI Explorer</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setChatMessages([])}
                    className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    title="Clear chat"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setChatOpen(false)}
                    className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    title="Close panel"
                  >
                    <PanelRightClose className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Chat messages */}
              <div ref={chatPanelRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {chatMessages.length === 0 && !chatLoading && (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <MessageSquare className="h-8 w-8 text-[var(--text-muted)] mb-3" />
                    <p className="text-sm text-[var(--text-secondary)] font-medium mb-1">
                      Ask AI about your graph
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Click any node in the mind map to explore topics with AI-powered explanations grounded in your documents.
                    </p>
                  </div>
                )}

                {chatMessages.map((msg) => (
                  <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[95%] rounded-xl px-3 py-2',
                        msg.role === 'user'
                          ? 'bg-[var(--primary)] text-white rounded-br-sm'
                          : 'bg-[var(--bg-secondary)] border border-[var(--card-border)] rounded-bl-sm'
                      )}
                    >
                      {msg.role === 'user' ? (
                        <div>
                          {msg.nodeLabel && (
                            <div className="flex items-center gap-1.5 mb-1 opacity-80">
                              <Sparkles className="h-3 w-3" />
                              <span className="text-[10px] font-medium">{msg.nodeLabel}</span>
                            </div>
                          )}
                          <p className="text-xs leading-relaxed">{msg.content}</p>
                        </div>
                      ) : (
                        <div>
                          {msg.sources && msg.sources.length > 0 ? (
                            <CitedMarkdown
                              content={msg.content}
                              sources={msg.sources}
                              messageId={msg.id}
                            />
                          ) : (
                            <p className="text-xs leading-relaxed text-[var(--text-primary)]">{msg.content}</p>
                          )}
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-[var(--card-border)]">
                              <p className="text-[10px] text-[var(--text-muted)] mb-1.5">
                                {msg.sources.length} source{msg.sources.length !== 1 ? 's' : ''} cited
                              </p>
                              <div className="space-y-1.5">
                                {msg.sources.slice(0, 3).map((src, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-start gap-2 p-1.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--card-border)]"
                                  >
                                    <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--primary)] text-white text-[9px] flex items-center justify-center font-medium">
                                      {idx + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[10px] font-medium text-[var(--text-primary)] truncate">
                                        {src.metadata?.document_title || 'Source'}
                                      </p>
                                      <p className="text-[9px] text-[var(--text-muted)] line-clamp-2 mt-0.5">
                                        {src.text?.slice(0, 120)}...
                                      </p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--card-border)] rounded-xl rounded-bl-sm px-4 py-3">
                      <div className="flex items-center gap-2">
                        <LoadingSpinner size="sm" />
                        <span className="text-xs text-[var(--text-muted)]">Analyzing...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input Area */}
              <div className="px-3 pb-3 pt-1 bg-[var(--bg-primary)] border-t border-[var(--card-border)] shrink-0">
                <div className="flex bg-[var(--card-bg)] rounded-2xl border border-[var(--card-border)] p-1 shadow-sm mt-1">
                  <PromptInput
                    value={chatInput}
                    onValueChange={setChatInput}
                    onSubmit={handleSendChat}
                    isLoading={chatLoading}
                    className="flex-1 flex flex-row items-end border-none shadow-none p-0 bg-transparent"
                  >
                    <PromptInputTextarea
                      placeholder="Ask me anything about these topics..."
                      disabled={chatLoading}
                      className="min-h-[40px] max-h-40 px-3 py-2 bg-transparent border-none focus:ring-0 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] flex-1"
                    />
                    <PromptInputActions className="pb-1 pr-1">
                      <PromptInputAction tooltip={chatLoading ? "Stop generation" : "Send message"}>
                        <Button
                          type="button"
                          onClick={() => {
                            if (!chatLoading && chatInput.trim()) {
                              handleSendChat();
                            }
                          }}
                          variant="default"
                          size="icon"
                          className="h-8 w-8 rounded-full bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white"
                          disabled={!chatLoading && !chatInput.trim()}
                        >
                          {chatLoading ? (
                            <Square className="h-4 w-4 fill-current" />
                          ) : (
                            <ArrowUp className="h-5 w-5" />
                          )}
                        </Button>
                      </PromptInputAction>
                    </PromptInputActions>
                  </PromptInput>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

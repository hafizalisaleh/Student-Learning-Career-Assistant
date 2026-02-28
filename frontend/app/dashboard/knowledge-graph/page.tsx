'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/loading-spinner';
import {
  Network,
  RefreshCw,
  FileText,
  Tag,
  Hash,
  Search,
  X,
  ExternalLink,
  Lightbulb,
  GitBranch,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

// Register the layout extension
cytoscape.use(coseBilkent);

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

// ─── Node Colors & Config ────────────────────────────────────────────

const NODE_CONFIG: Record<
  string,
  { color: string; bg: string; border: string; shape: string; icon: any; label: string; width: number; height: number }
> = {
  document: {
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.6)',
    shape: 'round-rectangle',
    icon: FileText,
    label: 'Documents',
    width: 60,
    height: 40,
  },
  topic: {
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.12)',
    border: 'rgba(139, 92, 246, 0.6)',
    shape: 'diamond',
    icon: Tag,
    label: 'Topics',
    width: 45,
    height: 45,
  },
  keyword: {
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.6)',
    shape: 'ellipse',
    icon: Hash,
    label: 'Keywords',
    width: 40,
    height: 30,
  },
  note: {
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.6)',
    shape: 'round-rectangle',
    icon: Lightbulb,
    label: 'Notes',
    width: 50,
    height: 35,
  },
};

const EDGE_STYLES: Record<string, { color: string; style: 'solid' | 'dashed'; label: string }> = {
  has_topic: { color: '#8b5cf6', style: 'solid', label: 'topic' },
  has_keyword: { color: '#f59e0b', style: 'dashed', label: 'keyword' },
  has_note: { color: '#22c55e', style: 'solid', label: 'note' },
  shared_topic: { color: '#ec4899', style: 'dashed', label: 'shared' },
};

// ─── Cytoscape Stylesheet ───────────────────────────────────────────

function buildStylesheet(): cytoscape.StylesheetStyle[] {
  const nodeStyles: cytoscape.StylesheetStyle[] = Object.entries(NODE_CONFIG).map(([type, cfg]) => ({
    selector: `node[nodeType="${type}"]`,
    style: {
      'background-color': cfg.bg,
      'border-color': cfg.border,
      'border-width': 2,
      shape: cfg.shape as any,
      width: cfg.width,
      height: cfg.height,
      label: 'data(label)',
      'text-valign': 'bottom' as const,
      'text-halign': 'center' as const,
      'text-margin-y': 6,
      'font-size': type === 'keyword' ? 9 : 11,
      'font-weight': type === 'document' ? 600 : 400,
      'text-max-width': type === 'document' ? '120px' : '100px',
      'text-wrap': 'ellipsis' as const,
      color: cfg.color,
      'text-outline-color': '#ffffff',
      'text-outline-width': 2,
      'text-outline-opacity': 0.8,
      'overlay-opacity': 0,
      'transition-property': 'border-width, border-color, background-color',
      'transition-duration': 150,
    } as any,
  }));

  const hoverStyle: cytoscape.StylesheetStyle = {
    selector: 'node:active, node:grabbed',
    style: {
      'border-width': 3,
      'overlay-opacity': 0.08,
    } as any,
  };

  const selectedStyle: cytoscape.StylesheetStyle = {
    selector: 'node:selected',
    style: {
      'border-width': 3,
      'overlay-opacity': 0.12,
    } as any,
  };

  // Clickable nodes (document, note) get a pointer cursor
  const clickableStyle: cytoscape.StylesheetStyle = {
    selector: 'node[?clickable]',
    style: {
      cursor: 'pointer',
    } as any,
  };

  const edgeStyles: cytoscape.StylesheetStyle[] = Object.entries(EDGE_STYLES).map(([type, cfg]) => ({
    selector: `edge[edgeType="${type}"]`,
    style: {
      'line-color': cfg.color,
      'line-style': cfg.style,
      'target-arrow-color': cfg.color,
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.8,
      'curve-style': 'bezier' as const,
      width: 1.5,
      opacity: 0.5,
      'transition-property': 'opacity, width',
      'transition-duration': 150,
    } as any,
  }));

  const edgeHoverStyle: cytoscape.StylesheetStyle = {
    selector: 'edge:selected',
    style: {
      opacity: 0.9,
      width: 2.5,
    } as any,
  };

  // Highlight connected edges on node hover
  const highlightedEdge: cytoscape.StylesheetStyle = {
    selector: 'edge.highlighted',
    style: {
      opacity: 0.85,
      width: 2.5,
    } as any,
  };

  const fadedNode: cytoscape.StylesheetStyle = {
    selector: 'node.faded',
    style: {
      opacity: 0.15,
    } as any,
  };

  const fadedEdge: cytoscape.StylesheetStyle = {
    selector: 'edge.faded',
    style: {
      opacity: 0.08,
    } as any,
  };

  const highlightedNode: cytoscape.StylesheetStyle = {
    selector: 'node.highlighted',
    style: {
      'border-width': 3,
      opacity: 1,
    } as any,
  };

  return [
    // Base node style
    {
      selector: 'node',
      style: {
        'background-opacity': 1,
        'border-opacity': 1,
      } as any,
    },
    ...nodeStyles,
    hoverStyle,
    selectedStyle,
    clickableStyle,
    // Base edge style
    {
      selector: 'edge',
      style: {
        'curve-style': 'bezier',
        'target-arrow-shape': 'triangle',
        opacity: 0.4,
        width: 1.5,
      } as any,
    },
    ...edgeStyles,
    edgeHoverStyle,
    highlightedEdge,
    fadedNode,
    fadedEdge,
    highlightedNode,
  ];
}

// ─── Main Component ──────────────────────────────────────────────────

export default function KnowledgeGraphPage() {
  const router = useRouter();
  const cyRef = useRef<cytoscape.Core | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rawData, setRawData] = useState<GraphApiData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    new Set(['document', 'topic', 'keyword', 'note'])
  );
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [nodeCount, setNodeCount] = useState(0);

  // Fetch graph data
  const fetchGraph = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await api.getKnowledgeGraph();
      setRawData(data);
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

  // Build Cytoscape elements from API data
  const buildElements = useCallback(() => {
    if (!rawData) return [];

    let filteredNodes = rawData.nodes.filter((n) => visibleTypes.has(n.type));

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filteredNodes = filteredNodes.filter((n) => n.label.toLowerCase().includes(q));
    }

    const visibleIds = new Set(filteredNodes.map((n) => n.id));

    const cyNodes = filteredNodes.map((n) => ({
      data: {
        id: n.id,
        label: n.type === 'keyword' ? `#${n.label}` : n.label,
        nodeType: n.type,
        originalId: n.id.replace(/^(doc|note|topic|kw)-/, ''),
        clickable: n.type === 'document' || n.type === 'note',
        contentType: n.metadata?.content_type,
        topicCount: n.metadata?.topics?.length || 0,
        docCount: n.metadata?.doc_count || 0,
        noteType: n.metadata?.note_type,
      },
    }));

    const cyEdges = rawData.links
      .filter((l) => visibleIds.has(l.source) && visibleIds.has(l.target))
      .map((l, i) => ({
        data: {
          id: `e-${l.source}-${l.target}-${i}`,
          source: l.source,
          target: l.target,
          edgeType: l.type,
          strength: l.strength,
        },
      }));

    return [...cyNodes, ...cyEdges];
  }, [rawData, visibleTypes, searchQuery]);

  // Initialize / update Cytoscape
  useEffect(() => {
    if (!containerRef.current || !rawData) return;

    const elements = buildElements();
    setNodeCount(elements.filter((e) => !('source' in e.data)).length);

    if (elements.length === 0) {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      return;
    }

    // If cy already exists, update elements
    if (cyRef.current) {
      cyRef.current.elements().remove();
      cyRef.current.add(elements as any);
      cyRef.current.layout({
        name: 'cose-bilkent',
        animate: 'end' as any,
        animationDuration: 600,
        idealEdgeLength: 130,
        nodeRepulsion: 9000,
        gravity: 0.3,
        gravityRange: 2.0,
        numIter: 2500,
        tile: true,
        tilingPaddingVertical: 20,
        tilingPaddingHorizontal: 20,
        nodeDimensionsIncludeLabels: true,
        fit: true,
        padding: 40,
      } as any).run();
      return;
    }

    // Create new Cytoscape instance
    const cy = cytoscape({
      container: containerRef.current,
      elements: elements as any,
      style: buildStylesheet(),
      layout: {
        name: 'cose-bilkent',
        animate: 'end' as any,
        animationDuration: 800,
        idealEdgeLength: 130,
        nodeRepulsion: 9000,
        gravity: 0.3,
        gravityRange: 2.0,
        numIter: 2500,
        tile: true,
        tilingPaddingVertical: 20,
        tilingPaddingHorizontal: 20,
        nodeDimensionsIncludeLabels: true,
        fit: true,
        padding: 40,
      } as any,
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
      boxSelectionEnabled: false,
    });

    // Click handler — navigate to documents/notes
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const nodeType = node.data('nodeType');
      const originalId = node.data('originalId');

      if (nodeType === 'document' && originalId) {
        router.push(`/dashboard/documents/${originalId}`);
      } else if (nodeType === 'note' && originalId) {
        router.push(`/dashboard/notes/${originalId}`);
      }
    });

    // Hover — highlight connected nodes/edges
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      setHoveredNode(node.data('id'));

      const neighborhood = node.closedNeighborhood();
      cy.elements().addClass('faded');
      neighborhood.removeClass('faded');
      neighborhood.edges().addClass('highlighted');
      neighborhood.nodes().addClass('highlighted');
    });

    cy.on('mouseout', 'node', () => {
      setHoveredNode(null);
      cy.elements().removeClass('faded highlighted');
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [rawData, visibleTypes, searchQuery, buildElements, router]);

  // Zoom controls
  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.3);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() / 1.3);
  const handleFitView = () => cyRef.current?.fit(undefined, 40);

  const toggleType = (type: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

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
            Explore connections between your documents, topics, and notes.
            Click a document or note to open it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchGraph}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      {rawData?.stats && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-8 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--card-border)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Type toggles */}
          {(['document', 'topic', 'keyword', 'note'] as const).map((key) => {
            const cfg = NODE_CONFIG[key];
            const Icon = cfg.icon;
            const count =
              key === 'document'
                ? rawData.stats.documents
                : key === 'topic'
                ? rawData.stats.topics
                : key === 'keyword'
                ? rawData.stats.keywords
                : rawData.stats.notes;

            return (
              <button
                key={key}
                onClick={() => toggleType(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                  visibleTypes.has(key)
                    ? 'border-transparent text-white'
                    : 'border-[var(--card-border)] bg-[var(--bg-secondary)] text-[var(--text-muted)] opacity-50'
                )}
                style={
                  visibleTypes.has(key)
                    ? { backgroundColor: cfg.color }
                    : undefined
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {cfg.label}: {count}
              </button>
            );
          })}

          <span className="text-xs text-[var(--text-muted)] ml-auto flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {rawData.stats.total_links} connections
          </span>
        </div>
      )}

      {/* Graph Container */}
      <div className="relative rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] overflow-hidden">
        <div className="h-[calc(100vh-300px)] min-h-[500px]">
          {/* Cytoscape container — always mounted so the ref is available */}
          <div
            ref={containerRef}
            className="w-full h-full"
            style={{ display: hasData && nodeCount > 0 ? 'block' : 'none' }}
          />

          {/* Zoom controls */}
          {hasData && nodeCount > 0 && (
            <>
              <div className="absolute left-4 bottom-20 flex flex-col gap-1 p-1 rounded-xl bg-[var(--bg-primary)]/90 backdrop-blur-sm border border-[var(--card-border)] shadow-sm">
                <button
                  onClick={handleZoomIn}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors"
                  title="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  onClick={handleZoomOut}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors"
                  title="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <div className="w-full h-px bg-[var(--card-border)]" />
                <button
                  onClick={handleFitView}
                  className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors"
                  title="Fit to view"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
              </div>

              {/* Hovered node tooltip */}
              {hoveredNode && rawData && (
                <div className="absolute top-3 right-3 px-3 py-2 rounded-lg bg-[var(--bg-primary)]/95 backdrop-blur-sm border border-[var(--card-border)] shadow-sm max-w-[220px]">
                  {(() => {
                    const node = rawData.nodes.find((n) => n.id === hoveredNode);
                    if (!node) return null;
                    const cfg = NODE_CONFIG[node.type];
                    const Icon = cfg.icon;
                    return (
                      <div className="flex items-start gap-2">
                        <div
                          className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5"
                          style={{ backgroundColor: `${cfg.color}20` }}
                        >
                          <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                            {node.label}
                          </p>
                          <p className="text-[10px] text-[var(--text-muted)] capitalize">
                            {node.type}
                            {node.metadata?.content_type && ` · ${node.metadata.content_type}`}
                            {(node.metadata?.doc_count ?? 0) > 1 && ` · ${node.metadata?.doc_count} docs`}
                            {node.metadata?.note_type && ` · ${node.metadata.note_type}`}
                          </p>
                          {(node.type === 'document' || node.type === 'note') && (
                            <p className="text-[10px] text-[var(--primary)] mt-0.5 flex items-center gap-0.5">
                              <ExternalLink className="h-2.5 w-2.5" /> Click to open
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Legend */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2 rounded-xl bg-[var(--bg-primary)]/90 backdrop-blur-sm border border-[var(--card-border)] shadow-sm">
                {Object.entries(NODE_CONFIG).map(([type, cfg]) => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cfg.color }}
                    />
                    <span className="text-[11px] text-[var(--text-secondary)] capitalize">
                      {type}
                    </span>
                  </div>
                ))}
                <div className="w-px h-3 bg-[var(--card-border)]" />
                <span className="text-[11px] text-[var(--text-muted)]">
                  Hover to highlight · Click to open
                </span>
              </div>
            </>
          )}

          {/* Empty state overlay */}
          {(!hasData || nodeCount === 0) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-[var(--accent-violet-subtle)] flex items-center justify-center mb-4">
                <Network className="h-8 w-8 text-[var(--accent-violet)]" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                {searchQuery ? 'No Matching Nodes' : 'No Graph Data'}
              </h3>
              <p className="text-sm text-[var(--text-secondary)] max-w-md">
                {searchQuery
                  ? `No nodes match "${searchQuery}". Try a different search term.`
                  : 'Upload documents and generate notes to see your personal knowledge graph. Topics and keywords are automatically extracted and linked.'}
              </p>
              {searchQuery && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => setSearchQuery('')}
                >
                  Clear Search
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Source {
  text: string;
  metadata: Record<string, any>;
  similarity?: number;
}

interface GroundingSupport {
  segment: {
    start_index: number;
    end_index: number;
    text: string;
  };
  chunk_indices: number[];
}

interface GroundingMetadata {
  grounding_chunks: Array<{
    type: string;
    uri: string;
    title: string;
  }>;
  grounding_supports: GroundingSupport[];
  search_queries?: string[];
}

interface CitedMarkdownProps {
  content: string;
  sources: Source[];
  messageId: string;
  mode?: string;
  groundingMetadata?: GroundingMetadata;
  onCitationClick?: (sourceIndex: number) => void;
}

function processTextWithCitations(
  text: string,
  sources: Source[],
  messageId: string,
  onCitationClick?: (idx: number) => void
): React.ReactNode[] {
  // Handle both normal [N] citations and strikethrough [~~N~~] (failed NLI)
  const parts = text.split(/(\[(?:~~)?\d+(?:~~)?\])/g);
  return parts.map((part, i) => {
    // Normal citation
    const normalMatch = part.match(/^\[(\d+)\]$/);
    if (normalMatch) {
      const num = parseInt(normalMatch[1]);
      const sourceIdx = num - 1;
      const source = sources[sourceIdx];
      if (!source) return <span key={i}>{part}</span>;
      const page = source.metadata?.page_number || source.metadata?.page;
      return (
        <button
          key={i}
          onClick={() => onCitationClick?.(sourceIdx)}
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[9px] font-bold bg-[var(--primary-light)] text-[var(--primary)] rounded-full hover:bg-[var(--primary)] hover:text-white transition-colors cursor-pointer align-super mx-0.5 leading-none"
          title={`Source ${num}${page ? ` — Page ${page}` : ''}`}
        >
          {num}
        </button>
      );
    }

    // Failed NLI citation (strikethrough)
    const failedMatch = part.match(/^\[~~(\d+)~~\]$/);
    if (failedMatch) {
      const num = parseInt(failedMatch[1]);
      return (
        <span
          key={i}
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[9px] font-bold bg-[var(--danger-bg)] text-[var(--danger)] rounded-full line-through align-super mx-0.5 leading-none opacity-60"
          title={`Source ${num} — Failed verification`}
        >
          {num}
        </span>
      );
    }

    return <span key={i}>{part}</span>;
  });
}

function processChildren(
  children: React.ReactNode,
  sources: Source[],
  messageId: string,
  onCitationClick?: (idx: number) => void
): React.ReactNode {
  return React.Children.map(children, child => {
    if (typeof child === 'string') {
      return processTextWithCitations(child, sources, messageId, onCitationClick);
    }
    return child;
  });
}

export function CitedMarkdown({ content, sources, messageId, mode, groundingMetadata, onCitationClick }: CitedMarkdownProps) {
  const makeProcessor = (children: React.ReactNode) =>
    processChildren(children, sources, messageId, onCitationClick);

  return (
    <div className="prose prose-sm max-w-none text-[var(--text-primary)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, children, ...props }) => (
            <p className="mb-2 last:mb-0 text-sm leading-relaxed text-[var(--text-primary)]" {...props}>
              {makeProcessor(children)}
            </p>
          ),
          li: ({ node, children, ...props }) => (
            <li className="ml-2 text-sm" {...props}>
              {makeProcessor(children)}
            </li>
          ),
          strong: ({ node, ...props }) => <strong className="font-semibold text-[var(--text-primary)]" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-2 space-y-1 text-sm text-[var(--text-primary)]" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-2 space-y-1 text-sm text-[var(--text-primary)]" {...props} />,
          code: ({ node, inline, ...props }: any) =>
            inline
              ? <code className="bg-[var(--bg-elevated)] px-1 py-0.5 rounded text-xs font-mono" {...props} />
              : <code className="block bg-[var(--bg-elevated)] p-3 rounded-lg text-xs font-mono my-2 overflow-x-auto" {...props} />,
          blockquote: ({ node, ...props }) => <blockquote className="border-l-3 border-[var(--primary)] pl-3 italic text-sm text-[var(--text-secondary)] my-2" {...props} />,
          h1: ({ node, ...props }) => <h1 className="text-base font-bold mt-3 mb-1 text-[var(--text-primary)]" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-sm font-bold mt-2 mb-1 text-[var(--text-primary)]" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-sm font-semibold mt-2 mb-1 text-[var(--text-primary)]" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>

      {/* Grounding supports visualization for File Search mode */}
      {mode === 'file_search' && groundingMetadata?.grounding_supports && groundingMetadata.grounding_supports.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--card-border)]">
          <p className="text-[10px] text-[var(--text-muted)] mb-1 flex items-center gap-1">
            <Globe className="h-2.5 w-2.5" />
            Grounding: {groundingMetadata.grounding_supports.length} segment{groundingMetadata.grounding_supports.length > 1 ? 's' : ''} mapped to sources
          </p>
        </div>
      )}
    </div>
  );
}

interface SourceCardProps {
  source: Source;
  index: number;
  messageId: string;
}

export function SourceCard({ source, index, messageId }: SourceCardProps) {
  const meta = source.metadata || {};
  const page = meta.page_number || meta.page;
  const docName = meta.document_title || meta.title;
  const uri = meta.uri;
  const isWebSource = meta.type === 'web' || meta.type === 'retrieved';

  return (
    <div
      id={`source-${messageId}-${index}`}
      className="p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--card-border)] transition-all"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-[var(--primary)] flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-5 h-5 text-[9px] font-bold bg-[var(--primary)] text-white rounded-full">
            {index + 1}
          </span>
          {isWebSource ? (
            <Globe className="h-3 w-3" />
          ) : (
            <FileText className="h-3 w-3" />
          )}
          {docName && <span className="truncate max-w-[200px]">{docName}</span>}
          {page && <span>- Page {page}</span>}
        </span>
        {source.similarity != null && (
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
            source.similarity > 0.8
              ? 'bg-[var(--success-bg)] text-[var(--success)]'
              : source.similarity > 0.6
                ? 'bg-[var(--warning-bg)] text-[var(--warning)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
          )}>
            {Math.round(source.similarity * 100)}% match
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">
        {source.text}
      </p>
      {uri && (
        <a
          href={uri}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-[var(--primary)] hover:underline mt-1 inline-block truncate max-w-full"
        >
          {uri}
        </a>
      )}
    </div>
  );
}

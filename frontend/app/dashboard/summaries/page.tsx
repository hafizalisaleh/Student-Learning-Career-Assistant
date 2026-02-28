'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Plus, Search, Brain, Trash2, Calendar, Eye, EyeOff, ChevronDown } from 'lucide-react';
import type { Summary } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';

export default function SummariesPage() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'short' | 'medium' | 'detailed'>('all');
  const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchSummaries();
  }, []);

  async function fetchSummaries() {
    try {
      setIsLoading(true);
      const data = await api.getSummaries();
      setSummaries(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load summaries:', error);
      toast.error('Failed to load summaries');
      setSummaries([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this summary?')) return;

    try {
      console.log('Deleting summary with ID:', id);
      await api.deleteSummary(id);
      toast.success('Summary deleted successfully');
      setSummaries(summaries.filter((summary) => summary.id !== id));
    } catch (error: any) {
      console.error('Delete error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to delete summary';
      toast.error(errorMessage);
    }
  }

  function toggleExpanded(id: string) {
    const newExpanded = new Set(expandedSummaries);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSummaries(newExpanded);
  }

  const filteredSummaries = summaries.filter((summary) => {
    const searchText = (summary.summary_text || '').toLowerCase();
    const matchesSearch = searchText.includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || summary.summary_length === filterType;
    return matchesSearch && matchesType;
  });

  const getSummaryTypeLabel = (type: string) => {
    const labels = {
      short: 'Bullet Points',
      medium: 'Medium',
      detailed: 'Detailed',
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getSummaryTypeBadgeVariant = (type: string): 'info' | 'success' | 'summaries' | 'default' => {
    const variants: Record<string, 'info' | 'success' | 'summaries' | 'default'> = {
      short: 'info',
      medium: 'success',
      detailed: 'summaries',
    };
    return variants[type] || 'default';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Summaries</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">AI-generated content summaries</p>
        </div>
        <Link href="/dashboard/summaries/new">
          <Button variant="default">
            <Plus className="h-4 w-4 mr-2" />
            Generate Summary
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[var(--text-muted)]" />
          <Input
            type="text"
            placeholder="Search summaries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
        >
          <option value="all">All Types</option>
          <option value="short">Bullet Points</option>
          <option value="medium">Medium</option>
          <option value="detailed">Detailed</option>
        </Select>
      </div>

      {/* Summaries List */}
      {filteredSummaries.length === 0 ? (
        <EmptyState
          icon={Brain}
          title={searchQuery || filterType !== 'all' ? 'No summaries found' : 'No summaries yet'}
          description={searchQuery || filterType !== 'all' ? 'Try adjusting your filters' : 'Generate your first summary to get started'}
          action={
            !searchQuery && filterType === 'all' ? (
              <Link href="/dashboard/summaries/new">
                <Button variant="default">
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Summary
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredSummaries.map((summary) => {
            const isExpanded = expandedSummaries.has(summary.id);
            const previewText = summary.summary_text?.substring(0, 200) || '';
            const hasMore = (summary.summary_text?.length || 0) > 200;

            return (
              <Card key={summary.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={getSummaryTypeBadgeVariant(summary.summary_length)}>
                          {getSummaryTypeLabel(summary.summary_length)}
                        </Badge>
                        <span className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                          <Calendar className="h-3 w-3" />
                          {formatDate(summary.generated_at)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(summary.id)}
                      >
                        {isExpanded ? (
                          <>
                            <EyeOff className="h-4 w-4 mr-1" />
                            Collapse
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4 mr-1" />
                            View Full
                          </>
                        )}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(summary.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-[var(--bg-secondary)] rounded-lg p-4 border border-[var(--card-border)]">
                    {isExpanded ? (
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown
                          className="text-[var(--text-primary)]"
                          components={{
                            h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-[var(--text-primary)] mt-4 mb-2" {...props} />,
                            h2: ({ node, ...props }) => <h2 className="text-lg font-bold text-[var(--text-primary)] mt-3 mb-2" {...props} />,
                            h3: ({ node, ...props }) => <h3 className="text-base font-semibold text-[var(--text-primary)] mt-2 mb-1" {...props} />,
                            p: ({ node, ...props }) => <p className="text-[var(--text-secondary)] mb-2 leading-relaxed" {...props} />,
                            ul: ({ node, ...props }) => <ul className="list-disc list-inside space-y-1 mb-3 text-[var(--text-secondary)]" {...props} />,
                            ol: ({ node, ...props }) => <ol className="list-decimal list-inside space-y-1 mb-3 text-[var(--text-secondary)]" {...props} />,
                            li: ({ node, ...props }) => <li className="ml-2 text-[var(--text-secondary)]" {...props} />,
                            strong: ({ node, ...props }) => <strong className="font-semibold text-[var(--text-primary)]" {...props} />,
                            em: ({ node, ...props }) => <em className="italic text-[var(--text-secondary)]" {...props} />,
                            code: ({ node, ...props }) => <code className="bg-[var(--bg-tertiary)] px-1 py-0.5 rounded text-sm font-mono text-[var(--text-primary)]" {...props} />,
                            blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-[var(--primary)] pl-4 italic text-[var(--text-tertiary)] my-2" {...props} />,
                          }}
                        >
                          {summary.summary_text || 'No content'}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div>
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            className="text-[var(--text-secondary)]"
                            components={{
                              p: ({ node, ...props }) => <p className="text-[var(--text-secondary)] leading-relaxed" {...props} />,
                              strong: ({ node, ...props }) => <strong className="font-semibold text-[var(--text-primary)]" {...props} />,
                            }}
                          >
                            {previewText + (hasMore ? '...' : '')}
                          </ReactMarkdown>
                        </div>
                        {hasMore && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(summary.id)}
                            className="mt-2"
                          >
                            Show more
                            <ChevronDown className="h-4 w-4 ml-1" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

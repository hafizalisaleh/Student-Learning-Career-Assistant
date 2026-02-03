'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Plus, Search, Brain, Trash2, FileText, Calendar, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
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
      // Ensure data is an array
      setSummaries(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load summaries:', error);
      toast.error('Failed to load summaries');
      setSummaries([]); // Set empty array on error
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

  const getSummaryTypeBadge = (type: string) => {
    const badges = {
      short: 'bg-blue-100 text-blue-800',
      medium: 'bg-green-100 text-green-800',
      detailed: 'bg-purple-100 text-purple-800',
    };
    return badges[type as keyof typeof badges] || 'bg-gray-100 text-gray-800';
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
          <h1 className="text-3xl font-bold text-gray-900">Summaries</h1>
          <p className="text-gray-600 mt-1">AI-generated content summaries</p>
        </div>
        <Link href="/dashboard/summaries/new">
          <Button variant="primary">
            <Plus className="h-4 w-4 mr-2" />
            Generate Summary
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <Input
            type="text"
            placeholder="Search summaries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Types</option>
          <option value="short">Bullet Points</option>
          <option value="medium">Medium</option>
          <option value="detailed">Detailed</option>
        </select>
      </div>

      {/* Summaries List */}
      {filteredSummaries.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchQuery || filterType !== 'all' ? 'No summaries found' : 'No summaries yet'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchQuery || filterType !== 'all'
                ? 'Try adjusting your filters'
                : 'Generate your first summary to get started'}
            </p>
            {!searchQuery && filterType === 'all' && (
              <Link href="/dashboard/summaries/new">
                <Button variant="primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Summary
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
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
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${getSummaryTypeBadge(
                            summary.summary_length
                          )}`}
                        >
                          {getSummaryTypeLabel(summary.summary_length)}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-500">
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
                        className="text-blue-600 hover:bg-blue-50"
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
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(summary.id)}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    {isExpanded ? (
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown
                          className="text-gray-800"
                          components={{
                            h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-gray-900 mt-4 mb-2" {...props} />,
                            h2: ({ node, ...props }) => <h2 className="text-lg font-bold text-gray-900 mt-3 mb-2" {...props} />,
                            h3: ({ node, ...props }) => <h3 className="text-base font-semibold text-gray-900 mt-2 mb-1" {...props} />,
                            p: ({ node, ...props }) => <p className="text-gray-700 mb-2 leading-relaxed" {...props} />,
                            ul: ({ node, ...props }) => <ul className="list-disc list-inside space-y-1 mb-3 text-gray-700" {...props} />,
                            ol: ({ node, ...props }) => <ol className="list-decimal list-inside space-y-1 mb-3 text-gray-700" {...props} />,
                            li: ({ node, ...props }) => <li className="ml-2 text-gray-700" {...props} />,
                            strong: ({ node, ...props }) => <strong className="font-semibold text-gray-900" {...props} />,
                            em: ({ node, ...props }) => <em className="italic text-gray-700" {...props} />,
                            code: ({ node, ...props }) => <code className="bg-gray-200 px-1 py-0.5 rounded text-sm font-mono text-gray-800" {...props} />,
                            blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-600 my-2" {...props} />,
                          }}
                        >
                          {summary.summary_text || 'No content'}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div>
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            className="text-gray-700"
                            components={{
                              p: ({ node, ...props }) => <p className="text-gray-700 leading-relaxed" {...props} />,
                              strong: ({ node, ...props }) => <strong className="font-semibold text-gray-900" {...props} />,
                            }}
                          >
                            {previewText + (hasMore ? '...' : '')}
                          </ReactMarkdown>
                        </div>
                        {hasMore && (
                          <button
                            onClick={() => toggleExpanded(summary.id)}
                            className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-1"
                          >
                            Show more
                            <ChevronDown className="h-4 w-4" />
                          </button>
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

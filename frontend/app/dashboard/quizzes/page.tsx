'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Plus, Search, ClipboardCheck, Play, BarChart3, Calendar } from 'lucide-react';
import type { Quiz, QuizAnalytics } from '@/lib/types';
import { formatDate, getDifficultyBadgeClass } from '@/lib/utils';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [analytics, setAnalytics] = useState<QuizAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setIsLoading(true);
      const [quizzesData, analyticsData] = await Promise.all([
        api.getQuizzes(),
        api.getQuizAnalytics(),
      ]);
      setQuizzes(Array.isArray(quizzesData) ? quizzesData : []);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Failed to load quizzes:', error);
      toast.error('Failed to load quizzes');
      setQuizzes([]);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredQuizzes = quizzes.filter(
    (quiz) =>
      quiz.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Quizzes</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">Test your knowledge with AI-generated quizzes</p>
        </div>
        <Link href="/dashboard/quizzes/new">
          <Button variant="primary">
            <Plus className="h-4 w-4 mr-2" />
            Generate Quiz
          </Button>
        </Link>
      </div>

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">Total Quizzes</p>
                <p className="stat-value">{analytics.total_quizzes}</p>
              </div>
              <div className="icon-wrapper icon-documents">
                <ClipboardCheck className="h-4 w-4" />
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">Total Attempts</p>
                <p className="stat-value">{analytics.total_attempts}</p>
              </div>
              <div className="icon-wrapper icon-notes">
                <Play className="h-4 w-4" />
              </div>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">Average Score</p>
                <p className="stat-value">{analytics.average_score.toFixed(1)}%</p>
              </div>
              <div className="icon-wrapper icon-summaries">
                <BarChart3 className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[var(--text-muted)]" />
        <Input
          type="text"
          placeholder="Search quizzes by title or topic..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Quizzes Grid */}
      {filteredQuizzes.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={searchQuery ? 'No quizzes found' : 'No quizzes yet'}
          description={searchQuery ? 'Try a different search term' : 'Generate your first quiz to test your knowledge'}
          action={
            !searchQuery ? (
              <Link href="/dashboard/quizzes/new">
                <Button variant="primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Quiz
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredQuizzes.map((quiz) => (
            <Card key={quiz.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <CardTitle className="text-lg">{quiz.title}</CardTitle>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getDifficultyBadgeClass((quiz as any).difficulty || quiz.difficulty_level || 'medium')}`}>
                    {(quiz as any).difficulty || quiz.difficulty_level || 'Medium'}
                  </span>
                </div>
                <CardDescription className="flex items-center gap-2">
                  <Calendar className="h-3 w-3" />
                  {formatDate(quiz.created_at)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Topic:</span>
                    <span className="font-medium text-[var(--text-primary)]">{(quiz as any).topic || quiz.title || 'General'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Questions:</span>
                    <span className="font-medium text-[var(--text-primary)]">{quiz.questions?.length || 0}</span>
                  </div>
                  <Link href={`/dashboard/quizzes/${quiz.id}`} className="block pt-2">
                    <Button variant="primary" size="sm" className="w-full">
                      <Play className="h-4 w-4 mr-2" />
                      Take Quiz
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Topics Performance */}
      {analytics && (analytics as any).topics && (analytics as any).topics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Performance by Topic</CardTitle>
            <CardDescription>Your quiz scores across different topics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(analytics as any).topics.map((topic: any) => (
                <div key={topic.topic}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-[var(--text-secondary)]">{topic.topic}</span>
                    <span className="text-sm text-[var(--text-tertiary)]">
                      {topic.average_score.toFixed(1)}% ({topic.count} {topic.count === 1 ? 'quiz' : 'quizzes'})
                    </span>
                  </div>
                  <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-2">
                    <div
                      className="bg-[var(--primary)] h-2 rounded-full transition-all"
                      style={{ width: `${topic.average_score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

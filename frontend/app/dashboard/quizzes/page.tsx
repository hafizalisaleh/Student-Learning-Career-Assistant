'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      // Ensure quizzesData is an array
      setQuizzes(Array.isArray(quizzesData) ? quizzesData : []);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error('Failed to load quizzes:', error);
      toast.error('Failed to load quizzes');
      setQuizzes([]); // Set empty array on error
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
          <h1 className="text-3xl font-bold text-gray-900">Quizzes</h1>
          <p className="text-gray-600 mt-1">Test your knowledge with AI-generated quizzes</p>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Quizzes</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.total_quizzes}</p>
                </div>
                <ClipboardCheck className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Attempts</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{analytics.total_attempts}</p>
                </div>
                <Play className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Average Score</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    {analytics.average_score.toFixed(1)}%
                  </p>
                </div>
                <BarChart3 className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
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
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {searchQuery ? 'No quizzes found' : 'No quizzes yet'}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchQuery
                ? 'Try a different search term'
                : 'Generate your first quiz to test your knowledge'}
            </p>
            {!searchQuery && (
              <Link href="/dashboard/quizzes/new">
                <Button variant="primary">
                  <Plus className="h-4 w-4 mr-2" />
                  Generate Quiz
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredQuizzes.map((quiz) => (
            <Card key={quiz.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <CardTitle className="text-lg">{quiz.title}</CardTitle>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getDifficultyBadgeClass(quiz.difficulty || quiz.difficulty_level || 'medium')}`}>
                    {quiz.difficulty || quiz.difficulty_level || 'Medium'}
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
                    <span className="text-gray-600">Topic:</span>
                    <span className="font-medium">{quiz.topic || quiz.title || 'General'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Questions:</span>
                    <span className="font-medium">{quiz.questions?.length || 0}</span>
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
      {analytics && analytics.topics && analytics.topics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Performance by Topic</CardTitle>
            <CardDescription>Your quiz scores across different topics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.topics.map((topic) => (
                <div key={topic.topic}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">{topic.topic}</span>
                    <span className="text-sm text-gray-600">
                      {topic.average_score.toFixed(1)}% ({topic.count} {topic.count === 1 ? 'quiz' : 'quizzes'})
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
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

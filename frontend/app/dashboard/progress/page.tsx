'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import toast from 'react-hot-toast';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  TrendingUp, TrendingDown, Award, Clock, BookOpen, FileText,
  Brain, Calendar, Activity, Zap, Target, Flame, Sparkles,
  Trophy, Lightbulb, Rocket, AlertTriangle, Book, GraduationCap,
  BarChart3, PieChart as PieChartIcon, RefreshCw, ArrowUp, ArrowDown, Minus
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TopicPerformance {
  topic: string;
  avg_score: number;
  attempts: number;
  last_attempt: string;
  trend: 'improving' | 'declining' | 'stable';
}

interface ActivitySummary {
  date: string;
  documents: number;
  notes: number;
  quizzes: number;
  study_time: number;
}

interface DetailedAnalytics {
  total_documents: number;
  total_notes: number;
  total_summaries: number;
  total_quizzes: number;
  total_quiz_attempts: number;
  average_quiz_score: number;
  total_study_time: number;
  documents_by_type: Record<string, number>;
  quiz_performance_by_topic: TopicPerformance[];
  recent_activity: ActivitySummary[];
  study_streak: number;
  improvement_rate: number;
  best_score: number;
  consistency_score: number;
  learning_velocity: number;
}

interface AIInsight {
  category: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  recommendation: string;
  icon: string;
}

const iconMap: Record<string, any> = {
  flame: Flame,
  sparkles: Sparkles,
  target: Target,
  trophy: Trophy,
  'trending-up': TrendingUp,
  lightbulb: Lightbulb,
  rocket: Rocket,
  alert: AlertTriangle,
  muscle: Award,
  book: Book,
  pen: FileText,
  clipboard: BookOpen,
  graduation: GraduationCap,
  brain: Brain,
};

export default function ProgressPage() {
  const [analytics, setAnalytics] = useState<DetailedAnalytics | null>(null);
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const [analyticsData, insightsData] = await Promise.all([
        api.getDetailedAnalytics(),
        api.getAIInsights()
      ]);
      
      setAnalytics(analyticsData);
      setInsights(insightsData);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadAnalytics();
    setRefreshing(false);
    toast.success('Analytics refreshed!');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Brain className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Data Yet</h2>
          <p className="text-gray-600">Start your learning journey to see your progress!</p>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const documentTypeData = Object.entries(analytics.documents_by_type).map(([type, count]) => ({
    name: type.toUpperCase(),
    value: count
  }));

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const activityData = analytics.recent_activity.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Documents: item.documents,
    Notes: item.notes,
    Quizzes: item.quizzes,
    'Study Time': item.study_time
  }));

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100 border-green-200';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100 border-yellow-200';
    return 'text-red-600 bg-red-100 border-red-200';
  };

  const getScoreGradient = (score: number) => {
    if (score >= 80) return 'from-green-50 to-emerald-50';
    if (score >= 60) return 'from-yellow-50 to-amber-50';
    return 'from-red-50 to-orange-50';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <ArrowUp className="w-4 h-4 text-green-600" />;
      case 'declining':
        return <ArrowDown className="w-4 h-4 text-red-600" />;
      default:
        return <Minus className="w-4 h-4 text-gray-600" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-l-red-500 bg-red-50';
      case 'medium':
        return 'border-l-yellow-500 bg-yellow-50';
      default:
        return 'border-l-blue-500 bg-blue-50';
    }
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            Your Learning Journey
          </h1>
          <p className="text-gray-600 mt-2">Track your progress, celebrate achievements, and grow smarter every day</p>
        </div>
        <Button 
          onClick={refreshData} 
          disabled={refreshing}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Study Streak */}
        <Card className="relative overflow-hidden border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-red-50 hover:shadow-lg transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-800 mb-1">Study Streak</p>
                <p className="text-4xl font-bold text-orange-600">{analytics.study_streak}</p>
                <p className="text-xs text-orange-700 mt-1">days in a row 🔥</p>
              </div>
              <div className="p-4 bg-orange-200 rounded-full">
                <Flame className="w-8 h-8 text-orange-600" />
              </div>
            </div>
            {analytics.study_streak >= 7 && (
              <div className="mt-4 text-xs font-semibold text-orange-800 bg-orange-200 rounded-full px-3 py-1 inline-block">
                ⭐ Outstanding!
              </div>
            )}
          </CardContent>
        </Card>

        {/* Average Quiz Score */}
        <Card className={`relative overflow-hidden border-2 bg-gradient-to-br ${getScoreGradient(analytics.average_quiz_score)} hover:shadow-lg transition-all`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Avg Quiz Score</p>
                <p className="text-4xl font-bold">{analytics.average_quiz_score.toFixed(1)}%</p>
                <p className="text-xs text-gray-600 mt-1">across all quizzes</p>
              </div>
              <div className={`p-4 rounded-full ${getScoreColor(analytics.average_quiz_score)}`}>
                <Award className="w-8 h-8" />
              </div>
            </div>
            {analytics.improvement_rate > 0 && (
              <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-green-700">
                <TrendingUp className="w-4 h-4" />
                +{analytics.improvement_rate.toFixed(1)}% improvement
              </div>
            )}
          </CardContent>
        </Card>

        {/* Total Content */}
        <Card className="relative overflow-hidden border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 hover:shadow-lg transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800 mb-1">Content Created</p>
                <p className="text-4xl font-bold text-blue-600">
                  {analytics.total_notes + analytics.total_summaries}
                </p>
                <p className="text-xs text-blue-700 mt-1">notes & summaries</p>
              </div>
              <div className="p-4 bg-blue-200 rounded-full">
                <BookOpen className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Study Time */}
        <Card className="relative overflow-hidden border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 hover:shadow-lg transition-all">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-800 mb-1">Study Time</p>
                <p className="text-4xl font-bold text-purple-600">
                  {Math.round(analytics.total_study_time / 60)}
                </p>
                <p className="text-xs text-purple-700 mt-1">hours invested</p>
              </div>
              <div className="p-4 bg-purple-200 rounded-full">
                <Clock className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 hover:shadow-md transition-all border-l-4 border-l-blue-500">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{analytics.total_documents}</p>
              <p className="text-xs text-gray-600">Documents Uploaded</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-all border-l-4 border-l-green-500">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{analytics.total_quiz_attempts}</p>
              <p className="text-xs text-gray-600">Quizzes Attempted</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-all border-l-4 border-l-purple-500">
          <div className="flex items-center gap-3">
            <Target className="w-5 h-5 text-purple-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{analytics.consistency_score.toFixed(0)}%</p>
              <p className="text-xs text-gray-600">Consistency Score</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 hover:shadow-md transition-all border-l-4 border-l-pink-500">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-pink-600" />
            <div>
              <p className="text-2xl font-bold text-gray-900">{analytics.learning_velocity.toFixed(1)}</p>
              <p className="text-xs text-gray-600">Content per Week</p>
            </div>
          </div>
        </Card>
      </div>

      {/* AI Insights Section */}
      {insights.length > 0 && (
        <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  AI-Powered Insights
                </CardTitle>
                <p className="text-sm text-gray-600 mt-1">Personalized recommendations to accelerate your learning</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.map((insight, index) => {
                const Icon = iconMap[insight.icon] || Sparkles;
                return (
                  <Card 
                    key={index}
                    className={`border-l-4 ${getPriorityColor(insight.priority)} hover:shadow-md transition-all`}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm">
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 mb-1">{insight.category}</h3>
                          <p className="text-sm text-gray-700 mb-3">{insight.message}</p>
                          <div className="bg-white rounded-lg p-3 border border-gray-200">
                            <p className="text-xs font-semibold text-gray-500 mb-1">💡 RECOMMENDATION</p>
                            <p className="text-sm text-gray-800">{insight.recommendation}</p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Timeline */}
        <Card className="border-2 border-blue-100">
          <CardHeader>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <CardTitle>Recent Activity</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={activityData}>
                <defs>
                  <linearGradient id="colorDocs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorNotes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="colorQuizzes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Legend />
                <Area type="monotone" dataKey="Documents" stroke="#3b82f6" fillOpacity={1} fill="url(#colorDocs)" />
                <Area type="monotone" dataKey="Notes" stroke="#10b981" fillOpacity={1} fill="url(#colorNotes)" />
                <Area type="monotone" dataKey="Quizzes" stroke="#f59e0b" fillOpacity={1} fill="url(#colorQuizzes)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Document Types Distribution */}
        {documentTypeData.length > 0 && (
          <Card className="border-2 border-green-100">
            <CardHeader>
              <div className="flex items-center gap-2">
                <PieChartIcon className="w-5 h-5 text-green-600" />
                <CardTitle>Documents by Type</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={documentTypeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {documentTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Topic Performance */}
      {analytics.quiz_performance_by_topic.length > 0 && (
        <Card className="border-2 border-purple-100">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-purple-600" />
              <div>
                <CardTitle>Performance by Topic</CardTitle>
                <p className="text-sm text-gray-600 mt-1">Your strengths and areas for improvement</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.quiz_performance_by_topic.slice(0, 10).map((topic, index) => (
                <div key={index} className="group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                        {topic.topic}
                      </span>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(topic.trend)}
                        <span className="text-xs text-gray-500 capitalize">{topic.trend}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gray-500">
                        {topic.attempts} attempt{topic.attempts !== 1 ? 's' : ''}
                      </span>
                      <span className={`font-bold text-lg w-16 text-right ${
                        topic.avg_score >= 80 ? 'text-green-600' :
                        topic.avg_score >= 60 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {topic.avg_score.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        topic.avg_score >= 80
                          ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                          : topic.avg_score >= 60
                          ? 'bg-gradient-to-r from-yellow-500 to-amber-500'
                          : 'bg-gradient-to-r from-red-500 to-orange-500'
                      }`}
                      style={{ width: `${topic.avg_score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {analytics.quiz_performance_by_topic.length > 10 && (
              <div className="mt-6 text-center">
                <Button variant="outline" className="text-sm">
                  View All Topics ({analytics.quiz_performance_by_topic.length})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Performance Summary Bar Chart */}
      {analytics.quiz_performance_by_topic.length > 0 && (
        <Card className="border-2 border-blue-100">
          <CardHeader>
            <CardTitle>Topic Performance Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={analytics.quiz_performance_by_topic.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis 
                  dataKey="topic" 
                  angle={-45} 
                  textAnchor="end" 
                  height={150}
                  stroke="#6b7280"
                  fontSize={11}
                />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                />
                <Bar dataKey="avg_score" fill="#3b82f6" name="Average Score %" radius={[8, 8, 0, 0]}>
                  {analytics.quiz_performance_by_topic.slice(0, 10).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={
                      entry.avg_score >= 80 ? '#10b981' :
                      entry.avg_score >= 60 ? '#f59e0b' : '#ef4444'
                    } />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Best Score Achievement */}
      {analytics.best_score > 0 && (
        <Card className="border-2 border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-yellow-400 rounded-full">
                  <Trophy className="w-8 h-8 text-yellow-900" />
                </div>
                <div>
                  <p className="text-sm font-medium text-yellow-800 mb-1">Your Best Performance</p>
                  <p className="text-4xl font-bold text-yellow-600">{analytics.best_score.toFixed(0)}%</p>
                  <p className="text-sm text-yellow-700 mt-1">Keep pushing to beat your personal record!</p>
                </div>
              </div>
              {analytics.best_score >= 90 && (
                <div className="text-right">
                  <div className="text-6xl">🏆</div>
                  <p className="text-xs font-bold text-yellow-800 mt-2">TOP PERFORMER</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

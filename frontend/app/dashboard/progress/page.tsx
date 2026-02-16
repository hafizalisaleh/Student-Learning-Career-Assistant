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
  Brain, Activity, Target, Flame,
  Trophy, RefreshCw, ArrowUp, ArrowDown, Minus
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
        api.getProgress(),
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
    toast.success('Analytics refreshed');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-14 h-14 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center mx-auto mb-3">
            <Brain className="w-7 h-7 text-[var(--text-muted)]" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">No Data Yet</h2>
          <p className="text-sm text-[var(--text-tertiary)]">Start your learning journey to see progress</p>
        </div>
      </div>
    );
  }

  // Chart data
  const documentTypeData = Object.entries(analytics.documents_by_type).map(([type, count]) => ({
    name: type.toUpperCase(),
    value: count
  }));

  const CHART_COLORS = ['#4B6A9B', '#5C8A72', '#B8860B', '#7C6B8E', '#8B5A5A', '#4A7C9B'];

  const activityData = analytics.recent_activity.map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    Documents: item.documents,
    Notes: item.notes,
    Quizzes: item.quizzes,
  }));

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-[var(--success)]';
    if (score >= 60) return 'text-[var(--warning)]';
    return 'text-[var(--error)]';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-[var(--success)]';
    if (score >= 60) return 'bg-[var(--warning)]';
    return 'bg-[var(--error)]';
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <ArrowUp className="w-3.5 h-3.5 text-[var(--success)]" />;
      case 'declining':
        return <ArrowDown className="w-3.5 h-3.5 text-[var(--error)]" />;
      default:
        return <Minus className="w-3.5 h-3.5 text-[var(--text-muted)]" />;
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'border-l-[var(--error)] bg-[var(--error-bg)]';
      case 'medium':
        return 'border-l-[var(--warning)] bg-[var(--warning-bg)]';
      default:
        return 'border-l-[var(--info)] bg-[var(--info-bg)]';
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            Learning Progress
          </h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            Track your achievements and growth
          </p>
        </div>
        <Button
          onClick={refreshData}
          disabled={refreshing}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Study Streak */}
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-value">{analytics.study_streak}</p>
              <p className="stat-label">Day Streak</p>
            </div>
            <div className="icon-wrapper icon-quizzes">
              <Flame className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Average Score */}
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-value">{analytics.average_quiz_score.toFixed(0)}%</p>
              <p className="stat-label">Avg Score</p>
            </div>
            <div className="icon-wrapper icon-notes">
              <Award className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Content Created */}
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-value">{analytics.total_notes + analytics.total_summaries}</p>
              <p className="stat-label">Notes & Summaries</p>
            </div>
            <div className="icon-wrapper icon-documents">
              <BookOpen className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Study Time */}
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-value">{Math.round(analytics.total_study_time / 60)}h</p>
              <p className="stat-label">Study Time</p>
            </div>
            <div className="icon-wrapper icon-summaries">
              <Clock className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-3 flex items-center gap-3">
          <FileText className="w-4 h-4 text-[var(--documents)]" />
          <div>
            <p className="text-lg font-semibold text-[var(--text-primary)]">{analytics.total_documents}</p>
            <p className="text-xs text-[var(--text-muted)]">Documents</p>
          </div>
        </div>

        <div className="card p-3 flex items-center gap-3">
          <Brain className="w-4 h-4 text-[var(--notes)]" />
          <div>
            <p className="text-lg font-semibold text-[var(--text-primary)]">{analytics.total_quiz_attempts}</p>
            <p className="text-xs text-[var(--text-muted)]">Quiz Attempts</p>
          </div>
        </div>

        <div className="card p-3 flex items-center gap-3">
          <Target className="w-4 h-4 text-[var(--summaries)]" />
          <div>
            <p className="text-lg font-semibold text-[var(--text-primary)]">{analytics.consistency_score.toFixed(0)}%</p>
            <p className="text-xs text-[var(--text-muted)]">Consistency</p>
          </div>
        </div>

        <div className="card p-3 flex items-center gap-3">
          <Activity className="w-4 h-4 text-[var(--career)]" />
          <div>
            <p className="text-lg font-semibold text-[var(--text-primary)]">{analytics.learning_velocity.toFixed(1)}</p>
            <p className="text-xs text-[var(--text-muted)]">Items/Week</p>
          </div>
        </div>
      </div>

      {/* AI Insights */}
      {insights.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">AI Insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((insight, index) => (
              <div
                key={index}
                className={`p-3 rounded-md border-l-2 ${getPriorityStyle(insight.priority)}`}
              >
                <h4 className="text-sm font-medium text-[var(--text-primary)] mb-1">{insight.category}</h4>
                <p className="text-xs text-[var(--text-secondary)] mb-2">{insight.message}</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  <span className="font-medium">Tip:</span> {insight.recommendation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Activity Chart */}
        <div className="card p-4">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Recent Activity</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={activityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
              <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} />
              <YAxis stroke="var(--text-muted)" fontSize={11} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card-bg)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '6px',
                  fontSize: '12px'
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Area type="monotone" dataKey="Documents" stroke="#4B6A9B" fill="#4B6A9B" fillOpacity={0.2} />
              <Area type="monotone" dataKey="Notes" stroke="#5C8A72" fill="#5C8A72" fillOpacity={0.2} />
              <Area type="monotone" dataKey="Quizzes" stroke="#B8860B" fill="#B8860B" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Document Types */}
        {documentTypeData.length > 0 && (
          <div className="card p-4">
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Documents by Type</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={documentTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  fontSize={11}
                >
                  {documentTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Topic Performance */}
      {analytics.quiz_performance_by_topic.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-[var(--quizzes)]" />
            <h3 className="text-sm font-medium text-[var(--text-secondary)]">Performance by Topic</h3>
          </div>
          <div className="space-y-3">
            {analytics.quiz_performance_by_topic.slice(0, 8).map((topic, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm text-[var(--text-primary)]">{topic.topic}</span>
                    <div className="flex items-center gap-0.5">
                      {getTrendIcon(topic.trend)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--text-muted)]">
                      {topic.attempts} attempt{topic.attempts !== 1 ? 's' : ''}
                    </span>
                    <span className={`text-sm font-semibold ${getScoreColor(topic.avg_score)}`}>
                      {topic.avg_score.toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full ${getScoreBg(topic.avg_score)}`}
                    style={{ width: `${topic.avg_score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Best Score */}
      {analytics.best_score > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="icon-wrapper icon-quizzes">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Personal Best</p>
                <p className="text-2xl font-bold text-[var(--text-primary)]">{analytics.best_score.toFixed(0)}%</p>
              </div>
            </div>
            {analytics.improvement_rate > 0 && (
              <div className="flex items-center gap-1 text-[var(--success)]">
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm font-medium">+{analytics.improvement_rate.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

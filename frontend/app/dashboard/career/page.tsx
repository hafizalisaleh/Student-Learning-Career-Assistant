'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { CareerAnalysis } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Briefcase, Upload, FileText, TrendingUp, Target,
  Award, BookOpen, Users, Sparkles
} from 'lucide-react';

export default function CareerPage() {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<CareerAnalysis | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalysis();
  }, []);

  const loadAnalysis = async () => {
    try {
      setLoading(true);
      const data = await api.getCurrentCareerAnalysis();
      setAnalysis(data);
    } catch (error: any) {
      if (error.response?.status !== 404) {
        toast.error('Failed to load career analysis');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a PDF or Word document');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    try {
      setUploading(true);
      toast.loading('Uploading and analyzing resume...', { id: 'resume-upload' });

      const { resume, analysis: analysisData } = await api.uploadAndAnalyzeResume(file);

      setAnalysis(analysisData);
      toast.success('Resume analyzed successfully!', { id: 'resume-upload' });
    } catch (error: any) {
      console.error('Resume analysis error:', error);
      toast.error(
        error.response?.data?.detail || 'Failed to analyze resume. Please try again.',
        { id: 'resume-upload' }
      );
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // No analysis yet - show upload prompt
  if (!analysis) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <EmptyState
          icon={Briefcase}
          title="Career Guidance Center"
          description="Upload your resume to receive AI-powered career insights, personalized recommendations, and targeted skill development advice."
          action={
            <div>
              <label htmlFor="resume-upload" className="inline-block cursor-pointer">
                <span className={cn(
                  'inline-flex items-center justify-center font-medium transition-all duration-200 px-6 py-3 text-base rounded-xl gap-2',
                  'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] shadow-sm hover:shadow-md',
                  uploading && 'opacity-50 pointer-events-none'
                )}>
                  {uploading ? (
                    <>
                      <LoadingSpinner size="sm" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Upload Resume
                    </>
                  )}
                </span>
              </label>
              <input
                id="resume-upload"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
              <p className="text-sm text-[var(--text-tertiary)] mt-3">
                Supported formats: PDF, DOC, DOCX (Max 10MB)
              </p>
            </div>
          }
        />

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card padding="md">
            <div className="icon-wrapper icon-documents mb-3">
              <Target className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-[var(--text-primary)] mb-2">Career Recommendations</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Get personalized career path suggestions based on your skills and experience
            </p>
          </Card>

          <Card padding="md">
            <div className="icon-wrapper icon-notes mb-3">
              <TrendingUp className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-[var(--text-primary)] mb-2">Skill Gap Analysis</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Identify missing skills and receive learning recommendations
            </p>
          </Card>

          <Card padding="md">
            <div className="icon-wrapper icon-summaries mb-3">
              <Sparkles className="h-4 w-4" />
            </div>
            <h3 className="font-semibold text-[var(--text-primary)] mb-2">Interview Preparation</h3>
            <p className="text-sm text-[var(--text-secondary)]">
              Access role-specific interview questions and best practices
            </p>
          </Card>
        </div>
      </div>
    );
  }

  // Show analysis results
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Career Analysis</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">AI-powered resume insights and recommendations</p>
        </div>
        <div>
          <label htmlFor="resume-reupload" className="inline-block cursor-pointer">
            <span className={cn(
              'inline-flex items-center justify-center font-medium transition-all duration-200 px-4 py-2.5 text-sm rounded-lg gap-2',
              'bg-transparent border-2 border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary-light)]',
              uploading && 'opacity-50 pointer-events-none'
            )}>
              {uploading ? (
                <>
                  <LoadingSpinner size="sm" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Update Resume
                </>
              )}
            </span>
          </label>
          <input
            id="resume-reupload"
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleFileUpload}
            disabled={uploading}
            className="hidden"
          />
        </div>
      </div>

      {/* Overview */}
      <Card padding="md">
        <div className="flex items-start gap-4">
          <div className="icon-wrapper icon-career" style={{ width: 48, height: 48 }}>
            <FileText className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">{analysis.resume_filename}</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Analyzed on {new Date(analysis.analyzed_at).toLocaleDateString()}
            </p>
            {analysis.overall_assessment && (
              <div className="bg-[var(--info-bg)] border border-[var(--info-border)] rounded-lg p-4">
                <p className="text-sm text-[var(--text-primary)]">{analysis.overall_assessment}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Career Recommendations */}
      {analysis.recommendations && analysis.recommendations.length > 0 && (
        <Card padding="md">
          <div className="flex items-center gap-3 mb-4">
            <div className="icon-wrapper icon-documents">
              <Briefcase className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Career Recommendations</h2>
          </div>
          <div className="space-y-4">
            {analysis.recommendations.map((rec, index) => (
              <div key={index} className="border-l-4 border-[var(--primary)] pl-4">
                <h3 className="font-semibold text-lg text-[var(--text-primary)] mb-2">{rec.role_title}</h3>
                <p className="text-[var(--text-secondary)] mb-3">{rec.description}</p>

                {rec.required_skills && rec.required_skills.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-[var(--text-secondary)] mb-2">Required Skills:</p>
                    <div className="flex flex-wrap gap-2">
                      {rec.required_skills.map((skill, idx) => (
                        <Badge key={idx} variant="info" size="lg">
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 text-sm text-[var(--text-tertiary)]">
                  <div className="flex items-center gap-1">
                    <Award className="w-4 h-4" />
                    <span>Match: {rec.match_percentage}%</span>
                  </div>
                  {rec.growth_potential && (
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" />
                      <span>{rec.growth_potential}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Skill Gaps */}
      {analysis.skill_gaps && analysis.skill_gaps.length > 0 && (
        <Card padding="md">
          <div className="flex items-center gap-3 mb-4">
            <div className="icon-wrapper icon-quizzes">
              <Target className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Skill Development Areas</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysis.skill_gaps.map((gap, index) => (
              <div key={index} className="bg-[var(--warning-bg)] border border-[var(--warning-border)] rounded-lg p-4">
                <h3 className="font-semibold text-[var(--text-primary)] mb-2">{gap.skill_name}</h3>
                <p className="text-sm text-[var(--text-secondary)] mb-3">{gap.importance}</p>
                {gap.learning_resources && gap.learning_resources.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-[var(--text-primary)] mb-2">Resources:</p>
                    <ul className="text-sm text-[var(--text-secondary)] space-y-1">
                      {gap.learning_resources.map((resource, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 flex-shrink-0" />
                          <span>{resource}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Interview Preparation */}
      {analysis.interview_prep && (
        <Card padding="md">
          <div className="flex items-center gap-3 mb-4">
            <div className="icon-wrapper icon-notes">
              <Users className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Interview Preparation</h2>
          </div>

          {analysis.interview_prep.common_questions &&
           analysis.interview_prep.common_questions.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-[var(--text-primary)] mb-3">Common Interview Questions</h3>
              <div className="space-y-3">
                {analysis.interview_prep.common_questions.map((question, index) => (
                  <div key={index} className="bg-[var(--success-bg)] border border-[var(--success-border)] rounded-lg p-4">
                    <p className="font-medium text-[var(--text-primary)]">{question}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.interview_prep.tips && analysis.interview_prep.tips.length > 0 && (
            <div>
              <h3 className="font-semibold text-[var(--text-primary)] mb-3">Interview Tips</h3>
              <ul className="space-y-2">
                {analysis.interview_prep.tips.map((tip, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-[var(--success)] flex-shrink-0 mt-0.5" />
                    <span className="text-[var(--text-secondary)]">{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Actions */}
      <div>
        <Button
          onClick={() => router.push('/dashboard/career/recommendations')}
          className="w-full"
        >
          View All Recommendations
        </Button>
      </div>
    </div>
  );
}

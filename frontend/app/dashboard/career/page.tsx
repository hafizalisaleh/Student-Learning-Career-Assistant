'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { CareerAnalysis } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
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
      // No analysis yet - this is fine
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

    // Validate file type
    const validTypes = ['application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a PDF or Word document');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    try {
      setUploading(true);
      toast.loading('Uploading and analyzing resume...', { id: 'resume-upload' });
      
      // Upload and analyze in one call
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
      // Reset input so same file can be uploaded again
      e.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // No analysis yet - show upload prompt
  if (!analysis) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="p-12 text-center">
          <Briefcase className="w-16 h-16 mx-auto mb-4 text-primary" />
          <h1 className="text-3xl font-bold mb-4">Career Guidance Center</h1>
          <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
            Upload your resume to receive AI-powered career insights, personalized recommendations, 
            and targeted skill development advice to advance your career.
          </p>
          
          <div className="mb-8">
            <label
              htmlFor="resume-upload"
              className={`inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark cursor-pointer transition-colors ${
                uploading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {uploading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  <span>Upload Resume</span>
                </>
              )}
            </label>
            <input
              id="resume-upload"
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </div>

          <div className="text-sm text-gray-500">
            Supported formats: PDF, DOC, DOCX (Max 10MB)
          </div>
        </Card>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card className="p-6">
            <Target className="w-8 h-8 text-blue-600 mb-3" />
            <h3 className="font-semibold mb-2">Career Recommendations</h3>
            <p className="text-sm text-gray-600">
              Get personalized career path suggestions based on your skills and experience
            </p>
          </Card>

          <Card className="p-6">
            <TrendingUp className="w-8 h-8 text-green-600 mb-3" />
            <h3 className="font-semibold mb-2">Skill Gap Analysis</h3>
            <p className="text-sm text-gray-600">
              Identify missing skills and receive learning recommendations
            </p>
          </Card>

          <Card className="p-6">
            <Sparkles className="w-8 h-8 text-purple-600 mb-3" />
            <h3 className="font-semibold mb-2">Interview Preparation</h3>
            <p className="text-sm text-gray-600">
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
        <h1 className="text-3xl font-bold">Career Analysis</h1>
        <label
          htmlFor="resume-reupload"
          className={`inline-flex items-center gap-2 px-4 py-2 border border-primary text-primary rounded-lg hover:bg-primary hover:text-white cursor-pointer transition-colors ${
            uploading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {uploading ? (
            <>
              <LoadingSpinner size="sm" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              <span>Update Resume</span>
            </>
          )}
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

      {/* Overview */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <FileText className="w-12 h-12 text-primary flex-shrink-0" />
          <div className="flex-1">
            <h2 className="text-xl font-bold mb-2">{analysis.resume_filename}</h2>
            <p className="text-gray-600 mb-4">
              Analyzed on {new Date(analysis.analyzed_at).toLocaleDateString()}
            </p>
            {analysis.overall_assessment && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-blue-900">{analysis.overall_assessment}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Career Recommendations */}
      {analysis.recommendations && analysis.recommendations.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Briefcase className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-bold">Career Recommendations</h2>
          </div>
          <div className="space-y-4">
            {analysis.recommendations.map((rec, index) => (
              <div key={index} className="border-l-4 border-primary pl-4">
                <h3 className="font-semibold text-lg mb-2">{rec.role_title}</h3>
                <p className="text-gray-700 mb-3">{rec.description}</p>
                
                {rec.required_skills && rec.required_skills.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-gray-600 mb-2">Required Skills:</p>
                    <div className="flex flex-wrap gap-2">
                      {rec.required_skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 text-sm text-gray-600">
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
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-6 h-6 text-orange-600" />
            <h2 className="text-xl font-bold">Skill Development Areas</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analysis.skill_gaps.map((gap, index) => (
              <div key={index} className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <h3 className="font-semibold text-orange-900 mb-2">{gap.skill_name}</h3>
                <p className="text-sm text-orange-800 mb-3">{gap.importance}</p>
                {gap.learning_resources && gap.learning_resources.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-orange-900 mb-2">Resources:</p>
                    <ul className="text-sm text-orange-800 space-y-1">
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
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-bold">Interview Preparation</h2>
          </div>
          
          {analysis.interview_prep.common_questions && 
           analysis.interview_prep.common_questions.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold mb-3">Common Interview Questions</h3>
              <div className="space-y-3">
                {analysis.interview_prep.common_questions.map((question, index) => (
                  <div key={index} className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="font-medium text-green-900">{question}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.interview_prep.tips && analysis.interview_prep.tips.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Interview Tips</h3>
              <ul className="space-y-2">
                {analysis.interview_prep.tips.map((tip, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Sparkles className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700">{tip}</span>
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

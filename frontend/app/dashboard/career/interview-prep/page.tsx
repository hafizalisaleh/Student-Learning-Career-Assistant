'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { InterviewPrep } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import toast from 'react-hot-toast';
import {
  MessageSquare, Lightbulb, CheckCircle, ChevronDown,
  ChevronUp, Sparkles, Target, Users, ArrowRight
} from 'lucide-react';

export default function InterviewPrepPage() {
  const [prepData, setPrepData] = useState<InterviewPrep | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
  const [practiceMode, setPracticeMode] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');

  useEffect(() => {
    loadInterviewPrep();
  }, []);

  const loadInterviewPrep = async () => {
    try {
      setLoading(true);
      const data = await api.getInterviewPrep();
      setPrepData(data);
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to load interview prep');
    } finally {
      setLoading(false);
    }
  };

  const toggleQuestion = (index: number) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const startPractice = () => {
    setPracticeMode(true);
    setCurrentQuestionIndex(0);
    setUserAnswer('');
  };

  const nextQuestion = () => {
    if (prepData && currentQuestionIndex < prepData.common_questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setUserAnswer('');
    } else {
      setPracticeMode(false);
      toast.success('Practice session completed!');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!prepData) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card className="p-12 text-center">
          <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h2 className="text-2xl font-bold mb-2">No Interview Prep Available</h2>
          <p className="text-gray-600 mb-6">
            Upload your resume first to get personalized interview preparation
          </p>
          <a
            href="/dashboard/career"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
          >
            Upload Resume
            <ArrowRight className="w-4 h-4" />
          </a>
        </Card>
      </div>
    );
  }

  // Practice Mode UI
  if (practiceMode && prepData.common_questions.length > 0) {
    const currentQuestion = prepData.common_questions[currentQuestionIndex];
    
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Practice Interview</h1>
          <Button variant="outline" onClick={() => setPracticeMode(false)}>
            Exit Practice
          </Button>
        </div>

        <Card className="p-8">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-600">
                Question {currentQuestionIndex + 1} of {prepData.common_questions.length}
              </span>
              <div className="w-48 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{
                    width: `${((currentQuestionIndex + 1) / prepData.common_questions.length) * 100}%`
                  }}
                />
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-6">{currentQuestion}</h2>

            <textarea
              value={userAnswer}
              onChange={(e) => setUserAnswer(e.target.value)}
              placeholder="Type your answer here... (This helps you practice articulating your thoughts)"
              className="w-full p-4 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-primary min-h-[200px] mb-4"
            />

            <div className="flex gap-4">
              <Button onClick={nextQuestion} className="flex-1">
                {currentQuestionIndex < prepData.common_questions.length - 1 ? 'Next Question' : 'Finish Practice'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Main Interview Prep UI
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Interview Preparation</h1>
          <p className="text-gray-600">
            Practice common questions and review tips for your target roles
          </p>
        </div>
        {prepData.common_questions.length > 0 && (
          <Button onClick={startPractice}>
            Start Practice Session
          </Button>
        )}
      </div>

      {/* Interview Tips */}
      {prepData.tips && prepData.tips.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Lightbulb className="w-6 h-6 text-yellow-600" />
            <h2 className="text-xl font-bold">Interview Tips</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {prepData.tips.map((tip, index) => (
              <div key={index} className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-gray-700">{tip}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* STAR Method Guide */}
      {prepData.behavioral_framework && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-6 h-6 text-purple-600" />
            <h2 className="text-xl font-bold">STAR Method Framework</h2>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-gray-700 mb-4">{prepData.behavioral_framework}</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-3 rounded-lg">
                <p className="font-bold text-purple-900 mb-1">Situation</p>
                <p className="text-sm text-gray-600">Set the context</p>
              </div>
              <div className="bg-white p-3 rounded-lg">
                <p className="font-bold text-purple-900 mb-1">Task</p>
                <p className="text-sm text-gray-600">Describe the challenge</p>
              </div>
              <div className="bg-white p-3 rounded-lg">
                <p className="font-bold text-purple-900 mb-1">Action</p>
                <p className="text-sm text-gray-600">Explain what you did</p>
              </div>
              <div className="bg-white p-3 rounded-lg">
                <p className="font-bold text-purple-900 mb-1">Result</p>
                <p className="text-sm text-gray-600">Share the outcome</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Common Questions */}
      {prepData.common_questions && prepData.common_questions.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <MessageSquare className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold">Common Interview Questions</h2>
          </div>
          <div className="space-y-3">
            {prepData.common_questions.map((question, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleQuestion(index)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <span className="font-medium text-left">{question}</span>
                  {expandedQuestions.has(index) ? (
                    <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  )}
                </button>
                {expandedQuestions.has(index) && (
                  <div className="p-4 bg-gray-50 border-t">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">
                          Tips for answering:
                        </p>
                        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                          <li>Be specific and use concrete examples</li>
                          <li>Highlight your unique contributions</li>
                          <li>Connect your answer to the role requirements</li>
                          <li>Keep your response concise (2-3 minutes)</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Role-Specific Questions */}
      {prepData.role_specific_questions && 
       Object.keys(prepData.role_specific_questions).length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Target className="w-6 h-6 text-green-600" />
            <h2 className="text-xl font-bold">Role-Specific Questions</h2>
          </div>
          <div className="space-y-6">
            {Object.entries(prepData.role_specific_questions).map(([role, questions]) => (
              <div key={role}>
                <h3 className="font-semibold text-lg mb-3 text-gray-900">{role}</h3>
                <div className="space-y-2">
                  {(questions as string[]).map((question, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <span className="text-green-700 font-bold flex-shrink-0">Q:</span>
                      <span className="text-gray-700">{question}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Technical Concepts */}
      {prepData.technical_concepts && prepData.technical_concepts.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <Sparkles className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-bold">Key Technical Concepts to Review</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {prepData.technical_concepts.map((concept, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <CheckCircle className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <span className="text-gray-700">{concept}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

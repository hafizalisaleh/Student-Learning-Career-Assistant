'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Quiz, QuizAttempt } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, Clock, Award, ArrowLeft, BarChart3 } from 'lucide-react';

interface QuizAnswer {
  question_id: string;  // UUID
  selected_answer?: string;
  answer_text?: string;
}

export default function TakeQuizPage() {
  const params = useParams();
  const router = useRouter();
  const quizId = params.id as string;  // Keep as string UUID

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [attempt, setAttempt] = useState<any | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [timeStarted, setTimeStarted] = useState<Date | null>(null);
  const [hasExistingAttempt, setHasExistingAttempt] = useState(false);

  useEffect(() => {
    loadQuiz();
  }, [quizId]);

  const loadQuiz = async () => {
    try {
      setLoading(true);
      
      // Always load quiz data first
      const data = await api.getQuiz(quizId);
      console.log('Quiz loaded:', data);
      setQuiz(data);
      
      // Check if user already has an attempt for this quiz
      try {
        const existingAttempt = await api.getQuizAttempt(quizId);
        if (existingAttempt && existingAttempt.completed_at) {
          console.log('✓ Found existing completed attempt');
          setAttempt(existingAttempt);
          setHasExistingAttempt(true);
          setLoading(false);
          return;
        }
      } catch (error: any) {
        // No existing attempt (404 is expected), continue to start new attempt
        if (error.response?.status === 404) {
          console.log('✓ No previous attempt found, starting fresh quiz');
        } else {
          console.warn('⚠️ Error checking for existing attempt:', error.message);
        }
      }
      
      // Start quiz attempt to track time
      try {
        const startResponse = await api.startQuizAttempt(quizId);
        setAttemptId(startResponse.attempt_id);
        setTimeStarted(new Date(startResponse.started_at));
        console.log('Quiz attempt started:', startResponse);
      } catch (error: any) {
        console.error('Failed to start attempt tracking:', error);
        // Fallback to client-side time tracking
        setTimeStarted(new Date());
      }
      
      // Initialize answers object
      const initialAnswers: Record<string, QuizAnswer> = {};
      data.questions.forEach(q => {
        initialAnswers[q.id] = { question_id: q.id };
      });
      setAnswers(initialAnswers);
    } catch (error: any) {
      console.error('Failed to load quiz:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to load quiz';
      toast.error(errorMessage);
      router.push('/dashboard/quizzes');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerChange = (questionId: string, value: string, type: 'mcq' | 'true_false' | 'short_answer') => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: {
        question_id: questionId,
        ...(type === 'short_answer' 
          ? { answer_text: value }
          : { selected_answer: value }
        )
      }
    }));
  };

  const handleSubmit = async () => {
    // Check if all questions are answered
    const unanswered = quiz?.questions.filter(q => {
      const answer = answers[q.id];
      return !answer?.selected_answer && !answer?.answer_text;
    });

    if (unanswered && unanswered.length > 0) {
      toast.error(`Please answer all questions (${unanswered.length} remaining)`);
      return;
    }

    try {
      setSubmitting(true);
      
      // Transform answers to match backend schema
      const formattedAnswers = Object.values(answers).map(ans => ({
        question_id: ans.question_id,
        answer: ans.selected_answer || ans.answer_text || ''
      }));
      
      console.log('Submitting answers:', formattedAnswers);
      
      const attemptData = await api.submitQuiz(quizId, { answers: formattedAnswers });
      
      console.log('Quiz submission response:', attemptData);
      setAttempt(attemptData);
      toast.success('Quiz submitted successfully!');
    } catch (error: any) {
      console.error('Failed to submit quiz:', error);
      console.error('Error details:', error.response?.data);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to submit quiz';
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!quiz && !attempt) {
    return null;
  }

  // Show results if attempt exists
  if (attempt) {
    const timeTaken = attempt.time_taken 
      ? Math.round(attempt.time_taken / 60) 
      : timeStarted 
        ? Math.round((new Date().getTime() - timeStarted.getTime()) / 60000)
        : 0;
    
    return (
      <div className="max-w-4xl mx-auto space-y-6 pb-8">
        {/* Main Results Card */}
        <Card className="p-8 text-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
          <div className="inline-block p-4 bg-white rounded-full shadow-lg mb-4">
            <Award className={`w-16 h-16 ${
              attempt.score >= 80 ? 'text-green-500' : 
              attempt.score >= 60 ? 'text-yellow-500' : 
              'text-orange-500'
            }`} />
          </div>
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Quiz Completed!
          </h1>
          <p className="text-gray-600 mb-8">{quiz?.title || 'Quiz Results'}</p>
          
          {/* Enhanced Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow border-t-4 border-blue-500">
              <div className="flex items-center justify-center mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <BarChart3 className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <p className="text-sm font-medium text-gray-600 mb-2">Your Score</p>
              <p className={`text-4xl font-bold ${getScoreColor(attempt.score)}`}>
                {attempt.score?.toFixed(1) || 0}%
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {attempt.score >= 80 ? 'Excellent!' : 
                 attempt.score >= 60 ? 'Good Job!' : 
                 attempt.score >= 40 ? 'Keep Practicing' : 'Need More Study'}
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow border-t-4 border-green-500">
              <div className="flex items-center justify-center mb-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <p className="text-sm font-medium text-gray-600 mb-2">Correct Answers</p>
              <p className="text-4xl font-bold text-gray-900">
                {attempt.correct_answers || 0}<span className="text-2xl text-gray-400">/{attempt.total_questions || 0}</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {Math.round(((attempt.correct_answers || 0) / (attempt.total_questions || 1)) * 100)}% accuracy
              </p>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow border-t-4 border-purple-500">
              <div className="flex items-center justify-center mb-2">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Clock className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <p className="text-sm font-medium text-gray-600 mb-2">Time Taken</p>
              <p className="text-4xl font-bold text-gray-900">
                {timeTaken}<span className="text-2xl text-gray-400"> min</span>
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {timeTaken > 20 ? 'Take your time' : 'Great pace!'}
              </p>
            </div>
          </div>

          <div className="flex justify-center">
            <Button onClick={() => router.push('/dashboard/quizzes')} className="px-6">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Quizzes
            </Button>
          </div>
        </Card>

        {/* Detailed Feedback */}
        {attempt.feedback && attempt.feedback.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">Detailed Results</h2>
            {attempt.feedback.map((fb: any, index: number) => (
              <Card key={fb.question_id || index} className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    {fb.is_correct ? (
                      <CheckCircle className="w-8 h-8 text-green-600" />
                    ) : (
                      <XCircle className="w-8 h-8 text-red-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">Question {index + 1}</h3>
                    <p className="text-gray-700 mb-4">{fb.question_text}</p>
                    
                    <div className="space-y-2">
                      <div className="bg-gray-50 p-3 rounded">
                        <p className="text-sm text-gray-600">Your Answer:</p>
                        <p className={`font-medium ${fb.is_correct ? 'text-green-700' : 'text-red-700'}`}>
                          {fb.user_answer || 'Not answered'}
                        </p>
                      </div>
                      
                      {!fb.is_correct && (
                        <div className="bg-green-50 p-3 rounded">
                          <p className="text-sm text-gray-600">Correct Answer:</p>
                          <p className="font-medium text-green-700">{fb.correct_answer}</p>
                        </div>
                      )}
                      
                      {fb.explanation && (
                        <div className="bg-blue-50 p-3 rounded">
                          <p className="text-sm text-gray-600">Explanation:</p>
                          <p className="text-sm text-blue-900">{fb.explanation}</p>
                        </div>
                      )}
                      
                      <div className="text-sm text-gray-600">
                        Points: {fb.points_earned?.toFixed(1) || 0} / {fb.points_possible || 1}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Performance Insights & Recommendations */}
        <Card className="p-6 bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
          <div className="flex items-start gap-3 mb-4">
            <Award className="w-8 h-8 text-purple-600 flex-shrink-0" />
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Performance Insights</h2>
              <p className="text-gray-600">AI-powered analysis of your quiz performance</p>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <p className="text-sm font-medium text-gray-600 mb-1">Performance Level</p>
              <p className={`text-2xl font-bold ${
                attempt.score >= 80 ? 'text-green-600' : 
                attempt.score >= 60 ? 'text-yellow-600' : 
                attempt.score >= 40 ? 'text-orange-600' : 'text-red-600'
              }`}>
                {attempt.score >= 80 ? 'Excellent' : 
                 attempt.score >= 60 ? 'Good' : 
                 attempt.score >= 40 ? 'Fair' : 'Needs Improvement'}
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <p className="text-sm font-medium text-gray-600 mb-1">Questions to Review</p>
              <p className="text-2xl font-bold text-blue-600">
                {(attempt.total_questions - attempt.correct_answers) || 0}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-lg shadow-sm">
            <h3 className="font-semibold text-lg text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-purple-600">💡</span> Key Recommendations
            </h3>
            <div className="space-y-3">
              {attempt.score < 60 && (
                <div className="flex gap-3 p-3 bg-red-50 rounded-lg border-l-4 border-red-400">
                  <span className="text-red-600 flex-shrink-0">⚠️</span>
                  <div>
                    <p className="font-medium text-red-900">Focus on Core Concepts</p>
                    <p className="text-sm text-red-800">Your score indicates gaps in understanding. Review the detailed explanations above and revisit the study material.</p>
                  </div>
                </div>
              )}
              
              {attempt.score >= 60 && attempt.score < 80 && (
                <div className="flex gap-3 p-3 bg-yellow-50 rounded-lg border-l-4 border-yellow-400">
                  <span className="text-yellow-600 flex-shrink-0">📚</span>
                  <div>
                    <p className="font-medium text-yellow-900">Strengthen Your Knowledge</p>
                    <p className="text-sm text-yellow-800">Good performance! Focus on the questions you missed to achieve excellence. Practice similar questions to reinforce concepts.</p>
                  </div>
                </div>
              )}
              
              {attempt.score >= 80 && (
                <div className="flex gap-3 p-3 bg-green-50 rounded-lg border-l-4 border-green-400">
                  <span className="text-green-600 flex-shrink-0">🌟</span>
                  <div>
                    <p className="font-medium text-green-900">Outstanding Performance</p>
                    <p className="text-sm text-green-800">Excellent work! You demonstrate strong understanding. Challenge yourself with more advanced topics to continue growing.</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 p-3 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                <span className="text-blue-600 flex-shrink-0">🎯</span>
                <div>
                  <p className="font-medium text-blue-900">Next Steps</p>
                  <ul className="text-sm text-blue-800 list-disc list-inside space-y-1 mt-1">
                    <li>Review the detailed feedback above for each incorrect answer</li>
                    <li>Study the explanations to understand the reasoning behind correct answers</li>
                    <li>Revisit the source material focusing on areas where you struggled</li>
                    {attempt.score < 70 && <li>Consider retaking the quiz after additional review</li>}
                    <li>Practice similar questions to reinforce your learning</li>
                  </ul>
                </div>
              </div>

              {timeTaken > 20 && (
                <div className="flex gap-3 p-3 bg-purple-50 rounded-lg border-l-4 border-purple-400">
                  <span className="text-purple-600 flex-shrink-0">⏱️</span>
                  <div>
                    <p className="font-medium text-purple-900">Time Management Tip</p>
                    <p className="text-sm text-purple-800">You took {timeTaken} minutes. Consider practicing time management to improve your efficiency in assessments.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Add null check before rendering quiz questions
  if (!quiz) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // Show quiz questions
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{quiz?.title || 'Quiz'}</h1>
            {quiz?.topic && (
              <p className="text-gray-600 mt-1">Topic: {quiz.topic}</p>
            )}
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Clock className="w-5 h-5" />
            <span>{quiz?.questions?.length || 0} Questions</span>
          </div>
        </div>

        <div className="space-y-8">
          {quiz?.questions?.map((question, index) => (
            <div key={question.id} className="border-b pb-6 last:border-b-0">
              <p className="font-semibold mb-4">
                {index + 1}. {question.question_text}
              </p>

              {question.question_type === 'mcq' && (
                <div className="space-y-2">
                  {question.options?.map((option, idx) => (
                    <label
                      key={idx}
                      className="flex items-center gap-3 p-3 rounded-lg border-2 hover:bg-gray-50 cursor-pointer transition-colors"
                      style={{
                        borderColor: answers[question.id]?.selected_answer === option ? '#3b82f6' : '#e5e7eb'
                      }}
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={option}
                        checked={answers[question.id]?.selected_answer === option}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value, 'mcq')}
                        className="w-4 h-4 text-primary"
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              )}

              {question.question_type === 'true_false' && (
                <div className="space-y-2">
                  <label
                    className="flex items-center gap-3 p-3 rounded-lg border-2 hover:bg-gray-50 cursor-pointer transition-colors"
                    style={{
                      borderColor: answers[question.id]?.selected_answer === 'True' ? '#3b82f6' : '#e5e7eb'
                    }}
                  >
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value="True"
                      checked={answers[question.id]?.selected_answer === 'True'}
                      onChange={(e) => handleAnswerChange(question.id, e.target.value, 'true_false')}
                      className="w-4 h-4 text-primary"
                    />
                    <span>True</span>
                  </label>
                  <label
                    className="flex items-center gap-3 p-3 rounded-lg border-2 hover:bg-gray-50 cursor-pointer transition-colors"
                    style={{
                      borderColor: answers[question.id]?.selected_answer === 'False' ? '#3b82f6' : '#e5e7eb'
                    }}
                  >
                    <input
                      type="radio"
                      name={`question-${question.id}`}
                      value="False"
                      checked={answers[question.id]?.selected_answer === 'False'}
                      onChange={(e) => handleAnswerChange(question.id, e.target.value, 'true_false')}
                      className="w-4 h-4 text-primary"
                    />
                    <span>False</span>
                  </label>
                </div>
              )}

              {question.question_type === 'short_answer' && (
                <textarea
                  value={answers[question.id]?.answer_text || ''}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value, 'short_answer')}
                  placeholder="Type your answer here..."
                  className="w-full p-3 border-2 rounded-lg focus:outline-none focus:border-primary min-h-[100px]"
                />
              )}

              {question.question_type === 'short' && (
                <textarea
                  value={answers[question.id]?.answer_text || ''}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value, 'short_answer')}
                  placeholder="Type your answer here..."
                  className="w-full p-3 border-2 rounded-lg focus:outline-none focus:border-primary min-h-[100px]"
                />
              )}

              {question.question_type === 'fill_blank' && (
                <input
                  type="text"
                  value={answers[question.id]?.answer_text || ''}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value, 'short_answer')}
                  placeholder="Fill in the blank..."
                  className="w-full p-3 border-2 rounded-lg focus:outline-none focus:border-primary"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-4 justify-end mt-6 pt-6 border-t">
          <Button
            variant="outline"
            onClick={() => router.push('/dashboard/quizzes')}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Quiz'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/api';
import { generateQuizSchema, type GenerateQuizFormData } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ArrowLeft, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import type { Document } from '@/lib/types';

export default function NewQuizPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<('mcq' | 'true_false' | 'short_answer')[]>(['mcq']);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<GenerateQuizFormData>({
    resolver: zodResolver(generateQuizSchema),
    defaultValues: {
      num_questions: 10,
      difficulty: 'medium',
      question_types: ['mcq'],
    },
  });

  useEffect(() => {
    async function fetchDocuments() {
      try {
        const data = await api.getDocuments();
        setDocuments(data.filter((doc) => doc.processing_status === 'completed'));
      } catch (error) {
        console.error('Failed to load documents');
      }
    }
    fetchDocuments();
  }, []);

  const handleTypeToggle = (type: 'mcq' | 'true_false' | 'short_answer') => {
    const newTypes = selectedTypes.includes(type)
      ? selectedTypes.filter((t) => t !== type)
      : [...selectedTypes, type];
    
    if (newTypes.length > 0) {
      setSelectedTypes(newTypes);
      setValue('question_types', newTypes);
    }
  };

  const onSubmit = async (data: GenerateQuizFormData) => {
    try {
      setIsLoading(true);
      console.log('Quiz form data:', data);
      console.log('Selected types:', selectedTypes);
      
      const quiz = await api.generateQuiz({
        ...data,
        question_types: selectedTypes,
      });
      
      console.log('Quiz generated:', quiz);
      toast.success('Quiz generated successfully!');
      router.push(`/dashboard/quizzes/${quiz.id}`);
    } catch (error: any) {
      console.error('Quiz generation error:', error);
      console.error('Error response:', error.response?.data);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to generate quiz';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/quizzes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Generate Quiz</h1>
          <p className="text-gray-600 mt-1">AI-powered quiz generation from your documents</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Quiz Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Document Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Document
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                {...register('document_id')}
              >
                <option value="">Choose a document</option>
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title}
                  </option>
                ))}
              </select>
              {errors.document_id && (
                <p className="mt-1 text-sm text-red-600">{errors.document_id.message}</p>
              )}
            </div>

            {/* Number of Questions */}
            <Input
              label="Number of Questions"
              type="number"
              min={1}
              max={50}
              placeholder="10"
              error={errors.num_questions?.message}
              {...register('num_questions', {
                setValueAs: (v) => Number(v),
              })}
            />

            {/* Difficulty */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Difficulty Level
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                {...register('difficulty')}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            {/* Question Types */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Question Types
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes('mcq')}
                    onChange={() => handleTypeToggle('mcq')}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="font-medium text-gray-900">Multiple Choice</p>
                    <p className="text-sm text-gray-600">Questions with 4 options</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes('true_false')}
                    onChange={() => handleTypeToggle('true_false')}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="font-medium text-gray-900">True/False</p>
                    <p className="text-sm text-gray-600">Simple true or false questions</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes('short_answer')}
                    onChange={() => handleTypeToggle('short_answer')}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <p className="font-medium text-gray-900">Short Answer</p>
                    <p className="text-sm text-gray-600">Open-ended text responses</p>
                  </div>
                </label>
              </div>
              {selectedTypes.length === 0 && (
                <p className="mt-1 text-sm text-red-600">Select at least one question type</p>
              )}
            </div>

            {/* Topic (Optional) */}
            <Input
              label="Topic (Optional)"
              type="text"
              placeholder="e.g., Machine Learning Basics"
              error={errors.topic?.message}
              {...register('topic')}
            />

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                disabled={isLoading || selectedTypes.length === 0}
                className="flex-1"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isLoading ? 'Generating Quiz...' : 'Generate Quiz'}
              </Button>
              <Link href="/dashboard/quizzes" className="flex-1">
                <Button type="button" variant="outline" className="w-full">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

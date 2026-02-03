'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/api';
import { generateSummarySchema, type GenerateSummaryFormData } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ArrowLeft, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import type { Document } from '@/lib/types';

export default function NewSummaryPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [sourceType, setSourceType] = useState<'document' | 'url'>('document');

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<GenerateSummaryFormData>({
    resolver: zodResolver(generateSummarySchema),
    defaultValues: {
      summary_length: 'medium',
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

  const onSubmit = async (data: GenerateSummaryFormData) => {
    try {
      setIsLoading(true);
      console.log('Submitting summary data:', data);
      
      // Prepare the request data
      const requestData = {
        document_id: data.document_id,
        summary_length: data.summary_length
      };
      
      console.log('Request data:', requestData);
      const result = await api.generateSummary(requestData);
      console.log('Summary generated:', result);
      
      toast.success('Summary generated successfully!');
      router.push('/dashboard/summaries');
    } catch (error: any) {
      console.error('Summary generation error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to generate summary';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/summaries">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Generate Summary</h1>
          <p className="text-gray-600 mt-1">AI-powered content summarization</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Summary Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Source Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Source Type
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="document"
                    checked={sourceType === 'document'}
                    onChange={() => setSourceType('document')}
                    className="text-blue-600"
                  />
                  <span>From Document</span>
                </label>
              </div>
            </div>

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

            {/* Summary Length */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Summary Type
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                {...register('summary_length')}
              >
                <option value="short">Bullet Points (2-3 points)</option>
                <option value="medium">Medium (5-7 points)</option>
                <option value="detailed">Detailed (Comprehensive)</option>
              </select>
              {errors.summary_length && (
                <p className="mt-1 text-sm text-red-600">{errors.summary_length.message}</p>
              )}
            </div>

            {/* Custom Prompt removed - not supported yet */}

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                disabled={isLoading}
                className="flex-1"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isLoading ? 'Generating...' : 'Generate Summary'}
              </Button>
              <Link href="/dashboard/summaries" className="flex-1">
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

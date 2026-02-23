'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/api';
import { generateSummarySchema, type GenerateSummaryFormData } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { ArrowLeft, Sparkles, FileText, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { Document } from '@/lib/types';

function NewSummaryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preSelectedDocId = searchParams.get('document');

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [preSelectedDoc, setPreSelectedDoc] = useState<Document | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<GenerateSummaryFormData>({
    resolver: zodResolver(generateSummarySchema),
    defaultValues: {
      summary_length: 'short',
      document_id: preSelectedDocId || '',
    },
  });

  useEffect(() => {
    async function fetchDocuments() {
      try {
        setIsLoadingDocs(true);
        const data = await api.getDocuments();

        // Handle both array and object responses
        const docsArray = Array.isArray(data) ? data : [];

        // Filter for completed documents (case-insensitive)
        const completedDocs = docsArray.filter((doc) =>
          doc.processing_status?.toLowerCase() === 'completed'
        );

        setDocuments(completedDocs);

        // If document is pre-selected via URL, set it
        if (preSelectedDocId) {
          const selectedDoc = completedDocs.find(doc => doc.id === preSelectedDocId);
          if (selectedDoc) {
            setPreSelectedDoc(selectedDoc);
            setValue('document_id', preSelectedDocId);
          }
        }
      } catch (error) {
        console.error('Failed to load documents:', error);
        toast.error('Failed to load documents');
      } finally {
        setIsLoadingDocs(false);
      }
    }
    fetchDocuments();
  }, [preSelectedDocId, setValue]);

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
      // Go back to document page if pre-selected, otherwise to summaries list
      router.push(preSelectedDocId ? `/dashboard/documents/${preSelectedDocId}` : '/dashboard/summaries');
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
        <Link href={preSelectedDoc ? `/dashboard/documents/${preSelectedDoc.id}` : '/dashboard/summaries'}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-[var(--accent-green)] to-[var(--accent-blue)]">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Generate Summary</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {preSelectedDoc ? `For "${preSelectedDoc.title}"` : 'AI-powered content summarization'}
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>{preSelectedDoc ? 'Choose Summary Length' : 'Summary Configuration'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Document Selection */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                <FileText className="h-4 w-4 inline mr-2" />
                Document
              </label>
              {isLoadingDocs ? (
                <div className="flex items-center gap-2 py-3 text-[var(--text-secondary)]">
                  <LoadingSpinner size="sm" />
                  <span>Loading document...</span>
                </div>
              ) : preSelectedDoc ? (
                /* Show pre-selected document as a card instead of dropdown */
                <div className="flex items-center gap-3 p-4 bg-[var(--accent-green-subtle)] border border-[var(--accent-green)] rounded-xl">
                  <CheckCircle className="h-5 w-5 text-[var(--accent-green)]" />
                  <div className="flex-1">
                    <p className="font-medium text-[var(--text-primary)]">{preSelectedDoc.title}</p>
                    <p className="text-xs text-[var(--text-secondary)]">Ready to generate summary</p>
                  </div>
                </div>
              ) : (
                <>
                  <select
                    className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--card-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--accent-blue)] text-[var(--text-primary)]"
                    {...register('document_id')}
                  >
                    <option value="">Choose a document</option>
                    {documents.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.title}
                      </option>
                    ))}
                  </select>
                  {documents.length === 0 && (
                    <p className="mt-3 text-sm text-[var(--warning)] bg-[var(--warning-subtle)] px-4 py-3 rounded-lg">
                      No documents available. Please{' '}
                      <Link href="/dashboard/documents" className="text-[var(--accent-blue)] hover:underline font-medium">
                        upload a document
                      </Link>{' '}
                      first and wait for it to finish processing.
                    </p>
                  )}
                </>
              )}
              {errors.document_id && (
                <p className="mt-2 text-sm text-[var(--error)]">{errors.document_id.message}</p>
              )}
            </div>

            {/* Summary Length */}
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
                Summary Length
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { value: 'short', label: 'Concise', desc: '2-3 key points only', recommended: true },
                  { value: 'medium', label: 'Standard', desc: '5-7 main points', recommended: false },
                  { value: 'detailed', label: 'In-depth', desc: 'Full coverage', recommended: false },
                ].map((option) => {
                  const isSelected = watch('summary_length') === option.value;
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        'relative flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer transition-all duration-200',
                        'bg-[var(--bg-elevated)] border-2 hover:border-[var(--card-border-hover)]',
                        isSelected
                          ? 'border-[var(--accent-blue)] bg-[var(--accent-blue-subtle)]'
                          : 'border-[var(--card-border)]'
                      )}
                    >
                      <input
                        type="radio"
                        value={option.value}
                        {...register('summary_length')}
                        className="sr-only"
                      />
                      <div className="flex items-center gap-1">
                        <p className="font-medium text-[var(--text-primary)]">{option.label}</p>
                        {option.recommended && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-[var(--accent-green)] text-white rounded-full">
                            Quick
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">{option.desc}</p>
                    </label>
                  );
                })}
              </div>
              {errors.summary_length && (
                <p className="mt-2 text-sm text-[var(--error)]">{errors.summary_length.message}</p>
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
              <Link href={preSelectedDoc ? `/dashboard/documents/${preSelectedDoc.id}` : '/dashboard/summaries'} className="flex-1">
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

export default function NewSummaryPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    }>
      <NewSummaryContent />
    </Suspense>
  );
}

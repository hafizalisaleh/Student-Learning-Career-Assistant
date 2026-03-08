'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, ListChecks, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  buildGeneratedNoteContent,
  buildGeneratedNoteTitle,
  buildGeneratedQuizFocusContext,
  buildGeneratedQuizTitle,
} from '@/lib/ai-artifacts';

interface SourceLike {
  text?: string;
  metadata?: Record<string, any>;
}

interface AnswerActionsProps {
  answer: string;
  sources?: SourceLike[];
  defaultDocumentId?: string | null;
  question?: string;
  className?: string;
}

function normalizeDocumentIds(
  sources: SourceLike[] | undefined,
  defaultDocumentId?: string | null
): string[] {
  const ids = (sources || [])
    .map((source) => source?.metadata?.document_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (defaultDocumentId && !ids.includes(defaultDocumentId)) {
    ids.unshift(defaultDocumentId);
  }

  return [...new Set(ids)];
}

export function AnswerActions({
  answer,
  sources = [],
  defaultDocumentId,
  question,
  className = '',
}: AnswerActionsProps) {
  const router = useRouter();
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isCreatingQuiz, setIsCreatingQuiz] = useState(false);

  const documentIds = useMemo(
    () => normalizeDocumentIds(sources, defaultDocumentId),
    [sources, defaultDocumentId]
  );

  const primaryDocumentId = documentIds[0];
  const primaryDocumentTitle = sources.find((source) => source?.metadata?.document_title)?.metadata?.document_title;

  const handleSaveAsNote = async () => {
    if (!primaryDocumentId) {
      toast.error('No source document found for this answer');
      return;
    }

    try {
      setIsSavingNote(true);
      const note = await api.createStudyNote({
        title: buildGeneratedNoteTitle(question, primaryDocumentTitle),
        document_id: primaryDocumentId,
        content: buildGeneratedNoteContent(answer, question, sources),
        content_format: 'markdown',
        note_type: 'structured',
      });
      toast.success('Saved as study note');
      router.push(`/dashboard/notes/${note.id}`);
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message || 'Failed to save note';
      toast.error(detail);
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleTurnIntoQuiz = async () => {
    if (documentIds.length === 0) {
      toast.error('No source document found for this answer');
      return;
    }

    try {
      setIsCreatingQuiz(true);
      const quiz = await api.generateQuiz({
        document_ids: documentIds,
        question_type: 'mixed',
        difficulty: 'medium',
        num_questions: 5,
        title: buildGeneratedQuizTitle(question, primaryDocumentTitle),
        focus_context: buildGeneratedQuizFocusContext(answer, question),
      });
      toast.success('Quiz generated from answer');
      router.push(`/dashboard/quizzes/${quiz.id}`);
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message || 'Failed to build quiz';
      toast.error(detail);
    } finally {
      setIsCreatingQuiz(false);
    }
  };

  return (
    <div className={`mt-4 flex flex-wrap items-center gap-2 ${className}`}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleSaveAsNote}
        disabled={!primaryDocumentId || isSavingNote || isCreatingQuiz}
        className="h-8 rounded-full"
      >
        {isSavingNote ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="mr-1.5 h-3.5 w-3.5" />
        )}
        Save as note
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleTurnIntoQuiz}
        disabled={documentIds.length === 0 || isSavingNote || isCreatingQuiz}
        className="h-8 rounded-full"
      >
        {isCreatingQuiz ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ListChecks className="mr-1.5 h-3.5 w-3.5" />
        )}
        Turn into quiz
      </Button>
    </div>
  );
}

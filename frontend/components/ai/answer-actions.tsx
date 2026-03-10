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
} from '@/lib/ai-artifacts';

interface SourceLike {
  text?: string;
  metadata?: Record<string, any>;
}

interface QuizScopeSection {
  title: string;
  pages?: number[];
}

interface QuizScope {
  documentId?: string | null;
  selectedTopics?: string[];
  selectedSubtopics?: string[];
  selectedSections?: QuizScopeSection[];
  focusContext?: string;
}

interface AnswerActionsProps {
  answer: string;
  sources?: SourceLike[];
  defaultDocumentId?: string | null;
  question?: string;
  quizScope?: QuizScope;
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
  quizScope,
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
      const focusParts = [
        quizScope?.focusContext?.trim(),
        buildGeneratedQuizFocusContext(answer, question).trim(),
      ].filter((value): value is string => Boolean(value));

      const requestData: Record<string, unknown> = {
        document_ids: documentIds,
        question_type: 'mixed',
        difficulty: 'medium',
        num_questions: 5,
        focus_context: focusParts.join('\n\n'),
      };

      if (quizScope?.selectedTopics?.length) {
        requestData.selected_topics = [...new Set(quizScope.selectedTopics.map((item) => item.trim()).filter(Boolean))];
      }

      if (quizScope?.selectedSubtopics?.length) {
        requestData.selected_subtopics = [...new Set(quizScope.selectedSubtopics.map((item) => item.trim()).filter(Boolean))];
      }

      if (quizScope?.selectedSections?.length) {
        requestData.selected_sections = quizScope.selectedSections
          .map((section) => ({
            title: section.title?.trim(),
            pages: Array.isArray(section.pages) ? section.pages.filter((page) => Number.isFinite(page) && page > 0) : [],
          }))
          .filter((section) => section.title);
      }

      const quiz = await api.generateQuiz(requestData);
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

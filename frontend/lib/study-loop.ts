export interface StudyLoopCounts {
  summaries: number;
  notes: number;
  quizzes: number;
  quizAttempts: number;
  bestQuizScore?: number | null;
}

export const STUDY_LOOP_VERIFICATION_SCORE = 70;

export type StudyLoopAction =
  | 'prepare'
  | 'summary'
  | 'notes'
  | 'quiz'
  | 'attempt'
  | 'review';

export interface StudyLoopStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
  active: boolean;
}

export interface StudyLoopNextStep {
  action: StudyLoopAction;
  label: string;
  description: string;
}

export function createEmptyStudyLoopCounts(): StudyLoopCounts {
  return {
    summaries: 0,
    notes: 0,
    quizzes: 0,
    quizAttempts: 0,
    bestQuizScore: null,
  };
}

export function getStudyLoopSteps(
  readyForGeneration: boolean,
  counts: StudyLoopCounts
): StudyLoopStep[] {
  const sourceReady = readyForGeneration;
  const hasSummary = readyForGeneration && counts.summaries > 0;
  const hasNotes = readyForGeneration && counts.notes > 0;
  const hasQuiz = readyForGeneration && counts.quizzes > 0;
  const hasAttempt = readyForGeneration && counts.quizAttempts > 0;
  const hasVerifiedAttempt =
    hasAttempt &&
    counts.bestQuizScore != null &&
    counts.bestQuizScore >= STUDY_LOOP_VERIFICATION_SCORE;

  return [
    {
      key: 'source',
      label: 'Source ready',
      description: sourceReady ? 'Prepared for generation' : 'Still processing',
      done: sourceReady,
      active: !sourceReady,
    },
    {
      key: 'summary',
      label: 'Summary',
      description:
        counts.summaries > 0
          ? `${counts.summaries} summary${counts.summaries === 1 ? '' : 'ies'} created`
          : 'Condense the source first',
      done: hasSummary,
      active: sourceReady && !hasSummary,
    },
    {
      key: 'notes',
      label: 'Notes',
      description:
        counts.notes > 0
          ? `${counts.notes} note${counts.notes === 1 ? '' : 's'} captured`
          : 'Turn understanding into notes',
      done: hasNotes,
      active: hasSummary && !hasNotes,
    },
    {
      key: 'quiz',
      label: 'Quiz ready',
      description:
        counts.quizzes > 0
          ? `${counts.quizzes} quiz${counts.quizzes === 1 ? '' : 'zes'} generated`
          : 'Create a check for recall',
      done: hasQuiz,
      active: hasNotes && !hasQuiz,
    },
    {
      key: 'verify',
      label: 'Verified',
      description:
        counts.quizAttempts > 0
          ? counts.bestQuizScore != null
            ? counts.bestQuizScore >= STUDY_LOOP_VERIFICATION_SCORE
              ? `Best score ${Math.round(counts.bestQuizScore)}%`
              : `Best score ${Math.round(counts.bestQuizScore)}%. Reach ${STUDY_LOOP_VERIFICATION_SCORE}%+ to verify understanding`
            : `${counts.quizAttempts} attempt${counts.quizAttempts === 1 ? '' : 's'} recorded`
          : 'Complete a quiz attempt',
      done: hasVerifiedAttempt,
      active: hasQuiz && !hasVerifiedAttempt,
    },
  ];
}

export function getStudyLoopNextStep(
  readyForGeneration: boolean,
  counts: StudyLoopCounts
): StudyLoopNextStep {
  if (!readyForGeneration) {
    return {
      action: 'prepare',
      label: 'Preparing source',
      description: 'Wait for extraction and indexing to finish before generating study artifacts.',
    };
  }

  if (counts.summaries === 0) {
    return {
      action: 'summary',
      label: 'Generate a summary',
      description: 'Start with a condensed pass so the document becomes easier to scan.',
    };
  }

  if (counts.notes === 0) {
    return {
      action: 'notes',
      label: 'Create notes',
      description: 'Turn the source into reusable study material before testing yourself.',
    };
  }

  if (counts.quizzes === 0) {
    return {
      action: 'quiz',
      label: 'Generate a quiz',
      description: 'Add an assessment so the desk can verify what you actually retained.',
    };
  }

  if (counts.quizAttempts === 0) {
    return {
      action: 'attempt',
      label: 'Take the quiz',
      description: 'You have generated checks, but no verification has happened yet.',
    };
  }

  if ((counts.bestQuizScore ?? 0) < STUDY_LOOP_VERIFICATION_SCORE) {
    return {
      action: 'review',
      label: 'Review weak areas',
      description: `Your best quiz score is ${Math.round(counts.bestQuizScore ?? 0)}%. Revisit the source, tighten notes, and verify again.`,
    };
  }

  return {
    action: 'review',
    label: 'Keep the concept fresh',
    description: 'Your study loop is verified. Reopen the desk when you want a tougher follow-up or broader recall check.',
  };
}

export function getStudyLoopCompletion(
  readyForGeneration: boolean,
  counts: StudyLoopCounts
): number {
  const steps = getStudyLoopSteps(readyForGeneration, counts);
  const completed = steps.filter((step) => step.done).length;
  return Math.round((completed / steps.length) * 100);
}

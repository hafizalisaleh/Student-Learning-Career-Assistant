interface ArtifactSourceLike {
  metadata?: Record<string, any>;
}

export interface ParsedSelectionPrompt {
  selectionType: 'text' | 'image' | null;
  pageNumber: number | null;
  selectedExcerpt: string | null;
  question: string;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripOuterQuotes(value: string) {
  return value.replace(/^["'`]+|["'`]+$/g, '').trim();
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 3).trimEnd()}...` : value;
}

function isGenericMeaningQuestion(question: string) {
  const normalized = normalizeWhitespace(question).toLowerCase();
  return [
    'meaning of this?',
    'meaning of this',
    'what does this mean?',
    'what does this mean',
    'explain this',
    'explain this?',
    'summarize this',
    'summarise this',
    'what is this about?',
    'what is this about',
  ].includes(normalized);
}

export function parseSelectionPrompt(rawPrompt?: string | null): ParsedSelectionPrompt {
  const prompt = (rawPrompt || '').trim();
  if (!prompt) {
    return {
      selectionType: null,
      pageNumber: null,
      selectedExcerpt: null,
      question: '',
    };
  }

  const questionMatch = prompt.match(/(?:^|\n)\s*Question:\s*([\s\S]+?)\s*$/i);
  const question = normalizeWhitespace(questionMatch?.[1] || prompt);

  const textMatch = prompt.match(
    /Regarding the selected text from Page\s+(\d+):\s*"([\s\S]*?)"/i
  );
  if (textMatch) {
    return {
      selectionType: 'text',
      pageNumber: Number(textMatch[1]),
      selectedExcerpt: stripOuterQuotes(textMatch[2]),
      question,
    };
  }

  const imageMatch = prompt.match(/A user-selected image region from Page\s+(\d+)/i);
  if (imageMatch) {
    return {
      selectionType: 'image',
      pageNumber: Number(imageMatch[1]),
      selectedExcerpt: null,
      question,
    };
  }

  return {
    selectionType: null,
    pageNumber: null,
    selectedExcerpt: null,
    question,
  };
}

export function buildGeneratedNoteTitle(rawPrompt?: string | null, documentTitle?: string | null) {
  const parsed = parseSelectionPrompt(rawPrompt);
  const doc = normalizeWhitespace(documentTitle || '');

  if (parsed.selectionType === 'text' && parsed.pageNumber) {
    if (isGenericMeaningQuestion(parsed.question)) {
      return `AI Note: Page ${parsed.pageNumber} Explanation`;
    }
    return `AI Note: ${truncate(parsed.question || `Page ${parsed.pageNumber} Note`, 64)}`;
  }

  if (parsed.selectionType === 'image' && parsed.pageNumber) {
    if (isGenericMeaningQuestion(parsed.question)) {
      return `AI Note: Page ${parsed.pageNumber} Visual Explanation`;
    }
    return `AI Note: ${truncate(parsed.question || `Page ${parsed.pageNumber} Visual Note`, 64)}`;
  }

  const fallback = parsed.question || doc || 'AI Study Note';
  return `AI Note: ${truncate(fallback, 64)}`;
}

export function buildGeneratedQuizTitle(rawPrompt?: string | null, documentTitle?: string | null) {
  const parsed = parseSelectionPrompt(rawPrompt);
  const doc = normalizeWhitespace(documentTitle || 'Document');

  if (parsed.pageNumber) {
    return `${doc} · Page ${parsed.pageNumber} Review Quiz`;
  }

  if (parsed.question) {
    return `${truncate(parsed.question, 48)} Quiz`;
  }

  return `${doc} Review Quiz`;
}

export function buildGeneratedNoteContent(
  answer: string,
  rawPrompt: string | undefined,
  sources: ArtifactSourceLike[] | undefined
) {
  const parsed = parseSelectionPrompt(rawPrompt);
  const sections: string[] = [];

  if (parsed.question) {
    sections.push(`## Question\n\n${parsed.question}`);
  }

  if (parsed.selectionType === 'text' && parsed.selectedExcerpt) {
    sections.push(
      `## Selected Text${parsed.pageNumber ? ` (Page ${parsed.pageNumber})` : ''}\n\n> ${parsed.selectedExcerpt}`
    );
  } else if (parsed.selectionType === 'image') {
    sections.push(
      `## Selected Visual${parsed.pageNumber ? ` (Page ${parsed.pageNumber})` : ''}\n\nA visual region from the document was selected for this answer.`
    );
  }

  sections.push(`## Answer\n\n${answer.trim()}`);

  const dedupedSources = [...new Map(
    (sources || [])
      .map((source) => {
        const meta = source?.metadata || {};
        const title = meta.document_title || meta.title || 'Source';
        const page = meta.page_number || meta.page || (Array.isArray(meta.page_numbers) ? meta.page_numbers[0] : null);
        const key = `${title}-${page || ''}`;
        return [
          key,
          `- ${title}${page ? ` (Page ${page})` : ''}`,
        ] as const;
      })
  ).values()];

  if (dedupedSources.length > 0) {
    sections.push(`## Sources\n\n${dedupedSources.join('\n')}`);
  }

  return sections.join('\n\n');
}

export function buildGeneratedQuizFocusContext(answer: string, rawPrompt?: string | null) {
  const parsed = parseSelectionPrompt(rawPrompt);
  const sections: string[] = [];

  if (parsed.question) {
    sections.push(`User question: ${parsed.question}`);
  }

  if (parsed.selectionType === 'text' && parsed.selectedExcerpt) {
    sections.push(
      `Selected text${parsed.pageNumber ? ` from page ${parsed.pageNumber}` : ''}: ${parsed.selectedExcerpt}`
    );
  } else if (parsed.selectionType === 'image') {
    sections.push(
      `Selected visual region${parsed.pageNumber ? ` from page ${parsed.pageNumber}` : ''}.`
    );
  }

  sections.push(`Reference answer:\n${answer.trim()}`);
  return sections.join('\n\n');
}

export function formatArtifactDisplayTitle(rawTitle?: string | null) {
  const title = normalizeWhitespace(rawTitle || '');
  if (!title) return '';

  if (/^AI Note:\s*Question:\s*/i.test(title)) {
    return title.replace(/^AI Note:\s*Question:\s*/i, 'AI Note: ');
  }

  if (/^AI Note:\s*Regarding the selected text from Page\s+\d+/i.test(title)) {
    const parsed = parseSelectionPrompt(title.replace(/^AI Note:\s*/i, ''));
    if (parsed.pageNumber) {
      return `AI Note: Page ${parsed.pageNumber} Explanation`;
    }
  }

  if (/^Quiz:\s*Regarding the selected text from Page\s+\d+/i.test(title)) {
    const parsed = parseSelectionPrompt(title.replace(/^Quiz:\s*/i, ''));
    if (parsed.pageNumber) {
      return `Page ${parsed.pageNumber} Review Quiz`;
    }
  }

  return title;
}

export function isEditableStudyNote(noteType?: string | null, contentFormat?: string | null) {
  return noteType === 'study' && contentFormat !== 'markdown';
}

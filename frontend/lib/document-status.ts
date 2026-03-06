import type { Document } from './types';

function getMetadata(doc?: Document | null) {
  return (doc?.doc_metadata ?? {}) as Record<string, any>;
}

export function isDocumentFailed(doc?: Document | null) {
  return doc?.processing_status?.toLowerCase() === 'failed';
}

export function isDocumentReadyForGeneration(doc?: Document | null) {
  if (!doc || isDocumentFailed(doc)) {
    return false;
  }

  const metadata = getMetadata(doc);

  if (metadata.ready_for_generation === true) {
    return true;
  }

  if (typeof doc.extracted_text === 'string' && doc.extracted_text.trim().length > 0) {
    return true;
  }

  return doc.processing_status?.toLowerCase() === 'completed' && metadata.indexed !== false;
}

export function getDocumentStage(doc?: Document | null) {
  const metadata = getMetadata(doc);
  return String(metadata.processing_stage || doc?.processing_status || 'pending').toLowerCase();
}

export function getDocumentStatusDescription(doc?: Document | null) {
  if (!doc) {
    return '';
  }

  const metadata = getMetadata(doc);

  if (isDocumentFailed(doc)) {
    return metadata.error || metadata.note || 'Document processing failed.';
  }

  if (isDocumentReadyForGeneration(doc) && metadata.enrichment_status === 'processing') {
    return 'Ready for notes, summaries, quizzes, and chat. Final concept analysis is still running.';
  }

  switch (getDocumentStage(doc)) {
    case 'extracting':
      return 'Extracting text and indexing the document.';
    case 'enriching':
      return 'Finishing concept analysis and timeline updates.';
    case 'processing':
      return 'Processing document.';
    case 'completed':
      return 'Document is ready to use.';
    default:
      return 'Preparing document.';
  }
}

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const past = new Date(date);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks > 1 ? 's' : ''} ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} year${diffInYears > 1 ? 's' : ''} ago`;
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function getFileTypeIcon(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();

  const iconMap: Record<string, string> = {
    // Documents
    pdf: 'FileText',
    doc: 'FileText',
    docx: 'FileText',
    txt: 'FileText',
    md: 'FileText',

    // Spreadsheets
    xls: 'Sheet',
    xlsx: 'Sheet',
    csv: 'Sheet',

    // Presentations
    ppt: 'Presentation',
    pptx: 'Presentation',

    // Images
    jpg: 'Image',
    jpeg: 'Image',
    png: 'Image',
    gif: 'Image',
    svg: 'Image',

    // Videos
    mp4: 'Video',
    avi: 'Video',
    mov: 'Video',

    // Archives
    zip: 'Archive',
    rar: 'Archive',
    '7z': 'Archive',
  };

  return iconMap[extension || ''] || 'File';
}

export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

export function getDifficultyBadgeClass(difficulty: string): string {
  const normalized = difficulty.toLowerCase();
  const classes: Record<string, string> = {
    easy: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]',
    medium: 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]',
    hard: 'bg-[var(--error-bg)] text-[var(--error)] border-[var(--error-border)]',
  };
  return classes[normalized] || 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border-[var(--card-border)]';
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-[var(--success)]';
  if (score >= 60) return 'text-[var(--warning)]';
  return 'text-[var(--error)]';
}

export function getScoreBadgeClass(score: number): string {
  if (score >= 80) return 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success-border)]';
  if (score >= 60) return 'bg-[var(--warning-bg)] text-[var(--warning)] border-[var(--warning-border)]';
  return 'bg-[var(--error-bg)] text-[var(--error)] border-[var(--error-border)]';
}

export function extractTextFromBlockNote(jsonStr: string): string {
  try {
    const blocks = JSON.parse(jsonStr);
    return blocks
      .map((block: any) => {
        if (typeof block.content === 'string') return block.content;
        if (Array.isArray(block.content)) {
          return block.content.map((c: any) => c.text || '').join('');
        }
        return '';
      })
      .filter(Boolean)
      .join(' ');
  } catch {
    return jsonStr.substring(0, 200);
  }
}

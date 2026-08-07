import { formatFileSize } from '@/lib/units';

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Photos and documents only: no executables or archives in a medical record. */
export const ALLOWED_ATTACHMENT_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/heic': 'HEIC',
};

export interface AttachmentInput {
  name: string;
  sizeBytes: number;
  mimeType: string;
}

/** The first rule a file breaks, as a sentence, or null when it's fine. */
export function attachmentProblem(file: AttachmentInput): string | null {
  if (!(file.mimeType in ALLOWED_ATTACHMENT_TYPES)) {
    return `${file.name} isn’t a PDF or photo, so it can’t be attached.`;
  }
  if (file.sizeBytes > MAX_ATTACHMENT_BYTES) {
    return `${file.name} is ${formatFileSize(file.sizeBytes)}. Files can be up to ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`;
  }
  if (file.sizeBytes === 0) return `${file.name} is empty.`;
  return null;
}

/**
 * Adds files to an existing selection, skipping duplicates (same name and size)
 * and anything that breaks the rules or goes past the limit.
 */
export function addAttachments<T extends AttachmentInput>(
  current: T[],
  incoming: T[],
): { files: T[]; problems: string[] } {
  const files = [...current];
  const problems: string[] = [];
  for (const file of incoming) {
    if (files.some((f) => f.name === file.name && f.sizeBytes === file.sizeBytes)) continue;
    const problem = attachmentProblem(file);
    if (problem) {
      problems.push(problem);
      continue;
    }
    if (files.length >= MAX_ATTACHMENTS) {
      problems.push(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      break;
    }
    files.push(file);
  }
  return { files, problems };
}

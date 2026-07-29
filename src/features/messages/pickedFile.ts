import type { AttachmentInput } from '@/domain/attachments';

/** A file chosen in the browser, with a key for the list. Only its details are sent. */
export interface PickedFile extends AttachmentInput {
  key: string;
}

/** Strips the UI-only key before sending. */
export function toAttachmentInputs(files: PickedFile[]): AttachmentInput[] {
  return files.map(({ name, sizeBytes, mimeType }) => ({ name, sizeBytes, mimeType }));
}

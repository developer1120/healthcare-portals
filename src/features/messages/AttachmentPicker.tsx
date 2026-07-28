import { useId, useRef, useState } from 'react';
import { IconFileText, IconPaperclip, IconPhoto, IconX } from '@tabler/icons-react';
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, addAttachments } from '@/domain/attachments';
import { formatFileSize } from '@/lib/units';
import { Button, IconButton } from '@/ui';
import type { PickedFile } from './pickedFile';

const extensionTypes: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
};

/** Some systems leave File.type empty (HEIC on Windows); fall back to the extension. */
function mimeTypeOf(file: File): string {
  return file.type || extensionTypes[file.name.split('.').pop()?.toLowerCase() ?? ''] || '';
}

const accept = [...Object.keys(ALLOWED_ATTACHMENT_TYPES), '.pdf', '.jpg', '.jpeg', '.png', '.heic'].join(',');

/** "Attach files" button with the chosen files listed underneath, each removable. */
export function AttachmentPicker({ files, onChange }: { files: PickedFile[]; onChange: (files: PickedFile[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const hintId = useId();

  function onPick(list: FileList | null) {
    const incoming = [...(list ?? [])].map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      sizeBytes: file.size,
      mimeType: mimeTypeOf(file),
    }));
    const result = addAttachments(files, incoming);
    setProblems(result.problems);
    onChange(result.files);
    // Allow picking the same file again after removing it.
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        aria-label="Choose files to attach"
        aria-describedby={hintId}
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => onPick(event.target.files)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" icon={IconPaperclip} onClick={() => inputRef.current?.click()}>
          Attach files
        </Button>
        <p id={hintId} className="text-xs text-ink-muted">
          PDFs or photos, up to {MAX_ATTACHMENTS} files of {formatFileSize(MAX_ATTACHMENT_BYTES)} each.
        </p>
      </div>
      {files.length > 0 && (
        <ul aria-label="Attached files" className="flex flex-wrap gap-2">
          {files.map((file) => {
            const FileIcon = file.mimeType === 'application/pdf' ? IconFileText : IconPhoto;
            return (
              <li
                key={file.key}
                className="inline-flex items-center gap-2 rounded-control border border-line bg-surface py-1 pr-1 pl-2.5 text-xs"
              >
                <FileIcon aria-hidden size={15} />
                <span className="max-w-48 truncate">{file.name}</span>
                <span className="text-ink-muted">{formatFileSize(file.sizeBytes)}</span>
                <IconButton
                  icon={IconX}
                  label={`Remove ${file.name}`}
                  variant="ghost"
                  size="sm"
                  className="size-6"
                  onClick={() => onChange(files.filter((f) => f.key !== file.key))}
                />
              </li>
            );
          })}
        </ul>
      )}
      {problems.length > 0 && (
        <ul role="alert" className="flex flex-col gap-0.5 text-xs font-medium text-critical">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

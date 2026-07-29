import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { format, isSameDay } from 'date-fns';
import { IconArchive, IconArrowLeft, IconInbox, IconPaperclip, IconSend } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { useClinicians, useMarkThreadRead, useReply, useSetThreadArchived, useThreads } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { clinicianSubtitle } from '@/domain/clinicians';
import { MESSAGE_MAX, REPLY_WITHIN_BUSINESS_DAYS, categoryLabels, isUnread } from '@/domain/messages';
import type { Clinician, Message, MessageThread } from '@/domain/types';
import { formatTime, toDate } from '@/lib/dates';
import { formatFileSize } from '@/lib/units';
import { Button, Card, Skeleton, Textarea, cx } from '@/ui';
import { AttachmentPicker } from './AttachmentPicker';
import { EmergencyNotice } from './EmergencyNotice';
import { toAttachmentInputs } from './pickedFile';
import type { PickedFile } from './pickedFile';

function MessageBubble({ message, mine, author }: { message: Message; mine: boolean; author?: Clinician }) {
  return (
    <li className={cx('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
      <span className="text-xs text-ink-muted">
        {mine ? 'You' : (author?.name ?? 'Care team')}
        {!mine && author && ` · ${clinicianSubtitle(author)}`} · {formatTime(message.sentAt)}
      </span>
      <div
        className={cx(
          'max-w-[85%] rounded-[16px] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap sm:max-w-[75%]',
          mine ? 'rounded-br-[6px] bg-rail text-white' : 'rounded-bl-[6px] border border-line bg-surface',
        )}
      >
        {message.body}
      </div>
      {message.attachments.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {message.attachments.map((file) => (
            <li
              key={file.id}
              className="inline-flex items-center gap-1.5 rounded-control bg-surface-sunken px-2.5 py-1 text-xs"
            >
              <IconPaperclip aria-hidden size={14} />
              {file.name}
              <span className="text-ink-muted">{formatFileSize(file.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ReplyBox({ thread, recipient }: { thread: MessageThread; recipient?: Clinician }) {
  const reply = useReply(thread.patientId);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string>();
  const fieldId = useId();

  function send() {
    if (!body.trim()) {
      setError('Write a message before sending.');
      return;
    }
    reply.mutate(
      { threadId: thread.id, body, attachments: toAttachmentInputs(files) },
      {
        onSuccess: () => {
          setBody('');
          setFiles([]);
        },
      },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+Enter or Cmd+Enter sends; plain Enter makes a new line.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="flex flex-col gap-2 border-t border-line pt-4"
    >
      <label htmlFor={fieldId} className="text-sm font-medium">
        Reply to {recipient?.name ?? 'your care team'}
      </label>
      <Textarea
        id={fieldId}
        rows={3}
        maxLength={MESSAGE_MAX}
        value={body}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${fieldId}-hint`}
        onKeyDown={onKeyDown}
        onChange={(event) => {
          setBody(event.target.value);
          setError(undefined);
        }}
      />
      {error && (
        <p role="alert" className="text-xs font-medium text-critical">
          {error}
        </p>
      )}
      <EmergencyNotice text={body} />
      <AttachmentPicker files={files} onChange={setFiles} />

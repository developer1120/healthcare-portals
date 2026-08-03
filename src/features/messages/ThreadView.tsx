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
      {reply.isError && (
        <p role="alert" className="rounded-control bg-critical-soft px-3 py-2 text-sm text-critical-ink">
          {errorMessage(reply.error)} Your message is still here.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id={`${fieldId}-hint`} className="text-xs text-ink-muted">
          Replies usually come within {REPLY_WITHIN_BUSINESS_DAYS} business days. For an emergency, call 911.
        </p>
        <Button type="submit" variant="primary" icon={IconSend} loading={reply.isPending}>
          Send
        </Button>
      </div>
    </form>
  );
}

function Thread({ thread, clinicians }: { thread: MessageThread; clinicians: Clinician[] }) {
  const markRead = useMarkThreadRead(thread.patientId);
  const archive = useSetThreadArchived(thread.patientId);
  const endRef = useRef<HTMLLIElement>(null);
  const location = useLocation();
  const recipient = clinicians.find((c) => c.id === thread.assigneeId);
  const unread = isUnread(thread);

  // Opening a thread reads it.
  useEffect(() => {
    if (unread) markRead.mutate(thread.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per thread, not per render of the mutation
  }, [thread.id, unread]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [thread.messages.length]);

  return (
    <Card className="flex min-h-0 flex-1 flex-col gap-4">
      {(location.state as { notice?: string } | null)?.notice === 'sent' && (
        <p role="status" className="rounded-control bg-ok-soft px-3 py-2 text-sm text-ok-ink">
          Message sent to {recipient?.name ?? 'your care team'}. Replies usually come within{' '}
          {REPLY_WITHIN_BUSINESS_DAYS} business days.
        </p>
      )}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <Link
            to={`/messages${location.search}`}
            className="mb-2 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink lg:hidden"
          >
            <IconArrowLeft aria-hidden size={16} /> All messages
          </Link>
          <h2 className="text-lg">{thread.subject}</h2>
          <p className="text-sm text-ink-muted">
            {categoryLabels[thread.category]} · With {recipient?.name ?? 'your care team'}
          </p>
        </div>
        <Button
          size="sm"
          icon={thread.archived ? IconInbox : IconArchive}
          loading={archive.isPending}
          onClick={() => archive.mutate({ threadId: thread.id, archived: !thread.archived })}
        >
          {thread.archived ? 'Move to inbox' : 'Archive'}
        </Button>
      </header>

      {/* Focusable so keyboard users can scroll a long conversation. */}
      <ol aria-label="Messages" tabIndex={0} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {thread.messages.map((message, index) => {
          const previous = thread.messages[index - 1];
          const newDay = !previous || !isSameDay(toDate(previous.sentAt), toDate(message.sentAt));
          return [
            newDay && (
              <li key={`day-${message.id}`} className="text-center text-xs font-medium text-ink-muted">
                {format(toDate(message.sentAt), 'EEEE d MMMM')}
              </li>
            ),
            <MessageBubble
              key={message.id}
              message={message}
              mine={message.authorId === thread.patientId}
              author={clinicians.find((c) => c.id === message.authorId)}
            />,
          ];
        })}
        {/* Scroll target for the newest message; hidden from assistive tech. */}
        <li ref={endRef} aria-hidden="true" />
      </ol>

      <ReplyBox thread={thread} recipient={recipient} />
    </Card>
  );
}

export function ThreadView() {
  const { threadId } = useParams();
  const patientId = usePatientId();
  const threads = useThreads(patientId);
  const clinicians = useClinicians();

  return (
    <QueryState query={threads} label="this conversation" loading={<Skeleton className="h-96 flex-1 rounded-card" />}>
      {(list) => {
        const thread = list.find((t) => t.id === threadId);
        if (!thread) {
          return (
            <Card tone="sunken" className="text-sm text-ink-muted">
              We couldn't find that conversation. It may have been removed.
            </Card>
          );
        }
        return <Thread key={thread.id} thread={thread} clinicians={clinicians.data ?? []} />;
      }}
    </QueryState>
  );
}

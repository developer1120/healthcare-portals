import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { IconAlertTriangle, IconArrowLeft, IconCircleCheck, IconPhone, IconSend } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import {
  useClinicInbox,
  useClinicReply,
  useClinicians,
  useCloseThread,
  useMarkInboxRead,
  useReassignThread,
} from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { useClinicianId } from '@/auth/session';
import { MESSAGE_MAX, categoryLabels } from '@/domain/messages';
import { routeMessage } from '@/domain/messageRouting';
import { assessRisk, riskLevelDisplay } from '@/domain/risk';
import { isUnreadForClinician, quickReplies, triageDisplay, triageThread } from '@/domain/triage';
import type { InboxItem } from '@/domain/triage';
import type { Clinician } from '@/domain/types';
import { ageOn, formatDay, formatTime } from '@/lib/dates';
import { useNow } from '@/lib/useNow';
import { Button, Card, Field, Select, Skeleton, StatusDot, Textarea, cx } from '@/ui';

function ReplyBox({ item, clinicianId }: { item: InboxItem; clinicianId: string }) {
  const reply = useClinicReply(clinicianId);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string>();
  const fieldId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const firstName = item.snapshot.patient.preferredName ?? item.snapshot.patient.firstName;

  function send() {
    if (!body.trim()) {
      setError('Write a reply before sending.');
      return;
    }
    reply.mutate({ threadId: item.thread.id, body }, { onSuccess: () => setBody('') });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
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
        Reply to {firstName}
      </label>
      <div role="group" aria-label="Quick replies" className="flex flex-wrap gap-1.5">
        {quickReplies.map((quick) => (
          <button
            key={quick.label}
            type="button"
            onClick={() => {
              setBody((current) => (current.trim() ? `${current.trimEnd()}\n\n${quick.body}` : quick.body));
              setError(undefined);
              textarea.current?.focus();
            }}
            className="h-7 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
          >
            {quick.label}
          </button>
        ))}
      </div>
      <Textarea
        ref={textarea}
        id={fieldId}
        rows={4}
        maxLength={MESSAGE_MAX}
        value={body}
        aria-invalid={error ? true : undefined}
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
      {reply.isError && (
        <p role="alert" className="rounded-control bg-critical-soft px-3 py-2 text-sm text-critical-ink">
          {errorMessage(reply.error)} Your reply is still here.
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-muted">Ctrl+Enter to send. The patient is notified by email.</p>
        <Button type="submit" variant="primary" icon={IconSend} loading={reply.isPending}>
          Send reply
        </Button>
      </div>
    </form>
  );
}

function Reassign({ item, clinicianId, clinicians }: { item: InboxItem; clinicianId: string; clinicians: Clinician[] }) {
  const reassign = useReassignThread(clinicianId);
  const options = routeMessage(item.thread.category, item.snapshot.patient, clinicians).options;
  return (
    <Field label="Assigned to" error={reassign.isError ? errorMessage(reassign.error) : undefined} className="w-56">
      <Select
        value={item.thread.assigneeId}
        disabled={reassign.isPending}
        onChange={(event) => reassign.mutate({ threadId: item.thread.id, assigneeId: event.target.value })}
        options={options.map((c) => ({ value: c.id, label: c.id === clinicianId ? `${c.name} (you)` : c.name }))}
      />
    </Field>
  );
}

function Conversation({ item, clinicianId, clinicians }: { item: InboxItem; clinicianId: string; clinicians: Clinician[] }) {
  const now = useNow(60_000);
  const markRead = useMarkInboxRead(clinicianId);
  const close = useCloseThread(clinicianId);
  const { thread, snapshot } = item;
  const { patient } = snapshot;
  const triage = triageThread(item, now);
  const level = triageDisplay[triage.level];
  const risk = riskLevelDisplay[assessRisk(snapshot, now).level];
  const name = `${patient.preferredName ?? patient.firstName} ${patient.lastName}`;
  const unread = isUnreadForClinician(thread);
  const { mutate: markThreadRead } = markRead;

  useEffect(() => {
    if (unread) markThreadRead(thread.id);
  }, [unread, thread.id, markThreadRead]);

  const authorName = (authorId: string) =>
    authorId === patient.id ? name : authorId === clinicianId ? 'You' : (clinicians.find((c) => c.id === authorId)?.name ?? 'Care team');

  return (
    <Card padded={false} className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg">{thread.subject}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-muted">
              <Link to={`/clinic/patients/${patient.id}`} className="font-medium text-ink hover:underline">
                {name}
              </Link>
              <span className="tabular">
                {ageOn(patient.dateOfBirth, now)} · {patient.mrn}
              </span>
              <StatusDot tone={risk.tone}>{risk.label} risk</StatusDot>
              <span>· {categoryLabels[thread.category]}</span>
            </p>
          </div>
          <Reassign item={item} clinicianId={clinicianId} clinicians={clinicians} />
        </div>
        {triage.needsReply && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <StatusDot tone={level.tone}>
              <span className="font-semibold">{level.label}</span>
            </StatusDot>
            {triage.reasons.map((reason) => (
              <span key={reason} className="text-ink-muted">
                {reason}
              </span>
            ))}
            {triage.level !== 'emergency' && (
              <Button
                size="sm"
                variant="ghost"
                icon={IconCircleCheck}
                className="ml-auto"
                loading={close.isPending}
                onClick={() => close.mutate(thread.id)}
              >
                No reply needed
              </Button>
            )}
          </div>
        )}
        {triage.needsReply && triage.level === 'emergency' && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-control border border-critical/40 bg-critical-soft px-3 py-2.5 text-sm text-critical-ink"
          >
            <IconAlertTriangle aria-hidden size={18} className="mt-px shrink-0" />
            <p>
              This message suggests an emergency. Call the patient now rather than replying here:{' '}
              <a href={`tel:${patient.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 font-semibold underline">
                <IconPhone aria-hidden size={14} />
                {patient.phone}
              </a>
              .
            </p>
          </div>
        )}
      </header>
      {/* Focusable so keyboard users can scroll a long conversation. */}
      <ol aria-label="Messages" tabIndex={0} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
        {thread.messages.map((message) => {
          const mine = message.authorId === clinicianId;
          const fromPatient = message.authorId === patient.id;
          return (
            <li key={message.id} className={cx('flex flex-col gap-1', fromPatient ? 'items-start' : 'items-end')}>
              <span className="text-xs text-ink-muted">
                {authorName(message.authorId)} · {formatDay(message.sentAt, now)}, {formatTime(message.sentAt)}
              </span>
              <div
                className={cx(
                  'max-w-[85%] rounded-[16px] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap sm:max-w-[75%]',
                  fromPatient
                    ? 'rounded-bl-[6px] border border-line bg-surface'
                    : cx('rounded-br-[6px]', mine ? 'bg-rail text-white' : 'bg-surface-sunken'),
                )}
              >
                {message.body}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="px-4 pb-4 sm:px-5">
        <ReplyBox key={thread.id} item={item} clinicianId={clinicianId} />
      </div>
    </Card>
  );
}

export function InboxThread() {
  const { threadId } = useParams();
  const location = useLocation();
  const clinicianId = useClinicianId();
  const inbox = useClinicInbox(clinicianId);
  const clinicians = useClinicians();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Link
        to={`/clinic/inbox${location.search}`}
        className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-ink-muted hover:text-ink lg:hidden"
      >
        <IconArrowLeft aria-hidden size={16} />
        Inbox
      </Link>
      <QueryState query={inbox} label="this conversation" loading={<Skeleton className="h-96 rounded-card" />}>
        {(items) => {
          const item = items.find((i) => i.thread.id === threadId);
          if (!item) {
            return (
              <Card title="Conversation not found" tone="sunken">
                <p className="text-sm text-ink-muted">It may belong to a patient who isn’t on your care team.</p>
              </Card>
            );
          }
          return <Conversation item={item} clinicianId={clinicianId} clinicians={clinicians.data ?? []} />;
        }}
      </QueryState>
    </div>
  );
}

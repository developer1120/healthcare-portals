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

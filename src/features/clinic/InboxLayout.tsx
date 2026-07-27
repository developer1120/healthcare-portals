import { Suspense } from 'react';
import { Link, Outlet, useParams, useSearchParams } from 'react-router';
import { IconInbox } from '@tabler/icons-react';
import { useClinicInbox, useClinicians } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { useClinicianId } from '@/auth/session';
import { lastMessage } from '@/domain/messages';
import { filterInbox, isUnreadForClinician, sortInbox, triageDisplay } from '@/domain/triage';
import type { InboxScope, InboxStatus, TriagedItem } from '@/domain/triage';
import { relativeTime } from '@/lib/dates';
import { useNow } from '@/lib/useNow';
import { PaneSkeleton } from '@/shell/PageSkeleton';
import { SegmentedControl, Skeleton, StatusDot, cx } from '@/ui';

function InboxRow({
  item,
  selected,
  search,
  now,
  assignee,
}: {
  item: TriagedItem;
  selected: boolean;
  search: string;
  now: Date;
  assignee?: string;
}) {
  const { thread, snapshot, triage } = item;
  const unread = isUnreadForClinician(thread);
  const latest = lastMessage(thread);
  const display = triageDisplay[triage.level];
  const name = `${snapshot.patient.preferredName ?? snapshot.patient.firstName} ${snapshot.patient.lastName}`;

  return (
    <li>
      <Link
        to={`/clinic/inbox/${thread.id}${search}`}
        aria-current={selected ? 'page' : undefined}
        className={cx(
          'flex flex-col gap-1 rounded-card border px-4 py-3 text-sm transition-colors',
          selected ? 'border-ink bg-surface' : 'border-line bg-surface hover:border-line-strong',
          triage.level === 'emergency' && triage.needsReply && 'border-critical/60',
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className={cx('truncate', unread ? 'font-semibold text-ink' : 'font-medium')}>
            {unread && <span className="sr-only">Unread: </span>}
            {name}
          </span>
          <span className="shrink-0 text-xs text-ink-muted">{latest && relativeTime(latest.sentAt, now)}</span>
        </span>
        <span className={cx('truncate', unread ? 'text-ink' : 'text-ink-muted')}>{thread.subject}</span>
        <span className="truncate text-xs text-ink-muted">{latest?.body}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {triage.needsReply ? (
            <StatusDot tone={display.tone}>{display.label}</StatusDot>
          ) : (
            <StatusDot tone="ok">Replied</StatusDot>
          )}
          {triage.reasons.map((reason) => (
            <span key={reason} className={reason === 'Overdue' ? 'font-medium text-critical-ink' : 'text-ink-muted'}>
              {reason}
            </span>
          ))}
          {assignee && <span className="text-ink-muted">→ {assignee}</span>}
        </span>
      </Link>
    </li>
  );
}

/** Triage list beside the open conversation; one pane at a time on narrow screens. */
export function InboxLayout() {
  const { threadId } = useParams();
  const clinicianId = useClinicianId();
  const inbox = useClinicInbox(clinicianId);
  const clinicians = useClinicians();
  const now = useNow(60_000);
  const [params, setParams] = useSearchParams();
  const scope: InboxScope = params.get('scope') === 'team' ? 'team' : 'mine';
  const status: InboxStatus = params.get('status') === 'all' ? 'all' : 'needs-reply';
  const search = params.toString() ? `?${params}` : '';

  function update(key: string, value: string | undefined) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div className="grid gap-5 lg:h-[calc(100dvh-9.5rem)] lg:grid-cols-[24rem_minmax(0,1fr)]">
      <section
        aria-label="Conversations"
        className={cx('min-h-0 min-w-0 flex-col gap-3', threadId ? 'hidden lg:flex' : 'flex')}
      >
        <div className="flex flex-wrap gap-2">
          <SegmentedControl<InboxScope>
            label="Whose messages"
            size="sm"
            value={scope}
            onChange={(next) => update('scope', next === 'team' ? next : undefined)}
            options={[
              { value: 'mine', label: 'Assigned to me' },
              { value: 'team', label: 'Care team' },
            ]}
          />
          <SegmentedControl<InboxStatus>
            label="Which messages"
            size="sm"
            value={status}
            onChange={(next) => update('status', next === 'all' ? next : undefined)}
            options={[
              { value: 'needs-reply', label: 'Needs reply' },
              { value: 'all', label: 'All' },
            ]}
          />
        </div>
        <QueryState
          query={inbox}
          label="your inbox"
          loading={
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-24 rounded-card" />
              ))}
            </div>
          }
        >
          {(items) => {
            const shown = filterInbox(sortInbox(items, now), { scope, status }, clinicianId);
            return shown.length === 0 ? (
              <p className="rounded-card border border-dashed border-line-strong p-6 text-center text-sm text-ink-muted">
                {status === 'needs-reply' ? 'Nothing waiting for a reply.' : 'No conversations.'}
              </p>
            ) : (
              <ol aria-label="Messages by priority" className="-mr-1 flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
                {shown.map((item) => (
                  <InboxRow
                    key={item.thread.id}
                    item={item}
                    selected={item.thread.id === threadId}
                    search={search}
                    now={now}
                    assignee={
                      item.thread.assigneeId === clinicianId
                        ? undefined
                        : clinicians.data?.find((c) => c.id === item.thread.assigneeId)?.name
                    }
                  />
                ))}
              </ol>
            );
          }}
        </QueryState>
      </section>
      <div className={cx('min-h-0 min-w-0 flex-col', threadId ? 'flex' : 'hidden lg:flex')}>
        <Suspense fallback={<PaneSkeleton />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}

export function NoInboxThreadSelected() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong p-8 text-center text-sm text-ink-muted">
      <IconInbox aria-hidden size={28} stroke={1.5} />
      Choose a conversation. The most urgent are at the top.
    </div>
  );
}

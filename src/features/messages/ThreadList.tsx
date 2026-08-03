import { IconPencilPlus } from '@tabler/icons-react';
import { Link, useSearchParams } from 'react-router';
import { useClinicians, useThreads } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { categoryLabels, filterThreads, isUnread, lastMessage, unreadCount } from '@/domain/messages';
import type { InboxView } from '@/domain/messages';
import type { Clinician, MessageThread } from '@/domain/types';
import { relativeTime } from '@/lib/dates';
import { Avatar, ButtonLink, Field, Input, SegmentedControl, Skeleton, cx } from '@/ui';

function ThreadItem({
  thread,
  clinician,
  selected,
  search,
}: {
  thread: MessageThread;
  clinician?: Clinician;
  selected: boolean;
  search: string;
}) {
  const latest = lastMessage(thread)!;
  const unread = isUnread(thread);
  const fromPatient = latest.authorId === thread.patientId;

  return (
    <li>
      <Link
        to={`/messages/${thread.id}${search}`}
        aria-current={selected ? 'page' : undefined}
        className={cx(
          'flex gap-3 rounded-card border p-3 transition-colors',
          selected ? 'border-ink bg-surface' : 'border-transparent hover:border-line hover:bg-surface',
        )}
      >
        <Avatar name={clinician?.name ?? 'Care team'} size="sm" decorative />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cx('truncate text-sm', unread ? 'font-semibold text-ink' : 'font-medium')}>
              {thread.subject}
            </span>
            <span className="shrink-0 text-2xs text-ink-muted">{relativeTime(latest.sentAt)}</span>
          </span>
          <span className="block truncate text-xs text-ink-muted">
            {clinician?.name ?? 'Care team'} · {categoryLabels[thread.category]}
          </span>
          <span className={cx('mt-0.5 line-clamp-2 text-sm', unread ? 'text-ink' : 'text-ink-muted')}>
            {fromPatient && 'You: '}
            {latest.body}
          </span>
        </span>
        {unread && (
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent">
            <span className="sr-only">Unread</span>
          </span>
        )}
      </Link>
    </li>
  );
}

/** Searchable list of conversations, split into inbox, unread and archived. */
export function ThreadList({ patientId, selectedId }: { patientId: string; selectedId?: string }) {
  const [params, setParams] = useSearchParams();
  const threads = useThreads(patientId);
  const clinicians = useClinicians();
  const view = (['unread', 'archived'].includes(params.get('view') ?? '') ? params.get('view') : 'inbox') as InboxView;
  const query = params.get('q') ?? '';
  const search = params.toString() ? `?${params}` : '';

  function update(key: string, value: string) {
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
    <section aria-label="Conversations" className="flex min-h-0 flex-1 flex-col gap-3">
      <QueryState
        query={threads}
        label="your messages"
        loading={
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-card" />
            ))}
          </div>
        }
      >
        {(list) => {
          const shown = filterThreads(list, view, query, clinicians.data);
          const unread = unreadCount(list);
          return (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SegmentedControl<InboxView>
                  label="Show"
                  size="sm"
                  value={view}
                  onChange={(next) => update('view', next === 'inbox' ? '' : next)}
                  options={[
                    { value: 'inbox', label: 'Inbox' },
                    { value: 'unread', label: unread ? `Unread (${unread})` : 'Unread' },
                    { value: 'archived', label: 'Archived' },
                  ]}
                />
                <ButtonLink to="/messages/new" variant="primary" size="sm" icon={IconPencilPlus}>
                  New message
                </ButtonLink>
              </div>
              <Field label="Search messages" hideLabel>
                <Input
                  type="search"
                  placeholder="Subject, words or clinician"
                  value={query}
                  onChange={(event) => update('q', event.target.value)}
                />
              </Field>
              {shown.length === 0 ? (
                <p className="rounded-card bg-surface-sunken p-4 text-sm text-ink-muted">
                  {query
                    ? 'No conversations match your search.'
                    : view === 'unread'
                      ? 'You’re all caught up.'
                      : view === 'archived'
                        ? 'Archived conversations will appear here.'
                        : 'Messages from your care team will appear here.'}
                </p>
              ) : (
                <ul className="-mx-1 flex min-h-0 flex-col gap-1 overflow-y-auto px-1">
                  {shown.map((thread) => (
                    <ThreadItem
                      key={thread.id}
                      thread={thread}
                      clinician={clinicians.data?.find((c) => c.id === thread.assigneeId)}
                      selected={thread.id === selectedId}
                      search={search}
                    />
                  ))}
                </ul>
              )}
            </>
          );
        }}
      </QueryState>
    </section>
  );
}

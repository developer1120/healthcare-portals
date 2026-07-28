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

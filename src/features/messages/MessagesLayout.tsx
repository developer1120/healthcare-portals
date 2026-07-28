import { Suspense } from 'react';
import { Outlet, useMatch, useParams } from 'react-router';
import { IconMessages } from '@tabler/icons-react';
import { usePatientId } from '@/auth/session';
import { PaneSkeleton } from '@/shell/PageSkeleton';
import { cx } from '@/ui';
import { ThreadList } from './ThreadList';

/**
 * Two panes on wide screens (list beside the open conversation); one at a time
 * on narrow screens, where opening a conversation replaces the list.
 */
export function MessagesLayout() {
  const { threadId } = useParams();
  const composing = useMatch('/messages/new') !== null;
  // On narrow screens a thread or the compose form replaces the list.
  const detailOpen = Boolean(threadId) || composing;
  const patientId = usePatientId();

  return (
    <div className="grid gap-5 lg:h-[calc(100dvh-9.5rem)] lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className={cx('min-h-0 flex-col', detailOpen ? 'hidden lg:flex' : 'flex')}>
        <ThreadList patientId={patientId} selectedId={threadId} />
      </div>
      <div className={cx('min-h-0 flex-col', detailOpen ? 'flex' : 'hidden lg:flex')}>
        <Suspense fallback={<PaneSkeleton />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}

/** Right-hand pane before a conversation is chosen (wide screens only). */
export function NoThreadSelected() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong p-8 text-center text-sm text-ink-muted">
      <IconMessages aria-hidden size={28} stroke={1.5} />
      Choose a conversation to read it.
    </div>
  );
}

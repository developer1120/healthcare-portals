import { Link } from 'react-router';
import { IconX } from '@tabler/icons-react';
import type { NotificationWithState } from '@/domain/notifications';
import { relativeTime } from '@/lib/dates';
import { IconButton, cx } from '@/ui';
import { notificationIcons } from './notificationIcons';

interface NotificationItemProps {
  item: NotificationWithState;
  now: Date;
  onOpen: () => void;
  onDismiss?: () => void;
  compact?: boolean;
}

/** One notification: icon, title, detail and time, linking to where to act on it. */
export function NotificationItem({ item, now, onOpen, onDismiss, compact = false }: NotificationItemProps) {
  const ItemIcon = notificationIcons[item.kind];
  return (
    <li className="group relative">
      <Link
        to={item.href}
        onClick={onOpen}
        className={cx(
          'flex gap-3 rounded-control px-3 py-2.5 transition-colors hover:bg-surface-sunken',
          onDismiss && 'pr-11',
        )}
      >
        <span
          className={cx(
            'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[10px]',
            item.priority === 'high' ? 'bg-critical-soft text-critical-ink' : 'bg-surface-sunken text-ink-muted',
          )}
        >
          <ItemIcon aria-hidden size={17} stroke={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx('flex items-start justify-between gap-2 text-sm', item.read ? 'text-ink-muted' : 'font-semibold text-ink')}>
            <span>
              {!item.read && <span className="sr-only">Unread: </span>}
              {item.title}
            </span>
            {!item.read && <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />}
          </span>
          <span className={cx('block text-sm text-ink-muted', compact && 'truncate')}>{item.body}</span>
          <span className="block text-xs text-ink-muted">{relativeTime(item.at, now)}</span>
        </span>
      </Link>
      {onDismiss && (
        <IconButton
          icon={IconX}
          label={`Dismiss: ${item.title}`}
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="absolute top-2 right-2 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
        />
      )}
    </li>
  );
}

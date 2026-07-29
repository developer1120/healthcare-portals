import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconBell } from '@tabler/icons-react';
import { useMarkAllNotificationsRead, useMarkNotificationsRead, useNotifications } from '@/api/queries';
import { usePatientId } from '@/auth/session';
import { unreadNotifications } from '@/domain/notifications';
import { useNow } from '@/lib/useNow';
import { Button } from '@/ui';
import { NotificationItem } from './NotificationItem';

const SHOWN = 6;

/**
 * Bell in the top bar with the unread count. Opens a small panel of the latest
 * notifications; opening one marks it read. A disclosure, like the account menu.
 */
export function NotificationBell() {
  const patientId = usePatientId();
  const notifications = useNotifications(patientId);
  const markRead = useMarkNotificationsRead(patientId);
  const markAll = useMarkAllNotificationsRead(patientId);
  const now = useNow(60_000);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const items = notifications.data ?? [];
  const unread = unreadNotifications(items);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={() => setOpen((value) => !value)}
        className="relative flex size-10 items-center justify-center rounded-control border border-line bg-surface text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        <IconBell aria-hidden size={19} stroke={1.75} />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-semibold text-on-accent"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <section
          id={panelId}
          aria-label="Latest notifications"
          className="absolute top-full right-0 z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-2 shadow-[0_8px_24px_rgb(0_0_0/0.08)]"
        >
          <div className="flex items-center justify-between gap-2 px-3 pt-1 pb-2">
            <h2 className="text-sm">Notifications</h2>
            {unread > 0 && (
              <Button size="sm" variant="ghost" onClick={() => markAll.mutate()}>
                Mark all as read
              </Button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-muted">You’re all caught up.</p>
          ) : (
            <ul className="flex max-h-96 flex-col overflow-y-auto">
              {items.slice(0, SHOWN).map((item) => (
                <NotificationItem
                  key={item.id}
                  item={item}
                  now={now}
                  compact
                  onOpen={() => {
                    if (!item.read) markRead.mutate([item.id]);
                    setOpen(false);
                  }}
                />
              ))}
            </ul>
          )}
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-control px-3 py-2 text-center text-sm font-medium text-data-ink hover:bg-surface-sunken"
          >
            See all notifications
          </Link>
        </section>
      )}
    </div>
  );
}

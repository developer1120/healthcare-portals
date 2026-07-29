import { Link, useSearchParams } from 'react-router';
import { IconBellOff, IconSettings } from '@tabler/icons-react';
import { useDismissNotification, useMarkAllNotificationsRead, useMarkNotificationsRead, useNotifications } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { NOTIFICATION_WINDOW_DAYS, notificationGroup, unreadNotifications } from '@/domain/notifications';
import { useNow } from '@/lib/useNow';
import { Button, Card, SegmentedControl, Skeleton } from '@/ui';
import { NotificationItem } from './NotificationItem';

type Filter = 'all' | 'unread';
const groups = ['Today', 'Yesterday', 'Earlier'] as const;

export function NotificationsPage() {
  const patientId = usePatientId();
  const notifications = useNotifications(patientId);
  const markRead = useMarkNotificationsRead(patientId);
  const markAll = useMarkAllNotificationsRead(patientId);
  const dismiss = useDismissNotification(patientId);
  const now = useNow(60_000);
  const [params, setParams] = useSearchParams();
  const filter: Filter = params.get('show') === 'unread' ? 'unread' : 'all';

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <QueryState query={notifications} label="your notifications" loading={<Skeleton className="h-96 rounded-card" />}>
        {(items) => {
          const unread = unreadNotifications(items);
          const shown = filter === 'unread' ? items.filter((item) => !item.read) : items;
          return (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SegmentedControl<Filter>
                  label="Show"
                  value={filter}
                  onChange={(next) => setParams(next === 'unread' ? { show: next } : {}, { replace: true })}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'unread', label: unread ? `Unread ${unread}` : 'Unread' },
                  ]}
                />
                <div className="flex items-center gap-2">
                  {unread > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => markAll.mutate()}>
                      Mark all as read
                    </Button>
                  )}
                  <Link
                    to="/settings"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
                  >
                    <IconSettings aria-hidden size={16} />
                    Reminder settings
                  </Link>
                </div>
              </div>
              {shown.length === 0 ? (
                <Card tone="sunken">
                  <p className="flex items-center gap-2 text-sm text-ink-muted">
                    <IconBellOff aria-hidden size={18} />
                    {filter === 'unread' ? 'Nothing unread.' : 'No notifications in the last 30 days.'}
                  </p>
                </Card>
              ) : (
                groups.map((group) => {
                  const inGroup = shown.filter((item) => notificationGroup(item.at, now) === group);
                  if (inGroup.length === 0) return null;
                  return (
                    <Card key={group} title={group} padded={false} className="px-2 pt-4 pb-2 [&>header]:px-3">
                      <ul className="flex flex-col">
                        {inGroup.map((item) => (
                          <NotificationItem
                            key={item.id}
                            item={item}
                            now={now}
                            onOpen={() => {
                              if (!item.read) markRead.mutate([item.id]);
                            }}
                            onDismiss={() => dismiss.mutate(item.id)}
                          />
                        ))}
                      </ul>
                    </Card>
                  );
                })
              )}
              <p className="text-xs text-ink-muted">Showing the last {NOTIFICATION_WINDOW_DAYS} days.</p>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

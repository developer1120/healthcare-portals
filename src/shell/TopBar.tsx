import { IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand } from '@tabler/icons-react';
import { useRequiredSession } from '@/auth/session';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { formatLongDate } from '@/lib/dates';
import { WIDE_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { IconButton } from '@/ui';
import { AccountMenu } from './AccountMenu';
import { useLayoutStore } from './layoutStore';

/** The care panel button: shows or hides the column on wide screens, opens the drawer below that. */
function CarePanelToggle() {
  const wide = useMediaQuery(WIDE_QUERY);
  const carePanelOpen = useLayoutStore((state) => state.carePanelOpen);
  const toggleCarePanel = useLayoutStore((state) => state.toggleCarePanel);
  const setCareDrawerOpen = useLayoutStore((state) => state.setCareDrawerOpen);

  if (!wide) {
    return (
      <IconButton
        icon={IconLayoutSidebarRightExpand}
        label="Open care panel"
        aria-haspopup="dialog"
        onClick={() => setCareDrawerOpen(true)}
      />
    );
  }
  return (
    <IconButton
      icon={carePanelOpen ? IconLayoutSidebarRightCollapse : IconLayoutSidebarRightExpand}
      label={carePanelOpen ? 'Hide care panel' : 'Show care panel'}
      aria-pressed={carePanelOpen}
      aria-controls="care-panel"
      onClick={toggleCarePanel}
    />
  );
}

/** Page heading with today's date, plus the care panel, notification and account controls on the right. */
export function TopBar({ heading }: { heading: string }) {
  const { role } = useRequiredSession();

  return (
    <header className="flex items-end justify-between gap-3 px-4 pt-5 pb-4 sm:gap-4 sm:px-6 sm:pt-6 sm:pb-5 lg:px-8">
      <div className="min-w-0">
        <p className="text-xs text-ink-muted sm:text-sm">{formatLongDate(new Date())}</p>
        <h1 className="text-xl text-balance sm:truncate sm:text-2xl md:text-[1.75rem]">{heading}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2 print:hidden">
        {role === 'patient' && <CarePanelToggle />}
        {role === 'patient' && <NotificationBell />}
        <AccountMenu />
      </div>
    </header>
  );
}

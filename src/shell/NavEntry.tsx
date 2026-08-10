import { NavLink } from 'react-router';
import type { NavItem } from '@/app/navigation';
import { preloadPage } from '@/app/pages';
import { useClinicInbox, useClinicRequests, useThreads } from '@/api/queries';
import { useClinicianId, usePatientId } from '@/auth/session';
import { unreadCount } from '@/domain/messages';
import { waitingOnMe } from '@/domain/requests';
import { unreadForClinician } from '@/domain/triage';
import { cx } from '@/ui';

/** Where the link sits: the desktop icon rail, the phone bottom bar, or the bottom bar's "More" sheet. */
export type NavVariant = 'rail' | 'bar' | 'sheet';

interface NavItemLinkProps {
  item: NavItem;
  variant: NavVariant;
  count?: number;
  counting?: string;
  onNavigate?: () => void;
}

function CountBadge({ count, className }: { count: number; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] leading-none font-semibold text-on-accent',
        className,
      )}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}

function NavItemLink({ item, variant, count = 0, counting = 'unread', onNavigate }: NavItemLinkProps) {
  const { icon: ItemIcon } = item;
  // With a count, spell it out in one name ("Messages, 1 unread"); otherwise the visible label is the name.
  const name = variant === 'bar' ? (item.shortLabel ?? item.label) : item.label;
  const label = count > 0 ? `${name}, ${count} ${counting}` : undefined;
  // Start downloading the page as soon as someone shows interest in the link.
  const intent = { onPointerEnter: () => preloadPage(item.to), onFocus: () => preloadPage(item.to) };

  if (variant === 'rail') {
    return (
      <NavLink
        {...intent}
        to={item.to}
        end={item.end}
        aria-label={label}
        className={({ isActive }) =>
          cx(
            'group relative flex size-11 items-center justify-center rounded-[12px] transition-colors',
            isActive ? 'bg-rail-active text-white' : 'text-rail-ink hover:bg-rail-active/60 hover:text-white',
          )
        }
      >
        <ItemIcon aria-hidden size={21} stroke={1.75} />
        {count > 0 && <CountBadge count={count} className="absolute top-1 right-1" />}
        {/* The label is the link's accessible name and doubles as a hover/focus tooltip. */}
        <span
          className={cx(
            'pointer-events-none absolute left-full z-20 ml-3 rounded-[8px] bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-canvas',
            'opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        >
          {item.label}
        </span>
      </NavLink>
    );
  }

  if (variant === 'bar') {
    return (
      <NavLink
        {...intent}
        to={item.to}
        end={item.end}
        aria-label={label}
        onClick={onNavigate}
        className={({ isActive }) =>
          cx(
            'relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-[12px] px-1 text-[11px] font-medium transition-colors',
            isActive ? 'text-white' : 'text-rail-ink hover:text-white',
          )
        }
      >
        {({ isActive }) => (
          <>
            <span className={cx('flex h-7 w-12 items-center justify-center rounded-full', isActive && 'bg-rail-active')}>
              <ItemIcon aria-hidden size={21} stroke={1.75} />
            </span>
            <span className="max-w-full truncate">{name}</span>
            {count > 0 && <CountBadge count={count} className="absolute top-1 left-1/2 ml-2" />}
          </>
        )}
      </NavLink>
    );
  }

  return (
    <NavLink
      {...intent}
      to={item.to}
      end={item.end}
      aria-label={label}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          'flex h-12 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors',
          isActive ? 'bg-surface-sunken text-ink' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
        )
      }
    >
      <ItemIcon aria-hidden size={20} stroke={1.75} />
      <span className="flex-1">{item.label}</span>
      {count > 0 && <CountBadge count={count} className="" />}
    </NavLink>
  );
}

type EntryProps = Omit<NavItemLinkProps, 'count' | 'counting'>;

/** The Messages link with the patient's unread count. */
function UnreadMessagesEntry(props: EntryProps) {
  const threads = useThreads(usePatientId());
  return <NavItemLink {...props} count={threads.data ? unreadCount(threads.data) : 0} />;
}

/** The clinician's Inbox link, counting unopened patient messages assigned to them. */
function ClinicInboxEntry(props: EntryProps) {
  const clinicianId = useClinicianId();
  const inbox = useClinicInbox(clinicianId);
  return <NavItemLink {...props} count={inbox.data ? unreadForClinician(inbox.data, clinicianId) : 0} />;
}

/** The clinician's Requests link, counting refills and results waiting on them. */
function ClinicRequestsEntry(props: EntryProps) {
  const clinicianId = useClinicianId();
  const requests = useClinicRequests(clinicianId);
  return <NavItemLink {...props} count={requests.data ? waitingOnMe(requests.data, clinicianId) : 0} counting="waiting" />;
}

/** One navigation item with its live count badge, if it has one. */
export function NavEntry(props: EntryProps) {
  if (props.item.badge === 'unread-messages') return <UnreadMessagesEntry {...props} />;
  if (props.item.badge === 'clinic-inbox') return <ClinicInboxEntry {...props} />;
  if (props.item.badge === 'clinic-requests') return <ClinicRequestsEntry {...props} />;
  return <NavItemLink {...props} />;
}

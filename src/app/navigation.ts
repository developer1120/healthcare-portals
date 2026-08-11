import {
  IconCalendarEvent,
  IconCalendarStats,
  IconClipboardCheck,
  IconHeartRateMonitor,
  IconInbox,
  IconLayoutDashboard,
  IconMessage2,
  IconNotes,
  IconPill,
  IconReceipt2,
  IconSettings,
  IconTestPipe,
  IconUsers,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import type { Role } from '@/auth/types';

export interface NavItem {
  to: string;
  label: string;
  /** Shorter label for the phone bottom bar, where space is tight. */
  shortLabel?: string;
  icon: Icon;
  /** Only active on an exact match (needed for "/"). */
  end?: boolean;
  /** Show a count badge, e.g. unread messages. */
  badge?: 'unread-messages' | 'clinic-inbox' | 'clinic-requests';
}

/** Main sections of the patient portal, in rail order. */
export const patientNav: NavItem[] = [
  { to: '/', label: 'Home', icon: IconLayoutDashboard, end: true },
  { to: '/appointments', label: 'Appointments', shortLabel: 'Visits', icon: IconCalendarEvent },
  { to: '/messages', label: 'Messages', icon: IconMessage2, badge: 'unread-messages' },
  { to: '/results', label: 'Results', icon: IconTestPipe },
  { to: '/medications', label: 'Medications', icon: IconPill },
  { to: '/vitals', label: 'Vitals', icon: IconHeartRateMonitor },
  { to: '/records', label: 'Health record', icon: IconNotes },
  { to: '/billing', label: 'Billing', icon: IconReceipt2 },
];

/** Clinician workspace sections. */
export const clinicianNav: NavItem[] = [
  { to: '/clinic', label: 'Today', icon: IconCalendarStats, end: true },
  { to: '/clinic/patients', label: 'Patients', icon: IconUsers },
  { to: '/clinic/inbox', label: 'Inbox', icon: IconInbox, badge: 'clinic-inbox' },
  { to: '/clinic/requests', label: 'Requests', icon: IconClipboardCheck, badge: 'clinic-requests' },
];

/** Rail sections per role: main items, plus utilities pinned to the bottom. */
export const navFor: Record<Role, { main: NavItem[]; utility: NavItem[] }> = {
  patient: { main: patientNav, utility: [{ to: '/settings', label: 'Settings', icon: IconSettings }] },
  clinician: { main: clinicianNav, utility: [{ to: '/clinic/settings', label: 'Settings', icon: IconSettings }] },
};

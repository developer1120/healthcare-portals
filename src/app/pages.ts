import { lazyPage } from './lazyPage';
import type { LazyPage } from './lazyPage';

/**
 * Every page, split into its own chunk so the first load only fetches the shell
 * and the page being opened. Pages that live inside a layout (a conversation
 * inside Messages) are lazy too, with their own skeleton in that layout.
 */
export const pages = {
  // Patient portal
  dashboard: lazyPage(() => import('@/features/dashboard/DashboardPage').then((m) => m.DashboardPage), 'DashboardPage'),
  appointments: lazyPage(() => import('@/features/appointments/AppointmentsPage').then((m) => m.AppointmentsPage), 'AppointmentsPage'),
  booking: lazyPage(() => import('@/features/booking/BookingPage').then((m) => m.BookingPage), 'BookingPage'),
  appointment: lazyPage(
    () => import('@/features/appointments/AppointmentDetailPage').then((m) => m.AppointmentDetailPage),
    'AppointmentDetailPage',
  ),
  reschedule: lazyPage(() => import('@/features/appointments/ReschedulePage').then((m) => m.ReschedulePage), 'ReschedulePage'),
  checkIn: lazyPage(() => import('@/features/telehealth/CheckInPage').then((m) => m.CheckInPage), 'CheckInPage'),
  messages: lazyPage(() => import('@/features/messages/MessagesLayout').then((m) => m.MessagesLayout), 'MessagesLayout'),
  noThread: lazyPage(() => import('@/features/messages/MessagesLayout').then((m) => m.NoThreadSelected), 'NoThreadSelected'),
  thread: lazyPage(() => import('@/features/messages/ThreadView').then((m) => m.ThreadView), 'ThreadView'),
  compose: lazyPage(() => import('@/features/messages/ComposePage').then((m) => m.ComposePage), 'ComposePage'),
  results: lazyPage(() => import('@/features/results/ResultsPage').then((m) => m.ResultsPage), 'ResultsPage'),
  result: lazyPage(() => import('@/features/results/ResultDetailPage').then((m) => m.ResultDetailPage), 'ResultDetailPage'),
  medications: lazyPage(() => import('@/features/medications/MedicationsPage').then((m) => m.MedicationsPage), 'MedicationsPage'),
  vitals: lazyPage(() => import('@/features/vitals/VitalsPage').then((m) => m.VitalsPage), 'VitalsPage'),
  records: lazyPage(() => import('@/features/records/HealthRecordPage').then((m) => m.HealthRecordPage), 'HealthRecordPage'),
  document: lazyPage(() => import('@/features/records/DocumentPage').then((m) => m.DocumentPage), 'DocumentPage'),
  billing: lazyPage(() => import('@/features/billing/BillingPage').then((m) => m.BillingPage), 'BillingPage'),
  insurance: lazyPage(() => import('@/features/billing/InsurancePage').then((m) => m.InsurancePage), 'InsurancePage'),
  notifications: lazyPage(
    () => import('@/features/notifications/NotificationsPage').then((m) => m.NotificationsPage),
    'NotificationsPage',
  ),
  profile: lazyPage(() => import('@/features/profile/ProfilePage').then((m) => m.ProfilePage), 'ProfilePage'),
  settings: lazyPage(() => import('@/pages/SettingsPage').then((m) => m.SettingsPage), 'SettingsPage'),

  // Clinician workspace
  schedule: lazyPage(() => import('@/features/clinic/SchedulePage').then((m) => m.SchedulePage), 'SchedulePage'),
  roster: lazyPage(() => import('@/features/clinic/RosterPage').then((m) => m.RosterPage), 'RosterPage'),
  chart: lazyPage(() => import('@/features/clinic/ChartPage').then((m) => m.ChartPage), 'ChartPage'),
  inbox: lazyPage(() => import('@/features/clinic/InboxLayout').then((m) => m.InboxLayout), 'InboxLayout'),
  noInboxThread: lazyPage(() => import('@/features/clinic/InboxLayout').then((m) => m.NoInboxThreadSelected), 'NoInboxThreadSelected'),
  inboxThread: lazyPage(() => import('@/features/clinic/InboxThread').then((m) => m.InboxThread), 'InboxThread'),
  requests: lazyPage(() => import('@/features/clinic/RequestsPage').then((m) => m.RequestsPage), 'RequestsPage'),
} satisfies Record<string, LazyPage>;

/** The page each navigation link opens, so hovering a link can start loading it. */
const byPath: Record<string, LazyPage> = {
  '/': pages.dashboard,
  '/appointments': pages.appointments,
  '/messages': pages.messages,
  '/results': pages.results,
  '/medications': pages.medications,
  '/vitals': pages.vitals,
  '/records': pages.records,
  '/billing': pages.billing,
  '/settings': pages.settings,
  '/notifications': pages.notifications,
  '/profile': pages.profile,
  '/clinic': pages.schedule,
  '/clinic/patients': pages.roster,
  '/clinic/inbox': pages.inbox,
  '/clinic/requests': pages.requests,
  '/clinic/settings': pages.settings,
};

/** Starts fetching the page behind a link. Failures are left for when it's actually opened. */
export function preloadPage(path: string): void {
  byPath[path]?.preload().catch(() => {});
}

/** Loads every page, e.g. so tests render synchronously. */
export function preloadAllPages(): Promise<unknown> {
  return Promise.all(Object.values(pages).map((page) => page.preload()));
}

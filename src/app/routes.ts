import type { RouteObject } from 'react-router';
import { ClinicianGate, PatientGate } from '@/auth/RequireRole';
import { AppShell } from '@/shell/AppShell';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { SignInPage } from '@/pages/SignInPage';
import { pages } from './pages';

const notFound: RouteObject = { path: '*', Component: NotFoundPage, handle: { title: 'Page not found' } };

/**
 * Route table. The patient portal and the clinician workspace each sit behind a
 * role gate and share the app shell. The shell, sign-in and not-found pages
 * load up front; every other page loads on first use (see pages.ts).
 */
export const routes: RouteObject[] = [
  { path: '/sign-in', Component: SignInPage, handle: { title: 'Sign in' } },
  {
    path: '/clinic',
    Component: ClinicianGate,
    children: [
      {
        Component: AppShell,
        children: [
          { index: true, Component: pages.schedule, handle: { title: 'Today' } },
          { path: 'patients', Component: pages.roster, handle: { title: 'Patients' } },
          { path: 'patients/:patientId', Component: pages.chart, handle: { title: 'Chart' } },
          {
            path: 'inbox',
            Component: pages.inbox,
            handle: { title: 'Inbox' },
            children: [
              { index: true, Component: pages.noInboxThread },
              { path: ':threadId', Component: pages.inboxThread },
            ],
          },
          { path: 'requests', Component: pages.requests, handle: { title: 'Requests' } },
          { path: 'settings', Component: pages.settings, handle: { title: 'Settings' } },
          notFound,
        ],
      },
    ],
  },
  {
    path: '/',
    Component: PatientGate,
    children: [
      {
        Component: AppShell,
        children: [
          { index: true, Component: pages.dashboard, handle: { title: 'Home' } },
          { path: 'appointments', Component: pages.appointments, handle: { title: 'Appointments' } },
          { path: 'appointments/book', Component: pages.booking, handle: { title: 'Book a visit' } },
          { path: 'appointments/:appointmentId', Component: pages.appointment, handle: { title: 'Appointment' } },
          {
            path: 'appointments/:appointmentId/reschedule',
            Component: pages.reschedule,
            handle: { title: 'Reschedule visit' },
          },
          {
            path: 'appointments/:appointmentId/check-in',
            Component: pages.checkIn,
            handle: { title: 'Video visit check-in' },
          },
          {
            path: 'messages',
            Component: pages.messages,
            handle: { title: 'Messages' },
            children: [
              { index: true, Component: pages.noThread },
              { path: 'new', Component: pages.compose, handle: { title: 'New message' } },
              { path: ':threadId', Component: pages.thread },
            ],
          },
          { path: 'results', Component: pages.results, handle: { title: 'Results' } },
          { path: 'results/:panelId', Component: pages.result, handle: { title: 'Result' } },
          { path: 'medications', Component: pages.medications, handle: { title: 'Medications' } },
          { path: 'vitals', Component: pages.vitals, handle: { title: 'Vitals' } },
          { path: 'records', Component: pages.records, handle: { title: 'Health record' } },
          { path: 'records/documents/:documentId', Component: pages.document, handle: { title: 'Document' } },
          { path: 'billing', Component: pages.billing, handle: { title: 'Billing' } },
          { path: 'billing/insurance', Component: pages.insurance, handle: { title: 'Insurance' } },
          { path: 'notifications', Component: pages.notifications, handle: { title: 'Notifications' } },
          { path: 'profile', Component: pages.profile, handle: { title: 'Profile' } },
          { path: 'settings', Component: pages.settings, handle: { title: 'Settings' } },
          notFound,
        ],
      },
    ],
  },
];

import { addDays, addHours, differenceInCalendarDays, format, isAfter } from 'date-fns';
import { formatDay, formatTime, toDate } from '@/lib/dates';
import { dosesOn } from './adherence';
import { endOf } from './appointments';
import { statementStatus, statementTotals } from './billing';
import { dueDate, immunizationStatus } from './healthRecord';
import { summarizePanel } from './labs';
import { formatMoney } from '@/lib/units';
import { waitingRoomOpensAt } from './telehealth';
import type {
  Appointment,
  Clinician,
  DoseLog,
  Immunization,
  IsoDateTime,
  LabPanel,
  Medication,
  MessageThread,
  NotificationKind,
  NotificationState,
  PaymentPlan,
  RefillRequest,
  ReminderPrefs,
  Statement,
} from './types';

/** Older events drop off the list. */
export const NOTIFICATION_WINDOW_DAYS = 30;
/** Statements remind this many days before they're due. */
export const BILLING_REMINDER_DAYS = 7;
export const LEAD_HOUR_OPTIONS = [2, 24, 48] as const;

export interface PatientNotification {
  /** Stable for the same event, so read and dismissed state sticks. */
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  /** When it happened or became relevant. */
  at: IsoDateTime;
  priority: 'high' | 'normal';
}

export interface NotificationWithState extends PatientNotification {
  read: boolean;
}

/** Everything notifications are built from, for one patient. */
export interface NotificationSources {
  patientId: string;
  threads: MessageThread[];
  labs: LabPanel[];
  refills: RefillRequest[];
  medications: Medication[];
  doseLogs: DoseLog[];
  appointments: Appointment[];
  statements: Statement[];
  plans: PaymentPlan[];
  immunizations: Immunization[];
  clinicians: Clinician[];
}

export function defaultReminderPrefs(patientId: string): ReminderPrefs {
  return { patientId, appointmentLeadHours: 24, medicationReminders: true, billingReminders: true, email: true, sms: false };
}

function snippet(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * Works out the patient's notifications from their records at `now`: care-team
 * messages, released and reviewed results, refill decisions, visit reminders
 * at the patient's chosen lead time, the video waiting room opening, doses due
 * now, statements coming due, and vaccines due. Only events that have already
 * happened and are within the last 30 days are included, newest first.
 */
export function buildNotifications(src: NotificationSources, prefs: ReminderPrefs, now: Date = new Date()): PatientNotification[] {
  const items: PatientNotification[] = [];
  const name = (id?: string) => src.clinicians.find((c) => c.id === id)?.name ?? 'Your care team';
  const push = (item: Omit<PatientNotification, 'at'> & { at: Date | string }) =>
    items.push({ ...item, at: toDate(item.at).toISOString() });

  for (const thread of src.threads) {
    for (const message of thread.messages) {
      if (message.authorId === src.patientId) continue;
      push({
        id: `msg:${message.id}`,
        kind: 'message',
        title: `${name(message.authorId)} replied`,
        body: `${thread.subject}: ${snippet(message.body)}`,
        href: `/messages/${thread.id}`,
        at: message.sentAt,
        priority: 'normal',
      });
    }
  }

  for (const panel of src.labs) {
    if (panel.resultedAt && panel.status !== 'pending') {
      const { outOfRange, critical } = summarizePanel(panel);
      push({
        id: `result:${panel.id}`,
        kind: 'result',
        title: `New results: ${panel.name}`,
        body: critical
          ? 'One value needs prompt attention. Your care team has been alerted.'
          : outOfRange > 0
            ? `${outOfRange} ${outOfRange === 1 ? 'value is' : 'values are'} outside the usual range.`
            : 'Everything is in the usual range.',
        href: `/results/${panel.id}`,
        at: panel.resultedAt,
        priority: critical ? 'high' : 'normal',
      });
    }
    if (panel.status === 'reviewed' && panel.reviewedAt) {
      push({
        id: `review:${panel.id}`,
        kind: 'result-reviewed',
        title: `${name(panel.orderedById)} reviewed your ${panel.name.toLowerCase()}`,
        body: panel.clinicianNote ? snippet(panel.clinicianNote) : 'Open the result to see the note.',
        href: `/results/${panel.id}`,

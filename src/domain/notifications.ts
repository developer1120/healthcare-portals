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
        at: panel.reviewedAt,
        priority: 'normal',
      });
    }
  }

  for (const refill of src.refills) {
    if (!refill.decidedAt || (refill.status !== 'approved' && refill.status !== 'denied')) continue;
    const medication = src.medications.find((m) => m.id === refill.medicationId);
    const label = medication ? `${medication.name} ${medication.strength}` : 'your medicine';
    push({
      id: `refill:${refill.id}`,
      kind: 'refill',
      title: refill.status === 'approved' ? `Refill approved: ${label}` : `Refill not approved: ${label}`,
      body: refill.decisionNote ? snippet(refill.decisionNote) : refill.status === 'approved' ? `Sent to ${refill.pharmacy ?? 'your pharmacy'}.` : 'Message your care team if you have questions.',
      href: '/medications',
      at: refill.decidedAt,
      priority: refill.status === 'denied' ? 'high' : 'normal',
    });
  }

  for (const visit of src.appointments) {
    if (visit.status !== 'booked' && visit.status !== 'checked-in') continue;
    const start = toDate(visit.start);
    const remindAt = addHours(start, -prefs.appointmentLeadHours);
    if (now >= remindAt && now < start) {
      const day = differenceInCalendarDays(start, now) === 0 ? 'today' : formatDay(start, now);
      push({
        id: `appt:${visit.id}:${prefs.appointmentLeadHours}`,
        kind: 'appointment',
        title: `Visit ${day} at ${formatTime(start)}`,
        body: `${name(visit.clinicianId)} · ${visit.mode === 'video' ? 'Video visit' : visit.location}`,
        href: `/appointments/${visit.id}`,
        at: remindAt,
        priority: 'normal',
      });
    }
    if (visit.mode === 'video' && visit.status === 'booked' && now >= waitingRoomOpensAt(visit) && now < endOf(visit)) {
      push({
        id: `checkin:${visit.id}`,
        kind: 'check-in',
        title: 'Your video waiting room is open',
        body: `Check in for your ${formatTime(start)} visit with ${name(visit.clinicianId)}.`,
        href: `/appointments/${visit.id}/check-in`,
        at: waitingRoomOpensAt(visit),
        priority: 'high',
      });
    }
  }

  if (prefs.medicationReminders) {
    for (const dose of dosesOn(now, src.medications, src.doseLogs, now)) {
      if (dose.state !== 'due' || dose.scheduledFor > now) continue;
      push({
        id: `dose:${dose.medication.id}:${dose.scheduledFor.toISOString()}`,
        kind: 'dose',
        title: `Time for ${dose.medication.name} ${dose.medication.strength}`,
        body: `Your ${formatTime(dose.scheduledFor)} dose. Mark it taken on your medications page.`,
        href: '/medications',
        at: dose.scheduledFor,
        priority: 'normal',
      });
    }
  }

  if (prefs.billingReminders) {
    for (const statement of src.statements) {
      const status = statementStatus(statement, src.plans, now);
      if (status !== 'due' && status !== 'overdue') continue;
      const due = toDate(statement.dueOn);
      const remindAt = status === 'overdue' ? addDays(due, 1) : addDays(due, -BILLING_REMINDER_DAYS);
      if (now < remindAt) continue;
      const balance = formatMoney(statementTotals(statement).balance);
      push({
        id: `bill:${statement.id}:${status}`,
        kind: 'billing',
        title: status === 'overdue' ? `Payment overdue: ${balance}` : `Payment due ${format(due, 'd MMM')}: ${balance}`,
        body: 'Pay online or set up a payment plan.',
        href: '/billing',
        at: remindAt,
        priority: status === 'overdue' ? 'high' : 'normal',
      });
    }
  }

  for (const immunization of src.immunizations) {
    const status = immunizationStatus(immunization, now);
    const due = dueDate(immunization);
    if (!due || (status !== 'overdue' && status !== 'due-soon')) continue;
    push({
      id: `imm:${immunization.id}`,
      kind: 'immunization',
      title: status === 'overdue' ? `${immunization.vaccine} is overdue` : `${immunization.vaccine} due soon`,
      body: `Due ${formatDay(due, now)}. Book it with your next visit.`,
      href: '/records',
      at: status === 'overdue' ? due : addDays(due, -30),
      priority: 'normal',
    });
  }

  const since = addDays(now, -NOTIFICATION_WINDOW_DAYS);
  return items
    .filter((item) => !isAfter(toDate(item.at), now) && toDate(item.at) >= since)
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

/** Applies what the patient has read or dismissed. */
export function withState(items: PatientNotification[], state: NotificationState | undefined): NotificationWithState[] {
  return items
    .filter((item) => !state?.dismissedIds.includes(item.id))
    .map((item) => ({
      ...item,
      read: Boolean(state?.readIds.includes(item.id) || (state?.readAllBefore && item.at <= state.readAllBefore)),
    }));
}

export function unreadNotifications(items: NotificationWithState[]): number {
  return items.filter((item) => !item.read).length;
}

/** "Today", "Yesterday" or "Earlier", for grouping the list. */
export function notificationGroup(at: string, now: Date = new Date()): 'Today' | 'Yesterday' | 'Earlier' {
  const days = differenceInCalendarDays(now, toDate(at));
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : 'Earlier';
}

import { addMinutes, differenceInMinutes, getDay, isSameDay } from 'date-fns';
import { atTime, compareAsc, toDate } from '@/lib/dates';
import { endOf } from './appointments';
import type { PatientSnapshot } from './risk';
import type { Appointment, Clinician } from './types';

/** One row of a clinician's day. */
export interface ScheduleEntry {
  appointment: Appointment;
  snapshot: PatientSnapshot;
}

export interface DaySchedule {
  clinician: Clinician;
  entries: ScheduleEntry[];
}

export type VisitAction = 'check-in' | 'complete' | 'no-show' | 'undo-no-show';

/** Front desk can mark arrival up to an hour early. */
export const ARRIVAL_WINDOW_MINUTES = 60;
/** A patient counts as missed once they're this late. */
export const NO_SHOW_AFTER_MINUTES = 15;

export const visitActionLabels: Record<VisitAction, string> = {
  'check-in': 'Mark arrived',
  complete: 'Complete visit',
  'no-show': 'Mark missed',
  'undo-no-show': 'Undo missed',
};

/**
 * What the clinician can do with a visit right now. Video patients check
 * themselves in from the waiting room, so only in-person arrivals are marked
 * here. Missed visits can be undone the same day, in case the patient turns up.
 */
export function visitActions(appointment: Appointment, now: Date = new Date()): VisitAction[] {
  const start = toDate(appointment.start);
  const end = endOf(appointment);
  switch (appointment.status) {
    case 'booked': {
      const actions: VisitAction[] = [];
      const arrivalOpens = addMinutes(start, -ARRIVAL_WINDOW_MINUTES);
      if (appointment.mode === 'in-person' && now >= arrivalOpens && now < end) actions.push('check-in');
      if (now >= addMinutes(start, NO_SHOW_AFTER_MINUTES) && isSameDay(start, now)) actions.push('no-show');
      return actions;
    }
    case 'checked-in':
      return now >= start ? ['complete'] : [];
    case 'no-show':
      return isSameDay(start, now) ? ['undo-no-show'] : [];
    default:
      return [];
  }
}

/** Applies an action that `visitActions` allowed. */
export function applyVisitAction(appointment: Appointment, action: VisitAction, now: Date = new Date()): void {
  switch (action) {
    case 'check-in':
      appointment.status = 'checked-in';
      appointment.checkedInAt = now.toISOString();
      break;
    case 'complete':
      appointment.status = 'completed';
      break;
    case 'no-show':
      appointment.status = 'no-show';
      break;
    case 'undo-no-show':
      appointment.status = 'booked';
      break;
  }
}

/** Minutes a checked-in patient has been waiting, or null if they aren't waiting. */
export function waitingMinutes(appointment: Appointment, now: Date = new Date()): number | null {
  if (appointment.status !== 'checked-in' || !appointment.checkedInAt) return null;
  return Math.max(0, differenceInMinutes(now, toDate(appointment.checkedInAt)));
}

export interface ScheduleSummary {
  visits: number;
  waiting: number;
  done: number;
  missed: number;
  toGo: number;
}

export function scheduleSummary(entries: ScheduleEntry[]): ScheduleSummary {
  const statuses = entries.map((e) => e.appointment.status).filter((s) => s !== 'cancelled');
  const count = (status: Appointment['status']) => statuses.filter((s) => s === status).length;
  return {
    visits: statuses.length,
    waiting: count('checked-in'),
    done: count('completed'),
    missed: count('no-show'),
    toGo: count('booked'),
  };
}

/**
 * Who to see next: anyone already waiting (earliest booking first), otherwise
 * the next booked visit that hasn't ended.
 */
export function nextUp(entries: ScheduleEntry[], now: Date = new Date()): ScheduleEntry | undefined {
  const byStart = [...entries].sort((a, b) => compareAsc(a.appointment.start, b.appointment.start));
  return (
    byStart.find((e) => e.appointment.status === 'checked-in') ??
    byStart.find((e) => e.appointment.status === 'booked' && endOf(e.appointment) > now)
  );
}

export interface Gap {
  start: Date;
  end: Date;
}

/**
 * Open time in the clinician's working hours on `day`, at least one slot
 * long. Cancelled visits free their time; missed ones don't (it has passed).
 */
export function scheduleGaps(clinician: Clinician, appointments: Appointment[], day: Date): Gap[] {
  const hours = clinician.workingHours.filter((h) => h.weekday === getDay(day));
  const busy = appointments
    .filter((a) => a.status !== 'cancelled' && isSameDay(toDate(a.start), day))
    .map((a) => ({ start: toDate(a.start), end: endOf(a) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const gaps: Gap[] = [];
  for (const block of hours) {
    const blockStart = atTime(day, 0, block.start);
    const blockEnd = atTime(day, 0, block.end);
    let cursor = blockStart;
    for (const visit of busy) {
      if (visit.end <= cursor || visit.start >= blockEnd) continue;
      if (differenceInMinutes(visit.start, cursor) >= clinician.slotMinutes) gaps.push({ start: cursor, end: visit.start });
      if (visit.end > cursor) cursor = visit.end;
    }
    if (differenceInMinutes(blockEnd, cursor) >= clinician.slotMinutes) gaps.push({ start: cursor, end: blockEnd });
  }
  return gaps;
}

export function isWorkingDay(clinician: Clinician, day: Date): boolean {
  return clinician.workingHours.some((h) => h.weekday === getDay(day));
}

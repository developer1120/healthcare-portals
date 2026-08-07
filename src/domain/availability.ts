import { addDays, addMinutes, differenceInMinutes, getDay, startOfDay } from 'date-fns';
import { atTime, toDate, toIsoDate } from '@/lib/dates';
import { endOf, isActive } from './appointments';
import type { Appointment, Clinician, IsoDate, Patient } from './types';

/** Visits can't be booked less than this far ahead, so the clinic can prepare. */
export const BOOKING_LEAD_MINUTES = 120;
/** How far ahead patients can book. */
export const BOOKING_WINDOW_DAYS = 21;
/** Clinicians don't see patients over lunch. */
export const LUNCH = { start: '12:00', end: '13:00' } as const;

interface Interval {
  start: Date;
  end: Date;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** The clinician's booked time, from active appointments with any patient. */
export function busyIntervals(clinicianId: string, appointments: Appointment[]): Interval[] {
  return appointments
    .filter((a) => a.clinicianId === clinicianId && isActive(a))
    .map((a) => ({ start: toDate(a.start), end: endOf(a) }));
}

/**
 * Free slot start times on one day: within working hours, stepping by the
 * clinician's slot length, skipping lunch, booked time and anything sooner
 * than the booking lead time.
 */
export function slotsForDay(clinician: Clinician, day: Date, busy: Interval[], now: Date): Date[] {
  const hours = clinician.workingHours.find((h) => h.weekday === getDay(day));
  if (!hours) return [];

  const open = atTime(day, 0, hours.start);
  const close = atTime(day, 0, hours.end);
  const lunch = { start: atTime(day, 0, LUNCH.start), end: atTime(day, 0, LUNCH.end) };
  const earliest = addMinutes(now, BOOKING_LEAD_MINUTES);

  const slots: Date[] = [];
  for (let start = open; addMinutes(start, clinician.slotMinutes) <= close; start = addMinutes(start, clinician.slotMinutes)) {
    const slot = { start, end: addMinutes(start, clinician.slotMinutes) };
    if (start < earliest) continue;
    if (overlaps(slot, lunch)) continue;
    if (busy.some((b) => overlaps(slot, b))) continue;
    slots.push(start);
  }
  return slots;
}

export interface DayAvailability {
  date: IsoDate;
  slots: string[];
}

/** Free slots for each day of the booking window, starting today. Days off are included, empty. */
export function availability(
  clinician: Clinician,
  appointments: Appointment[],
  now: Date,
  days = BOOKING_WINDOW_DAYS,
): DayAvailability[] {
  const busy = busyIntervals(clinician.id, appointments);
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(startOfDay(now), i);
    return { date: toIsoDate(day), slots: slotsForDay(clinician, day, busy, now).map((d) => d.toISOString()) };
  });
}

/** Whether `start` is exactly one of the clinician's free slots right now. */
export function isSlotAvailable(clinician: Clinician, appointments: Appointment[], start: Date, now: Date): boolean {
  if (differenceInMinutes(startOfDay(start), startOfDay(now)) / (24 * 60) >= BOOKING_WINDOW_DAYS) return false;
  const slots = slotsForDay(clinician, startOfDay(start), busyIntervals(clinician.id, appointments), now);
  return slots.some((slot) => slot.getTime() === start.getTime());
}

/** Patients can book clinicians who are taking new patients, or who already look after them. */
export function canBookWith(clinician: Clinician, patient: Patient): boolean {
  return clinician.acceptingNewPatients || patient.careTeamIds.includes(clinician.id);
}

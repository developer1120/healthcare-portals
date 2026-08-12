import { addMinutes, format } from 'date-fns';
import type { StatusTone } from '@/ui';
import { compareAsc, compareDesc, toDate } from '@/lib/dates';
import type { Appointment, AppointmentStatus, Clinician, VisitMode } from './types';

export const modeLabels: Record<VisitMode, string> = {
  video: 'Video visit',
  'in-person': 'In person',
};

export const statusDisplay: Record<AppointmentStatus, { label: string; tone: StatusTone }> = {
  booked: { label: 'Booked', tone: 'info' },
  'checked-in': { label: 'Checked in', tone: 'ok' },
  completed: { label: 'Completed', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  'no-show': { label: 'Missed', tone: 'warn' },
};

/** Booked or checked-in, i.e. still going ahead. */
export function isActive(appointment: Appointment): boolean {
  return appointment.status === 'booked' || appointment.status === 'checked-in';
}

export function endOf(appointment: Appointment): Date {
  return addMinutes(toDate(appointment.start), appointment.durationMinutes);
}

/**
 * The next visit that is still going ahead. A visit in progress counts until
 * it ends, so a patient who is a few minutes late still sees it.
 */
export function nextAppointment(appointments: Appointment[], now: Date = new Date()): Appointment | undefined {
  return appointments
    .filter((a) => isActive(a) && endOf(a) > now)
    .sort((a, b) => compareAsc(a.start, b.start))[0];
}

/**
 * Upcoming: still going ahead and not yet over, soonest first.
 * Past: everything else (finished, cancelled, missed), most recent first.
 */
export function splitAppointments(
  appointments: Appointment[],
  now: Date = new Date(),
): { upcoming: Appointment[]; past: Appointment[] } {
  const upcoming: Appointment[] = [];
  const past: Appointment[] = [];
  for (const appointment of appointments) {
    (isActive(appointment) && endOf(appointment) > now ? upcoming : past).push(appointment);
  }
  return {
    upcoming: upcoming.sort((a, b) => compareAsc(a.start, b.start)),
    past: past.sort((a, b) => compareDesc(a.start, b.start)),
  };
}

export interface AppointmentFilters {
  clinicianId?: string;
  mode?: VisitMode;
  status?: AppointmentStatus;
  /** Free text matched against the reason, clinician and location. */
  query?: string;
}

export function filterAppointments(
  appointments: Appointment[],
  { clinicianId, mode, status, query }: AppointmentFilters,
  clinicians: Clinician[] = [],
): Appointment[] {
  const needle = query?.trim().toLowerCase();
  return appointments.filter((appointment) => {
    if (clinicianId && appointment.clinicianId !== clinicianId) return false;
    if (mode && appointment.mode !== mode) return false;
    if (status && appointment.status !== status) return false;
    if (needle) {
      const clinician = clinicians.find((c) => c.id === appointment.clinicianId);
      const haystack = [appointment.reason, appointment.location, clinician?.name ?? ''].join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** Groups already-sorted appointments under "October 2026"-style month headings, keeping order. */
export function groupByMonth(appointments: Appointment[]): { month: string; appointments: Appointment[] }[] {
  const groups: { month: string; appointments: Appointment[] }[] = [];
  for (const appointment of appointments) {
    const month = format(toDate(appointment.start), 'MMMM yyyy');
    const last = groups.at(-1);
    if (last?.month === month) last.appointments.push(appointment);
    else groups.push({ month, appointments: [appointment] });
  }
  return groups;
}

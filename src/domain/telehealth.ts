import { addMinutes, differenceInMinutes } from 'date-fns';
import { toDate } from '@/lib/dates';
import { endOf } from './appointments';
import type { Appointment } from './types';

/** Pre-check opens this many days before a video visit. */
export const PRECHECK_WINDOW_DAYS = 7;
/** The waiting room opens this many minutes before the start. */
export const WAITING_ROOM_OPENS_MINUTES = 15;

export type TelehealthStage =
  | 'not-video'
  | 'ended'
  | 'too-early'
  | 'precheck'
  | 'waiting-soon'
  | 'waiting-open'
  | 'checked-in';

/**
 * Where a video visit is in its lifecycle:
 * too-early → precheck → waiting-soon → waiting-open → checked-in, or ended.
 * Pre-check can be redone until the patient joins the waiting room.
 */
export function telehealthStage(appointment: Appointment, now: Date = new Date()): TelehealthStage {
  if (appointment.mode !== 'video') return 'not-video';
  if (appointment.status === 'checked-in' && endOf(appointment) > now) return 'checked-in';
  if (appointment.status !== 'booked' || endOf(appointment) <= now) return 'ended';

  const start = toDate(appointment.start);
  if (differenceInMinutes(start, now) > PRECHECK_WINDOW_DAYS * 24 * 60) return 'too-early';
  if (!appointment.precheck) return 'precheck';
  return now < waitingRoomOpensAt(appointment) ? 'waiting-soon' : 'waiting-open';
}

export function waitingRoomOpensAt(appointment: Appointment): Date {
  return addMinutes(toDate(appointment.start), -WAITING_ROOM_OPENS_MINUTES);
}

/** The call to action for a video visit right now, or null when there is nothing to do online. */
export function telehealthAction(appointment: Appointment, now: Date = new Date()): { label: string; href: string } | null {
  const href = `/appointments/${appointment.id}/check-in`;
  switch (telehealthStage(appointment, now)) {
    case 'precheck':
      return { label: 'Pre-check in', href };
    case 'waiting-soon':
      return { label: 'View check-in', href };
    case 'waiting-open':
      return { label: 'Join waiting room', href };
    case 'checked-in':
      return { label: 'Return to waiting room', href };
    default:
      return null;
  }
}

export type ConnectionQuality = 'good' | 'fair' | 'poor';

/** Round-trip time to a rough video quality rating. */
export function classifyConnection(roundTripMs: number): ConnectionQuality {
  if (roundTripMs < 150) return 'good';
  if (roundTripMs < 400) return 'fair';
  return 'poor';
}

/** US phone numbers: 10 digits, optionally with a leading 1 and any punctuation. */
export function normalisePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
}

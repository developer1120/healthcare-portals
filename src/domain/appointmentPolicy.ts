import { addHours, differenceInMinutes } from 'date-fns';
import { toDate } from '@/lib/dates';
import { isActive } from './appointments';
import type { Appointment } from './types';

/** Changes inside this window can't be made online without consequences. */
export const CHANGE_CUTOFF_HOURS = 24;
/** A visit can be moved online this many times; after that the clinic arranges it. */
export const MAX_RESCHEDULES = 2;
export const LATE_CANCEL_FEE_CENTS = 2_500;
export const CLINIC_PHONE = '(503) 555-0100';

export const cancellationReasons = [
  'Feeling better',
  'Schedule conflict',
  'Booked by mistake',
  'Seeing another provider',
  'Other',
] as const;
export type CancellationReason = (typeof cancellationReasons)[number];

export type ChangeBlock = 'not-active' | 'started' | 'within-cutoff' | 'limit-reached';

export interface ChangePolicy {
  canCancel: boolean;
  canReschedule: boolean;
  /** Cancelling now counts as a late cancellation and adds the fee. */
  lateCancellation: boolean;
  /** Last moment to change for free: 24 hours before the start. */
  freeChangeDeadline: Date;
  /** Why rescheduling isn't offered, if it isn't. */
  rescheduleBlock?: ChangeBlock;
}

/**
 * The 24-hour policy:
 * - More than 24 hours out: cancel for free or reschedule online (at most twice).
 * - Inside 24 hours: rescheduling is by phone only; cancelling is still possible
 *   but counts as late and adds a fee the patient must accept.
 * - Once a visit has started, or if it is no longer booked, nothing can change.
 */
export function changePolicy(appointment: Appointment, now: Date = new Date()): ChangePolicy {
  const start = toDate(appointment.start);
  const freeChangeDeadline = addHours(start, -CHANGE_CUTOFF_HOURS);
  const blocked = (rescheduleBlock: ChangeBlock): ChangePolicy => ({
    canCancel: false,
    canReschedule: false,
    lateCancellation: false,
    freeChangeDeadline,
    rescheduleBlock,
  });

  // Checked-in patients are already at the clinic or in the waiting room.
  if (!isActive(appointment) || appointment.status === 'checked-in') return blocked('not-active');
  if (start <= now) return blocked('started');

  const withinCutoff = differenceInMinutes(start, now) < CHANGE_CUTOFF_HOURS * 60;
  const limitReached = (appointment.rescheduleCount ?? 0) >= MAX_RESCHEDULES;
  return {
    canCancel: true,
    canReschedule: !withinCutoff && !limitReached,
    lateCancellation: withinCutoff,
    freeChangeDeadline,
    rescheduleBlock: withinCutoff ? 'within-cutoff' : limitReached ? 'limit-reached' : undefined,
  };
}

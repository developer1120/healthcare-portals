import { screen, waitFor, within } from '@testing-library/react';
import { addHours, addMinutes } from 'date-fns';
import { api } from '@/api/endpoints';
import { getDb, writeDb } from '@/api/mockDb';
import { CLINIC_PHONE, LATE_CANCEL_FEE_CENTS, changePolicy } from '@/domain/appointmentPolicy';
import type { Appointment } from '@/domain/types';
import { formatTimeRange } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const now = TEST_NOW;
const AVA = 'pat-ava';
/** Ava's upcoming video visit with Dr. Okafor, two days after the test date. */
const VISIT = 'apt-005';

function visit(hoursAway: number, fields: Partial<Appointment> = {}): Appointment {
  return {
    id: 'a',
    patientId: AVA,
    clinicianId: 'cln-okafor',
    start: addHours(now, hoursAway).toISOString(),
    durationMinutes: 20,
    mode: 'video',
    status: 'booked',
    reason: 'Check-in',
    location: 'Video visit',
    createdAt: now.toISOString(),
    ...fields,
  };
}

/** Moves Ava's visit to start `hoursAway` from now, keeping everything else. */
function moveVisit(hoursAway: number, fields: Partial<Appointment> = {}) {
  writeDb((db) => {
    Object.assign(db.appointments.find((a) => a.id === VISIT)!, {
      start: addHours(now, hoursAway).toISOString(),
      ...fields,
    });
  });
}

describe('changePolicy', () => {
  it('allows free changes more than 24 hours out', () => {
    const policy = changePolicy(visit(25), now);
    expect(policy).toMatchObject({ canCancel: true, canReschedule: true, lateCancellation: false });
    expect(policy.freeChangeDeadline).toEqual(addHours(now, 1));
  });

  it('turns cancellation late and rescheduling off inside 24 hours', () => {
    expect(changePolicy(visit(23.9), now)).toMatchObject({
      canCancel: true,
      canReschedule: false,
      lateCancellation: true,
      rescheduleBlock: 'within-cutoff',
    });
  });

  it('treats exactly 24 hours out as still free', () => {
    expect(changePolicy(visit(24), now)).toMatchObject({ canReschedule: true, lateCancellation: false });
  });

  it('caps online rescheduling but still allows cancelling', () => {
    expect(changePolicy(visit(48, { rescheduleCount: 2 }), now)).toMatchObject({
      canCancel: true,
      canReschedule: false,
      rescheduleBlock: 'limit-reached',
    });
  });

  it('allows nothing once the visit has started, is checked in, or is over', () => {
    expect(changePolicy(visit(-0.1), now)).toMatchObject({ canCancel: false, rescheduleBlock: 'started' });
    expect(changePolicy(visit(1, { status: 'checked-in' }), now).canCancel).toBe(false);
    expect(changePolicy(visit(48, { status: 'cancelled' }), now).canCancel).toBe(false);
  });
});

describe('cancel and reschedule endpoints', () => {
  async function freeSlot(exclude?: string) {
    const days = await api.availability.list('cln-okafor');
    return days.flatMap((d) => d.slots).find((s) => s !== exclude)!;
  }

  it('cancels for free outside the window', async () => {
    const before = getDb().statements.flatMap((s) => s.lines).length;
    const cancelled = await api.appointments.cancel({ patientId: AVA, appointmentId: VISIT, reason: 'Feeling better' });

    expect(cancelled).toMatchObject({ status: 'cancelled', cancellationReason: 'Feeling better', lateCancellation: false });
    expect(getDb().statements.flatMap((s) => s.lines)).toHaveLength(before);
    await expect(
      api.appointments.cancel({ patientId: AVA, appointmentId: VISIT, reason: 'Again' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('needs the fee accepted for a late cancellation, then bills it', async () => {
    moveVisit(3);
    await expect(
      api.appointments.cancel({ patientId: AVA, appointmentId: VISIT, reason: 'Schedule conflict' }),
    ).rejects.toMatchObject({ status: 400, message: 'Confirm the late cancellation fee to cancel within 24 hours.' });

    await api.appointments.cancel({ patientId: AVA, appointmentId: VISIT, reason: 'Schedule conflict', acceptLateFee: true });

    const fee = getDb()
      .statements.flatMap((s) => s.lines)
      .find((line) => line.description === 'Late cancellation fee');
    expect(fee?.chargeCents).toBe(LATE_CANCEL_FEE_CENTS);
  });

  it('treats another patient’s visit as not found', async () => {
    await expect(
      api.appointments.cancel({ patientId: 'pat-marcus', appointmentId: VISIT, reason: 'Nope' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('moves a visit, keeping its id and remembering where it was', async () => {
    const original = getDb().appointments.find((a) => a.id === VISIT)!.start;
    const start = await freeSlot();
    const moved = await api.appointments.reschedule({ patientId: AVA, appointmentId: VISIT, start, mode: 'in-person' });

    expect(moved).toMatchObject({
      id: VISIT,
      start,
      mode: 'in-person',
      location: 'Riverside Heart Clinic',
      rescheduleCount: 1,
      rescheduledFrom: original,
    });
  });

  it('refuses to move a visit inside the window or past the limit', async () => {
    const start = await freeSlot();
    moveVisit(5);
    await expect(
      api.appointments.reschedule({ patientId: AVA, appointmentId: VISIT, start, mode: 'video' }),
    ).rejects.toMatchObject({ status: 409, message: 'This visit can no longer be moved online. Call the clinic to change it.' });

    moveVisit(72, { rescheduleCount: 2 });
    await expect(
      api.appointments.reschedule({ patientId: AVA, appointmentId: VISIT, start, mode: 'video' }),
    ).rejects.toMatchObject({ message: 'This visit has been moved 2 times. Call the clinic to change it again.' });
  });

  it('refuses a time that is not free', async () => {

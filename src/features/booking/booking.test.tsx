import { screen, waitFor, within } from '@testing-library/react';
import { addDays, addMinutes, getDay } from 'date-fns';
import { api } from '@/api/endpoints';
import { getDb, writeDb } from '@/api/mockDb';
import {
  BOOKING_LEAD_MINUTES,
  BOOKING_WINDOW_DAYS,
  availability,
  canBookWith,
  isSlotAvailable,
  slotsForDay,
} from '@/domain/availability';
import type { Appointment, Clinician, Patient } from '@/domain/types';
import { atTime, formatTime } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const now = TEST_NOW;

/** The next date (from tomorrow) that falls on the given weekday, at local midnight. */
function nextWeekday(weekday: number): Date {
  let day = atTime(now, 1, '00:00');
  while (getDay(day) !== weekday) day = addDays(day, 1);
  return day;
}

const clinician: Clinician = {
  id: 'cln-test',
  name: 'Dr. Test',
  role: 'physician',
  credentials: 'MD',
  specialty: 'primary-care',
  clinic: 'Test Clinic',
  languages: ['English'],
  acceptingNewPatients: true,
  offersVideo: true,
  bio: '',
  workingHours: [{ weekday: 3, start: '09:00', end: '14:00' }],
  slotMinutes: 30,
};

function busy(start: Date, minutes: number) {
  return { start, end: addMinutes(start, minutes) };
}

describe('slotsForDay', () => {
  const wednesday = nextWeekday(3);

  it('steps through working hours by slot length, skipping lunch', () => {
    const slots = slotsForDay(clinician, wednesday, [], now).map(formatTime);
    expect(slots).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30']);
  });

  it('skips booked time, including partial overlaps', () => {
    const taken = [busy(atTime(wednesday, 0, '09:00'), 30), busy(atTime(wednesday, 0, '10:15'), 20)];
    const slots = slotsForDay(clinician, wednesday, taken, now).map(formatTime);
    expect(slots).toEqual(['09:30', '11:00', '11:30', '13:00', '13:30']);
  });

  it('has nothing on days off', () => {
    expect(slotsForDay(clinician, addDays(wednesday, 1), [], now)).toEqual([]);
  });

  it('keeps the booking lead time', () => {
    const almostTen = atTime(wednesday, 0, '08:00');
    const slots = slotsForDay(clinician, wednesday, [], almostTen).map(formatTime);
    // 08:00 + 2 h: 10:00 is the first allowed start.
    expect(BOOKING_LEAD_MINUTES).toBe(120);
    expect(slots[0]).toBe('10:00');
  });
});

describe('availability', () => {
  it('covers the booking window from today', () => {
    const days = availability(clinician, [], now);
    expect(days).toHaveLength(BOOKING_WINDOW_DAYS);
    expect(days.filter((d) => d.slots.length > 0).length).toBeGreaterThanOrEqual(2);
  });

  it('ignores cancelled visits when working out busy time', () => {
    const wednesday = nextWeekday(3);
    const cancelled = {
      clinicianId: 'cln-test',
      start: atTime(wednesday, 0, '09:00').toISOString(),
      durationMinutes: 30,
      status: 'cancelled',
    } as Appointment;
    expect(isSlotAvailable(clinician, [cancelled], atTime(wednesday, 0, '09:00'), now)).toBe(true);
    expect(isSlotAvailable(clinician, [{ ...cancelled, status: 'booked' }], atTime(wednesday, 0, '09:00'), now)).toBe(
      false,
    );
  });

  it('only accepts exact slot starts inside the window', () => {
    const wednesday = nextWeekday(3);
    expect(isSlotAvailable(clinician, [], atTime(wednesday, 0, '09:10'), now)).toBe(false);
    expect(isSlotAvailable(clinician, [], atTime(wednesday, 0, '12:00'), now)).toBe(false);
    expect(isSlotAvailable(clinician, [], atTime(addDays(wednesday, 28), 0, '09:00'), now)).toBe(false);
  });

  it('lets patients book their own clinicians even when the list is closed', () => {
    const closed = { ...clinician, acceptingNewPatients: false };
    expect(canBookWith(closed, { careTeamIds: [] } as unknown as Patient)).toBe(false);
    expect(canBookWith(closed, { careTeamIds: ['cln-test'] } as unknown as Patient)).toBe(true);
  });
});

describe('booking endpoint', () => {
  async function firstSlot(clinicianId: string) {
    const days = await api.availability.list(clinicianId);
    return days.find((d) => d.slots.length > 0)!.slots[0]!;
  }

  it('books a free slot and adds the clinician to the care team', async () => {
    const start = await firstSlot('cln-sato');
    const booked = await api.appointments.book({
      patientId: 'pat-ava',
      clinicianId: 'cln-sato',
      start,
      mode: 'video',
      reason: '  Migraines most weeks  ',
    });

    expect(booked).toMatchObject({ status: 'booked', mode: 'video', location: 'Video visit', durationMinutes: 40 });
    expect(booked.reason).toBe('Migraines most weeks');
    expect(getDb().patients.find((p) => p.id === 'pat-ava')!.careTeamIds).toContain('cln-sato');
    expect(await firstSlot('cln-sato')).not.toBe(start);
  });

  it('refuses a slot someone else just took', async () => {
    const start = await firstSlot('cln-sato');
    await api.appointments.book({ patientId: 'pat-kai', clinicianId: 'cln-sato', start, mode: 'video', reason: 'Sleep' });

    await expect(
      api.appointments.book({ patientId: 'pat-ava', clinicianId: 'cln-sato', start, mode: 'video', reason: 'Migraines' }),
    ).rejects.toMatchObject({ status: 409, message: 'That time was just taken. Pick another time.' });
  });

  it('refuses a clinician who is not taking new patients', async () => {
    await expect(
      api.appointments.book({
        patientId: 'pat-ava',
        clinicianId: 'cln-raman',

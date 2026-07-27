import { screen, within } from '@testing-library/react';
import { api } from '@/api/endpoints';
import { getDb } from '@/api/mockDb';
import { nextUp, scheduleGaps, scheduleSummary, visitActions } from '@/domain/schedule';
import type { Appointment } from '@/domain/types';
import { atTime, formatTime, toIsoDate } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

/** Today (a Tuesday) at a local clock time. */
const at = (hhmm: string, day = 0) => atTime(TEST_NOW, day, hhmm);
const TODAY = toIsoDate(TEST_NOW);

/** Seeds the demo data at 05:00 first (so today's visits are still booked), then moves the clock. */
function seedThenMoveClockTo(hhmm: string) {
  getDb();
  vi.setSystemTime(at(hhmm));
}

// Start every test at 05:00 local, before clinic opens, whatever the test timezone.
beforeEach(() => {
  vi.setSystemTime(at('05:00'));
});

function visit(patientId: string, clinicianId = 'cln-lindqvist'): Appointment {
  return getDb().appointments.find(
    (a) => a.patientId === patientId && a.clinicianId === clinicianId && toIsoDate(new Date(a.start)) === TODAY,
  )!;
}

describe('visit actions', () => {
  // Marcus is booked in person at 08:00 for 20 minutes.
  it('opens arrival an hour early and missed after 15 minutes', () => {
    const marcus = visit('pat-marcus');
    expect(visitActions(marcus, at('06:59'))).toEqual([]);
    expect(visitActions(marcus, at('07:00'))).toEqual(['check-in']);
    expect(visitActions(marcus, at('08:15'))).toEqual(['check-in', 'no-show']);
    expect(visitActions(marcus, at('08:20'))).toEqual(['no-show']);
    expect(visitActions(marcus, at('09:00', 1))).toEqual([]);
  });

  it('completes only after the start, and undoes a missed visit the same day', () => {
    const marcus = visit('pat-marcus');
    expect(visitActions({ ...marcus, status: 'checked-in' }, at('07:50'))).toEqual([]);
    expect(visitActions({ ...marcus, status: 'checked-in' }, at('08:00'))).toEqual(['complete']);
    expect(visitActions({ ...marcus, status: 'no-show' }, at('09:00'))).toEqual(['undo-no-show']);
    expect(visitActions({ ...marcus, status: 'no-show' }, at('09:00', 1))).toEqual([]);
    expect(visitActions({ ...marcus, status: 'completed' }, at('09:00'))).toEqual([]);
  });

  it('leaves video check-in to the patient', () => {
    const echo = visit('pat-olu', 'cln-okafor');
    expect(echo.mode).toBe('video');
    expect(visitActions(echo, at('09:00'))).toEqual([]);
  });
});

describe('day planning', () => {
  it('finds open time of at least one slot inside working hours', async () => {
    const { clinician, entries } = await api.clinic.schedule('cln-lindqvist', TODAY);
    const gaps = scheduleGaps(clinician, entries.map((e) => e.appointment), TEST_NOW);
    expect(gaps.map((g) => `${formatTime(g.start)}–${formatTime(g.end)}`)).toEqual([
      '08:40–09:00',
      '09:20–09:40',
      '10:00–10:20',
      '10:40–11:00',
      '11:20–13:00',
      '13:20–13:40',
      '14:00–14:20',
      '14:40–17:00',
    ]);
    // A cancelled visit frees its slot.
    const withCancel = entries.map((e) => (e.snapshot.patient.id === 'pat-dev' ? { ...e.appointment, status: 'cancelled' as const } : e.appointment));
    expect(scheduleGaps(clinician, withCancel, TEST_NOW).map((g) => formatTime(g.start))).toContain('08:40');
    expect(scheduleGaps(clinician, withCancel, TEST_NOW).find((g) => formatTime(g.start) === '08:40')!.end).toEqual(at('09:40'));
    expect(scheduleGaps(clinician, [], at('12:00', 4))).toEqual([]);
  });

  it('summarises the day and picks who is next', async () => {
    const { entries } = await api.clinic.schedule('cln-lindqvist', TODAY);
    expect(scheduleSummary(entries)).toEqual({ visits: 9, waiting: 0, done: 0, missed: 0, toGo: 9 });
    expect(nextUp(entries, at('05:00'))?.snapshot.patient.firstName).toBe('Marcus');

    // Someone already waiting goes before the next booking.
    const grace = entries.find((e) => e.snapshot.patient.id === 'pat-grace')!;
    grace.appointment.status = 'checked-in';
    expect(nextUp(entries, at('05:00'))?.snapshot.patient.firstName).toBe('Grace');
  });
});

describe('schedule endpoints', () => {
  it('lists one clinician’s day in order with patient snapshots', async () => {
    const { clinician, entries } = await api.clinic.schedule('cln-lindqvist', TODAY);
    expect(clinician.id).toBe('cln-lindqvist');
    expect(entries.map((e) => formatTime(e.appointment.start))).toEqual([

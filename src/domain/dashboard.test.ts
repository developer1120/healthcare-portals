import { addMinutes } from 'date-fns';
import { atTime } from '@/lib/dates';
import { greetingFor } from '@/lib/greeting';
import { TEST_NOW } from '@/test/clock';
import { nextAppointment } from './appointments';
import { panelStatus } from './labs';
import type { Appointment, BloodPressureReading, LabPanel, VitalReading } from './types';
import { averageBloodPressure, lastDays, readingsOf } from './vitals';

const now = TEST_NOW;

function appointment(id: string, start: Date, fields: Partial<Appointment> = {}): Appointment {
  return {
    id,
    patientId: 'p',
    clinicianId: 'c',
    start: start.toISOString(),
    durationMinutes: 20,
    mode: 'in-person',
    status: 'booked',
    reason: 'Check-up',
    location: 'Clinic',
    createdAt: start.toISOString(),
    ...fields,
  };
}

describe('nextAppointment', () => {
  it('picks the soonest visit that is still going ahead', () => {
    const list = [
      appointment('later', atTime(now, 5, '09:00')),
      appointment('cancelled', atTime(now, 1, '09:00'), { status: 'cancelled' }),
      appointment('soonest', atTime(now, 2, '09:00')),
      appointment('past', atTime(now, -2, '09:00'), { status: 'completed' }),
    ];
    expect(nextAppointment(list, now)?.id).toBe('soonest');
  });

  it('keeps showing a visit that has started but not ended', () => {
    const started = appointment('now', addMinutes(now, -10));
    expect(nextAppointment([started], now)?.id).toBe('now');
    expect(nextAppointment([started], addMinutes(now, 15))).toBeUndefined();
  });

  it('returns undefined with nothing booked', () => {
    expect(nextAppointment([], now)).toBeUndefined();
  });
});

describe('greetingFor', () => {
  it.each([
    ['06:30', 'Good morning'],
    ['11:59', 'Good morning'],
    ['12:00', 'Good afternoon'],
    ['17:59', 'Good afternoon'],
    ['18:00', 'Good evening'],
    ['23:30', 'Good evening'],
  ])('%s → %s', (time, greeting) => {
    expect(greetingFor(atTime(now, 0, time))).toBe(greeting);
  });
});

describe('vitals helpers', () => {
  const bp = (day: number, systolic: number, diastolic: number): BloodPressureReading => ({
    id: `bp${day}`,
    patientId: 'p',
    kind: 'blood-pressure',
    takenAt: atTime(now, day, '07:30').toISOString(),
    source: 'home',
    systolic,
    diastolic,
  });
  const readings: VitalReading[] = [
    bp(-1, 128, 82),
    { id: 'hr', patientId: 'p', kind: 'heart-rate', takenAt: atTime(now, -1, '07:30').toISOString(), source: 'home', bpm: 64 },
    bp(-40, 138, 88),
    bp(-10, 131, 84),
  ];

  it('narrows to one kind, oldest first', () => {
    expect(readingsOf(readings, 'blood-pressure').map((r) => r.systolic)).toEqual([138, 131, 128]);
    expect(readingsOf(readings, 'weight')).toEqual([]);
  });

  it('keeps only recent readings', () => {
    expect(lastDays(readingsOf(readings, 'blood-pressure'), 30, now).map((r) => r.systolic)).toEqual([131, 128]);
  });

  it('averages blood pressure and rounds', () => {
    expect(averageBloodPressure([bp(-2, 128, 82), bp(-1, 131, 85)])).toEqual({ systolic: 130, diastolic: 84 });
    expect(averageBloodPressure([])).toBeNull();
  });
});

describe('panelStatus', () => {
  const base: LabPanel = {
    id: 'l',
    patientId: 'p',
    name: 'Panel',
    orderedById: 'c',
    collectedAt: now.toISOString(),
    status: 'final',
    observations: [],
  };
  const obs = (value: number) => ({ code: 'x', name: 'X', value, unit: 'u', refLow: 1, refHigh: 5, criticalHigh: 10 });

  it('describes each kind of result', () => {
    expect(panelStatus({ ...base, status: 'pending' })).toEqual({ tone: 'neutral', label: 'Waiting for results' });
    expect(panelStatus({ ...base, observations: [obs(3)] })).toEqual({ tone: 'ok', label: 'All in range' });
    expect(panelStatus({ ...base, observations: [obs(6), obs(7), obs(3)] })).toEqual({
      tone: 'warn',
      label: '2 outside range',
    });
    expect(panelStatus({ ...base, observations: [obs(6), obs(12)] })).toEqual({
      tone: 'critical',
      label: 'Needs attention',
    });
  });
});

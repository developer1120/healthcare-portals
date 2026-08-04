import { screen, waitFor, within } from '@testing-library/react';
import { addDays, addMinutes, differenceInMinutes } from 'date-fns';
import { api } from '@/api/endpoints';
import { getDb, writeDb } from '@/api/mockDb';
import {
  classifyConnection,
  normalisePhone,
  telehealthAction,
  telehealthStage,
  waitingRoomOpensAt,
} from '@/domain/telehealth';
import type { Appointment } from '@/domain/types';
import { formatDuration, formatTime, toDate } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const now = TEST_NOW;
const AVA = 'pat-ava';
/** Ava's video visit with Dr. Okafor, two days after the test date. */
const VIDEO = 'apt-005';
/** Ava's in-person visit with Jonas Lindqvist. */
const IN_PERSON = 'apt-006';

function visit(fields: Partial<Appointment> = {}): Appointment {
  return {
    id: 'v',
    patientId: AVA,
    clinicianId: 'cln-okafor',
    start: addMinutes(now, 60).toISOString(),
    durationMinutes: 20,
    mode: 'video',
    status: 'booked',
    reason: 'Check-in',
    location: 'Video visit',
    createdAt: now.toISOString(),
    ...fields,
  };
}

const done = { completedAt: now.toISOString(), callbackPhone: '(503) 555-0142', devicesOk: true, consentAt: now.toISOString() };

function videoStart(): Date {
  return toDate(getDb().appointments.find((a) => a.id === VIDEO)!.start);
}

function savePrecheck() {
  writeDb((db) => {
    db.appointments.find((a) => a.id === VIDEO)!.precheck = done;
  });
}

describe('telehealth rules', () => {
  it('walks a video visit through its stages', () => {
    expect(telehealthStage(visit({ mode: 'in-person' }), now)).toBe('not-video');
    expect(telehealthStage(visit({ start: addDays(now, 8).toISOString() }), now)).toBe('too-early');
    expect(telehealthStage(visit(), now)).toBe('precheck');
    expect(telehealthStage(visit({ precheck: done }), now)).toBe('waiting-soon');
    expect(telehealthStage(visit({ precheck: done }), addMinutes(now, 45))).toBe('waiting-open');
    expect(telehealthStage(visit({ precheck: done, status: 'checked-in' }), addMinutes(now, 61))).toBe('checked-in');
    expect(telehealthStage(visit({ precheck: done }), addMinutes(now, 81))).toBe('ended');
    expect(telehealthStage(visit({ status: 'cancelled' }), now)).toBe('ended');
  });

  it('opens the waiting room 15 minutes before the start', () => {
    expect(waitingRoomOpensAt(visit())).toEqual(addMinutes(now, 45));
  });

  it('names the next step for each stage', () => {
    expect(telehealthAction(visit(), now)?.label).toBe('Pre-check in');
    expect(telehealthAction(visit({ precheck: done }), addMinutes(now, 50))).toEqual({
      label: 'Join waiting room',
      href: '/appointments/v/check-in',
    });
    expect(telehealthAction(visit({ mode: 'in-person' }), now)).toBeNull();
  });

  it('rates the connection by round-trip time', () => {
    expect(classifyConnection(40)).toBe('good');
    expect(classifyConnection(250)).toBe('fair');
    expect(classifyConnection(900)).toBe('poor');
  });

  it('normalises US phone numbers', () => {
    expect(normalisePhone('503.555.0142')).toBe('(503) 555-0142');
    expect(normalisePhone('+1 503 555 0142')).toBe('(503) 555-0142');
    expect(normalisePhone('555-0142')).toBeNull();
  });

  it('formats waiting times', () => {
    expect(formatDuration(0.5)).toBe('less than a minute');
    expect(formatDuration(14)).toBe('14 min');
    expect(formatDuration(134)).toBe('2 h 14 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(60 * 27)).toBe('1 day 3 h');
    expect(formatDuration(-5)).toBe('less than a minute');
  });
});

describe('telehealth endpoints', () => {
  const request = { patientId: AVA, appointmentId: VIDEO, callbackPhone: '503 555 0142', devicesOk: true, consent: true };

  it('saves the pre-check and ticks off the pre-check task', async () => {
    const saved = await api.appointments.precheck({ ...request, notes: '  New ankle swelling  ' });
    expect(saved.precheck).toMatchObject({ callbackPhone: '(503) 555-0142', notes: 'New ankle swelling', devicesOk: true });
    expect(getDb().tasks.find((t) => t.kind === 'pre-check')!.completedAt).toBe(now.toISOString());
  });

  it('needs consent and a real phone number', async () => {
    await expect(api.appointments.precheck({ ...request, consent: false })).rejects.toMatchObject({ status: 400 });
    await expect(api.appointments.precheck({ ...request, callbackPhone: '12345' })).rejects.toMatchObject({
      message: 'Enter a 10-digit phone number.',
    });
  });

  it('refuses in-person visits and visits too far away', async () => {
    await expect(api.appointments.precheck({ ...request, appointmentId: IN_PERSON })).rejects.toMatchObject({
      message: 'Pre-check is only for video visits.',
    });
    writeDb((db) => {
      db.appointments.find((a) => a.id === VIDEO)!.start = addDays(now, 10).toISOString();
    });
    await expect(api.appointments.precheck(request)).rejects.toMatchObject({ status: 409 });
  });

  it('only lets patients into the waiting room after pre-check, from 15 minutes before', async () => {
    await expect(api.appointments.checkIn(request)).rejects.toMatchObject({ message: 'Finish your pre-check first.' });

    savePrecheck();
    await expect(api.appointments.checkIn(request)).rejects.toMatchObject({
      message: 'The waiting room opens 15 minutes before your visit.',
    });

    vi.setSystemTime(addMinutes(videoStart(), -10));
    const checkedIn = await api.appointments.checkIn(request);
    expect(checkedIn).toMatchObject({ status: 'checked-in', checkedInAt: addMinutes(videoStart(), -10).toISOString() });

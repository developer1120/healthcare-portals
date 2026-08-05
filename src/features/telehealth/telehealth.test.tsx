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
  });
});

/** Installs a fake getUserMedia. Returns the track stop spy so tests can check the camera turns off. */
function mockMedia(behaviour: 'ok' | 'denied' | 'no-camera') {
  const stop = vi.fn();
  const track = { stop };
  const getUserMedia = vi.fn(async () => {
    if (behaviour === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
    return {
      getVideoTracks: () => (behaviour === 'no-camera' ? [] : [track]),
      getAudioTracks: () => [track],
      getTracks: () => [track],
    } as unknown as MediaStream;
  });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  return stop;
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices');
});

describe('CheckInPage', () => {
  it('is where the dashboard sends patients before a video visit', async () => {
    renderRoute('/');
    const card = await screen.findByRole('region', { name: 'Next visit' });
    expect(await within(card).findByRole('link', { name: 'Pre-check in' })).toHaveAttribute(
      'href',
      `/appointments/${VIDEO}/check-in`,
    );
    expect(within(card).getByRole('link', { name: 'View visit' })).toHaveAttribute('href', `/appointments/${VIDEO}`);
  });

  it('tests the camera and microphone, and turns the camera off when leaving', async () => {
    const stop = mockMedia('ok');
    const { user, unmount } = renderRoute(`/appointments/${VIDEO}/check-in`);
    await user.click(await screen.findByRole('button', { name: 'Test camera and microphone' }));

    expect(await screen.findByText('Camera and microphone are working')).toBeInTheDocument();
    expect(screen.getByLabelText('Your camera preview')).toBeInTheDocument();
    unmount();
    expect(stop).toHaveBeenCalled();
  });

  it('explains blocked permissions and missing devices', async () => {
    mockMedia('denied');
    const { user } = renderRoute(`/appointments/${VIDEO}/check-in`);
    await user.click(await screen.findByRole('button', { name: 'Test camera and microphone' }));
    expect(await screen.findByText(/isn’t allowed to use your camera or microphone/)).toBeInTheDocument();

    mockMedia('no-camera');
    await user.click(screen.getByRole('button', { name: 'Test again' }));
    expect(await screen.findByText(/No camera found/)).toBeInTheDocument();
  });

  it('says when the browser cannot do video at all', async () => {
    const { user } = renderRoute(`/appointments/${VIDEO}/check-in`);
    await user.click(await screen.findByRole('button', { name: 'Test camera and microphone' }));
    expect(await screen.findByText(/This browser can’t run a video visit/)).toBeInTheDocument();
  });

  it('tests the connection', async () => {
    const { user } = renderRoute(`/appointments/${VIDEO}/check-in`);
    await user.click(await screen.findByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText(/Good connection \(\d+ ms\)/)).toBeInTheDocument();
  });

  it('asks for consent, the medication check and a callback number', async () => {
    const { user } = renderRoute(`/appointments/${VIDEO}/check-in`);
    const phone = await screen.findByRole('textbox', { name: /we’ll call you on/ });
    expect(phone).toHaveValue('(503) 555-0142');

    await user.clear(phone);
    await user.type(phone, '555');
    await user.click(screen.getByRole('button', { name: 'Finish pre-check' }));

    expect(phone).toHaveAccessibleDescription('Enter a 10-digit phone number, like (503) 555-0142');
    expect(screen.getByText('Consent is needed for a video visit')).toBeInTheDocument();
    expect(screen.getByText('Check your medication list before continuing')).toBeInTheDocument();
    expect(getDb().appointments.find((a) => a.id === VIDEO)!.precheck).toBeUndefined();
  });

  it('finishes pre-check and shows when the waiting room opens', async () => {
    const { user } = renderRoute(`/appointments/${VIDEO}/check-in`);
    await user.type(await screen.findByRole('textbox', { name: /Anything new since you booked/ }), 'Ankle swelling');
    await user.click(screen.getByRole('checkbox', { name: /checked my medication list/ }));
    await user.click(screen.getByRole('checkbox', { name: /consent to receiving care by video/ }));
    await user.click(screen.getByRole('button', { name: 'Finish pre-check' }));

    const room = await screen.findByRole('region', { name: 'Waiting room' });
    expect(room).toHaveTextContent(`Your waiting room opens at ${formatTime(addMinutes(videoStart(), -15))}`);
    const opensAt = addMinutes(videoStart(), -15);
    expect(room).toHaveTextContent(`opens in ${formatDuration(differenceInMinutes(opensAt, new Date()))}`);
    expect(screen.getByText(/the clinic will call you on \(503\) 555-0142/)).toBeInTheDocument();
    expect(getDb().appointments.find((a) => a.id === VIDEO)!.precheck).toMatchObject({
      notes: 'Ankle swelling',
      devicesOk: false,
    });
  });

  it('lets the patient into the waiting room once it opens', async () => {
    savePrecheck();
    vi.setSystemTime(addMinutes(videoStart(), -5));
    const { user } = renderRoute(`/appointments/${VIDEO}/check-in`);

    const room = await screen.findByRole('region', { name: 'Waiting room' });
    expect(room).toHaveTextContent('Your waiting room is open');
    await user.click(within(room).getByRole('button', { name: 'Join waiting room' }));

    await waitFor(() => expect(room).toHaveTextContent('Dr. Maya Okafor will let you in shortly'));
    expect(room).toHaveTextContent('Waiting less than a minute');
    expect(getDb().appointments.find((a) => a.id === VIDEO)!.status).toBe('checked-in');
  });

  it('sends in-person patients to the front desk', async () => {
    renderRoute(`/appointments/${IN_PERSON}/check-in`);
    expect(await screen.findByText(/This is an in-person visit. Check in at the front desk/)).toBeInTheDocument();
  });

  it('has nothing to do for a cancelled visit', async () => {
    writeDb((db) => {
      db.appointments.find((a) => a.id === VIDEO)!.status = 'cancelled';
    });
    renderRoute(`/appointments/${VIDEO}/check-in`);
    expect(await screen.findByText(/ended or was cancelled/)).toBeInTheDocument();
  });

  it('offers the next step on the visit page', async () => {
    renderRoute(`/appointments/${VIDEO}`);
    expect(await screen.findByRole('link', { name: 'Pre-check in' })).toHaveAttribute(
      'href',
      `/appointments/${VIDEO}/check-in`,
    );
  });
});

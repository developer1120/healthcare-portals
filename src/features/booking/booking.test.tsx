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
        start: addDays(now, 3).toISOString(),
        mode: 'in-person',
        reason: 'Mole check',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'forbidden' });
  });

  it('refuses video with a clinician who only sees people in person', async () => {
    writeDb((db) => {
      db.clinicians.find((c) => c.id === 'cln-sato')!.offersVideo = false;
    });
    const start = await firstSlot('cln-sato');
    await expect(
      api.appointments.book({ patientId: 'pat-ava', clinicianId: 'cln-sato', start, mode: 'video', reason: 'Migraines' }),
    ).rejects.toMatchObject({ status: 400, code: 'validation' });
  });

  it('needs a reason', async () => {
    const start = await firstSlot('cln-sato');
    await expect(
      api.appointments.book({ patientId: 'pat-ava', clinicianId: 'cln-sato', start, mode: 'video', reason: ' ' }),
    ).rejects.toMatchObject({ message: 'Add a short reason for the visit.' });
  });

  it('stops a patient double-booking themselves', async () => {
    const start = await firstSlot('cln-sato');
    writeDb((db) => {
      db.appointments.push({
        ...db.appointments.find((a) => a.patientId === 'pat-ava')!,
        id: 'apt-mine',
        clinicianId: 'cln-ferreira',
        start,
        status: 'booked',
      });
    });
    await expect(
      api.appointments.book({ patientId: 'pat-ava', clinicianId: 'cln-sato', start, mode: 'video', reason: 'Migraines' }),
    ).rejects.toMatchObject({ message: 'You already have a visit at that time.' });
  });

  it('does not offer nurses or coordinators for booking', async () => {
    await expect(api.availability.list('cln-delgado')).rejects.toMatchObject({ status: 404 });
  });
});

function timeOptions() {
  const times = screen.getByRole('group', { name: /^Time on/ });
  return within(times).getAllByRole('radio');
}

describe('BookingPage', () => {
  it('books a visit end to end and confirms it on the visit page', async () => {
    const { user, router } = renderRoute('/appointments/book?clinician=cln-sato');

    await screen.findByRole('group', { name: /^Time on/ });
    const slot = timeOptions()[0]!;
    await user.click(slot);
    // In person, a neurologist is a specialist visit; on video it's the cheaper video copay.
    expect(await within(screen.getByLabelText('Booking summary')).findByText('$50.00 copay')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Video visit' }));
    await user.type(screen.getByRole('textbox', { name: /What would you like to talk about/ }), 'Migraines most weeks');

    const summary = screen.getByLabelText('Booking summary');
    expect(summary).toHaveTextContent('Dr. Hana Sato, Neurology');
    expect(summary).toHaveTextContent('Video visit');
    expect(summary).toHaveTextContent('From home');
    expect(summary).toHaveTextContent('$15.00 copay');

    await user.click(screen.getByRole('button', { name: 'Book visit' }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/appointments\/apt-/));
    expect(await screen.findByText(/Your visit is booked/)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Migraines most weeks' })).toBeInTheDocument();
    const booked = getDb().appointments.find((a) => a.reason === 'Migraines most weeks')!;
    expect(booked).toMatchObject({ clinicianId: 'cln-sato', mode: 'video', start: (slot as HTMLInputElement).value });
  });

  it('lists the care team first and blocks clinicians who are not taking patients', async () => {
    const { user, router } = renderRoute('/appointments/book');
    const options = await screen.findAllByRole('radio', { name: /Dr\.|Jonas/ });

    expect(options[0]!.closest('label')).toHaveTextContent('Your care team');
    const raman = screen.getByRole('radio', { name: /Dr. Priya Raman/ });
    expect(raman).toBeDisabled();
    expect(raman.closest('label')).toHaveTextContent('Not taking new patients');

    await user.click(screen.getByRole('radio', { name: /Dr. Hana Sato/ }));
    expect(new URLSearchParams(router.state.location.search).get('clinician')).toBe('cln-sato');
    expect(await screen.findByRole('group', { name: /^Time on/ })).toBeInTheDocument();
  });

  it('searches clinicians by language', async () => {
    const { user } = renderRoute('/appointments/book');
    await user.type(await screen.findByRole('searchbox', { name: 'Search clinicians' }), 'japanese');
    const group = screen.getByRole('group', { name: 'Clinician' });
    expect(within(group).getAllByRole('radio')).toHaveLength(1);
    expect(within(group).getByRole('radio', { name: /Dr. Hana Sato/ })).toBeInTheDocument();
  });

  it('asks for a time and a reason before booking', async () => {
    const { user } = renderRoute('/appointments/book?clinician=cln-sato');
    await screen.findByRole('group', { name: /^Time on/ });

    await user.click(screen.getByRole('button', { name: 'Book visit' }));

    expect(screen.getByRole('textbox', { name: /What would you like to talk about/ })).toBeInvalid();
    await user.type(screen.getByRole('textbox', { name: /What would you like to talk about/ }), 'Headaches');
    await user.click(screen.getByRole('button', { name: 'Book visit' }));
    expect(screen.getByText('Choose a time for your visit.')).toBeInTheDocument();
  });

  it('explains when the slot was just taken and clears the choice', async () => {
    const { user } = renderRoute('/appointments/book?clinician=cln-sato');
    await screen.findByRole('group', { name: /^Time on/ });
    const slot = timeOptions()[0] as HTMLInputElement;
    await user.click(slot);
    await user.type(screen.getByRole('textbox', { name: /What would you like to talk about/ }), 'Headaches');

    // Another patient books the same time while Ava is typing.
    await api.appointments.book({
      patientId: 'pat-kai',
      clinicianId: 'cln-sato',
      start: slot.value,
      mode: 'in-person',
      reason: 'Sleep',
    });
    await user.click(screen.getByRole('button', { name: 'Book visit' }));

    expect(await screen.findByText('That time was just taken. Pick another time.')).toBeInTheDocument();
    await waitFor(() => expect(timeOptions().map((r) => (r as HTMLInputElement).value)).not.toContain(slot.value));
    expect(timeOptions().every((r) => !(r as HTMLInputElement).checked)).toBe(true);
  });

  it('ignores a clinician in the URL the patient cannot book', async () => {
    renderRoute('/appointments/book?clinician=cln-raman');
    expect(await screen.findByText('Choose a clinician to see their free times.')).toBeInTheDocument();
  });

  it('is linked from the appointments list', async () => {
    renderRoute('/appointments');
    expect(await screen.findByRole('link', { name: 'Book a visit' })).toHaveAttribute('href', '/appointments/book');
  });
});

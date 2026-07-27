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
      '08:00', '08:20', '09:00', '09:40', '10:20', '11:00', '13:00', '13:40', '14:20',
    ]);
    expect(entries.every((e) => e.appointment.clinicianId === 'cln-lindqvist')).toBe(true);
    expect(entries[0]!.snapshot.conditions.length).toBe(3);
    await expect(api.clinic.schedule('cln-nobody', TODAY)).rejects.toMatchObject({ status: 404 });
  });

  it('applies allowed changes and refuses the rest', async () => {
    const marcus = visit('pat-marcus');
    const update = (action: 'check-in' | 'complete' | 'no-show', clinicianId = 'cln-lindqvist') =>
      api.clinic.updateVisit({ clinicianId, appointmentId: marcus.id, action });

    await expect(update('check-in')).rejects.toMatchObject({ status: 409 });
    vi.setSystemTime(at('07:50'));
    await expect(update('check-in', 'cln-okafor')).rejects.toMatchObject({ status: 404 });
    await expect(update('check-in')).resolves.toMatchObject({ status: 'checked-in', checkedInAt: at('07:50').toISOString() });
    await expect(update('complete')).rejects.toMatchObject({ status: 409 });
    vi.setSystemTime(at('08:25'));
    await expect(update('complete')).resolves.toMatchObject({ status: 'completed' });
    expect(visit('pat-marcus').status).toBe('completed');
  });
});

describe('schedule page', () => {
  const row = (name: RegExp) => within(screen.getByRole('list', { name: 'Schedule' })).getByRole('listitem', { name });

  it('shows the day with who is next, open time and where "now" is', async () => {
    renderRoute('/clinic', { as: 'clinician' });
    expect(await screen.findByRole('heading', { name: /Tuesday 13 October/ })).toHaveTextContent('Today');
    const summary = await screen.findByLabelText('Day summary');
    expect(summary).toHaveTextContent('Visits9');
    expect(summary).toHaveTextContent('To go9');
    expect(screen.getByRole('region', { name: 'Next up' })).toHaveTextContent('Next up at 08:00Marcus Bell');

    const schedule = screen.getByRole('list', { name: 'Schedule' });
    expect(within(schedule).getAllByRole('listitem', { name: /^\d\d:\d\d / })).toHaveLength(9);
    expect(within(schedule).getByText('Open 11:20–13:00')).toBeInTheDocument();
    expect(schedule.firstElementChild).toHaveTextContent('Now 05:00');

    const grace = row(/09:40 Grace Whitfield/);
    expect(within(grace).getByText('High risk')).toBeInTheDocument();
    expect(within(grace).getByRole('link', { name: 'Grace Whitfield' })).toHaveAttribute('href', '/clinic/patients/pat-grace');
    expect(within(grace).queryByRole('button')).not.toBeInTheDocument();
  });

  it('checks a patient in and completes the visit', async () => {
    seedThenMoveClockTo('08:05');
    const { user } = renderRoute('/clinic', { as: 'clinician' });
    await screen.findByRole('list', { name: 'Schedule' });

    await user.click(within(row(/08:00 Marcus Bell/)).getByRole('button', { name: 'Mark arrived' }));
    expect(await within(row(/08:00 Marcus Bell/)).findByText('Arrived · 0 min')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Next up' })).toHaveTextContent('Waiting 0 min');
    expect(screen.getByLabelText('Day summary')).toHaveTextContent('Waiting1');

    await user.click(within(row(/08:00 Marcus Bell/)).getByRole('button', { name: 'Complete visit' }));
    expect(await within(row(/08:00 Marcus Bell/)).findByText('Completed')).toBeInTheDocument();
    expect(screen.getByLabelText('Day summary')).toHaveTextContent('Done1');
    expect(screen.getByRole('region', { name: 'Next up' })).toHaveTextContent('Lucía Navarro');
  });

  it('marks a late patient missed and can undo it', async () => {
    seedThenMoveClockTo('08:40');
    const { user } = renderRoute('/clinic', { as: 'clinician' });
    await screen.findByRole('list', { name: 'Schedule' });

    const marcus = () => row(/08:00 Marcus Bell/);
    expect(within(marcus()).getByText('Not checked in')).toBeInTheDocument();
    await user.click(within(marcus()).getByRole('button', { name: 'Mark missed' }));
    expect(await within(marcus()).findByText('Missed')).toBeInTheDocument();
    expect(screen.getByLabelText('Day summary')).toHaveTextContent('Missed1');

    await user.click(within(marcus()).getByRole('button', { name: 'Undo missed' }));
    expect(await within(marcus()).findByText('Not checked in')).toBeInTheDocument();
  });

  it('moves between days and says when there is no clinic', async () => {
    const { user, router } = renderRoute('/clinic', { as: 'clinician' });
    await screen.findByRole('list', { name: 'Schedule' });

    await user.click(screen.getByRole('button', { name: 'Next day' }));
    expect(router.state.location.search).toBe('?date=2026-10-14');
    expect(await screen.findByRole('heading', { level: 1, name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wednesday 14 October' })).toBeInTheDocument();
    expect(await screen.findByText('No visits booked on this day.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to today' }));
    expect(router.state.location.search).toBe('');
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
  });

  it('shows weekends as no clinic', async () => {
    renderRoute('/clinic?date=2026-10-17', { as: 'clinician' });
    expect(await screen.findByText('No clinic on this day.')).toBeInTheDocument();
  });
});

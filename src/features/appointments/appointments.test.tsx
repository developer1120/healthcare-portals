import { screen, within } from '@testing-library/react';
import { filterAppointments, groupByMonth, splitAppointments } from '@/domain/appointments';
import type { Appointment, Clinician } from '@/domain/types';
import { atTime } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const now = TEST_NOW;

function appointment(id: string, day: number, fields: Partial<Appointment> = {}): Appointment {
  const start = atTime(now, day, '10:00');
  return {
    id,
    patientId: 'p',
    clinicianId: 'cln-a',
    start: start.toISOString(),
    durationMinutes: 30,
    mode: 'in-person',
    status: day < 0 ? 'completed' : 'booked',
    reason: 'Check-up',
    location: 'Harbour Street',
    createdAt: start.toISOString(),
    ...fields,
  };
}

describe('appointment helpers', () => {
  const list = [
    appointment('past-old', -40),
    appointment('soon', 2, { mode: 'video', clinicianId: 'cln-b', reason: 'Medication check-in' }),
    appointment('cancelled-future', 5, { status: 'cancelled' }),
    appointment('past-recent', -3, { status: 'no-show' }),
    appointment('later', 40),
  ];
  const clinicians = [{ id: 'cln-b', name: 'Dr. Maya Okafor' }] as Clinician[];

  it('splits into upcoming (soonest first) and past (newest first)', () => {
    const { upcoming, past } = splitAppointments(list, now);
    expect(upcoming.map((a) => a.id)).toEqual(['soon', 'later']);
    // A cancelled future visit belongs with the past ones: it is no longer happening.
    expect(past.map((a) => a.id)).toEqual(['cancelled-future', 'past-recent', 'past-old']);
  });

  it('filters by clinician, mode, status and free text', () => {
    expect(filterAppointments(list, { clinicianId: 'cln-b' }).map((a) => a.id)).toEqual(['soon']);
    expect(filterAppointments(list, { mode: 'video' }).map((a) => a.id)).toEqual(['soon']);
    expect(filterAppointments(list, { status: 'no-show' }).map((a) => a.id)).toEqual(['past-recent']);
    expect(filterAppointments(list, { query: '  OKAFOR ' }, clinicians).map((a) => a.id)).toEqual(['soon']);
    expect(filterAppointments(list, { query: 'medication' }).map((a) => a.id)).toEqual(['soon']);
    expect(filterAppointments(list, { query: 'harbour', mode: 'video' })).toEqual([list[1]]);
    expect(filterAppointments(list, {})).toHaveLength(list.length);
  });

  it('groups consecutive visits by month without reordering', () => {
    const { upcoming } = splitAppointments(list, now);
    expect(groupByMonth(upcoming).map((g) => [g.month, g.appointments.length])).toEqual([
      ['October 2026', 1],
      ['November 2026', 1],
    ]);
  });
});

/** Appointment rows on the page (the care panel has links into appointments too). */
function rows() {
  return within(screen.getByRole('main'))
    .getAllByRole('listitem')
    .filter((item) => item.querySelector('a[href^="/appointments/"]'));
}

describe('AppointmentsPage', () => {
  it('lists upcoming visits by month, soonest first', async () => {
    renderRoute('/appointments');

    expect(await screen.findByText('3 upcoming visits')).toBeInTheDocument();
    const months = within(screen.getByRole('main')).getAllByRole('heading', { level: 2 });
    expect(months.map((h) => h.textContent)).toEqual([
      'October 2026',
      'November 2026',
    ]);
    const first = rows()[0]!;
    expect(first).toHaveTextContent('Medication check-in');
    expect(first).toHaveTextContent('Dr. Maya Okafor · Cardiology');
    expect(first).toHaveTextContent('15 Oct · 10:30 – 10:50 · in 2 days');
    expect(within(first).getByText('Booked')).toHaveAttribute('data-tone', 'info');
    expect(within(first).getByRole('link')).toHaveAttribute('href', '/appointments/apt-005');
  });

  it('switches to past visits, newest first, and records it in the URL', async () => {
    const { user, router } = renderRoute('/appointments');
    await user.click(await screen.findByRole('radio', { name: 'Past (4)' }));

    expect(router.state.location.search).toBe('?view=past');

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
    expect(screen.getByText('4 past visits')).toBeInTheDocument();
    const reasons = ['Mole check', 'Annual physical', 'Prediabetes follow-up', 'Blood pressure review'];
    expect(rows()).toHaveLength(reasons.length);
    reasons.forEach((reason, i) => expect(rows()[i]).toHaveTextContent(reason));
    expect(within(rows()[0]!).getByText('Cancelled')).toBeInTheDocument();
  });

  it('filters by clinician and clears back to everything', async () => {
    const { user, router } = renderRoute('/appointments');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Clinician' }), 'cln-okafor');

    expect(screen.getByText('Showing 1 of 3 upcoming visits')).toBeInTheDocument();
    expect(new URLSearchParams(router.state.location.search).get('clinician')).toBe('cln-okafor');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('3 upcoming visits')).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
  });

  it('searches by reason', async () => {
    const { user } = renderRoute('/appointments');
    await user.type(await screen.findByRole('searchbox', { name: 'Search appointments' }), 'flu');

    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('Flu vaccine and BP check');
  });

  it('filters past visits by outcome', async () => {
    const { user } = renderRoute('/appointments?view=past');
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Outcome' }), 'cancelled');
    expect(screen.getByText('Showing 1 of 4 past visits')).toBeInTheDocument();
  });

  it('restores filters from the URL and explains when nothing matches', async () => {
    renderRoute('/appointments?view=past&mode=video');
    expect(await screen.findByText('Showing 1 of 4 past visits')).toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent('Prediabetes follow-up');
    expect(screen.getByRole('combobox', { name: 'Visit type' })).toHaveValue('video');
  });

  it('says so when no visit matches', async () => {
    const { user } = renderRoute('/appointments');
    await user.type(await screen.findByRole('searchbox', { name: 'Search appointments' }), 'zzz');
    expect(screen.getByText('No visits match these filters. Try clearing them.')).toBeInTheDocument();
  });

  it('ignores unknown filter values in the URL', async () => {
    renderRoute('/appointments?mode=teleport&status=cancelled');
    // status only applies to past visits, and "teleport" is not a mode.
    expect(await screen.findByText('3 upcoming visits')).toBeInTheDocument();
  });
});

describe('AppointmentDetailPage', () => {
  it('opens from the list and shows preparation tips for an upcoming video visit', async () => {
    const { user, router } = renderRoute('/appointments');
    await user.click(await screen.findByRole('link', { name: /Medication check-in/ }));

    expect(router.state.location.pathname).toBe('/appointments/apt-005');
    expect(await screen.findByRole('heading', { level: 1, name: 'Visit with Dr. Maya Okafor' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Medication check-in' })).toBeInTheDocument();
    expect(screen.getByText('Thu 15 Oct · 10:30 – 10:50')).toBeInTheDocument();
    const prep = screen.getByRole('region', { name: 'Before your visit' });
    expect(prep).toHaveTextContent('Check your camera and microphone');
    expect(screen.getByRole('link', { name: 'All appointments' })).toHaveAttribute('href', '/appointments');
  });

  it('shows the visit summary for a completed visit', async () => {
    renderRoute('/appointments/apt-003');
    const summary = await screen.findByRole('region', { name: 'Visit summary' });
    expect(within(summary).getByRole('heading', { name: 'What we found' })).toBeInTheDocument();
    expect(summary).toHaveTextContent('Blood pressure 131/84 in clinic');
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('says when no summary has been shared yet', async () => {
    renderRoute('/appointments/apt-002');
    expect(await screen.findByText('No summary has been shared for this visit yet.')).toBeInTheDocument();
  });

  it('explains a cancellation', async () => {
    renderRoute('/appointments/apt-004');
    expect(await screen.findByText(/Clinician unavailable/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Before your visit' })).not.toBeInTheDocument();
  });

  it('does not show another patient’s appointment', async () => {
    // apt-008 belongs to a different patient in the seed.
    renderRoute('/appointments/apt-008');
    expect(await screen.findByText(/couldn't find that appointment/)).toBeInTheDocument();
  });
});

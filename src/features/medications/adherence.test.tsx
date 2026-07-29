import { screen, waitFor, within } from '@testing-library/react';
import { api } from '@/api/endpoints';
import { getDb } from '@/api/mockDb';
import { adherenceSummary, canMarkDose, dosesOn } from '@/domain/adherence';
import type { DoseLog, Medication } from '@/domain/types';
import { atTime, toIsoDate } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const now = TEST_NOW;
const AVA = 'pat-ava';

const twiceDaily: Medication = {
  id: 'm1',
  patientId: AVA,
  name: 'Metformin',
  strength: '500 mg',
  form: 'tablet',
  instructions: 'With meals',
  doseTimes: ['08:00', '19:00'],
  asNeeded: false,
  prescriberId: 'cln-ferreira',
  startDate: '2026-01-01',
  status: 'active',
  refillsRemaining: 2,
  daysSupply: 90,
  lastFilledAt: '2026-10-01T12:00:00Z',
  pharmacy: 'Hawthorne',
};

function taken(day: number, time: string, medicationId = 'm1'): DoseLog {
  const at = atTime(now, day, time);
  return { id: `${medicationId}-${day}-${time}`, medicationId, scheduledFor: at.toISOString(), takenAt: at.toISOString(), skipped: false };
}

describe('dose states', () => {
  it('moves from later, to due, to not marked as the day goes on', () => {
    const at = (time: string) => dosesOn(now, [twiceDaily], [], atTime(now, 0, time)).map((d) => d.state);
    expect(at('06:00')).toEqual(['upcoming', 'upcoming']);
    expect(at('07:30')).toEqual(['due', 'upcoming']);
    expect(at('09:30')).toEqual(['due', 'upcoming']);
    expect(at('10:30')).toEqual(['missed', 'upcoming']);
  });

  it('uses the log when there is one', () => {
    const skipped = { ...taken(0, '08:00'), takenAt: undefined, skipped: true };
    expect(dosesOn(now, [twiceDaily], [taken(0, '08:00')], atTime(now, 0, '20:00')).map((d) => d.state)).toEqual([
      'taken',
      'due',
    ]);
    expect(dosesOn(now, [twiceDaily], [skipped], atTime(now, 0, '09:00'))[0]!.state).toBe('skipped');
  });

  it('leaves out as-needed medicines and ones not being taken that day', () => {
    const asNeeded = { ...twiceDaily, id: 'm2', asNeeded: true };
    const stopped = { ...twiceDaily, id: 'm3', status: 'stopped' as const, endDate: toIsoDate(atTime(now, -3, '12:00')) };
    const notStarted = { ...twiceDaily, id: 'm4', startDate: toIsoDate(atTime(now, 2, '12:00')) };
    expect(dosesOn(now, [asNeeded, stopped, notStarted], [], now)).toEqual([]);
    expect(dosesOn(atTime(now, -5, '12:00'), [stopped], [], now)).toHaveLength(2);
  });

  it('allows marking from an hour before the dose', () => {
    const dose = atTime(now, 0, '08:00');
    expect(canMarkDose(dose, atTime(now, 0, '06:59'))).toBe(false);
    expect(canMarkDose(dose, atTime(now, 0, '07:00'))).toBe(true);
  });
});

describe('adherenceSummary', () => {
  it('counts past doses only, by day and by medicine, and finds the streak', () => {
    const logs = [
      taken(-3, '08:00'),
      taken(-3, '19:00'),
      taken(-2, '08:00'),
      taken(-2, '19:00'),
      taken(-1, '08:00'),
      taken(-1, '19:00'),
      taken(0, '08:00'),
    ];
    const summary = adherenceSummary([twiceDaily], logs, 4, atTime(now, 0, '09:00'));

    // Today's 08:00 is taken; the 19:00 dose is still upcoming and not counted.
    expect(summary.days.map((d) => [d.scheduled, d.taken])).toEqual([
      [2, 2],
      [2, 2],
      [2, 2],
      [1, 1],
    ]);
    expect(summary.rate).toBe(1);
    expect(summary.streak).toBe(3);
    expect(summary.byMedication[0]).toMatchObject({ scheduled: 7, taken: 7 });
  });

  it('breaks the streak on a missed dose and has no rate with nothing due', () => {
    const summary = adherenceSummary([twiceDaily], [taken(-1, '08:00'), taken(-1, '19:00'), taken(-2, '08:00')], 3, atTime(now, 0, '06:00'));
    expect(summary.streak).toBe(1);
    expect(summary.rate).toBeCloseTo(3 / 4);
    expect(adherenceSummary([], [], 14, now).rate).toBeNull();
  });
});

/**
 * Builds the demo data at 05:00 local on the test day (before any dose is due,
 * in any time zone), then moves the clock to `time`.
 */
function startDayAt(time = '05:00') {
  vi.setSystemTime(atTime(now, 0, '05:00'));
  getDb();
  vi.setSystemTime(atTime(now, 0, time));
}

describe('dose endpoint', () => {
  const lisinoprilToday = () => atTime(now, 0, '08:00').toISOString();

  it('records, changes and clears a dose', async () => {
    startDayAt('08:20');
    const request = { patientId: AVA, medicationId: 'med-lisinopril', scheduledFor: lisinoprilToday() };

    expect(await api.doses.record({ ...request, action: 'taken' })).toMatchObject({ skipped: false, takenAt: expect.any(String) });
    expect(await api.doses.record({ ...request, action: 'skipped' })).toMatchObject({ skipped: true, takenAt: undefined });
    await api.doses.record({ ...request, action: 'clear' });
    expect(getDb().doseLogs.filter((l) => l.scheduledFor === lisinoprilToday() && l.medicationId === 'med-lisinopril')).toEqual([]);
  });

  it('refuses times that aren’t dose times, early marks and other patients’ medicines', async () => {
    startDayAt();
    const request = { patientId: AVA, medicationId: 'med-lisinopril', action: 'taken' as const };
    await expect(api.doses.record({ ...request, scheduledFor: atTime(now, 0, '09:00').toISOString() })).rejects.toMatchObject({
      status: 400,
    });
    await expect(api.doses.record({ ...request, scheduledFor: lisinoprilToday() })).rejects.toMatchObject({
      message: 'You can mark a dose from 60 minutes before it’s due.',
    });
    await expect(
      api.doses.record({ ...request, medicationId: 'med-samir-metformin', scheduledFor: lisinoprilToday() }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('Medications page schedule', () => {
  it('lists today’s doses by time, not yet markable before the hour', async () => {
    startDayAt();
    renderRoute('/medications');
    const today = await screen.findByRole('region', { name: 'Today' });
    expect(today).toHaveTextContent('0 of 4 doses taken');
    expect(within(today).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['08:00', '19:00', '21:30']);
    const morning = within(today).getByRole('region', { name: '08:00 doses' });
    expect(morning).toHaveTextContent('Lisinopril 10 mg');
    expect(morning).toHaveTextContent('Metformin 500 mg');
    expect(morning).toHaveTextContent('From 07:00');
  });

  it('ticks a due dose taken, then undoes it', async () => {
    startDayAt('08:30');
    const { user } = renderRoute('/medications');
    const today = await screen.findByRole('region', { name: 'Today' });

    await user.click(within(today).getByRole('button', { name: 'Mark Lisinopril 10 mg taken' }));
    expect(within(today).getByText('Taken at 08:30')).toBeInTheDocument();
    expect(today).toHaveTextContent('1 of 4 doses taken');
    await waitFor(() =>
      expect(getDb().doseLogs.some((l) => l.medicationId === 'med-lisinopril' && l.scheduledFor === atTime(now, 0, '08:00').toISOString())).toBe(true),
    );

    await user.click(within(today).getByRole('button', { name: 'Undo Lisinopril 10 mg' }));
    expect(await within(today).findByRole('button', { name: 'Mark Lisinopril 10 mg taken' })).toBeInTheDocument();
  });

  it('skips a dose', async () => {
    startDayAt('08:30');
    const { user } = renderRoute('/medications');
    const today = await screen.findByRole('region', { name: 'Today' });
    await user.click(within(today).getByRole('button', { name: 'Skip Metformin 500 mg' }));
    expect(within(within(today).getByRole('region', { name: '08:00 doses' })).getByText('Skipped')).toBeInTheDocument();
  });

  it('summarises the last 14 days', async () => {
    startDayAt();
    renderRoute('/medications');
    const card = await screen.findByRole('region', { name: 'Last 14 days' });
    const db = getDb();
    const meds = db.medications.filter((m) => m.patientId === AVA);
    const expected = adherenceSummary(meds, db.doseLogs, 14, new Date());

    expect(card).toHaveTextContent(`${Math.round(expected.rate! * 100)}%of doses taken`);
    const days = within(within(card).getByRole('list', { name: 'Doses taken each day' })).getAllByRole('listitem');
    expect(days).toHaveLength(14);
    const yesterday = expected.days[12]!;
    expect(days[12]).toHaveTextContent(`${yesterday.taken} of ${yesterday.scheduled} doses taken`);
    expect(within(card).getByRole('list', { name: 'By medicine' })).toHaveTextContent('Lisinopril 10 mg');
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import { addDays, addHours } from 'date-fns';
import { api } from '@/api/endpoints';
import { getDb } from '@/api/mockDb';
import { adviceFor, readingProblems } from '@/domain/vitalEntry';
import type { NewReading } from '@/domain/vitalEntry';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';
import { READINGS_PER_PAGE } from './VitalsPage';

const now = TEST_NOW;
const AVA = 'pat-ava';
const at = now.toISOString();

describe('readingProblems', () => {
  it('accepts a sensible reading', () => {
    expect(readingProblems({ kind: 'blood-pressure', systolic: 128, diastolic: 82, takenAt: at }, now)).toEqual([]);
  });

  it('catches impossible numbers, swapped blood pressure and bad times', () => {
    expect(readingProblems({ kind: 'blood-pressure', systolic: 80, diastolic: 120, takenAt: at }, now)).toEqual([
      'The top number should be higher than the bottom number.',
    ]);
    expect(readingProblems({ kind: 'heart-rate', bpm: 400, takenAt: at }, now)).toEqual([
      'Heart rate should be between 30 and 220 beats per minute.',
    ]);
    expect(readingProblems({ kind: 'weight', kg: 73, takenAt: addHours(now, 2).toISOString() }, now)).toEqual([
      'That time is in the future.',
    ]);
    expect(readingProblems({ kind: 'weight', kg: 73, takenAt: addDays(now, -31).toISOString() }, now)).toEqual([
      'Readings older than 30 days can’t be added here.',
    ]);
  });
});

describe('adviceFor', () => {
  const bp = (systolic: number, diastolic: number): NewReading => ({ kind: 'blood-pressure', systolic, diastolic, takenAt: at });

  it('is urgent for a hypertensive crisis and very low glucose', () => {
    expect(adviceFor(bp(190, 110))).toMatchObject({ urgent: true, title: 'This reading is very high' });
    expect(adviceFor({ kind: 'glucose', mgPerDl: 48, context: 'random', takenAt: at })).toMatchObject({
      urgent: true,
      title: 'Your blood sugar is low',
    });
  });

  it('gives a gentler next step for less serious readings, and nothing in range', () => {
    expect(adviceFor(bp(145, 92))).toMatchObject({ urgent: false, title: 'Higher than your target' });
    expect(adviceFor({ kind: 'glucose', mgPerDl: 62, context: 'fasting', takenAt: at })?.urgent).toBe(false);
    expect(adviceFor(bp(118, 76))).toBeNull();
    expect(adviceFor({ kind: 'weight', kg: 73, takenAt: at })).toBeNull();
  });
});

describe('vitals endpoint', () => {
  it('saves a home reading and ticks off today’s blood pressure task', async () => {
    const reading = await api.vitals.add(AVA, { kind: 'blood-pressure', systolic: 126, diastolic: 80, takenAt: at, note: ' after walk ' });
    expect(reading).toMatchObject({ patientId: AVA, source: 'home', note: 'after walk' });
    expect(getDb().tasks.find((t) => t.id === 'tsk-1')!.completedAt).toBeDefined();
  });

  it('does not tick the task off for a reading from another day', async () => {
    await api.vitals.add(AVA, { kind: 'blood-pressure', systolic: 126, diastolic: 80, takenAt: addDays(now, -2).toISOString() });
    expect(getDb().tasks.find((t) => t.id === 'tsk-1')!.completedAt).toBeUndefined();
  });

  it('rejects readings that fail the checks', async () => {
    await expect(api.vitals.add(AVA, { kind: 'heart-rate', bpm: 12, takenAt: at })).rejects.toMatchObject({ status: 400 });
  });
});

describe('VitalsPage', () => {
  it('starts on the type the link asks for and lists recent readings', async () => {
    renderRoute('/vitals?kind=weight');
    expect(screen.getByRole('radio', { name: 'Weight' })).toBeChecked();
    const recent = await screen.findByRole('table', { name: /^Weight readings, newest first/ });
    expect(within(recent).getAllByRole('row').length).toBeGreaterThan(2);
    expect(screen.getByRole('textbox', { name: /^Weight/ })).toBeInTheDocument();
  });

  it('logs a blood pressure reading and says what it means', async () => {
    const { user } = renderRoute('/vitals');
    await user.type(await screen.findByRole('textbox', { name: /Top number/ }), '128');
    await user.type(screen.getByRole('textbox', { name: /Bottom number/ }), '82');
    await user.click(screen.getByRole('button', { name: 'Save reading' }));

    const saved = await screen.findByRole('status', { name: '' });
    expect(saved).toHaveTextContent('Saved 128/82 mmHg');
    expect(within(saved).getByText('High (stage 1)')).toHaveAttribute('data-tone', 'warn');
    expect(screen.getByRole('textbox', { name: /Top number/ })).toHaveValue('');
    await waitFor(() =>
      expect(within(screen.getByRole('table', { name: /^Blood pressure readings/ })).getAllByRole('row')[1]).toHaveTextContent('128/82 mmHg'),
    );
  });


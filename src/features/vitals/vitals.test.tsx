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

  it('explains each problem next to its field', async () => {
    const { user } = renderRoute('/vitals');
    const top = await screen.findByRole('textbox', { name: /Top number/ });
    const bottom = screen.getByRole('textbox', { name: /Bottom number/ });

    await user.click(screen.getByRole('button', { name: 'Save reading' }));
    expect(top).toHaveAccessibleDescription(/Enter the top number/);

    await user.type(top, '80');
    await user.type(bottom, '120');
    await user.click(screen.getByRole('button', { name: 'Save reading' }));
    expect(bottom).toHaveAccessibleDescription(/should be lower than the top number/);

    await user.clear(top);
    await user.type(top, '1280');
    await user.click(screen.getByRole('button', { name: 'Save reading' }));
    expect(top).toHaveAccessibleDescription(/That looks unlikely. The top number is usually between 70 and 250/);
  });

  it('shows urgent advice for a very high reading', async () => {
    const { user } = renderRoute('/vitals');
    await user.type(await screen.findByRole('textbox', { name: /Top number/ }), '192');
    await user.type(screen.getByRole('textbox', { name: /Bottom number/ }), '124');
    await user.click(screen.getByRole('button', { name: 'Save reading' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This reading is very high');
    expect(alert).toHaveTextContent('call 911');
  });

  it('converts glucose from mmol/L before saving', async () => {
    const { user } = renderRoute('/vitals?kind=glucose');
    await user.click(await screen.findByRole('radio', { name: 'mmol/L' }));
    await user.type(screen.getByRole('textbox', { name: /Blood glucose/ }), '6.0');
    await user.selectOptions(screen.getByRole('combobox', { name: 'When' }), 'after-meal');
    await user.click(screen.getByRole('button', { name: 'Save reading' }));

    expect(await screen.findByText(/Saved/)).toHaveTextContent('Saved 108 mg/dL');
    expect(getDb().vitals.at(-1)).toMatchObject({ kind: 'glucose', mgPerDl: 108, context: 'after-meal' });
  });

  it('converts weight from pounds', async () => {
    const { user } = renderRoute('/vitals?kind=weight');
    await user.click(await screen.findByRole('radio', { name: 'lb' }));
    await user.type(screen.getByRole('textbox', { name: /^Weight/ }), '161.4');
    await user.click(screen.getByRole('button', { name: 'Save reading' }));
    await waitFor(() => expect(getDb().vitals.at(-1)).toMatchObject({ kind: 'weight', kg: 73.2 }));
  });

  it('refuses a time in the future', async () => {
    const { user } = renderRoute('/vitals?kind=heart-rate');
    const when = await screen.findByLabelText(/Taken at/);
    await user.clear(when);
    await user.type(when, '2026-10-20T09:00');
    await user.type(screen.getByRole('textbox', { name: /Resting heart rate/ }), '64');
    await user.click(screen.getByRole('button', { name: 'Save reading' }));
    expect(when).toHaveAccessibleDescription('That time is in the future');
  });
});

describe('reading history pages', () => {
  const history = () => screen.getByRole('table', { name: /readings, newest first/ });
  const firstRow = () => within(history()).getAllByRole('row')[1]!.textContent;

  it('pages through every reading, newest first, keeping the page in the URL', async () => {
    const total = getDb().vitals.filter((v) => v.patientId === 'pat-ava' && v.kind === 'blood-pressure').length;
    const pages = Math.ceil(total / READINGS_PER_PAGE);
    const { user, router } = renderRoute('/vitals');
    await screen.findByRole('table', { name: /page 1 of/ });
    expect(within(history()).getAllByRole('row')).toHaveLength(READINGS_PER_PAGE + 1);

    const pager = screen.getByRole('navigation', { name: 'Reading pages' });
    expect(within(pager).getByRole('button', { name: 'Newer' })).toBeDisabled();
    expect(pager).toHaveTextContent(`1–${READINGS_PER_PAGE} of ${total}`);
    const newest = firstRow();

    await user.click(within(pager).getByRole('button', { name: 'Older' }));
    expect(router.state.location.search).toContain('page=2');
    expect(history()).toHaveAccessibleName(`Blood pressure readings, newest first, page 2 of ${pages}`);
    expect(firstRow()).not.toBe(newest);

    await user.click(within(pager).getByRole('button', { name: 'Newer' }));
    expect(router.state.location.search).not.toContain('page=');
    expect(firstRow()).toBe(newest);
  });

  it('starts a new reading type on its first page, and clamps a page that doesn’t exist', async () => {
    const { user, router } = renderRoute('/vitals?kind=blood-pressure&page=999');
    expect(await screen.findByRole('table', { name: /page (\d+) of \1$/ })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Reading pages' })).getByRole('button', { name: 'Older' })).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Weight' }));
    expect(router.state.location.search).toBe('?kind=weight');
    expect(await screen.findByRole('table', { name: /^Weight readings, newest first, page 1 of/ })).toBeInTheDocument();
  });
});

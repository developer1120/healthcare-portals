import { screen, waitFor, within } from '@testing-library/react';
import { api } from '@/api/endpoints';
import { getDb, writeDb } from '@/api/mockDb';
import { isNewResult, rangeLayout } from '@/domain/labs';
import type { LabObservation, LabPanel } from '@/domain/types';
import { renderRoute } from '@/test/renderRoute';

const AVA = 'pat-ava';

function obs(value: number, range: Partial<LabObservation>): LabObservation {
  return { code: 'x', name: 'X', value, unit: 'u', ...range };
}

describe('rangeLayout', () => {
  it('puts an in-range value inside the band', () => {
    const layout = rangeLayout(obs(4.2, { refLow: 3.5, refHigh: 5.1 }))!;
    expect(layout.lowPct).toBe(25);
    expect(layout.highPct).toBe(75);
    expect(layout.valuePct).toBeGreaterThan(layout.lowPct);
    expect(layout.valuePct).toBeLessThan(layout.highPct);
  });

  it('stretches the bar to fit an outlier beyond the band', () => {
    const layout = rangeLayout(obs(12, { refLow: 4, refHigh: 6 }))!;
    expect(layout.valuePct).toBe(100);
    expect(layout.highPct).toBeLessThan(100);
  });

  it('runs open-ended ranges to the edge', () => {
    expect(rangeLayout(obs(142, { refHigh: 100 }))).toMatchObject({ lowPct: 0 });
    expect(rangeLayout(obs(52, { refLow: 40 }))).toMatchObject({ highPct: 100 });
  });

  it('has nothing to draw without a range', () => {
    expect(rangeLayout(obs(7, {}))).toBeNull();
  });

  it('treats resulted, unseen panels as new', () => {
    const panel = { status: 'final' } as LabPanel;
    expect(isNewResult(panel)).toBe(true);
    expect(isNewResult({ ...panel, patientViewedAt: '2026-10-12T10:00:00Z' })).toBe(false);
    expect(isNewResult({ ...panel, status: 'pending' })).toBe(false);
  });
});

describe('markViewed endpoint', () => {
  const newIds = () => getDb().labPanels.filter((p) => p.patientId === AVA && isNewResult(p)).map((p) => p.id);

  it('marks only the patient’s own new results, then completes the results task', async () => {
    const ids = newIds();
    expect(ids).toHaveLength(3);

    await api.labs.markViewed(AVA, [ids[0]!]);
    expect(newIds()).toHaveLength(2);
    expect(getDb().tasks.find((t) => t.kind === 'read-result')!.completedAt).toBeUndefined();

    await api.labs.markViewed(AVA, ids);
    expect(newIds()).toHaveLength(0);
    expect(getDb().tasks.find((t) => t.kind === 'read-result')!.completedAt).toBeDefined();
  });

  it('does not touch another patient’s results', async () => {
    const grace = getDb().labPanels.find((p) => p.patientId === 'pat-grace')!;
    await api.labs.markViewed(AVA, [grace.id]);
    expect(getDb().labPanels.find((p) => p.id === grace.id)!.patientViewedAt).toBeUndefined();
  });
});

function panel(name: RegExp | string) {
  return screen.getAllByRole('region', { name }).find((r) => r.tagName === 'SECTION')!;
}

describe('ResultsPage', () => {
  it('lists results newest first, with pending ones waiting and new ones badged', async () => {
    renderRoute('/results');
    expect(await screen.findByText(/3 new results since you last looked/)).toBeInTheDocument();


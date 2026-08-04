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

    const headings = within(screen.getByRole('main')).getAllByRole('heading', { level: 2 });
    expect(headings.slice(0, 4).map((h) => h.textContent)).toEqual([
      'Vitamin D, 25-hydroxy',
      'Hemoglobin A1cNew',
      'Lipid panelNew',
      'Basic metabolic panelNew',
    ]);
    expect(panel(/^Vitamin D, 25-hydroxy/)).toHaveTextContent('Most results are ready in 1–3 days.');
  });

  it('shows each value against its range in words, not only colour', async () => {
    renderRoute('/results');
    await screen.findByText(/new results since you last looked/);
    const lipids = within(screen.getAllByRole('table', { name: 'Lipid panel results' })[0]!);
    const ldl = lipids.getByRole('rowheader', { name: /LDL cholesterol/ }).closest('tr')!;

    expect(ldl).toHaveTextContent('142 mg/dL');
    expect(ldl).toHaveTextContent('< 100 mg/dL');
    expect(within(ldl).getByText('High')).toHaveAttribute('data-tone', 'warn');
    expect(ldl).toHaveTextContent('The “bad” cholesterol');
    // The dot sits past the end of the normal band.
    const marker = within(ldl).getByTestId('range-marker');
    const band = marker.previousElementSibling as HTMLElement;
    expect(parseFloat(marker.style.left)).toBeGreaterThan(parseFloat(band.style.left) + parseFloat(band.style.width));
  });

  it('marks results seen on opening, keeping the badges for this visit', async () => {
    renderRoute('/results');
    await screen.findByText(/new results since you last looked/);

    await waitFor(() => expect(getDb().labPanels.filter((p) => p.patientId === AVA && isNewResult(p))).toHaveLength(0));
    expect(getDb().tasks.find((t) => t.kind === 'read-result')!.completedAt).toBeDefined();
    expect(within(screen.getByRole('main')).getAllByText('New')).toHaveLength(3);
  });

  it('shows the clinician’s note once reviewed, and explains when there isn’t one yet', async () => {
    renderRoute('/results');
    await screen.findByText(/new results since you last looked/);

    expect(screen.getByText('In the prediabetes range. Let’s start metformin and recheck in three months.')).toBeInTheDocument();
    expect(within(panel(/^Hemoglobin A1c/)).getByText(/hasn’t added a note yet/)).toBeInTheDocument();
  });

  it('links to a message about the result', async () => {
    renderRoute('/results');
    await screen.findByText(/new results since you last looked/);
    const ask = within(panel(/^Lipid panel/)).getByRole('link', { name: 'Ask about this result' });
    expect(ask).toHaveAttribute(
      'href',
      '/messages/new?topic=results&subject=Question+about+my+lipid+panel+results',
    );
  });

  it('filters to results outside range or still waiting, and searches by test', async () => {
    const { user } = renderRoute('/results');
    await user.click(await screen.findByRole('radio', { name: 'Outside range (7)' }));
    expect(within(screen.getByRole('main')).getAllByRole('heading', { level: 2 })).toHaveLength(7);

    await user.click(screen.getByRole('radio', { name: 'Waiting' }));
    expect(within(screen.getByRole('main')).getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Vitamin D, 25-hydroxy',
    ]);

    await user.click(screen.getByRole('radio', { name: 'All' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search results' }), 'potassium');
    expect(within(screen.getByRole('main')).getAllByRole('heading', { level: 2 })).toHaveLength(2);
  });

  it('raises an alert for a critical value', async () => {
    writeDb((db) => {
      const bmp = db.labPanels.find((p) => p.patientId === AVA && p.name === 'Basic metabolic panel')!;
      bmp.observations.find((o) => o.name === 'Potassium')!.value = 6.6;
    });
    renderRoute('/results');
    expect(await screen.findByRole('alert')).toHaveTextContent('needs prompt attention');
    expect(screen.getByText('Critically high')).toHaveAttribute('data-tone', 'critical');
  });
});

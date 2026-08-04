import { render, screen, waitFor, within } from '@testing-library/react';
import { getDb } from '@/api/mockDb';
import { linearScale, niceTicks } from '@/charts/scale';
import { TrendChart } from '@/charts/TrendChart';
import { distanceFromRange, isNewResult, observationHistory, trendSummary } from '@/domain/labs';
import { renderRoute } from '@/test/renderRoute';

const A1C = '4548-4';
const avaPanels = () => getDb().labPanels.filter((p) => p.patientId === 'pat-ava');

describe('chart scales', () => {
  it('picks round tick values that cover the data', () => {
    expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(120, 140)).toEqual([120, 125, 130, 135, 140]);
    expect(niceTicks(4, 6.1)).toEqual([4, 5, 6, 7]);
  });

  it('still gives ticks for a single value', () => {
    const ticks = niceTicks(64, 64);
    expect(ticks[0]).toBeLessThan(64);
    expect(ticks.at(-1)).toBeGreaterThan(64);
  });

  it('maps a domain onto a range, centring a flat domain', () => {
    expect(linearScale([0, 10], [100, 0])(2.5)).toBe(75);
    expect(linearScale([5, 5], [0, 200])(5)).toBe(100);
  });
});

describe('result trends', () => {
  it('collects one test across panels, oldest first, skipping pending ones', () => {
    const history = observationHistory(avaPanels(), A1C);
    expect(history.map((p) => p.value)).toEqual([6.1, 6, 5.9]);
    expect(history.every((p) => p.flag === 'high')).toBe(true);
  });

  it('measures distance outside a range', () => {
    expect(distanceFromRange(5.9, { refLow: 4, refHigh: 5.6 })).toBeCloseTo(0.3);
    expect(distanceFromRange(3.5, { refLow: 4, refHigh: 5.6 })).toBeCloseTo(0.5);
    expect(distanceFromRange(5, { refLow: 4, refHigh: 5.6 })).toBe(0);
  });

  it('judges a change by whether it moves toward the range', () => {
    const range = { refLow: 4, refHigh: 5.6 };
    expect(trendSummary(observationHistory(avaPanels(), A1C), range)).toMatchObject({
      change: -0.1,
      direction: 'down',
      improving: true,
    });
    // HDL went up but stayed in range: no verdict.
    expect(trendSummary(observationHistory(avaPanels(), '2085-9'), { refLow: 40 })).toMatchObject({
      direction: 'up',
      improving: null,
    });
    expect(trendSummary(observationHistory(avaPanels(), '718-7'), {})).toBeNull();
  });
});

describe('TrendChart', () => {
  const points = [
    { at: '2026-04-16T15:00:00Z', value: 6.1, outOfRange: true },
    { at: '2026-07-10T15:00:00Z', value: 6.0, outOfRange: true },
    { at: '2026-10-04T15:00:00Z', value: 5.4 },
  ];

  it('draws the band, a dot per result with a hover title, and dated axis labels', () => {
    const { container } = render(
      <TrendChart points={points} band={{ low: 4, high: 5.6 }} unit="%" label="A1c over time" />,
    );
    expect(screen.getByRole('img', { name: 'A1c over time' })).toBeInTheDocument();
    expect(screen.getByTestId('trend-band')).toBeInTheDocument();
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(container.querySelector('circle')?.getAttribute('fill')).toBe('var(--mw-warn)');
    expect(container.querySelectorAll('circle')[2]?.getAttribute('fill')).toBe('var(--mw-data)');
    expect([...container.querySelectorAll('title')].map((t) => t.textContent)).toContain('4 Oct 2026: 5.4 %');
    expect(screen.getByText('16 Apr 26')).toBeInTheDocument();
    expect(screen.getByText('4 Oct 26')).toBeInTheDocument();
  });

  it('places higher values higher up', () => {
    const { container } = render(<TrendChart points={points} unit="%" label="A1c" />);
    const [first, , last] = [...container.querySelectorAll('circle')].map((c) => Number(c.getAttribute('cy')));
    expect(first!).toBeLessThan(last!);
  });
});

describe('ResultDetailPage', () => {
  it('opens from the results list and shows each test with its trend', async () => {
    const { user, router } = renderRoute('/results');
    const main = within(await screen.findByRole('main'));
    await user.click((await main.findAllByRole('link', { name: 'Hemoglobin A1c' }))[0]!);

    expect(router.state.location.pathname).toBe('/results/lab-006');
    expect(await screen.findByRole('heading', { level: 1, name: 'Hemoglobin A1c' })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Hemoglobin A1c' });
    expect(card).toHaveTextContent('5.9 %');
    expect(card).toHaveTextContent('Normal range 4–5.6 %');
    expect(card).toHaveTextContent(/Down 0.1 % since .* · moving toward the normal range/);
    expect(within(card).getByRole('img', { name: /^Hemoglobin A1c over time: 3 results from/ })).toBeInTheDocument();
  });

  it('can show the history as a table instead of a chart', async () => {
    const { user } = renderRoute('/results/lab-006');
    const card = await screen.findByRole('region', { name: 'Hemoglobin A1c' });
    await user.click(within(card).getByRole('radio', { name: 'Table' }));

    expect(within(card).queryByRole('img')).not.toBeInTheDocument();
    const rows = within(within(card).getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.children[1]!.textContent)).toEqual(['5.9 %', '6 %', '6.1 %']);
  });

  it('says when a test has no history yet', async () => {
    renderRoute('/results/lab-005');
    const card = await screen.findByRole('region', { name: 'Hemoglobin' });
    expect(card).toHaveTextContent('This is your first Hemoglobin result here.');
    expect(within(card).queryByRole('radio')).not.toBeInTheDocument();
  });

  it('marks a new result seen when opened directly', async () => {
    renderRoute('/results/lab-007');
    await screen.findByRole('heading', { level: 1, name: 'Lipid panel' });
    await waitFor(() => expect(isNewResult(getDb().labPanels.find((p) => p.id === 'lab-007')!)).toBe(false));
  });

  it('shows the clinician’s note for a reviewed result', async () => {
    renderRoute('/results/lab-002');
    expect(await screen.findByText('LDL is high. Starting atorvastatin 20 mg at night.')).toBeInTheDocument();
  });

  it('does not show another patient’s result', async () => {
    renderRoute('/results/lab-010');
    expect(await screen.findByText(/couldn't find that result/)).toBeInTheDocument();
  });

  it('is linked from the dashboard', async () => {
    renderRoute('/');
    const card = await within(screen.getByRole('main')).findByRole('region', { name: 'Latest results' });
    expect(await within(card).findByRole('link', { name: 'Hemoglobin A1c' })).toHaveAttribute('href', '/results/lab-006');
  });
});

describe('TrendChart with one-sided ranges', () => {
  it('keeps part of the normal zone visible for a "less than" range', () => {
    render(
      <TrendChart
        points={[
          { at: '2026-07-07T15:00:00Z', value: 158 },
          { at: '2026-10-06T15:00:00Z', value: 142 },
        ]}
        band={{ high: 100 }}
        unit="mg/dL"
        label="LDL"
      />,
    );
    expect(Number(screen.getByTestId('trend-band').getAttribute('height'))).toBeGreaterThan(10);
  });
});

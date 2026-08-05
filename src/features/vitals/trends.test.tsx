import { render, screen, within } from '@testing-library/react';
import { writeDb } from '@/api/mockDb';
import { TrendChart } from '@/charts/TrendChart';
import type { VitalReading } from '@/domain/types';
import { vitalTrend } from '@/domain/vitalTrends';
import { atTime } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const now = TEST_NOW;
const base = { patientId: 'p', source: 'home' as const };

function bp(day: number, systolic: number, diastolic: number): VitalReading {
  return { ...base, id: `bp${day}`, kind: 'blood-pressure', takenAt: atTime(now, day, '07:30').toISOString(), systolic, diastolic };
}

describe('vitalTrend', () => {
  const falling = [140, 138, 136, 134, 132, 130, 128, 126].map((s, i) => bp(i - 8, s, s - 50));

  it('summarises blood pressure against the 130/80 target', () => {
    const trend = vitalTrend(falling, 'blood-pressure', 30, now);
    expect(trend.stats).toEqual({ count: 8, average: '133/83', lowest: '126/76', highest: '140/90' });
    // Only 126/76 and 128/78 are under both numbers.
    expect(trend.atTarget).toBe(2 / 8);
    expect(trend.references?.map((r) => r.value)).toEqual([130, 80]);
    expect(trend.secondary).toHaveLength(8);
    expect(trend.change).toEqual({
      text: 'Systolic down 8 mmHg on average from the start to the end of the period',
      improving: true,
    });
  });

  it('leaves out readings older than the period and gives no change with too few', () => {
    const trend = vitalTrend([bp(-40, 150, 95), ...falling.slice(-3)], 'blood-pressure', 30, now);
    expect(trend.stats.count).toBe(3);
    expect(trend.change).toBeNull();
  });

  it('charts only fasting glucose', () => {
    const glucose = (day: number, mgPerDl: number, context: 'fasting' | 'after-meal'): VitalReading => ({
      ...base,
      id: `g${day}${context}`,
      kind: 'glucose',
      takenAt: atTime(now, day, '07:00').toISOString(),
      mgPerDl,
      context,
    });
    const trend = vitalTrend([glucose(-2, 104, 'fasting'), glucose(-2, 160, 'after-meal'), glucose(-1, 96, 'fasting')], 'glucose', 30, now);
    expect(trend.scope).toBe('Fasting readings');
    expect(trend.points.map((p) => p.value)).toEqual([104, 96]);
    expect(trend.band).toEqual({ low: 70, high: 99 });
  });

  it('describes weight change without judging it', () => {
    const weight = (day: number, kg: number): VitalReading => ({
      ...base,
      id: `w${day}`,
      kind: 'weight',
      takenAt: atTime(now, day, '07:00').toISOString(),
      kg,
    });
    expect(vitalTrend([weight(-20, 74.2), weight(-1, 73.2)], 'weight', 30, now).change).toEqual({
      text: 'Down 1.0 kg from first to latest reading',
      improving: null,
    });
  });
});

describe('TrendChart extras', () => {
  it('draws a second line and dashed target lines', () => {
    render(
      <TrendChart
        points={[
          { at: '2026-10-01T07:00:00Z', value: 132 },
          { at: '2026-10-02T07:00:00Z', value: 128 },
        ]}
        secondary={[
          { at: '2026-10-01T07:00:00Z', value: 84 },
          { at: '2026-10-02T07:00:00Z', value: 80 },
        ]}
        references={[
          { value: 130, label: '130' },
          { value: 80, label: '80' },
        ]}
        unit="mmHg"
        label="BP"
      />,
    );
    expect(screen.getByTestId('trend-secondary').querySelectorAll('circle')).toHaveLength(2);
    expect(screen.getAllByTestId('trend-reference')).toHaveLength(2);
  });
});

describe('Vitals trend card', () => {
  it('shows blood pressure numbers, the change and a described chart', async () => {
    renderRoute('/vitals');
    const card = await screen.findByRole('region', { name: 'Blood pressure trend' });

    expect(card).toHaveTextContent('Home readings, last 30 days');
    const stats = within(card).getAllByRole('definition').map((d) => d.textContent);
    expect(stats[0]).toMatch(/^\d{3}\/\d{2}$/);
    expect(within(card).getByText('Under 130/80')).toBeInTheDocument();
    expect(card).toHaveTextContent(/Systolic (down|up) [\d.]+ mmHg on average/);
    expect(within(card).getByRole('img', { name: /^Blood pressure over the last 30 days: \d+ readings, average/ })).toBeInTheDocument();
  });

  it('switches to 90 days, keeping it in the URL across reading types', async () => {
    const { user, router } = renderRoute('/vitals');
    const card = await screen.findByRole('region', { name: 'Blood pressure trend' });
    const count30 = Number(/(\d+) readings/.exec(within(card).getByRole('img').getAttribute('aria-label')!)![1]);

    await user.click(within(card).getByRole('radio', { name: '90d' }));
    expect(card).toHaveTextContent('last 90 days');
    const count90 = Number(/(\d+) readings/.exec(within(card).getByRole('img').getAttribute('aria-label')!)![1]);
    expect(count90).toBeGreaterThan(count30);

    await user.click(screen.getByRole('radio', { name: 'Weight' }));
    expect(new URLSearchParams(router.state.location.search).get('range')).toBe('90');
    expect(screen.getByRole('region', { name: 'Weight trend' })).toHaveTextContent('last 90 days');
  });

  it('can show the readings as a table', async () => {
    const { user } = renderRoute('/vitals?kind=heart-rate');
    const card = await screen.findByRole('region', { name: 'Resting heart rate trend' });
    await user.click(within(card).getByRole('radio', { name: 'Table' }));

    const rows = within(within(card).getByRole('table')).getAllByRole('row');
    expect(rows.length).toBeGreaterThan(10);
    expect(rows[1]).toHaveTextContent(/\d+ bpm/);
  });

  it('says so when there are no readings in the period', async () => {
    writeDb((db) => {
      db.vitals = db.vitals.filter((v) => v.kind !== 'weight');
    });
    renderRoute('/vitals?kind=weight');
    expect(await screen.findByText('No readings in the last 30 days. Log one to start a trend.')).toBeInTheDocument();
  });
});

describe('blood pressure extremes', () => {
  it('reports real readings, not the two numbers’ separate minimums', () => {
    const trend = vitalTrend([bp(-3, 126, 84), bp(-2, 134, 76), bp(-1, 140, 88)], 'blood-pressure', 30, now);
    expect(trend.stats.lowest).toBe('126/84');
    expect(trend.stats.highest).toBe('140/88');
  });
});

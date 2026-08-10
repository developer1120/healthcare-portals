import type { ReferenceLine, TrendPoint } from '@/charts/TrendChart';
import { formatGlucose, formatWeight, round } from '@/lib/units';
import { distanceFromRange } from './labs';
import type { VitalKind, VitalReading } from './types';
import { assessReading, lastDays, readingsOf } from './vitals';

/** Home blood pressure target (ACC/AHA): under 130 over under 80. */
export const BP_TARGET = { systolic: 130, diastolic: 80 } as const;

export interface VitalTrend {
  points: TrendPoint[];
  secondary?: TrendPoint[];
  band?: { low?: number; high?: number };
  references?: ReferenceLine[];
  unit: string;
  /** Which readings are shown, when it isn't all of them. */
  scope?: string;
  stats: { count: number; average: string; lowest: string; highest: string };
  /** Share of readings at or under target (blood pressure only). */
  atTarget?: number;
  /** Change between the first and last week of the period. */
  change: { text: string; improving: boolean | null } | null;
}

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * Compares the average of the first few readings in the period with the last
 * few, which smooths out day-to-day noise. Needs at least six readings.
 */
function periodChange(
  values: number[],
  unit: string,
  target: { refLow?: number; refHigh?: number } | null,
  label = '',
): VitalTrend['change'] {
  if (values.length < 6) return null;
  const size = Math.min(7, Math.floor(values.length / 2));
  const before = mean(values.slice(0, size));
  const after = mean(values.slice(-size));
  const change = round(after - before, 1);
  const what = label ? `${label} ` : '';
  const sentence =
    Math.abs(change) < 0.5
      ? `${what}steady across the period`
      : `${what}${change < 0 ? 'down' : 'up'} ${Math.abs(change)} ${unit} on average from the start to the end of the period`;
  const text = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  if (!target || Math.abs(change) < 0.5) return { text, improving: null };
  const beforeGap = distanceFromRange(before, target);
  const afterGap = distanceFromRange(after, target);
  return { text, improving: beforeGap === afterGap ? null : afterGap < beforeGap };
}

/** Everything the trend card needs for one kind of vital over the last `days` days. */
export function vitalTrend(readings: VitalReading[], kind: VitalKind, days: number, now: Date = new Date()): VitalTrend {
  const flag = (reading: VitalReading) => {
    const assessment = assessReading(reading);
    return assessment !== null && assessment.tone !== 'ok';
  };

  switch (kind) {
    case 'blood-pressure': {
      const recent = lastDays(readingsOf(readings, kind), days, now);
      const sys = recent.map((r) => r.systolic);
      const dia = recent.map((r) => r.diastolic);
      const atTarget = recent.filter((r) => r.systolic < BP_TARGET.systolic && r.diastolic < BP_TARGET.diastolic).length;
      // Lowest and highest are real readings (by the top number), not the two
      // numbers' separate minimums, which could come from different days.
      const bySystolic = [...recent].sort((a, b) => a.systolic - b.systolic || a.diastolic - b.diastolic);
      const asText = (r: { systolic: number; diastolic: number } | undefined) => (r ? `${r.systolic}/${r.diastolic}` : '—');
      return {
        points: recent.map((r) => ({ at: r.takenAt, value: r.systolic, outOfRange: flag(r) })),
        secondary: recent.map((r) => ({ at: r.takenAt, value: r.diastolic })),
        references: [
          { value: BP_TARGET.systolic, label: String(BP_TARGET.systolic) },
          { value: BP_TARGET.diastolic, label: String(BP_TARGET.diastolic) },
        ],
        unit: 'mmHg',
        stats: {
          count: recent.length,
          average: recent.length ? `${Math.round(mean(sys))}/${Math.round(mean(dia))}` : '—',
          lowest: asText(bySystolic[0]),
          highest: asText(bySystolic.at(-1)),
        },
        atTarget: recent.length ? atTarget / recent.length : undefined,
        change: periodChange(sys, 'mmHg', { refHigh: BP_TARGET.systolic - 1 }, 'Systolic'),
      };
    }
    case 'heart-rate': {
      const recent = lastDays(readingsOf(readings, kind), days, now);
      const bpm = recent.map((r) => r.bpm);
      const band = { low: 50, high: 100 };
      return {
        points: recent.map((r) => ({ at: r.takenAt, value: r.bpm, outOfRange: flag(r) })),
        band,
        unit: 'bpm',
        stats: {
          count: recent.length,
          average: recent.length ? `${Math.round(mean(bpm))} bpm` : '—',
          lowest: recent.length ? `${Math.min(...bpm)} bpm` : '—',
          highest: recent.length ? `${Math.max(...bpm)} bpm` : '—',
        },
        change: periodChange(bpm, 'bpm', { refLow: band.low, refHigh: band.high }),
      };
    }
    case 'glucose': {
      // Fasting readings are the ones comparable day to day.
      const recent = lastDays(readingsOf(readings, kind), days, now).filter((r) => r.context === 'fasting');
      const values = recent.map((r) => r.mgPerDl);
      const band = { low: 70, high: 99 };
      return {
        points: recent.map((r) => ({ at: r.takenAt, value: r.mgPerDl, outOfRange: flag(r) })),
        band,
        unit: 'mg/dL',
        scope: 'Fasting readings',
        stats: {
          count: recent.length,
          average: recent.length ? formatGlucose(mean(values)) : '—',
          lowest: recent.length ? formatGlucose(Math.min(...values)) : '—',
          highest: recent.length ? formatGlucose(Math.max(...values)) : '—',
        },
        change: periodChange(values, 'mg/dL', { refLow: band.low, refHigh: band.high }),
      };
    }
    case 'weight': {
      const recent = lastDays(readingsOf(readings, kind), days, now);
      const kg = recent.map((r) => r.kg);
      return {
        points: recent.map((r) => ({ at: r.takenAt, value: r.kg })),
        unit: 'kg',
        stats: {
          count: recent.length,
          average: recent.length ? formatWeight(mean(kg)) : '—',
          lowest: recent.length ? formatWeight(Math.min(...kg)) : '—',
          highest: recent.length ? formatWeight(Math.max(...kg)) : '—',
        },
        // Whether a weight change is good depends on goals, so no verdict.
        change: kg.length >= 2 ? weightChange(kg) : null,
      };
    }
  }
}

function weightChange(kg: number[]): VitalTrend['change'] {
  const change = round(kg.at(-1)! - kg[0]!, 1);
  if (Math.abs(change) < 0.1) return { text: 'Steady across the period', improving: null };
  return { text: `${change < 0 ? 'Down' : 'Up'} ${Math.abs(change).toFixed(1)} kg from first to latest reading`, improving: null };
}

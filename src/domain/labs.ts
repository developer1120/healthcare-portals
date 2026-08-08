import type { StatusTone } from '@/ui';
import type { LabObservation, LabPanel } from './types';

export type LabFlag = 'normal' | 'low' | 'high' | 'critical-low' | 'critical-high';

/** Where a value sits against its reference and critical ranges. Bounds are inclusive. */
export function flagObservation({ value, refLow, refHigh, criticalLow, criticalHigh }: LabObservation): LabFlag {
  if (criticalLow !== undefined && value < criticalLow) return 'critical-low';
  if (criticalHigh !== undefined && value > criticalHigh) return 'critical-high';
  if (refLow !== undefined && value < refLow) return 'low';
  if (refHigh !== undefined && value > refHigh) return 'high';
  return 'normal';
}

export const flagDisplay: Record<LabFlag, { label: string; tone: StatusTone }> = {
  normal: { label: 'In range', tone: 'ok' },
  low: { label: 'Low', tone: 'warn' },
  high: { label: 'High', tone: 'warn' },
  'critical-low': { label: 'Critically low', tone: 'critical' },
  'critical-high': { label: 'Critically high', tone: 'critical' },
};

export function isCritical(flag: LabFlag): boolean {
  return flag === 'critical-low' || flag === 'critical-high';
}

/** "70–99 mg/dL", "< 200 mg/dL", "> 40 mg/dL", or "" when there is no range. */
export function formatReferenceRange({ refLow, refHigh, unit }: LabObservation): string {
  if (refLow !== undefined && refHigh !== undefined) return `${refLow}–${refHigh} ${unit}`;
  if (refHigh !== undefined) return `< ${refHigh} ${unit}`;
  if (refLow !== undefined) return `> ${refLow} ${unit}`;
  return '';
}

/** How many observations in a panel fall outside range, and whether any are critical. */
export function summarizePanel(panel: LabPanel): { outOfRange: number; critical: boolean } {
  const flags = panel.observations.map(flagObservation);
  return {
    outOfRange: flags.filter((flag) => flag !== 'normal').length,
    critical: flags.some(isCritical),
  };
}

/** Resulted, but the patient hasn't opened it yet. */
export function isNewResult(panel: LabPanel): boolean {
  return panel.status !== 'pending' && !panel.patientViewedAt;
}

export interface RangeLayout {
  /** Left edge of the reference range, as a percentage of the bar. */
  lowPct: number;
  /** Right edge of the reference range. */
  highPct: number;
  /** Where the value sits. */
  valuePct: number;
}

/**
 * Lays out a value against its reference range on a bar. The bar spans the
 * range plus half its width either side (or enough to fit the value), so an
 * in-range value sits inside the shaded band and an outlier sits beyond it.
 * Open-ended ranges ("< 100") get a band that runs to the edge.
 */
export function rangeLayout({ value, refLow, refHigh }: LabObservation): RangeLayout | null {
  if (refLow === undefined && refHigh === undefined) return null;
  const low = refLow ?? 0;
  const high = refHigh ?? Math.max(low * 2, value * 1.25);
  const width = high - low || Math.abs(high) || 1;
  const min = Math.min(refLow === undefined ? 0 : low - width / 2, value);
  const max = Math.max(refHigh === undefined ? high : high + width / 2, value);
  const pct = (n: number) => Math.round(((n - min) / (max - min)) * 1000) / 10;
  return {
    lowPct: refLow === undefined ? 0 : pct(low),
    highPct: refHigh === undefined ? 100 : pct(high),
    valuePct: pct(value),
  };
}

/** Short plain-language descriptions of common tests, keyed by LOINC code. */
export const labDescriptions: Record<string, string> = {
  '4548-4': 'Average blood sugar over the past 2–3 months.',
  '2093-3': 'All the cholesterol in your blood.',
  '2089-1': 'The “bad” cholesterol that can build up in arteries.',
  '2085-9': 'The “good” cholesterol that helps clear the bad kind.',
  '2571-8': 'A type of fat in the blood, affected by recent meals.',
  '2345-7': 'Blood sugar at the time of the test.',
  '2951-2': 'A salt that helps balance fluids and nerve signals.',
  '2823-3': 'A mineral your heart and muscles need to work properly.',
  '2160-0': 'A waste product your kidneys filter out.',
  '33914-3': 'An estimate of how well your kidneys are filtering.',
  '718-7': 'The protein in red blood cells that carries oxygen.',
  '6690-2': 'Cells that fight infection.',
  '777-3': 'Cells that help your blood clot.',
};

/** One line describing a panel: waiting, needs attention, some outside range, or all in range. */
export function panelStatus(panel: LabPanel): { tone: StatusTone; label: string } {
  if (panel.status === 'pending') return { tone: 'neutral', label: 'Waiting for results' };
  const { outOfRange, critical } = summarizePanel(panel);
  if (critical) return { tone: 'critical', label: 'Needs attention' };
  if (outOfRange > 0) return { tone: 'warn', label: `${outOfRange} outside range` };
  return { tone: 'ok', label: 'All in range' };
}

export interface HistoryPoint {
  panelId: string;
  collectedAt: string;
  value: number;
  unit: string;
  flag: LabFlag;
}

/** Every resulted value of one test (by LOINC code) for a patient, oldest first. */
export function observationHistory(panels: LabPanel[], code: string): HistoryPoint[] {
  return panels
    .filter((p) => p.status !== 'pending')
    .flatMap((panel) =>
      panel.observations
        .filter((o) => o.code === code)
        .map((o) => ({
          panelId: panel.id,
          collectedAt: panel.collectedAt,
          value: o.value,
          unit: o.unit,
          flag: flagObservation(o),
        })),
    )
    .sort((a, b) => a.collectedAt.localeCompare(b.collectedAt));
}

/** How far a value sits outside its reference range; 0 inside it. */
export function distanceFromRange(value: number, { refLow, refHigh }: Pick<LabObservation, 'refLow' | 'refHigh'>): number {
  if (refLow !== undefined && value < refLow) return refLow - value;
  if (refHigh !== undefined && value > refHigh) return value - refHigh;
  return 0;
}

export interface TrendSummary {
  change: number;
  direction: 'up' | 'down' | 'same';
  since: string;
  /** Moved toward the normal range (true), away from it (false), or no clear call (null). */
  improving: boolean | null;
}

/** Change from the previous result of the same test, judged against the reference range. */
export function trendSummary(history: HistoryPoint[], range: Pick<LabObservation, 'refLow' | 'refHigh'>): TrendSummary | null {
  if (history.length < 2) return null;
  const latest = history.at(-1)!;
  const previous = history.at(-2)!;
  const change = Math.round((latest.value - previous.value) * 100) / 100;
  const before = distanceFromRange(previous.value, range);
  const after = distanceFromRange(latest.value, range);
  return {
    change,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same',
    since: previous.collectedAt,
    improving: before === after ? null : after < before,
  };
}

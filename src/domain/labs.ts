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

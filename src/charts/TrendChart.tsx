import { format } from 'date-fns';
import { toDate } from '@/lib/dates';
import { linearScale, niceTicks } from './scale';

export interface TrendPoint {
  /** ISO timestamp. */
  at: string;
  value: number;
  /** Out-of-range points are drawn in the warning colour. */
  outOfRange?: boolean;
}

export interface ReferenceLine {
  value: number;
  /** Short label drawn at the right end of the line, e.g. "130". */
  label: string;
}

interface TrendChartProps {
  points: TrendPoint[];
  /** A second, quieter line on the same axis, e.g. diastolic under systolic. */
  secondary?: TrendPoint[];
  /** The normal range, drawn as a shaded band. Either side may be open. */
  band?: { low?: number; high?: number };
  /** Dashed target lines, e.g. 130 and 80 for blood pressure. */
  references?: ReferenceLine[];
  unit: string;
  /** Text alternative describing the chart. */
  label: string;
  formatValue?: (value: number) => string;
}

const WIDTH = 640;
const HEIGHT = 220;
/** The top margin leaves room for the unit label above the highest tick. */
const MARGIN = { top: 28, right: 36, bottom: 30, left: 48 };

function pathFor(points: TrendPoint[], x: (n: number) => number, y: (n: number) => number): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(toDate(p.at).getTime()).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ');
}

/**
 * Line chart of values over time, spaced by real dates, with a y axis, the
 * normal band and a dot per result (each with a hover title). Scales to its
 * container's width; text stays legible because the aspect ratio is fixed.
 * Dots shrink when there are many readings so the line stays readable.
 */
export function TrendChart({
  points,
  secondary = [],
  band,
  references = [],
  unit,
  label,
  formatValue = String,
}: TrendChartProps) {
  if (points.length === 0) return null;

  const all = [...points, ...secondary];
  const times = all.map((p) => toDate(p.at).getTime());
  const values = all.map((p) => p.value);
  const extra = [band?.low, band?.high, ...references.map((r) => r.value)].filter((v): v is number => v !== undefined);
  // A one-sided range ("< 100") would otherwise end exactly at the axis edge and
  // vanish; reach a little past its boundary so some of the normal zone shows.
  const span = Math.max(...values, ...extra) - Math.min(...values, ...extra) || Math.abs(values[0]!) || 1;
  if (band?.high !== undefined && band.low === undefined) extra.push(band.high - span * 0.25);
  if (band?.low !== undefined && band.high === undefined) extra.push(band.low + span * 0.25);
  const ticks = niceTicks(Math.min(...values, ...extra), Math.max(...values, ...extra), 4);
  const yMin = ticks[0]!;
  const yMax = ticks.at(-1)!;

  const plotLeft = MARGIN.left;
  const plotRight = WIDTH - MARGIN.right;
  const plotTop = MARGIN.top;
  const plotBottom = HEIGHT - MARGIN.bottom;
  const x = linearScale([Math.min(...times), Math.max(...times)], [plotLeft + 12, plotRight - 12]);
  const y = linearScale([yMin, yMax], [plotBottom, plotTop]);

  const bandTop = y(Math.min(band?.high ?? yMax, yMax));
  const bandBottom = y(Math.max(band?.low ?? yMin, yMin));
  const dense = points.length > 30;
  const radius = dense ? 2.5 : 4.5;


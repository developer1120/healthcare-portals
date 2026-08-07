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

  // Label the first and last dates, plus the middle one when there's room.
  const labelled = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : points.map((_, i) => i);
  const describe = (point: TrendPoint) => `${format(toDate(point.at), 'd MMM yyyy')}: ${formatValue(point.value)} ${unit}`;

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label} className="h-auto w-full overflow-visible">
      {band && (
        <rect
          data-testid="trend-band"
          x={plotLeft}
          width={plotRight - plotLeft}
          y={bandTop}
          height={Math.max(0, bandBottom - bandTop)}
          fill="var(--mw-ok-soft)"
        />
      )}
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={plotLeft} x2={plotRight} y1={y(tick)} y2={y(tick)} stroke="var(--mw-line)" strokeWidth={1} />
          <text x={plotLeft - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--mw-ink-muted)">
            {formatValue(tick)}
          </text>
        </g>
      ))}
      <text x={plotLeft - 8} y={12} textAnchor="end" fontSize={10} fill="var(--mw-ink-subtle)">
        {unit}
      </text>

      {references.map((reference) => (
        <g key={reference.value} data-testid="trend-reference">
          <line
            x1={plotLeft}
            x2={plotRight}
            y1={y(reference.value)}
            y2={y(reference.value)}
            stroke="var(--mw-ok)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
          />
          <text x={plotRight + 4} y={y(reference.value)} dominantBaseline="middle" fontSize={10} fill="var(--mw-ok-ink)">
            {reference.label}
          </text>
        </g>
      ))}

      {secondary.length > 0 && (
        <g data-testid="trend-secondary">
          <path d={pathFor(secondary, x, y)} fill="none" stroke="var(--mw-ink-subtle)" strokeWidth={1.75} strokeLinejoin="round" />
          {secondary.map((point) => (
            <circle key={point.at} cx={x(toDate(point.at).getTime())} cy={y(point.value)} r={radius - 0.5} fill="var(--mw-ink-subtle)">
              <title>{describe(point)}</title>
            </circle>
          ))}
        </g>
      )}

      <path d={pathFor(points, x, y)} fill="none" stroke="var(--mw-data)" strokeWidth={2.25} strokeLinejoin="round" />
      {points.map((point, i) => (
        <g key={point.at}>
          <title>{describe(point)}</title>
          <circle
            cx={x(toDate(point.at).getTime())}
            cy={y(point.value)}
            r={i === points.length - 1 ? radius + 1.5 : radius}
            fill={point.outOfRange ? 'var(--mw-warn)' : 'var(--mw-data)'}
            stroke="var(--mw-surface)"
            strokeWidth={dense ? 1 : 2}
          />
        </g>
      ))}

      {labelled.map((i) => (
        <text
          key={`x-${i}`}
          x={x(toDate(points[i]!.at).getTime())}
          y={HEIGHT - 8}
          textAnchor={points.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
          fontSize={11}
          fill="var(--mw-ink-muted)"
        >
          {format(toDate(points[i]!.at), 'd MMM yy')}
        </text>
      ))}
    </svg>
  );
}

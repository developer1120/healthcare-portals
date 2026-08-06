import { useId } from 'react';
import { cx } from '@/ui';
import { SPARK_HEIGHT as HEIGHT, SPARK_WIDTH as WIDTH, linePoints, scaleY } from './scale';

export interface SparklineSeries {
  values: number[];
  /** A CSS colour, usually a token such as var(--mw-data). */
  color: string;
}

interface SparklineProps {
  series: SparklineSeries[];
  /** Shaded band for the healthy range, in the same units as the values. */
  band?: { low: number; high: number };
  /** A dashed reference line, e.g. a target the values should stay under. */
  threshold?: number;
  /** Extra room above and below the data, as a share of its range. */
  padding?: number;
  /** Mark the most recent point of the first series with a dot. */
  markLast?: boolean;
  className?: string;
  /** Summary for screen readers. Without one the chart is decorative. */
  label?: string;
}

/**
 * Tiny trend line with no axes. Stretches to its container; strokes keep their
 * width because of vector-effect. Every series shares one y scale.
 */
export function Sparkline({
  series,
  band,
  threshold,
  padding = 0.15,
  markLast = false,
  className,
  label,
}: SparklineProps) {
  const clipId = useId();
  const all = series
    .flatMap((s) => s.values)
    .concat(band ? [band.low, band.high] : [])
    .concat(threshold === undefined ? [] : [threshold]);
  if (series.every((s) => s.values.length === 0)) return null;

  const rawMin = Math.min(...all);
  const rawMax = Math.max(...all);
  const pad = (rawMax - rawMin || 1) * padding;
  const min = rawMin - pad;
  const max = rawMax + pad;

  const first = series[0]!;
  const lastValue = first.values.at(-1);
  const lastX = WIDTH;
  const lastY = lastValue === undefined ? 0 : scaleY(lastValue, min, max);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx('block h-10 w-full overflow-visible', className)}
    >
      <clipPath id={clipId}>
        <rect x="0" y="-2" width={WIDTH} height={HEIGHT + 4} />
      </clipPath>
      {band && (
        <rect
          data-testid="sparkline-band"
          x="0"
          width={WIDTH}
          y={scaleY(band.high, min, max)}
          height={scaleY(band.low, min, max) - scaleY(band.high, min, max)}
          fill="var(--mw-ok-soft)"
        />
      )}
      {threshold !== undefined && (
        <line
          data-testid="sparkline-threshold"
          x1="0"
          x2={WIDTH}
          y1={scaleY(threshold, min, max)}
          y2={scaleY(threshold, min, max)}
          stroke="var(--mw-ok)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <g clipPath={`url(#${clipId})`}>
        {series.map((s, i) =>
          s.values.length === 0 ? null : (
            <polyline
              key={i}
              points={linePoints(s.values, min, max)}
              fill="none"
              stroke={s.color}
              strokeWidth={i === 0 ? 2 : 1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ),
        )}
      </g>
      {markLast && lastValue !== undefined && (
        // A zero-length line with a round cap draws a circle that is not stretched by the viewBox.
        <line
          x1={lastX}
          y1={lastY}
          x2={lastX}
          y2={lastY}
          stroke={first.color}
          strokeWidth={7}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

import { flagObservation, rangeLayout } from '@/domain/labs';
import type { LabObservation } from '@/domain/types';
import { cx } from '@/ui';

const markerTone = {
  normal: 'bg-ok',
  low: 'bg-warn',
  high: 'bg-warn',
  'critical-low': 'bg-critical',
  'critical-high': 'bg-critical',
} as const;

/**
 * A value's position against its reference range: shaded band for the range,
 * dot for the value. Decorative, because the same facts are in the table text.
 */
export function RangeBar({ observation, className }: { observation: LabObservation; className?: string }) {
  const layout = rangeLayout(observation);
  if (!layout) return null;
  const flag = flagObservation(observation);

  return (
    <div aria-hidden="true" data-testid="range-bar" className={cx('relative h-2 rounded-full bg-surface-sunken', className)}>
      <div
        className="absolute inset-y-0 rounded-full bg-ok-soft ring-1 ring-ok/40"
        style={{ left: `${layout.lowPct}%`, width: `${layout.highPct - layout.lowPct}%` }}
      />
      <div
        data-testid="range-marker"
        className={cx('absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface', markerTone[flag])}
        style={{ left: `${layout.valuePct}%` }}
      />
    </div>
  );
}

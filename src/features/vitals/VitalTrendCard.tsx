import { useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { TrendChart } from '@/charts/TrendChart';
import type { VitalKind, VitalReading } from '@/domain/types';
import { vitalTrend } from '@/domain/vitalTrends';
import { vitalLabels } from '@/domain/vitals';
import { formatDay, formatTime } from '@/lib/dates';
import { Card, SegmentedControl, cx } from '@/ui';

type Range = '30' | '90';

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-control bg-surface-sunken px-3 py-2">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="font-display text-lg font-semibold tabular">{children}</dd>
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={className} />
      {label}
    </span>
  );
}

/** A vital over 30 or 90 days: summary numbers, the change, and a chart or table. */
export function VitalTrendCard({ kind, readings }: { kind: VitalKind; readings: VitalReading[] }) {
  const [params, setParams] = useSearchParams();
  const range: Range = params.get('range') === '90' ? '90' : '30';
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const days = Number(range);
  const trend = vitalTrend(readings, kind, days);
  const name = vitalLabels[kind];

  function setRange(next: Range) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === '30') updated.delete('range');
        else updated.set('range', next);
        return updated;
      },
      { replace: true },
    );
  }

  const summary =
    `${name} over the last ${days} days: ${trend.stats.count} readings, average ${trend.stats.average}` +
    (trend.unit === 'mmHg' ? ' mmHg' : '') +
    `${trend.change ? `. ${trend.change.text}` : ''}.`;

  return (
    <Card
      title={`${name} trend`}
      description={`${trend.scope ?? 'Home readings'}, last ${days} days`}
      action={
        <SegmentedControl<Range>
          label="Time range"
          size="sm"
          value={range}
          onChange={setRange}
          options={[
            { value: '30', label: '30d' },
            { value: '90', label: '90d' },
          ]}
        />
      }
    >
      {trend.stats.count === 0 ? (
        <p className="text-sm text-ink-muted">No readings in the last {days} days. Log one to start a trend.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Average">{trend.stats.average}</Stat>
            <Stat label="Lowest">{trend.stats.lowest}</Stat>
            <Stat label="Highest">{trend.stats.highest}</Stat>
            {trend.atTarget !== undefined ? (
              <Stat label="Under 130/80">{Math.round(trend.atTarget * 100)}%</Stat>
            ) : (
              <Stat label="Readings">{trend.stats.count}</Stat>
            )}
          </dl>

          {trend.change && (
            <p className="text-sm">
              {trend.change.text}
              {trend.change.improving !== null && (
                <span className={cx('font-medium', trend.change.improving ? 'text-ok-ink' : 'text-warn-ink')}>
                  {' '}
                  · {trend.change.improving ? 'heading toward target' : 'moving away from target'}
                </span>
              )}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              {kind === 'blood-pressure' ? (
                <>
                  <Swatch className="h-0.5 w-4 rounded bg-data" label="Systolic" />
                  <Swatch className="h-0.5 w-4 rounded bg-ink-subtle" label="Diastolic" />
                  <Swatch className="w-4 border-t-2 border-dashed border-ok" label="Targets 130 and 80" />
                </>
              ) : trend.band ? (
                <Swatch className="size-3 rounded-[3px] bg-ok-soft" label={`Target ${trend.band.low}–${trend.band.high} ${trend.unit}`} />
              ) : null}
              {kind !== 'weight' && <Swatch className="size-2.5 rounded-full bg-warn" label="Outside target" />}
            </p>
            <SegmentedControl
              label={`Show ${name.toLowerCase()} as`}
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'chart', label: 'Chart' },
                { value: 'table', label: 'Table' },
              ]}
            />
          </div>

          {view === 'chart' ? (
            <TrendChart
              points={trend.points}
              secondary={trend.secondary}
              band={trend.band}
              references={trend.references}
              unit={trend.unit}
              label={summary}
            />
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{name} readings, last {days} days, newest first</caption>
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-left text-xs text-ink-muted">
                    <th scope="col" className="py-2 font-medium">When</th>
                    <th scope="col" className="py-2 font-medium">Reading</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...trend.points].reverse().map((point, i, list) => {
                    const diastolic = trend.secondary?.[list.length - 1 - i]?.value;
                    return (
                      <tr key={point.at}>
                        <td className="py-1.5">
                          {formatDay(point.at)} <span className="text-ink-muted">{formatTime(point.at)}</span>
                        </td>
                        <td className={cx('py-1.5 tabular', point.outOfRange && 'font-semibold')}>
                          {diastolic !== undefined ? `${point.value}/${diastolic}` : point.value} {trend.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

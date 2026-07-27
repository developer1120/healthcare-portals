import { useState } from 'react';
import { useVitals } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { Sparkline } from '@/charts/Sparkline';
import { SYSTOLIC_TARGET, averageBloodPressure, lastDays, readingsOf } from '@/domain/vitals';
import { Card, SegmentedControl, Skeleton } from '@/ui';

type Range = '30' | '90';

const ranges = [
  { value: '30' as const, label: '30d' },
  { value: '90' as const, label: '90d' },
];

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={className} />
      {label}
    </span>
  );
}

/** Home blood pressure over 30 or 90 days against the target band. */
export function BloodPressureTrend({ patientId }: { patientId: string }) {
  const [range, setRange] = useState<Range>('30');
  const query = useVitals(patientId, 'blood-pressure');
  const days = Number(range);

  return (
    <Card
      title="Blood pressure"
      description={`Home readings, last ${days} days`}
      action={<SegmentedControl label="Time range" size="sm" options={ranges} value={range} onChange={setRange} />}
    >
      <QueryState query={query} label="your blood pressure" loading={<Skeleton className="h-32" />}>
        {(readings) => {
          const recent = lastDays(readingsOf(readings, 'blood-pressure'), days).filter((r) => r.source === 'home');
          const average = averageBloodPressure(recent);
          if (!average) {
            return <p className="text-sm text-ink-muted">No home readings in the last {days} days.</p>;
          }
          const summary = `Average ${average.systolic}/${average.diastolic} mmHg over ${recent.length} readings`;
          return (
            <>
              <Sparkline
                series={[
                  { values: recent.map((r) => r.systolic), color: 'var(--mw-data)' },
                  { values: recent.map((r) => r.diastolic), color: 'var(--mw-ink-subtle)' },
                ]}
                threshold={SYSTOLIC_TARGET.high}
                markLast
                className="h-32"
                label={`Systolic and diastolic blood pressure, last ${days} days. ${summary}.`}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                <p className="tabular">{summary}</p>
                <p className="flex flex-wrap gap-3">
                  <LegendSwatch className="h-0.5 w-4 rounded bg-data" label="Systolic" />
                  <LegendSwatch className="h-0.5 w-4 rounded bg-ink-subtle" label="Diastolic" />
                  <LegendSwatch
                    className="w-4 border-t-2 border-dashed border-ok"
                    label={`Systolic target under ${SYSTOLIC_TARGET.high}`}
                  />
                </p>
              </div>
            </>
          );
        }}
      </QueryState>
    </Card>
  );
}

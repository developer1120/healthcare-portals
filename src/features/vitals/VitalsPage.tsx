import { useSearchParams } from 'react-router';
import { useVitals } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import type { VitalKind, VitalReading } from '@/domain/types';
import { assessReading, vitalLabels } from '@/domain/vitals';
import { compareDesc, formatDay, formatTime } from '@/lib/dates';
import { pageParam, paginate } from '@/lib/paginate';
import { Card, Pagination, SegmentedControl, Skeleton, StatusDot } from '@/ui';
import { LogReadingForm } from './LogReadingForm';
import { VitalTrendCard } from './VitalTrendCard';
import { formatReading, glucoseContextLabels, isVitalKind, kindOptions } from './readingFormat';

/** Readings per page of history. */
export const READINGS_PER_PAGE = 10;
const sourceLabels = { home: 'Home', clinic: 'Clinic', device: 'Device' } as const;

interface ReadingHistoryProps {
  kind: VitalKind;
  readings: VitalReading[];
  page: number;
  onPageChange: (page: number) => void;
}

/** Every reading of one kind, newest first, a page at a time. */
function ReadingHistory({ kind, readings, page, onPageChange }: ReadingHistoryProps) {
  const all = readings.filter((r) => r.kind === kind).sort((a, b) => compareDesc(a.takenAt, b.takenAt));
  const { items, ...position } = paginate(all, page, READINGS_PER_PAGE);

  if (all.length === 0) return <p className="text-sm text-ink-muted">No readings yet. Your first one will show here.</p>;

  return (
    <div className="flex flex-col gap-3">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {vitalLabels[kind]} readings, newest first, page {position.page} of {position.pageCount}
        </caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            <th scope="col" className="py-2 font-medium">When</th>
            <th scope="col" className="py-2 font-medium">Reading</th>
            <th scope="col" className="py-2 font-medium">Status</th>
            <th scope="col" className="py-2 font-medium">From</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((reading) => {
            const status = assessReading(reading);
            return (
              <tr key={reading.id}>
                <td className="py-2 pr-2 whitespace-nowrap">
                  {formatDay(reading.takenAt)} <span className="text-ink-muted">{formatTime(reading.takenAt)}</span>
                </td>
                <td className="py-2 pr-2 whitespace-nowrap tabular">
                  {formatReading(reading)}
                  {reading.kind === 'glucose' && (
                    <span className="block text-xs text-ink-muted">{glucoseContextLabels[reading.context]}</span>
                  )}
                </td>
                <td className="py-2 pr-2">{status ? <StatusDot tone={status.tone}>{status.label}</StatusDot> : '—'}</td>
                <td className="py-2 text-ink-muted">{sourceLabels[reading.source]}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pagination
        label="Reading pages"
        {...position}
        onChange={onPageChange}
        previousLabel="Newer"
        nextLabel="Older"
      />
    </div>
  );
}

export function VitalsPage() {
  const patientId = usePatientId();
  const vitals = useVitals(patientId);
  const [params, setParams] = useSearchParams();
  const requested = params.get('kind');
  const kind: VitalKind = isVitalKind(requested) ? requested : 'blood-pressure';
  const page = pageParam(params);

  function setParam(key: string, value: string | undefined) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (value) updated.set(key, value);
        else updated.delete(key);
        // A new reading type starts back at its newest readings.
        if (key === 'kind') updated.delete('page');
        return updated;
      },
      { replace: true, preventScrollReset: true },
    );
  }

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <SegmentedControl<VitalKind>
        label="Reading type"
        value={kind}
        onChange={(next) => setParam('kind', next)}
        options={kindOptions}
        className="self-start"
      />
      <QueryState query={vitals} label="your trend" loading={<Skeleton className="h-80 rounded-card" />}>
        {(readings) => <VitalTrendCard kind={kind} readings={readings} />}
      </QueryState>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <Card title={`Log ${vitalLabels[kind].toLowerCase()}`}>
          {/* Keyed by kind so switching types starts a fresh form. */}
          <LogReadingForm key={kind} kind={kind} patientId={patientId} />
        </Card>
        <Card title="Readings">
          <QueryState query={vitals} label="your readings" loading={<Skeleton className="h-48" />}>
            {(readings) => (
              <ReadingHistory
                kind={kind}
                readings={readings}
                page={page}
                onPageChange={(next) => setParam('page', next > 1 ? String(next) : undefined)}
              />
            )}
          </QueryState>
        </Card>
      </div>
    </div>
  );
}

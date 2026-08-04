import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { IconArrowDownRight, IconArrowRight, IconArrowUpRight, IconMessageQuestion } from '@tabler/icons-react';
import { useClinicians, useLabPanels, useMarkResultsViewed } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { TrendChart } from '@/charts/TrendChart';
import {
  flagDisplay,
  flagObservation,
  formatReferenceRange,
  isNewResult,
  labDescriptions,
  observationHistory,
  trendSummary,
} from '@/domain/labs';
import type { Clinician, LabObservation, LabPanel } from '@/domain/types';
import { formatShortDate } from '@/lib/dates';
import { usePageHeading } from '@/shell/pageHeading';
import { BackLink, Card, SegmentedControl, Skeleton, StatusDot, cx } from '@/ui';

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function TrendSentence({ history, observation }: { history: ReturnType<typeof observationHistory>; observation: LabObservation }) {
  const trend = trendSummary(history, observation);
  if (!trend) {
    return (
      <p className="text-sm text-ink-muted">
        This is your first {observation.name} result here. Later results will show as a trend.
      </p>
    );
  }
  const Arrow = trend.direction === 'up' ? IconArrowUpRight : trend.direction === 'down' ? IconArrowDownRight : IconArrowRight;
  const amount = `${formatValue(Math.abs(trend.change))} ${observation.unit}`;
  const movement =
    trend.direction === 'same' ? 'No change' : `${trend.direction === 'up' ? 'Up' : 'Down'} ${amount}`;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Arrow aria-hidden size={18} stroke={1.75} className="text-ink-muted" />
      <span>
        {movement} since {formatShortDate(trend.since)}
      </span>
      {/* A real space, so the sentence reads correctly as text, not just with visual gap. */}{' '}
      {trend.improving !== null && (
        <span className={cx('font-medium', trend.improving ? 'text-ok-ink' : 'text-warn-ink')}>
          · {trend.improving ? 'moving toward the normal range' : 'moving away from the normal range'}
        </span>
      )}
    </p>
  );
}

function ObservationTrend({ observation, panels }: { observation: LabObservation; panels: LabPanel[] }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const history = observationHistory(panels, observation.code);
  const display = flagDisplay[flagObservation(observation)];
  const range = formatReferenceRange(observation);
  const first = history[0]!;
  const label =
    `${observation.name} over time: ${history.length} ${history.length === 1 ? 'result' : 'results'} ` +
    `from ${formatShortDate(first.collectedAt)} to ${formatShortDate(history.at(-1)!.collectedAt)}. ` +
    `Latest ${formatValue(observation.value)} ${observation.unit}${range ? `, normal range ${range}` : ''}.`;

  return (
    <Card
      title={observation.name}
      description={labDescriptions[observation.code]}
      headingLevel={2}
      action={
        history.length > 1 && (
          <SegmentedControl
            label={`Show ${observation.name} as`}
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'chart', label: 'Chart' },
              { value: 'table', label: 'Table' },
            ]}
          />
        )
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="font-display text-3xl font-semibold tabular">
          {formatValue(observation.value)} <span className="font-sans text-sm font-normal text-ink-muted">{observation.unit}</span>
        </p>
        <StatusDot tone={display.tone}>{display.label}</StatusDot>
        {range && <p className="text-sm text-ink-muted">Normal range {range}</p>}
      </div>
      <div className="mt-2">
        <TrendSentence history={history} observation={observation} />
      </div>

      {history.length > 1 && (
        <div className="mt-4">
          {view === 'chart' ? (
            <TrendChart
              points={history.map((p) => ({ at: p.collectedAt, value: p.value, outOfRange: p.flag !== 'normal' }))}
              band={{ low: observation.refLow, high: observation.refHigh }}
              unit={observation.unit}
              label={label}
              formatValue={formatValue}
            />
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">{observation.name} results over time</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th scope="col" className="py-2 font-medium">Date</th>

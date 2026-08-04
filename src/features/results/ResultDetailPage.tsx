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
                  <th scope="col" className="py-2 font-medium">Result</th>
                  <th scope="col" className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...history].reverse().map((point) => (
                  <tr key={point.panelId}>
                    <td className="py-2">{formatShortDate(point.collectedAt)}</td>
                    <td className="py-2 tabular">
                      {formatValue(point.value)} {point.unit}
                    </td>
                    <td className="py-2">
                      <StatusDot tone={flagDisplay[point.flag].tone}>{flagDisplay[point.flag].label}</StatusDot>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </Card>
  );
}

function ResultDetail({ panel, panels, orderedBy }: { panel: LabPanel; panels: LabPanel[]; orderedBy?: Clinician }) {
  const markViewed = useMarkResultsViewed(panel.patientId);
  usePageHeading(panel.name);

  useEffect(() => {
    if (isNewResult(panel)) markViewed.mutate([panel.id]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per panel
  }, [panel.id]);

  const askLink = `/messages/new?${new URLSearchParams({
    topic: 'results',
    subject: `Question about my ${panel.name.toLowerCase()} results`,
  })}`;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
          <div>
            <p>
              Collected {formatShortDate(panel.collectedAt)}
              {orderedBy && ` · Ordered by ${orderedBy.name}`}
            </p>
            <p className="text-ink-muted">
              {panel.status === 'pending'
                ? 'Waiting for the lab. Most results are ready in 1–3 days.'
                : panel.status === 'reviewed' && panel.reviewedAt
                  ? `Reviewed ${formatShortDate(panel.reviewedAt)}`
                  : 'Not reviewed by your clinician yet'}
            </p>
          </div>
          {panel.status !== 'pending' && (
            <Link
              to={askLink}
              className="inline-flex items-center gap-1.5 font-medium text-ink-muted hover:text-ink hover:underline"
            >
              <IconMessageQuestion aria-hidden size={16} stroke={1.75} />
              Ask about this result
            </Link>
          )}
        </div>
        {panel.clinicianNote && (
          <figure className="mt-3 rounded-control bg-data-soft px-3 py-2.5 text-sm text-data-ink">
            <blockquote>{panel.clinicianNote}</blockquote>
            <figcaption className="mt-1 text-xs">{orderedBy?.name ?? 'Your clinician'}</figcaption>
          </figure>
        )}
      </Card>

      {panel.observations.map((observation) => (
        <ObservationTrend key={observation.code} observation={observation} panels={panels} />
      ))}
    </div>
  );
}

export function ResultDetailPage() {
  const { panelId } = useParams();
  const patientId = usePatientId();
  const labs = useLabPanels(patientId);
  const clinicians = useClinicians();

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <BackLink to="/results">All results</BackLink>
      <QueryState query={labs} label="this result" loading={<Skeleton className="h-72 rounded-card" />}>
        {(panels) => {
          const panel = panels.find((p) => p.id === panelId);
          if (!panel) {
            return (
              <Card tone="sunken" className="text-sm text-ink-muted">
                We couldn't find that result. It may have been removed, or the link may be wrong.
              </Card>
            );
          }
          return (
            <ResultDetail
              panel={panel}
              panels={panels}
              orderedBy={clinicians.data?.find((c) => c.id === panel.orderedById)}
            />
          );
        }}
      </QueryState>
    </div>
  );
}

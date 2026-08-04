import { useId } from 'react';
import { Link } from 'react-router';
import { IconAlertTriangle, IconMessageQuestion } from '@tabler/icons-react';
import { flagDisplay, flagObservation, formatReferenceRange, labDescriptions, summarizePanel } from '@/domain/labs';
import type { Clinician, LabPanel } from '@/domain/types';
import { formatShortDate, relativeDay } from '@/lib/dates';
import { StatusDot, cx } from '@/ui';
import { RangeBar } from './RangeBar';

interface PanelCardProps {
  panel: LabPanel;
  orderedBy?: Clinician;
  /** Shown with a "New" badge (the patient hadn't seen it before this visit). */
  isNew: boolean;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(value < 10 ? 1 : 0).replace(/\.0$/, '');
}

export function PanelCard({ panel, orderedBy, isNew }: PanelCardProps) {
  const headingId = useId();
  const { critical } = summarizePanel(panel);
  const askLink = `/messages/new?${new URLSearchParams({
    topic: 'results',
    subject: `Question about my ${panel.name.toLowerCase()} results`,
  })}`;

  return (
    // Named with the date too, since the same test can appear more than once on the page.
    <section
      aria-label={`${panel.name}, collected ${formatShortDate(panel.collectedAt)}`}
      className="rounded-card border border-line bg-surface p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={headingId} className="flex flex-wrap items-center gap-2 text-base">
            {panel.status === 'pending' ? (
              panel.name
            ) : (
              <Link to={`/results/${panel.id}`} className="hover:underline">
                {panel.name}
              </Link>
            )}
            {isNew && (
              <span className="rounded-[6px] bg-accent-soft px-1.5 py-0.5 font-sans text-2xs font-semibold text-accent-ink">
                New
              </span>
            )}
          </h2>
          <p className="text-sm text-ink-muted">
            Collected {formatShortDate(panel.collectedAt)}
            {orderedBy && ` · Ordered by ${orderedBy.name}`}
          </p>
        </div>
        {panel.status !== 'pending' && (
          <Link
            to={askLink}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink hover:underline"
          >
            <IconMessageQuestion aria-hidden size={16} stroke={1.75} />
            Ask about this result
          </Link>
        )}
      </header>

      {panel.status === 'pending' ? (
        <p className="mt-3 rounded-control bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted">
          <StatusDot tone="neutral" className="mr-2">
            Waiting for results
          </StatusDot>
          Sample collected {relativeDay(panel.collectedAt).toLowerCase()}. Most results are ready in 1–3 days.
        </p>
      ) : (
        <>
          {critical && (
            <p
              role="alert"
              className="mt-3 flex gap-2 rounded-control border border-critical/40 bg-critical-soft px-3 py-2.5 text-sm text-critical-ink"
            >
              <IconAlertTriangle aria-hidden size={18} className="mt-px shrink-0" />
              One of these results is in a range that needs prompt attention. Your care team has been alerted and will
              contact you. If you feel unwell, call 911.
            </p>
          )}

          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <caption className="sr-only">{panel.name} results</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-ink-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">Test</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Result</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Normal range</th>
                  <th scope="col" className="w-32 py-2 pr-3 font-medium">
                    <span className="sr-only">Range chart</span>
                  </th>
                  <th scope="col" className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {panel.observations.map((observation) => {
                  const flag = flagObservation(observation);
                  const display = flagDisplay[flag];
                  const out = flag !== 'normal';
                  return (
                    <tr key={observation.code}>
                      <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                        <span className="block font-medium">{observation.name}</span>
                        {labDescriptions[observation.code] && (
                          <span className="block text-xs text-ink-muted">{labDescriptions[observation.code]}</span>
                        )}
                      </th>
                      <td className={cx('py-2.5 pr-3 whitespace-nowrap tabular', out && 'font-semibold')}>
                        {formatValue(observation.value)} <span className="text-xs font-normal text-ink-muted">{observation.unit}</span>
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-ink-muted tabular">
                        {formatReferenceRange(observation) || '—'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <RangeBar observation={observation} />
                      </td>
                      <td className="py-2.5">
                        <StatusDot tone={display.tone}>{display.label}</StatusDot>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {panel.status === 'reviewed' && panel.clinicianNote ? (
            <figure className="mt-3 rounded-control bg-data-soft px-3 py-2.5 text-sm text-data-ink">
              <blockquote>{panel.clinicianNote}</blockquote>
              <figcaption className="mt-1 text-xs">
                {orderedBy?.name ?? 'Your clinician'}
                {panel.reviewedAt && `, ${formatShortDate(panel.reviewedAt)}`}
              </figcaption>
            </figure>
          ) : (
            <p className="mt-3 text-xs text-ink-muted">
              Your clinician hasn’t added a note yet. Results are shared with you as soon as they’re ready, sometimes
              before your clinician has reviewed them.
            </p>
          )}
        </>
      )}
    </section>
  );
}

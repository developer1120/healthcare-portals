import { format } from 'date-fns';
import { adherenceSummary } from '@/domain/adherence';
import type { DoseLog, Medication } from '@/domain/types';
import { toDate } from '@/lib/dates';
import { Card, cx } from '@/ui';

const DAYS = 14;

function cellTone(scheduled: number, taken: number): string {
  if (scheduled === 0) return 'bg-surface-sunken';
  if (taken === scheduled) return 'bg-ok';
  if (taken / scheduled >= 0.5) return 'bg-warn';
  return 'bg-critical';
}

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** How consistently scheduled doses were taken over the last two weeks. */
export function AdherenceCard({ medications, logs, now }: { medications: Medication[]; logs: DoseLog[]; now: Date }) {
  const summary = adherenceSummary(medications, logs, DAYS, now);

  return (
    <Card title="Last 14 days" description="Doses marked as taken. Today counts once each dose time has passed.">
      {summary.rate === null ? (
        <p className="text-sm text-ink-muted">Nothing scheduled in the last two weeks.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-x-3">
            <p className="font-display text-3xl font-semibold tabular">{percent(summary.rate)}</p>
            <p className="text-sm text-ink-muted">of doses taken</p>
            {summary.streak > 1 && (
              <p className="rounded-control bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok-ink">
                {summary.streak}-day streak
              </p>
            )}
          </div>

          <div>
            <ul aria-label="Doses taken each day" className="grid grid-cols-14 gap-1">
              {summary.days.map((day) => {
                const date = toDate(`${day.date}T12:00:00`);
                const text =
                  day.scheduled === 0
                    ? `${format(date, 'EEE d MMM')}: nothing counted yet`
                    : `${format(date, 'EEE d MMM')}: ${day.taken} of ${day.scheduled} doses taken`;
                return (
                  <li key={day.date} title={text}>
                    <span className="sr-only">{text}</span>
                    <span aria-hidden="true" className={cx('block h-7 rounded-[6px]', cellTone(day.scheduled, day.taken))} />
                  </li>
                );
              })}
            </ul>
            <div aria-hidden="true" className="mt-1 flex justify-between text-2xs text-ink-muted">
              <span>{format(toDate(`${summary.days[0]!.date}T12:00:00`), 'd MMM')}</span>
              <span>Today</span>
            </div>
          </div>

          <ul aria-label="By medicine" className="flex flex-col gap-2">
            {summary.byMedication.map(({ medication, scheduled, taken }) => {
              const rate = scheduled ? taken / scheduled : 0;
              return (
                <li key={medication.id} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1 text-sm">
                  <span className="truncate">
                    {medication.name} {medication.strength}
                  </span>
                  <span className="text-right tabular">{percent(rate)}</span>
                  <span aria-hidden="true" className="col-span-2 h-1.5 rounded-full bg-surface-sunken">
                    <span
                      className={cx('block h-full rounded-full', rate >= 0.9 ? 'bg-ok' : 'bg-warn')}
                      style={{ width: percent(rate) }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

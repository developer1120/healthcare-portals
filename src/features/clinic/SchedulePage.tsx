import { Fragment } from 'react';
import { Link, useSearchParams } from 'react-router';
import { addDays, format, isSameDay, isValid, parseISO } from 'date-fns';
import { IconChevronLeft, IconChevronRight, IconMapPin, IconVideo } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { useSchedule, useUpdateVisit } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { useClinicianId } from '@/auth/session';
import { endOf, modeLabels, statusDisplay } from '@/domain/appointments';
import { assessRisk, riskLevelDisplay } from '@/domain/risk';
import {
  isWorkingDay,
  nextUp,
  scheduleGaps,
  scheduleSummary,
  visitActionLabels,
  visitActions,
  waitingMinutes,
} from '@/domain/schedule';
import type { DaySchedule, Gap, ScheduleEntry } from '@/domain/schedule';
import { ageOn, formatTime, toDate, toIsoDate } from '@/lib/dates';
import { useNow } from '@/lib/useNow';
import { usePageHeading } from '@/shell/pageHeading';
import { Button, Card, IconButton, Skeleton, StatusDot, cx } from '@/ui';
import type { StatusTone } from '@/ui';

function useScheduleDate(now: Date) {
  const [params, setParams] = useSearchParams();
  const parsed = parseISO(params.get('date') ?? '');
  const day = isValid(parsed) ? parsed : now;
  const go = (next: Date) =>
    setParams(isSameDay(next, now) ? {} : { date: toIsoDate(next) }, { replace: true, preventScrollReset: true });
  return { day, go };
}

function patientName({ snapshot: { patient } }: ScheduleEntry) {
  return `${patient.preferredName ?? patient.firstName} ${patient.lastName}`;
}

function statusFor(entry: ScheduleEntry, now: Date): { tone: StatusTone; label: string } {
  const { appointment } = entry;
  const waiting = waitingMinutes(appointment, now);
  if (waiting !== null) {
    const where = appointment.mode === 'video' ? 'In waiting room' : 'Arrived';
    return { tone: 'ok', label: `${where} · ${waiting} min` };
  }
  if (appointment.status === 'booked' && endOf(appointment) <= now) return { tone: 'warn', label: 'Not checked in' };
  return statusDisplay[appointment.status];
}

function VisitRow({ entry, now, clinicianId }: { entry: ScheduleEntry; now: Date; clinicianId: string }) {
  const update = useUpdateVisit(clinicianId);
  const { appointment, snapshot } = entry;
  const risk = riskLevelDisplay[assessRisk(snapshot, now).level];
  const status = statusFor(entry, now);
  const actions = visitActions(appointment, now);
  const ModeIcon = appointment.mode === 'video' ? IconVideo : IconMapPin;
  const cancelled = appointment.status === 'cancelled';

  return (
    <li
      aria-label={`${formatTime(appointment.start)} ${patientName(entry)}`}
      className={cx(
        'grid gap-x-4 gap-y-2 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] sm:px-5',
        appointment.status === 'checked-in' && 'bg-ok-soft/50',
        cancelled && 'opacity-60',
      )}
    >
      <p className="text-sm tabular">
        <span className="font-semibold">{formatTime(appointment.start)}</span>
        <span className="block text-xs text-ink-muted">{appointment.durationMinutes} min</span>
      </p>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 text-sm">
          <Link to={`/clinic/patients/${snapshot.patient.id}`} className={cx('font-medium hover:underline', cancelled && 'line-through')}>
            {patientName(entry)}
          </Link>
          <span className="text-xs text-ink-muted tabular">
            {ageOn(snapshot.patient.dateOfBirth, now)} · {snapshot.patient.mrn}
          </span>
          <StatusDot tone={risk.tone}>{risk.label} risk</StatusDot>
        </p>
        <p className="mt-0.5 text-sm text-ink-muted">{appointment.reason}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <ModeIcon aria-hidden size={14} />
            {modeLabels[appointment.mode]}
          </span>
          {appointment.mode === 'video' && appointment.status === 'booked' && (
            <span>{appointment.precheck ? 'Pre-check done' : 'No pre-check yet'}</span>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
        <StatusDot tone={status.tone}>{status.label}</StatusDot>
        {actions.length > 0 && (
          <div className="flex gap-1.5">
            {actions.map((action) => (
              <Button
                key={action}
                size="sm"
                variant={action === 'complete' || action === 'check-in' ? 'primary' : 'secondary'}
                loading={update.isPending && update.variables?.action === action}
                disabled={update.isPending}
                onClick={() => update.mutate({ appointmentId: appointment.id, action })}
              >
                {visitActionLabels[action]}
              </Button>
            ))}
          </div>
        )}
        {update.isError && (
          <p role="alert" className="text-xs text-critical-ink">
            {errorMessage(update.error)}
          </p>
        )}
      </div>
    </li>
  );
}

function GapRow({ gap }: { gap: Gap }) {
  return (
    <li className="border-b border-dashed border-line px-4 py-2 text-xs text-ink-muted last:border-0 sm:px-5">
      <span className="tabular">
        Open {formatTime(gap.start)}–{formatTime(gap.end)}
      </span>
    </li>
  );
}

function NowLine({ now }: { now: Date }) {
  return (
    <li aria-hidden="true" className="relative flex items-center gap-2 px-4 py-1 text-2xs font-semibold text-accent-ink sm:px-5">
      <span className="tabular">Now {formatTime(now)}</span>
      <span className="h-px flex-1 bg-accent" />
    </li>
  );
}

type Row = { kind: 'visit'; entry: ScheduleEntry; at: Date } | { kind: 'gap'; gap: Gap; at: Date };

function DayList({ schedule, day, now, clinicianId }: { schedule: DaySchedule; day: Date; now: Date; clinicianId: string }) {
  const rows: Row[] = [
    ...schedule.entries.map((entry) => ({ kind: 'visit' as const, entry, at: toDate(entry.appointment.start) })),
    ...scheduleGaps(schedule.clinician, schedule.entries.map((e) => e.appointment), day).map((gap) => ({
      kind: 'gap' as const,
      gap,
      at: gap.start,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const today = isSameDay(day, now);
  // The "now" line goes before the first row that starts after now.
  const nowIndex = today ? rows.findIndex((r) => r.at > now) : -1;
  const showNowAtEnd = today && nowIndex === -1 && rows.length > 0;

  return (
    <ol aria-label="Schedule">
      {rows.map((row, index) => (
        <Fragment key={row.kind === 'visit' ? row.entry.appointment.id : `gap-${row.at.toISOString()}`}>
          {index === nowIndex && <NowLine now={now} />}
          {row.kind === 'visit' ? (
            <VisitRow entry={row.entry} now={now} clinicianId={clinicianId} />
          ) : (
            <GapRow gap={row.gap} />
          )}
        </Fragment>
      ))}
      {showNowAtEnd && <NowLine now={now} />}
    </ol>
  );
}

function NextUpCard({ entry, now }: { entry: ScheduleEntry; now: Date }) {
  const waiting = waitingMinutes(entry.appointment, now);
  return (
    <Card tone="pine" role="region" aria-label="Next up">
      <p className="text-xs">{waiting !== null ? `Waiting ${waiting} min` : `Next up at ${formatTime(entry.appointment.start)}`}</p>
      <p className="mt-1 text-lg font-semibold text-white">
        <Link to={`/clinic/patients/${entry.snapshot.patient.id}`} className="hover:underline">
          {patientName(entry)}
        </Link>
      </p>
      <p className="text-sm text-white/90">
        {entry.appointment.reason} · {modeLabels[entry.appointment.mode]}
      </p>
    </Card>
  );
}

export function SchedulePage() {
  const clinicianId = useClinicianId();
  const now = useNow(30_000);
  const { day, go } = useScheduleDate(now);
  const schedule = useSchedule(clinicianId, toIsoDate(day));
  const today = isSameDay(day, now);
  // The rail calls this page "Today"; on other days the title follows.
  usePageHeading(today ? null : 'Schedule');

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton icon={IconChevronLeft} label="Previous day" onClick={() => go(addDays(day, -1))} />
        <h2 className="min-w-48 text-center text-lg">
          {format(day, 'EEEE d MMMM')}
          {today && <span className="ml-2 align-middle text-xs font-sans font-medium text-ink-muted">Today</span>}
        </h2>
        <IconButton icon={IconChevronRight} label="Next day" onClick={() => go(addDays(day, 1))} />
        {!today && (
          <Button size="sm" variant="ghost" onClick={() => go(now)}>
            Back to today
          </Button>
        )}
      </div>
      <QueryState query={schedule} label="the schedule" loading={<Skeleton className="h-96 rounded-card" />}>
        {(data) => {
          const summary = scheduleSummary(data.entries);
          const next = today ? nextUp(data.entries, now) : undefined;
          if (data.entries.length === 0) {
            return (
              <Card tone="sunken">
                <p className="text-sm text-ink-muted">
                  {isWorkingDay(data.clinician, day) ? 'No visits booked on this day.' : 'No clinic on this day.'}
                </p>
              </Card>
            );
          }
          return (
            <>
              <dl aria-label="Day summary" className="flex flex-wrap gap-2 text-sm">
                {(
                  [
                    ['Visits', summary.visits],
                    ['Waiting', summary.waiting],
                    ['Done', summary.done],
                    ['Missed', summary.missed],
                    ['To go', summary.toGo],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex items-baseline gap-1.5 rounded-control bg-surface px-3 py-1.5">
                    <dt className="text-ink-muted">{label}</dt>
                    <dd className="font-semibold tabular">{value}</dd>
                  </div>
                ))}
              </dl>
              {next && <NextUpCard entry={next} now={now} />}
              <Card padded={false}>
                <DayList schedule={data} day={day} now={now} clinicianId={clinicianId} />
              </Card>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

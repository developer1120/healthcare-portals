import { addMinutes } from 'date-fns';
import { IconArrowBackUp, IconCheck } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { useRecordDose } from '@/api/queries';
import { MARK_EARLY_MINUTES, dosesOn } from '@/domain/adherence';
import type { DoseState, ScheduledDose } from '@/domain/adherence';
import type { DoseLog, Medication } from '@/domain/types';
import { formatTime } from '@/lib/dates';
import { Button, Card, StatusDot } from '@/ui';
import type { StatusTone } from '@/ui';

const stateDisplay: Record<DoseState, { tone: StatusTone; label: string }> = {
  taken: { tone: 'ok', label: 'Taken' },
  skipped: { tone: 'neutral', label: 'Skipped' },
  due: { tone: 'info', label: 'Due now' },
  missed: { tone: 'warn', label: 'Not marked yet' },
  upcoming: { tone: 'neutral', label: 'Later today' },
};

function DoseRow({ dose, patientId }: { dose: ScheduledDose; patientId: string }) {
  const record = useRecordDose(patientId);
  const { medication, scheduledFor, state, log } = dose;
  const name = `${medication.name} ${medication.strength}`;
  const display = stateDisplay[state];
  const send = (action: 'taken' | 'skipped' | 'clear') =>
    record.mutate({ medicationId: medication.id, scheduledFor: scheduledFor.toISOString(), action });

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{name}</p>
        <StatusDot tone={display.tone}>
          {state === 'taken' && log?.takenAt ? `Taken at ${formatTime(log.takenAt)}` : display.label}
        </StatusDot>
        {record.isError && (
          <p role="alert" className="text-xs text-critical">
            {errorMessage(record.error)}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        {state === 'due' || state === 'missed' ? (
          <>
            <Button size="sm" variant="primary" icon={IconCheck} onClick={() => send('taken')} aria-label={`Mark ${name} taken`}>
              Taken
            </Button>
            <Button size="sm" variant="ghost" onClick={() => send('skipped')} aria-label={`Skip ${name}`}>
              Skip
            </Button>
          </>
        ) : state === 'taken' || state === 'skipped' ? (
          <Button size="sm" variant="ghost" icon={IconArrowBackUp} onClick={() => send('clear')} aria-label={`Undo ${name}`}>
            Undo
          </Button>
        ) : (
          <span className="text-xs text-ink-muted">From {formatTime(addMinutes(scheduledFor, -MARK_EARLY_MINUTES))}</span>
        )}
      </div>
    </li>
  );
}

/** Today's scheduled doses by time, each one tickable once it's close to due. */
export function TodaySchedule({
  medications,
  logs,
  patientId,
  now,
}: {
  medications: Medication[];
  logs: DoseLog[];
  patientId: string;
  now: Date;
}) {
  const doses = dosesOn(now, medications, logs, now);
  const times = [...new Set(doses.map((d) => formatTime(d.scheduledFor)))];
  const taken = doses.filter((d) => d.state === 'taken').length;

  return (
    <Card title="Today" description={doses.length ? `${taken} of ${doses.length} doses taken` : undefined}>
      {doses.length === 0 ? (
        <p className="text-sm text-ink-muted">No scheduled doses today.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {times.map((time) => (
            <section key={time} aria-label={`${time} doses`}>
              <h3 className="font-sans text-xs font-semibold tracking-normal text-ink-muted tabular">{time}</h3>
              <ul className="divide-y divide-line">
                {doses
                  .filter((d) => formatTime(d.scheduledFor) === time)
                  .map((dose) => (
                    <DoseRow key={`${dose.medication.id}-${time}`} dose={dose} patientId={patientId} />
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

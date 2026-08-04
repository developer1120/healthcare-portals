import { addMinutes, differenceInMinutes } from 'date-fns';
import { IconDoorEnter, IconPhone } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { useCheckIn } from '@/api/queries';
import { waitingRoomOpensAt } from '@/domain/telehealth';
import type { TelehealthStage } from '@/domain/telehealth';
import type { Appointment, Clinician } from '@/domain/types';
import { formatDuration, formatTime, formatTimeRange, toDate } from '@/lib/dates';
import { Button, Card } from '@/ui';

interface WaitingRoomProps {
  appointment: Appointment;
  clinician?: Clinician;
  stage: Extract<TelehealthStage, 'waiting-soon' | 'waiting-open' | 'checked-in'>;
  now: Date;
}

/** After pre-check: a countdown, then "Join waiting room", then the waiting state itself. */
export function WaitingRoom({ appointment, clinician, stage, now }: WaitingRoomProps) {
  const checkIn = useCheckIn();
  const opensAt = waitingRoomOpensAt(appointment);
  const who = clinician?.name ?? 'Your clinician';
  // If nobody has joined 10 minutes after the start, the clinic phones the patient.
  const callBy = addMinutes(toDate(appointment.start), 10);

  return (
    <div className="flex flex-col gap-4">
      <Card tone="pine" role="region" aria-label="Waiting room">
        {stage === 'checked-in' ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs">You’re in the waiting room</p>
            <h2 className="text-xl text-white">{who} will let you in shortly</h2>
            <p className="text-sm">
              Waiting {formatDuration(differenceInMinutes(now, toDate(appointment.checkedInAt ?? now.toISOString())))}.
              Keep this page open.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs">Pre-check complete</p>
              <h2 className="mt-1 text-xl text-white">
                {stage === 'waiting-open'
                  ? 'Your waiting room is open'
                  : `Your waiting room opens at ${formatTime(opensAt)}`}
              </h2>
              <p className="mt-1 text-sm tabular">
                {formatTimeRange(appointment.start, appointment.durationMinutes)}
                {stage === 'waiting-soon' && ` · opens in ${formatDuration(differenceInMinutes(opensAt, now))}`}
              </p>
            </div>
            {stage === 'waiting-open' && (
              <Button
                variant="primary"
                icon={IconDoorEnter}
                loading={checkIn.isPending}
                onClick={() => checkIn.mutate({ patientId: appointment.patientId, appointmentId: appointment.id })}
              >
                Join waiting room
              </Button>
            )}
          </div>
        )}
      </Card>

      {checkIn.isError && (
        <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
          {errorMessage(checkIn.error)}
        </p>
      )}

      {appointment.precheck && (
        <p className="flex items-start gap-2 text-sm text-ink-muted">
          <IconPhone aria-hidden size={18} stroke={1.75} className="mt-px shrink-0" />
          If {who} hasn’t joined by {formatTime(callBy)}, the clinic will call you on {appointment.precheck.callbackPhone}.
        </p>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { IconCalendarRepeat, IconPhone, IconX } from '@tabler/icons-react';
import { CLINIC_PHONE, LATE_CANCEL_FEE_CENTS, MAX_RESCHEDULES, changePolicy } from '@/domain/appointmentPolicy';
import type { Appointment } from '@/domain/types';
import { formatDay, formatTime } from '@/lib/dates';
import { formatMoney } from '@/lib/units';
import { Button, ButtonLink, Card } from '@/ui';
import { CancelVisitDialog } from './CancelVisitDialog';

/** Reschedule and cancel actions for an upcoming visit, explained against the 24-hour policy. */
export function ManageVisitCard({ appointment }: { appointment: Appointment }) {
  const navigate = useNavigate();
  const [cancelOpen, setCancelOpen] = useState(false);
  const policy = changePolicy(appointment);
  if (!policy.canCancel && !policy.canReschedule) return null;

  const deadline = `${formatDay(policy.freeChangeDeadline)}, ${formatTime(policy.freeChangeDeadline)}`;

  return (
    <Card title="Need to change this visit?">
      <div className="flex flex-col gap-3 text-sm">
        {policy.rescheduleBlock === 'within-cutoff' ? (
          <p className="rounded-control bg-warn-soft px-3 py-2.5 text-warn-ink">
            Your visit is less than 24 hours away. To move it, call the clinic. Cancelling now adds a{' '}
            {formatMoney(LATE_CANCEL_FEE_CENTS)} late cancellation fee.
          </p>
        ) : policy.rescheduleBlock === 'limit-reached' ? (
          <p className="text-ink-muted">
            This visit has been moved {MAX_RESCHEDULES} times. To change it again, call the clinic. You can still
            cancel for free until {deadline}.
          </p>
        ) : (
          <p className="text-ink-muted">Free to move or cancel until {deadline} (24 hours before).</p>
        )}

        <div className="flex flex-wrap gap-2">
          {policy.canReschedule ? (
            <ButtonLink to={`/appointments/${appointment.id}/reschedule`} icon={IconCalendarRepeat}>
              Reschedule
            </ButtonLink>
          ) : (
            <a
              href={`tel:${CLINIC_PHONE.replace(/[^\d]/g, '')}`}
              className="inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-4 font-semibold hover:border-line-strong"
            >
              <IconPhone aria-hidden size={18} stroke={1.75} />
              Call {CLINIC_PHONE}
            </a>
          )}
          <Button variant="danger" icon={IconX} onClick={() => setCancelOpen(true)}>
            Cancel visit
          </Button>
        </div>
      </div>

      <CancelVisitDialog
        appointment={appointment}
        late={policy.lateCancellation}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onCancelled={() => {
          setCancelOpen(false);
          navigate('.', { replace: true, state: { notice: 'cancelled' } });
        }}
      />
    </Card>
  );
}

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { errorMessage } from '@/api/errors';
import { useCancelAppointment } from '@/api/queries';
import { LATE_CANCEL_FEE_CENTS, cancellationReasons } from '@/domain/appointmentPolicy';
import type { Appointment } from '@/domain/types';
import { formatTimeRange } from '@/lib/dates';
import { formatMoney } from '@/lib/units';
import { Button, Dialog, Field, Select, Textarea } from '@/ui';

const NOTE_MAX = 300;

function cancelSchema(late: boolean) {
  return z
    .object({
      reason: z.enum(cancellationReasons, { error: 'Choose a reason' }),
      note: z.string().trim().max(NOTE_MAX, `Keep it under ${NOTE_MAX} characters`),
      acceptLateFee: z.boolean(),
    })
    .superRefine((values, ctx) => {
      if (values.reason === 'Other' && values.note.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['note'], message: 'Tell us a little about why' });
      }
      if (late && !values.acceptLateFee) {
        ctx.addIssue({ code: 'custom', path: ['acceptLateFee'], message: 'Confirm the fee to cancel now' });
      }
    });
}

type CancelValues = z.infer<ReturnType<typeof cancelSchema>>;

interface CancelVisitDialogProps {
  appointment: Appointment;
  late: boolean;
  open: boolean;
  onClose: () => void;
  onCancelled: () => void;
}

export function CancelVisitDialog({ appointment, late, open, onClose, onCancelled }: CancelVisitDialogProps) {
  const cancel = useCancelAppointment();
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<CancelValues>({
    resolver: zodResolver(cancelSchema(late)),
    defaultValues: { reason: undefined, note: '', acceptLateFee: false },
  });

  function close() {
    reset();
    cancel.reset();
    onClose();
  }

  const onSubmit = handleSubmit(({ reason, note, acceptLateFee }) =>
    cancel.mutate(
      {
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        reason: note ? `${reason}: ${note}` : reason,
        acceptLateFee,
      },
      { onSuccess: onCancelled },
    ),
  );

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Cancel this visit?"
      description={`${appointment.reason} · ${formatTimeRange(appointment.start, appointment.durationMinutes)}`}
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {late && (
          <p className="rounded-control bg-warn-soft px-3 py-2.5 text-sm text-warn-ink">
            Your visit is less than 24 hours away, so cancelling now adds a {formatMoney(LATE_CANCEL_FEE_CENTS)} late
            cancellation fee to your next statement.
          </p>
        )}
        <Field label="Reason" error={errors.reason?.message} required>
          <Select
            options={cancellationReasons.map((r) => ({ value: r, label: r }))}
            placeholder="Choose a reason"
            defaultValue=""
            {...register('reason')}
          />
        </Field>
        <Field
          label={watch('reason') === 'Other' ? 'Tell us more' : 'Anything else? (optional)'}
          error={errors.note?.message}
        >
          <Textarea rows={3} maxLength={NOTE_MAX} {...register('note')} />
        </Field>
        {late && (
          <div>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                aria-invalid={errors.acceptLateFee ? true : undefined}
                className="mt-0.5 size-4 accent-[var(--mw-critical)]"
                {...register('acceptLateFee')}
              />
              I understand a {formatMoney(LATE_CANCEL_FEE_CENTS)} fee will be added.
            </label>
            {errors.acceptLateFee && (
              <p role="alert" className="mt-1 text-xs font-medium text-critical">
                {errors.acceptLateFee.message}
              </p>
            )}
          </div>
        )}
        {cancel.isError && (
          <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
            {errorMessage(cancel.error)}
          </p>
        )}
        <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={close}>Keep visit</Button>
          <Button type="submit" variant="danger" loading={cancel.isPending}>
            Cancel visit
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { IconCircleCheck } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { usePrecheck } from '@/api/queries';
import { normalisePhone } from '@/domain/telehealth';
import type { Appointment, Patient } from '@/domain/types';
import { Button, Card, Field, Input, Textarea } from '@/ui';
import { ConnectionCheck } from './ConnectionCheck';
import { DeviceCheck } from './DeviceCheck';

const NOTES_MAX = 500;

const precheckSchema = z.object({
  callbackPhone: z
    .string()
    .trim()
    .min(1, 'Enter a phone number')
    .refine((value) => normalisePhone(value) !== null, 'Enter a 10-digit phone number, like (503) 555-0142'),
  notes: z.string().trim().max(NOTES_MAX, `Keep it under ${NOTES_MAX} characters`),
  medsReviewed: z.boolean().refine(Boolean, 'Check your medication list before continuing'),
  consent: z.boolean().refine(Boolean, 'Consent is needed for a video visit'),
});

type PrecheckValues = z.infer<typeof precheckSchema>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card title={title} headingLevel={3}>
      {children}
    </Card>
  );
}

export function PrecheckForm({ appointment, patient }: { appointment: Appointment; patient: Patient }) {
  const [devicesOk, setDevicesOk] = useState(false);
  const precheck = usePrecheck();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PrecheckValues>({
    resolver: zodResolver(precheckSchema),
    defaultValues: {
      callbackPhone: appointment.precheck?.callbackPhone ?? patient.phone,
      notes: appointment.precheck?.notes ?? '',
      medsReviewed: false,
      consent: false,
    },
  });

  const onSubmit = handleSubmit(({ callbackPhone, notes }) =>
    precheck.mutate({
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      callbackPhone,
      notes,
      devicesOk,
      consent: true,
    }),
  );

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Camera and microphone">
          <DeviceCheck onResult={setDevicesOk} />
        </Section>
        <Section title="Internet connection">
          <ConnectionCheck />
        </Section>
      </div>

      <Section title="Before the visit">
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="If the video drops, we’ll call you on"
            error={errors.callbackPhone?.message}
            required
          >
            <Input type="tel" autoComplete="tel" {...register('callbackPhone')} />
          </Field>
          <Field
            label="Anything new since you booked? (optional)"
            hint={`${watch('notes').length}/${NOTES_MAX} · Your clinician reads this before the visit.`}
            error={errors.notes?.message}
          >
            <Textarea rows={3} maxLength={NOTES_MAX} {...register('notes')} />
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <div>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                aria-invalid={errors.medsReviewed ? true : undefined}
                className="mt-0.5 size-4 accent-[var(--mw-ok)]"
                {...register('medsReviewed')}
              />
              I’ve checked my medication list and have my medicines or their labels to hand.
            </label>
            {errors.medsReviewed && (
              <p role="alert" className="mt-1 ml-6 text-xs font-medium text-critical">
                {errors.medsReviewed.message}
              </p>
            )}
          </div>
          <div>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                aria-invalid={errors.consent ? true : undefined}
                className="mt-0.5 size-4 accent-[var(--mw-ok)]"
                {...register('consent')}
              />
              I consent to receiving care by video. I understand my clinician may ask me to come in person if they
              need to examine me.
            </label>
            {errors.consent && (
              <p role="alert" className="mt-1 ml-6 text-xs font-medium text-critical">
                {errors.consent.message}
              </p>
            )}
          </div>
        </div>
      </Section>

      {!devicesOk && (
        <p className="text-sm text-ink-muted">
          You can finish without a camera test. If video doesn’t work on the day, your clinician will call you.
        </p>
      )}
      {precheck.isError && (
        <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
          {errorMessage(precheck.error)}
        </p>
      )}
      <Button type="submit" variant="primary" icon={IconCircleCheck} loading={precheck.isPending} className="self-end">
        Finish pre-check
      </Button>
    </form>
  );
}

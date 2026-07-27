import { useState } from 'react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { IconCalendarCheck } from '@tabler/icons-react';
import { errorMessage, isApiError } from '@/api/errors';
import { useAvailability, useBookAppointment, useClinicians, useInsurance, usePatient } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { modeLabels } from '@/domain/appointments';
import { canBookWith } from '@/domain/availability';
import { isBookable, specialtyLabels } from '@/domain/clinicians';
import { activePrimary, estimateCost, serviceForVisit } from '@/domain/insurance';
import type { Clinician, Patient, VisitMode } from '@/domain/types';
import { formatTimeRange } from '@/lib/dates';
import { formatMoney } from '@/lib/units';
import { BackLink, Button, Card, Field, SegmentedControl, Skeleton, Textarea } from '@/ui';
import { ClinicianPicker } from './ClinicianPicker';
import { SlotPicker } from './SlotPicker';

const REASON_MAX = 300;

const reasonSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Add a short reason, like “Follow-up on blood pressure”')
    .max(REASON_MAX, `Keep it under ${REASON_MAX} characters`),
});

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <Card
      title={
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-[8px] bg-rail text-xs text-white"
          >
            {number}
          </span>
          {title}
        </span>
      }
    >
      {children}
    </Card>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

function BookingForm({ clinicians, patient }: { clinicians: Clinician[]; patient: Patient }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [preferredMode, setPreferredMode] = useState<VisitMode>('in-person');
  const [chosenDate, setChosenDate] = useState<string>();
  const [slot, setSlot] = useState<string>();
  const [slotError, setSlotError] = useState<string>();
  const book = useBookAppointment();

  // A clinician from the URL (e.g. "Book with Dr. Okafor") only counts if the patient can book them.
  const requested = clinicians.find((c) => c.id === params.get('clinician'));
  const clinician = requested && isBookable(requested) && canBookWith(requested, patient) ? requested : undefined;
  const mode: VisitMode = clinician?.offersVideo ? preferredMode : 'in-person';
  const availability = useAvailability(clinician?.id);
  const firstOpenDay = availability.data?.find((d) => d.slots.length > 0)?.date;
  const date = chosenDate ?? firstOpenDay;
  const insurance = useInsurance(patient.id);
  const service = clinician ? serviceForVisit(clinician, mode) : undefined;
  const estimate = service && insurance.data ? estimateCost(service, activePrimary(insurance.data)) : undefined;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<z.infer<typeof reasonSchema>>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: '' } });
  const reasonLength = watch('reason').length;

  function chooseClinician(id: string) {
    setParams({ clinician: id }, { replace: true, preventScrollReset: true });
    setChosenDate(undefined);
    setSlot(undefined);
    setSlotError(undefined);
    book.reset();
  }

  const onSubmit = handleSubmit(({ reason }) => {
    if (!clinician || !slot) {
      setSlotError(clinician ? 'Choose a time for your visit.' : 'Choose a clinician and a time.');
      return;
    }
    book.mutate(
      { patientId: patient.id, clinicianId: clinician.id, start: slot, mode, reason },
      {
        onSuccess: (appointment) => navigate(`/appointments/${appointment.id}`, { state: { notice: 'booked' } }),
        // The slot is gone; fresh availability is on its way.
        onError: (error) => {
          if (isApiError(error) && error.code === 'conflict') setSlot(undefined);
        },
      },
    );
  });

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
      <Step number={1} title="Choose a clinician">
        <ClinicianPicker clinicians={clinicians} patient={patient} value={clinician?.id} onChange={chooseClinician} />
      </Step>

      <Step number={2} title="Pick a time">
        {!clinician ? (
          <p className="text-sm text-ink-muted">Choose a clinician to see their free times.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {clinician.offersVideo ? (
              <SegmentedControl<VisitMode>
                label="Visit type"
                value={mode}
                onChange={setPreferredMode}
                options={[
                  { value: 'in-person', label: modeLabels['in-person'] },
                  { value: 'video', label: modeLabels.video },
                ]}
                className="self-start"
              />
            ) : (
              <p className="text-sm text-ink-muted">{clinician.name} sees patients in person only.</p>
            )}
            <QueryState
              query={availability}
              label="free times"
              loading={<Skeleton className="h-36 rounded-card" />}
            >
              {(days) =>
                days.every((d) => d.slots.length === 0) ? (
                  <p className="rounded-card bg-surface-sunken p-4 text-sm text-ink-muted">
                    {clinician.name} has no free times in the next three weeks. Try another clinician, or message
                    the clinic.
                  </p>
                ) : (
                  <SlotPicker
                    clinician={clinician}
                    days={days}
                    date={date}
                    slot={slot}
                    onDateChange={(next) => {
                      setChosenDate(next);
                      setSlot(undefined);
                    }}
                    onSlotChange={(next) => {
                      setSlot(next);
                      setSlotError(undefined);
                    }}
                  />
                )
              }
            </QueryState>
          </div>
        )}
        {slotError && (
          <p role="alert" className="mt-3 text-sm font-medium text-critical">
            {slotError}
          </p>
        )}
      </Step>

      <Step number={3} title="Reason and confirm">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Field
            label="What would you like to talk about?"
            hint={`${reasonLength}/${REASON_MAX} · Only your care team sees this.`}
            error={errors.reason?.message}
            required
          >
            <Textarea rows={5} maxLength={REASON_MAX} {...register('reason')} />
          </Field>
          <div className="flex flex-col gap-3">
            <dl aria-label="Booking summary" className="divide-y divide-line rounded-card bg-surface-sunken px-4 py-1">
              <SummaryRow label="Clinician">
                {clinician ? `${clinician.name}, ${specialtyLabels[clinician.specialty]}` : '—'}
              </SummaryRow>
              <SummaryRow label="When">
                <span className="tabular">{slot && clinician ? formatTimeRange(slot, clinician.slotMinutes) : '—'}</span>
              </SummaryRow>
              <SummaryRow label="Type">{clinician ? modeLabels[mode] : '—'}</SummaryRow>
              <SummaryRow label="Where">{clinician ? (mode === 'video' ? 'From home' : clinician.clinic) : '—'}</SummaryRow>
              <SummaryRow label="Estimated cost">
                <span className="tabular">
                  {!estimate
                    ? '—'
                    : estimate.copayCents > 0 && estimate.youPayCents === estimate.copayCents
                      ? `${formatMoney(estimate.copayCents)} copay`
                      : `About ${formatMoney(estimate.youPayCents)}`}
                </span>
              </SummaryRow>
            </dl>
            {book.isError && (
              <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
                {errorMessage(book.error)}
              </p>
            )}
            <Button type="submit" variant="primary" icon={IconCalendarCheck} loading={book.isPending}>
              Book visit
            </Button>
          </div>
        </div>
      </Step>
    </form>
  );
}

export function BookingPage() {
  const patientId = usePatientId();
  const clinicians = useClinicians();
  const patient = usePatient(patientId);

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <BackLink to="/appointments">All appointments</BackLink>
      <QueryState query={clinicians} label="clinicians" loading={<Skeleton className="h-64 rounded-card" />}>
        {(list) => (
          <QueryState query={patient} label="your details" loading={<Skeleton className="h-64 rounded-card" />}>
            {(me) => <BookingForm clinicians={list} patient={me} />}
          </QueryState>
        )}
      </QueryState>
    </div>
  );
}

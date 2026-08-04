import { addDays } from 'date-fns';
import { useParams } from 'react-router';
import { useAppointments, useClinicians, usePatient } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { PRECHECK_WINDOW_DAYS, telehealthStage } from '@/domain/telehealth';
import type { Appointment, Clinician, Patient } from '@/domain/types';
import { formatDay, formatTimeRange, toDate } from '@/lib/dates';
import { useNow } from '@/lib/useNow';
import { usePageHeading } from '@/shell/pageHeading';
import { BackLink, ButtonLink, Card, Skeleton } from '@/ui';
import { PrecheckForm } from './PrecheckForm';
import { WaitingRoom } from './WaitingRoom';

function Notice({ children, appointment }: { children: string; appointment: Appointment }) {
  return (
    <Card tone="sunken" className="flex flex-col items-start gap-3 text-sm">
      <p>{children}</p>
      <ButtonLink to={`/appointments/${appointment.id}`} size="sm">
        View visit
      </ButtonLink>
    </Card>
  );
}

function CheckIn({ appointment, clinician, patient }: { appointment: Appointment; clinician?: Clinician; patient: Patient }) {
  // Tick every 15 seconds so the countdown and the "open" moment arrive without a reload.
  const now = useNow(15_000);
  const stage = telehealthStage(appointment, now);
  usePageHeading('Video visit check-in');

  switch (stage) {
    case 'not-video':
      return (
        <Notice appointment={appointment}>
          {`This is an in-person visit. Check in at the front desk at ${appointment.location} when you arrive.`}
        </Notice>
      );
    case 'ended':
      return <Notice appointment={appointment}>This visit has ended or was cancelled, so there’s nothing to check in for.</Notice>;
    case 'too-early':
      return (
        <Notice appointment={appointment}>
          {`Pre-check opens ${PRECHECK_WINDOW_DAYS} days before your visit, on ${formatDay(addDays(toDate(appointment.start), -PRECHECK_WINDOW_DAYS))}.`}
        </Notice>
      );
    case 'precheck':
      return (
        <div className="flex flex-col gap-4">
          <Card tone="sunken" className="text-sm">
            <p className="font-medium">
              {appointment.reason} with {clinician?.name ?? 'your clinician'}
            </p>
            <p className="text-ink-muted tabular">{formatTimeRange(appointment.start, appointment.durationMinutes)}</p>
            <p className="mt-2 text-ink-muted">
              Takes about two minutes. Once it’s done, your waiting room opens 15 minutes before the visit.
            </p>
          </Card>
          <PrecheckForm appointment={appointment} patient={patient} />
        </div>
      );
    default:
      return <WaitingRoom appointment={appointment} clinician={clinician} stage={stage} now={now} />;
  }
}

export function CheckInPage() {
  const { appointmentId } = useParams();
  const patientId = usePatientId();
  const appointments = useAppointments(patientId);
  const clinicians = useClinicians();
  const patient = usePatient(patientId);

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <BackLink to={`/appointments/${appointmentId}`}>Back to visit</BackLink>
      <QueryState query={appointments} label="this visit" loading={<Skeleton className="h-64 rounded-card" />}>
        {(list) => {
          const appointment = list.find((a) => a.id === appointmentId);
          if (!appointment) {
            return (
              <Card tone="sunken" className="text-sm text-ink-muted">
                We couldn't find that appointment.
              </Card>
            );
          }
          if (!patient.data) return <Skeleton className="h-64 rounded-card" />;
          return (
            <CheckIn
              appointment={appointment}
              clinician={clinicians.data?.find((c) => c.id === appointment.clinicianId)}
              patient={patient.data}
            />
          );
        }}
      </QueryState>
    </div>
  );
}

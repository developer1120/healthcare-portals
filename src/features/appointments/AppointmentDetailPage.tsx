import type { ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { IconCircleCheck, IconVideo } from '@tabler/icons-react';
import { useAppointments, useClinicians, useDocuments } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { endOf, isActive, modeLabels, statusDisplay } from '@/domain/appointments';
import { specialtyLabels } from '@/domain/clinicians';
import type { Appointment, Clinician, ClinicalDocument } from '@/domain/types';
import { formatShortDate, formatTimeRange, relativeDay } from '@/lib/dates';
import { LATE_CANCEL_FEE_CENTS } from '@/domain/appointmentPolicy';
import { telehealthAction } from '@/domain/telehealth';
import { formatMoney } from '@/lib/units';
import { usePageHeading } from '@/shell/pageHeading';
import { ManageVisitCard } from './ManageVisitCard';
import { Avatar, BackLink, ButtonLink, Card, Skeleton, StatusDot } from '@/ui';

/** Confirmation shown after arriving here from a change, passed in router state. */
const notices: Record<string, string> = {
  booked: 'Your visit is booked. We’ll send a reminder the day before.',
  rescheduled: 'Your visit has moved. We’ve updated your reminder.',
  cancelled: 'Your visit is cancelled. Your care team has been told.',
};

const preparation: Record<Appointment['mode'], string[]> = {
  video: [
    'Find a quiet, private place with good light.',
    'Check your camera and microphone a few minutes before.',
    'Have your medication list and any home readings to hand.',
  ],
  'in-person': [
    'Arrive 10 minutes early to check in.',
    'Bring your insurance card and a photo ID.',
    'Bring your medication list, or the medicines themselves.',
  ],
};

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function VisitSummary({ document }: { document?: ClinicalDocument }) {
  return (
    <Card title="Visit summary" description={document ? `Shared ${formatShortDate(document.createdAt)}` : undefined}>
      {document ? (
        <div className="flex flex-col gap-4">
          {document.sections.map((section) => (
            <div key={section.heading}>
              <h3 className="font-sans text-sm font-semibold tracking-normal">{section.heading}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{section.body}</p>
            </div>
          ))}
          <Link to={`/records/documents/${document.id}`} className="text-sm font-medium underline">
            Open, print or download the summary
          </Link>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No summary has been shared for this visit yet.</p>
      )}
    </Card>
  );
}

function AppointmentDetail({
  appointment,
  clinician,
  documents,
}: {
  appointment: Appointment;
  clinician?: Clinician;
  documents: ClinicalDocument[];
}) {
  const status = statusDisplay[appointment.status];
  const upcoming = isActive(appointment) && endOf(appointment) > new Date();
  const telehealth = telehealthAction(appointment);
  usePageHeading(clinician ? `Visit with ${clinician.name}` : null);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <StatusDot tone={status.tone}>{status.label}</StatusDot>
            <h2 className="mt-1 text-xl">{appointment.reason}</h2>
          </div>
          {upcoming && (
            <span className="rounded-control bg-data-soft px-2.5 py-1 text-xs font-semibold text-data-ink">
              {relativeDay(appointment.start)}
            </span>
          )}
        </div>

        {telehealth && (
          <ButtonLink to={telehealth.href} variant="primary" icon={IconVideo} className="mt-4">
            {telehealth.label}
          </ButtonLink>
        )}
        {appointment.precheck && upcoming && (
          <p className="mt-2 text-xs text-ink-muted">Pre-check done {formatShortDate(appointment.precheck.completedAt)}.</p>
        )}

        {clinician && (
          <div className="mt-4 flex items-center gap-3 rounded-control bg-surface-sunken p-3">
            <Avatar name={clinician.name} decorative />
            <div className="text-sm leading-tight">
              <p className="font-medium">{clinician.name}</p>
              <p className="text-ink-muted">
                {specialtyLabels[clinician.specialty]} · {clinician.credentials}
              </p>
            </div>
          </div>
        )}

        <dl className="mt-3 divide-y divide-line">
          <DetailRow label="When">
            <span className="tabular">{formatTimeRange(appointment.start, appointment.durationMinutes)}</span>
          </DetailRow>
          <DetailRow label="Length">{appointment.durationMinutes} minutes</DetailRow>
          <DetailRow label="Type">{modeLabels[appointment.mode]}</DetailRow>
          <DetailRow label="Where">{appointment.location}</DetailRow>
          <DetailRow label="Booked">{formatShortDate(appointment.createdAt)}</DetailRow>
          {appointment.rescheduledFrom && (
            <DetailRow label="Moved from">
              <span className="tabular">{formatTimeRange(appointment.rescheduledFrom, appointment.durationMinutes)}</span>
            </DetailRow>
          )}
          {appointment.status === 'cancelled' && appointment.cancelledAt && (
            <DetailRow label="Cancelled">
              {formatShortDate(appointment.cancelledAt)}
              {appointment.cancellationReason && ` · ${appointment.cancellationReason}`}
              {appointment.lateCancellation && (
                <span className="mt-0.5 block text-xs text-ink-muted">
                  Late cancellation: a {formatMoney(LATE_CANCEL_FEE_CENTS)} fee was added to your statement.
                </span>
              )}
            </DetailRow>
          )}
        </dl>
      </Card>

      {upcoming ? (
        <div className="flex flex-col gap-5">
          <Card title="Before your visit">
            <ul className="flex flex-col gap-2.5">
              {preparation[appointment.mode].map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-sm">
                  <IconCircleCheck aria-hidden size={18} stroke={1.75} className="mt-px shrink-0 text-ok" />
                  {tip}
                </li>
              ))}
            </ul>
          </Card>
          <ManageVisitCard appointment={appointment} />
        </div>
      ) : appointment.status === 'completed' ? (
        <VisitSummary document={documents.find((d) => d.appointmentId === appointment.id)} />
      ) : null}
    </div>
  );
}

export function AppointmentDetailPage() {
  const { appointmentId } = useParams();
  const patientId = usePatientId();
  const appointments = useAppointments(patientId);
  const clinicians = useClinicians();
  const documents = useDocuments(patientId);
  const location = useLocation();
  const notice = notices[(location.state as { notice?: string } | null)?.notice ?? ''];

  return (
    <div className="flex max-w-5xl flex-col gap-4">
      <BackLink to="/appointments">All appointments</BackLink>
      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-card bg-ok-soft px-4 py-3 text-sm text-ok-ink">
          <IconCircleCheck aria-hidden size={18} stroke={1.75} />
          {notice}
        </p>
      )}
      <QueryState query={appointments} label="this appointment" loading={<Skeleton className="h-64 rounded-card" />}>
        {(list) => {
          // Only the signed-in patient's own appointments are in this list.
          const appointment = list.find((a) => a.id === appointmentId);
          if (!appointment) {
            return (
              <Card tone="sunken">
                <p className="text-sm text-ink-muted">
                  We couldn't find that appointment. It may have been removed, or the link may be wrong.
                </p>
              </Card>
            );
          }
          return (
            <AppointmentDetail
              appointment={appointment}
              clinician={clinicians.data?.find((c) => c.id === appointment.clinicianId)}
              documents={documents.data ?? []}
            />
          );
        }}
      </QueryState>
    </div>
  );
}

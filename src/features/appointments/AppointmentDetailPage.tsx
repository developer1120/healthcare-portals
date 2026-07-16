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

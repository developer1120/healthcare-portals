import { useLocation, useParams } from 'react-router';
import { IconMail, IconPhone } from '@tabler/icons-react';
import { isApiError } from '@/api/errors';
import { useClinicians, usePatientChart } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { useClinicianId } from '@/auth/session';
import { sexLabels } from '@/domain/chart';
import type { PatientChart } from '@/domain/chart';
import { assessRisk, riskLevelDisplay } from '@/domain/risk';
import type { Clinician } from '@/domain/types';
import { ageOn, formatShortDate } from '@/lib/dates';
import { useNow } from '@/lib/useNow';
import { usePageHeading } from '@/shell/pageHeading';
import { Avatar, BackLink, Card, Skeleton, StatusDot } from '@/ui';
import { AllergyBanner, LabList, MedicationList, ProblemList, VisitList, VitalsSummary } from './ChartSections';

/** The roster passes its query string along, so "Back" returns to the same filtered list. */
export interface ChartLinkState {
  rosterSearch?: string;
}

function displayName(chart: PatientChart): string {
  const { patient } = chart;
  return `${patient.preferredName ?? patient.firstName} ${patient.lastName}`;
}

function ChartHeader({ chart, clinicians, now }: { chart: PatientChart; clinicians: Clinician[]; now: Date }) {
  const { patient } = chart;
  const risk = assessRisk(chart, now);
  const level = riskLevelDisplay[risk.level];
  const primary = clinicians.find((c) => c.id === patient.primaryClinicianId);

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4">
        <Avatar name={displayName(chart)} size="lg" decorative />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-muted tabular">
            {ageOn(patient.dateOfBirth, now)} · {sexLabels[patient.sex]}
            {patient.pronouns && ` · ${patient.pronouns}`} · Born {formatShortDate(patient.dateOfBirth)}
          </p>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-ink-muted">MRN</dt>
              <dd className="font-mono">{patient.mrn}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Primary care</dt>
              <dd>{primary?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Phone</dt>
              <dd>
                <a href={`tel:${patient.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 hover:underline">
                  <IconPhone aria-hidden size={14} />
                  {patient.phone}
                </a>
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-ink-muted">Email</dt>
              <dd>
                <a
                  href={`mailto:${patient.email}`}
                  title={patient.email}
                  className="inline-flex max-w-full items-center gap-1 hover:underline"
                >
                  <IconMail aria-hidden size={14} className="shrink-0" />
                  <span className="truncate">{patient.email}</span>
                </a>
              </dd>
            </div>
          </dl>
        </div>
        <section aria-label="Risk" className="w-full rounded-control bg-surface-sunken px-3 py-2.5 sm:w-64">
          <StatusDot tone={level.tone}>
            <span className="font-semibold text-ink">{level.label} risk</span>

import { useState } from 'react';
import type { ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { IconCalendarPlus, IconPlus, IconVaccine } from '@tabler/icons-react';
import { useCareTeam, useHealthRecord, usePatient } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import {
  dueDate,
  immunizationDisplay,
  immunizationStatus,
  severityDisplay,
  sortAllergies,
  sortImmunizations,
} from '@/domain/healthRecord';
import type { Allergy, Condition, Immunization, Patient } from '@/domain/types';
import { ageOn, formatShortDate } from '@/lib/dates';
import { Avatar, Button, ButtonLink, Card, Skeleton, StatusDot } from '@/ui';
import { AddAllergyDialog } from './AddAllergyDialog';
import { DocumentsCard } from './DocumentsCard';

const sexLabels: Record<Patient['sex'], string> = {
  female: 'Female',
  male: 'Male',
  intersex: 'Intersex',
  unknown: 'Not recorded',
};

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function PatientSummary({ patient }: { patient: Patient }) {
  const team = useCareTeam(patient.id);
  const primary = team.data?.find((c) => c.id === patient.primaryClinicianId);
  const name = `${patient.preferredName ?? patient.firstName} ${patient.lastName}`;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} size="lg" decorative />
        <div>
          <h2 className="text-xl">{name}</h2>
          <p className="text-sm text-ink-muted">Medical record number {patient.mrn}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact label="Date of birth">
          {formatShortDate(patient.dateOfBirth)} ({ageOn(patient.dateOfBirth)})
        </Fact>
        <Fact label="Sex">
          {sexLabels[patient.sex]}
          {patient.pronouns && ` · ${patient.pronouns}`}
        </Fact>
        <Fact label="Language">{patient.preferredLanguage}</Fact>
        <Fact label="Primary clinician">{primary?.name ?? '—'}</Fact>
      </dl>
    </Card>
  );
}

function Allergies({ allergies, patientId }: { allergies: Allergy[]; patientId: string }) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  return (
    <Card
      title="Allergies"
      action={
        <Button size="sm" icon={IconPlus} onClick={() => setAdding(true)}>
          Add
        </Button>
      }
    >
      <div role="status" className="text-sm">
        {added && <p className="mb-2 font-medium text-ok-ink">{added} added to your allergies.</p>}
      </div>
      {allergies.length === 0 ? (
        <p className="text-sm text-ink-muted">No known allergies.</p>
      ) : (
        <ul className="divide-y divide-line">
          {sortAllergies(allergies).map((allergy) => (
            <li key={allergy.id} className="flex items-start justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium">{allergy.substance}</p>
                <p className="text-sm text-ink-muted">{allergy.reaction}</p>
                {allergy.reportedBy === 'patient' && !allergy.verified && (
                  <p className="text-xs text-ink-muted">Reported by you · not yet confirmed</p>
                )}
              </div>
              <StatusDot tone={severityDisplay[allergy.severity].tone} className="shrink-0">
                {severityDisplay[allergy.severity].label}
              </StatusDot>
            </li>
          ))}
        </ul>
      )}
      <AddAllergyDialog
        patientId={patientId}
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(substance) => {
          setAdding(false);
          setAdded(substance);
        }}
      />
    </Card>
  );
}

function Conditions({ conditions }: { conditions: Condition[] }) {
  const active = conditions.filter((c) => c.status === 'active').sort((a, b) => b.onset.localeCompare(a.onset));
  const resolved = conditions.filter((c) => c.status === 'resolved');
  return (
    <Card title="Conditions">
      {active.length === 0 ? (
        <p className="text-sm text-ink-muted">No ongoing conditions.</p>
      ) : (
        <ul className="divide-y divide-line">
          {active.map((condition) => (
            <li key={condition.id} className="flex items-start justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium">{condition.name}</p>
                <p className="text-xs text-ink-muted">Since {format(parseISO(condition.onset), 'MMM yyyy')}</p>
              </div>
              <span className="shrink-0 font-mono text-xs text-ink-muted" title="Diagnosis code (ICD-10)">
                {condition.code}
              </span>
            </li>
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-muted">Past conditions ({resolved.length})</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {resolved.map((condition) => (
              <li key={condition.id} className="text-sm">
                {condition.name}{' '}
                <span className="text-xs text-ink-muted">
                  {format(parseISO(condition.onset), 'MMM yyyy')} –{' '}
                  {condition.resolvedOn ? format(parseISO(condition.resolvedOn), 'MMM yyyy') : '?'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function Immunizations({ immunizations, primaryId }: { immunizations: Immunization[]; primaryId: string }) {
  return (
    <Card title="Immunizations">
      <ul className="divide-y divide-line">
        {sortImmunizations(immunizations).map((immunization) => {
          const status = immunizationStatus(immunization);
          const display = immunizationDisplay[status];
          const due = dueDate(immunization);
          return (
            <li key={immunization.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-data-soft text-data-ink">
                  <IconVaccine aria-hidden size={16} stroke={1.75} />
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {immunization.vaccine}
                    {immunization.dose && <span className="font-normal text-ink-muted"> · {immunization.dose}</span>}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Last given {formatShortDate(immunization.givenOn)}
                    {due && ` · next due ${formatShortDate(due)}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusDot tone={display.tone}>{display.label}</StatusDot>
                {(status === 'overdue' || status === 'due-soon') && (
                  <ButtonLink to={`/appointments/book?clinician=${primaryId}`} size="sm" icon={IconCalendarPlus}>
                    Book
                  </ButtonLink>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function HealthRecordPage() {
  const patientId = usePatientId();
  const patient = usePatient(patientId);
  const record = useHealthRecord(patientId);

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <QueryState query={patient} label="your details" loading={<Skeleton className="h-36 rounded-card" />}>
        {(me) => <PatientSummary patient={me} />}
      </QueryState>
      <QueryState query={record} label="your health record" loading={<Skeleton className="h-64 rounded-card" />}>
        {({ allergies, conditions, immunizations }) => (
          <>
            <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
              <Allergies allergies={allergies} patientId={patientId} />
              <Conditions conditions={conditions} />
            </div>
            <Immunizations immunizations={immunizations} primaryId={patient.data?.primaryClinicianId ?? ''} />
            <DocumentsCard patientId={patientId} />
          </>
        )}
      </QueryState>
    </div>
  );
}

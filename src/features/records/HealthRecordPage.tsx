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

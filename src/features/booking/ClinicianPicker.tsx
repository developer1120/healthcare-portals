import { useState } from 'react';
import { IconUsers, IconVideo } from '@tabler/icons-react';
import { canBookWith } from '@/domain/availability';
import { isBookable, specialtyLabels } from '@/domain/clinicians';
import type { Clinician, Patient, Specialty } from '@/domain/types';
import { Avatar, Field, Input, Select, StatusDot, cx } from '@/ui';

interface ClinicianPickerProps {
  clinicians: Clinician[];
  patient: Patient;
  value: string | undefined;
  onChange: (clinicianId: string) => void;
}

function matches(clinician: Clinician, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [clinician.name, specialtyLabels[clinician.specialty], clinician.clinic, ...clinician.languages]
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

/** Searchable list of bookable clinicians as radio cards. Care team members come first. */
export function ClinicianPicker({ clinicians, patient, value, onChange }: ClinicianPickerProps) {
  const [query, setQuery] = useState('');
  const [specialty, setSpecialty] = useState<Specialty | ''>('');

  const bookable = clinicians
    .filter(isBookable)
    .sort(
      (a, b) =>
        Number(patient.careTeamIds.includes(b.id)) - Number(patient.careTeamIds.includes(a.id)) ||
        a.name.localeCompare(b.name),
    );
  const specialties = [...new Set(bookable.map((c) => c.specialty))];
  const shown = bookable.filter((c) => matches(c, query) && (!specialty || c.specialty === specialty));

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Field label="Search clinicians" hideLabel>
          <Input
            type="search"
            placeholder="Name, specialty, clinic or language"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        <Field label="Specialty" hideLabel>
          <Select
            options={specialties.map((s) => ({ value: s, label: specialtyLabels[s] }))}
            placeholder="Any specialty"
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value as Specialty | '')}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="sr-only">Clinician</legend>
        {shown.length === 0 ? (
          <p className="rounded-card bg-surface-sunken p-4 text-sm text-ink-muted">
            No clinicians match. Try another name or specialty.
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {shown.map((clinician) => {
              const allowed = canBookWith(clinician, patient);
              const onTeam = patient.careTeamIds.includes(clinician.id);
              return (
                <label
                  key={clinician.id}
                  className={cx(
                    'flex gap-3 rounded-card border bg-surface p-3 transition-colors',
                    'has-checked:border-ink has-checked:ring-1 has-checked:ring-ink has-focus-visible:outline-2 has-focus-visible:outline-focus',
                    allowed ? 'cursor-pointer border-line hover:border-line-strong' : 'cursor-not-allowed border-line opacity-60',
                  )}
                >
                  <input
                    type="radio"
                    name="clinician"
                    value={clinician.id}
                    checked={value === clinician.id}
                    disabled={!allowed}
                    onChange={() => onChange(clinician.id)}
                    className="sr-only"
                  />
                  <Avatar name={clinician.name} decorative />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-medium">{clinician.name}</span>
                    <span className="block text-ink-muted">
                      {specialtyLabels[clinician.specialty]} · {clinician.clinic}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
                      {onTeam && (
                        <span className="inline-flex items-center gap-1">
                          <IconUsers aria-hidden size={14} /> Your care team
                        </span>
                      )}
                      {clinician.offersVideo && (
                        <span className="inline-flex items-center gap-1">
                          <IconVideo aria-hidden size={14} /> Video visits
                        </span>
                      )}
                      <span>{clinician.languages.join(', ')}</span>
                    </span>
                    {!allowed && (
                      <StatusDot tone="neutral" className="mt-1.5">
                        Not taking new patients
                      </StatusDot>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
    </div>
  );
}

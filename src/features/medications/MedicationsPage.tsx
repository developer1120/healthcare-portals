import { Link } from 'react-router';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useClinicians, useDoseLogs, useHealthRecord, useMedications, useRefillRequests } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import type { Clinician, Medication, RefillRequest } from '@/domain/types';
import { useNow } from '@/lib/useNow';
import { Card, Skeleton } from '@/ui';
import { AdherenceCard } from './AdherenceCard';
import { MedicationCard } from './MedicationCard';
import { TodaySchedule } from './TodaySchedule';

function AllergyReminder({ patientId }: { patientId: string }) {
  const record = useHealthRecord(patientId);
  const allergies = record.data?.allergies ?? [];
  if (allergies.length === 0) return null;
  return (
    <p className="flex items-start gap-2 rounded-card border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn-ink">
      <IconAlertTriangle aria-hidden size={18} className="mt-px shrink-0" />
      <span>
        <span className="font-semibold">Allergies: </span>
        {allergies.map((a) => `${a.substance} (${a.reaction.toLowerCase()})`).join(', ')}.{' '}
        <Link to="/records" className="underline">
          See your health record
        </Link>
      </span>
    </p>
  );
}

function Group({
  title,
  medications,
  refills,
  clinicians,
}: {
  title: string;
  medications: Medication[];
  refills: RefillRequest[];
  clinicians: Clinician[];
}) {
  if (medications.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="font-sans text-sm font-semibold tracking-normal text-ink-muted">{title}</h2>
      <div className="grid gap-3 xl:grid-cols-2">
        {medications.map((medication) => (
          <MedicationCard
            key={medication.id}
            medication={medication}
            refills={refills}
            prescriber={clinicians.find((c) => c.id === medication.prescriberId)}
          />
        ))}
      </div>
    </section>
  );
}

export function MedicationsPage() {
  const patientId = usePatientId();
  const medications = useMedications(patientId);
  const refills = useRefillRequests(patientId);
  const clinicians = useClinicians();
  const doses = useDoseLogs(patientId);
  // Ticks once a minute so doses move from "later" to "due" without a reload.
  const now = useNow(60_000);

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <AllergyReminder patientId={patientId} />
      <QueryState
        query={medications}
        label="your medications"
        loading={
          <div className="grid gap-3 xl:grid-cols-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-64 rounded-card" />
            ))}
          </div>
        }
      >
        {(list) => {
          const active = list.filter((m) => m.status !== 'stopped');
          const past = list.filter((m) => m.status === 'stopped');
          const props = { refills: refills.data ?? [], clinicians: clinicians.data ?? [] };
          if (list.length === 0) {
            return <Card tone="sunken" className="text-sm text-ink-muted">Medicines your clinicians prescribe will appear here.</Card>;
          }
          return (
            <>
              {doses.data && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <TodaySchedule medications={list} logs={doses.data} patientId={patientId} now={now} />
                  <AdherenceCard medications={list} logs={doses.data} now={now} />
                </div>
              )}
              <Group title="Taken on a schedule" medications={active.filter((m) => !m.asNeeded)} {...props} />
              <Group title="Taken as needed" medications={active.filter((m) => m.asNeeded)} {...props} />
              {past.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer text-sm font-semibold text-ink-muted">
                    Past medications ({past.length})
                  </summary>
                  <div className="mt-3">
                    <Group title="Past medications" medications={past} {...props} />
                  </div>
                </details>
              )}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

import { IconAlertTriangle } from '@tabler/icons-react';
import { Sparkline } from '@/charts/Sparkline';
import { modeLabels, statusDisplay } from '@/domain/appointments';
import { flagTone, flaggedObservations, labReviewState, latestHeartRate, pastVisits, recentBloodPressure } from '@/domain/chart';
import type { PatientChart } from '@/domain/chart';
import { nextAppointment } from '@/domain/appointments';
import { severityDisplay, sortAllergies } from '@/domain/healthRecord';
import { flagDisplay } from '@/domain/labs';
import { supplyStatus } from '@/domain/medications';
import { assessBloodPressure, assessHeartRate, SYSTOLIC_TARGET } from '@/domain/vitals';
import type { Clinician } from '@/domain/types';
import { formatDay, formatShortDate, formatTime, relativeDay } from '@/lib/dates';
import { Card, StatusDot } from '@/ui';

type Lookup = (id: string) => Clinician | undefined;

/** Allergies sit above everything else, so they're seen before prescribing. */
export function AllergyBanner({ chart }: { chart: PatientChart }) {
  if (chart.allergies.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface px-4 py-3 text-sm text-ink-muted">
        No allergies recorded. Confirm with the patient before prescribing.
      </p>
    );
  }
  return (
    <section
      aria-label="Allergies"
      className="flex items-start gap-2.5 rounded-card border border-critical/40 bg-critical-soft px-4 py-3 text-sm text-critical-ink"
    >
      <IconAlertTriangle aria-hidden size={18} className="mt-px shrink-0" />
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {sortAllergies(chart.allergies).map((allergy) => (
          <li key={allergy.id}>
            <span className="font-semibold">{allergy.substance}</span>: {allergy.reaction.toLowerCase()} (
            {severityDisplay[allergy.severity].label.toLowerCase()}
            {allergy.verified === false && ', unverified'})
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProblemList({ chart }: { chart: PatientChart }) {
  return (
    <Card title="Problem list" headingLevel={2}>
      {chart.conditions.length === 0 ? (
        <p className="text-sm text-ink-muted">No active problems.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {chart.conditions.map((condition) => (
            <li key={condition.id} className="flex items-baseline justify-between gap-3 py-2">
              <span>{condition.name}</span>
              <span className="shrink-0 text-xs text-ink-muted tabular">
                {condition.code} · since {formatShortDate(condition.onset)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function MedicationList({ chart, clinician, now }: { chart: PatientChart; clinician: Lookup; now: Date }) {
  return (
    <Card title="Medications" headingLevel={2}>
      {chart.medications.length === 0 ? (
        <p className="text-sm text-ink-muted">No current medications.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {chart.medications.map((medication) => {
            const supply = supplyStatus(medication, now);
            const refill = chart.pendingRefills.find((r) => r.medicationId === medication.id);
            return (
              <li key={medication.id} className="flex flex-col gap-0.5 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">
                    {medication.name} {medication.strength}
                    {medication.status === 'paused' && <span className="font-normal text-ink-muted"> · paused</span>}
                  </span>
                  {refill ? (
                    <StatusDot tone="warn">Refill requested {relativeDay(refill.requestedAt, now).toLowerCase()}</StatusDot>
                  ) : (
                    supply.level !== 'ok' && (
                      <StatusDot tone={supply.level === 'out' ? 'critical' : 'warn'}>
                        {supply.level === 'out' ? 'Out of supply' : `${supply.daysLeft} days left`}
                      </StatusDot>
                    )
                  )}
                </div>
                <span className="text-ink-muted">{medication.instructions}</span>
                <span className="text-xs text-ink-muted">
                  {clinician(medication.prescriberId)?.name ?? 'Unknown prescriber'} · {medication.refillsRemaining}{' '}
                  {medication.refillsRemaining === 1 ? 'refill' : 'refills'} left
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function LabList({ chart, clinician }: { chart: PatientChart; clinician: Lookup }) {
  const panels = chart.labs.slice(0, 6);
  return (
    <Card title="Recent labs" headingLevel={2}>
      {panels.length === 0 ? (
        <p className="text-sm text-ink-muted">No lab results.</p>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {panels.map((panel) => {
            const state = labReviewState(panel);
            const flagged = flaggedObservations(panel);
            return (
              <li key={panel.id} aria-label={panel.name} className="flex flex-col gap-1 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{panel.name}</span>
                  <StatusDot tone={state.tone}>{state.label}</StatusDot>
                </div>
                <span className="text-xs text-ink-muted">
                  {formatShortDate(panel.collectedAt)}
                  {clinician(panel.orderedById) && ` · ${clinician(panel.orderedById)!.name}`}
                </span>
                {panel.status !== 'pending' &&

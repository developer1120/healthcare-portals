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
                  (flagged.length === 0 ? (
                    <span className="text-ink-muted">All in range</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {flagged.map(({ observation, flag }) => (
                        <li key={observation.code} className="flex items-baseline justify-between gap-3">
                          <span>{observation.name}</span>
                          <StatusDot tone={flagTone(flag)}>
                            <span className="tabular">
                              {observation.value} {observation.unit}
                            </span>{' '}
                            · {flagDisplay[flag].label}
                          </StatusDot>
                        </li>
                      ))}
                    </ul>
                  ))}
                {panel.clinicianNote && <span className="text-xs text-ink-muted italic">“{panel.clinicianNote}”</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function VitalsSummary({ chart, now }: { chart: PatientChart; now: Date }) {
  const bp = chart.latestBloodPressure;
  const heartRate = latestHeartRate(chart);
  const trend = recentBloodPressure(chart, 90, now);
  const bpAssessment = bp && assessBloodPressure(bp.systolic, bp.diastolic);
  const hrAssessment = heartRate && assessHeartRate(heartRate.bpm);

  return (
    <Card title="Vitals" headingLevel={2}>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-xs text-ink-muted">Blood pressure</dt>
          {bp && bpAssessment ? (
            <dd>
              <span className="block font-display text-xl font-semibold tabular">
                {bp.systolic}/{bp.diastolic}
              </span>
              <StatusDot tone={bpAssessment.tone}>{bpAssessment.label}</StatusDot>
              <span className="block text-xs text-ink-muted">
                {relativeDay(bp.takenAt, now)} · {bp.source}
              </span>
            </dd>
          ) : (
            <dd className="text-ink-muted">None recorded</dd>
          )}
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Heart rate</dt>
          {heartRate && hrAssessment ? (
            <dd>
              <span className="block font-display text-xl font-semibold tabular">{heartRate.bpm} bpm</span>
              <StatusDot tone={hrAssessment.tone}>{hrAssessment.label}</StatusDot>
              <span className="block text-xs text-ink-muted">{relativeDay(heartRate.takenAt, now)}</span>
            </dd>
          ) : (
            <dd className="text-ink-muted">None recorded</dd>
          )}
        </div>
      </dl>
      {trend.length >= 3 && (
        <div className="mt-4">
          <p className="text-xs text-ink-muted">Blood pressure, last 90 days ({trend.length} readings)</p>
          <Sparkline
            series={[
              { values: trend.map((r) => r.systolic), color: 'var(--mw-data)' },
              { values: trend.map((r) => r.diastolic), color: 'var(--mw-ink-subtle)' },
            ]}
            threshold={SYSTOLIC_TARGET.high}
            markLast
            className="mt-1 h-20"
            label={`Systolic from ${trend[0]!.systolic} to ${trend.at(-1)!.systolic} over ${trend.length} readings in the last 90 days.`}
          />
        </div>
      )}
    </Card>
  );
}

export function VisitList({ chart, clinician, now }: { chart: PatientChart; clinician: Lookup; now: Date }) {
  const next = nextAppointment(chart.appointments, now);
  const past = pastVisits(chart.appointments, now);
  const describe = (clinicianId: string) => clinician(clinicianId)?.name ?? 'Unknown clinician';

  return (
    <Card title="Visits" headingLevel={2}>
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <h3 className="font-sans text-xs font-medium tracking-normal text-ink-muted">Next</h3>
          {next ? (
            <p className="mt-0.5">
              <span className="font-medium tabular">
                {formatDay(next.start, now)}, {formatTime(next.start)}
              </span>{' '}
              · {describe(next.clinicianId)} · {modeLabels[next.mode]}
              <span className="block text-ink-muted">{next.reason}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-ink-muted">Nothing booked.</p>
          )}
        </div>
        <div>
          <h3 className="font-sans text-xs font-medium tracking-normal text-ink-muted">Recent</h3>
          {past.length === 0 ? (
            <p className="mt-0.5 text-ink-muted">No past visits.</p>
          ) : (
            <ul className="mt-0.5 divide-y divide-line">
              {past.map((visit) => (
                <li key={visit.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5">
                  <span>
                    <span className="tabular">{formatShortDate(visit.start)}</span> · {visit.reason}
                    <span className="block text-xs text-ink-muted">{describe(visit.clinicianId)}</span>
                  </span>
                  <StatusDot tone={statusDisplay[visit.status].tone}>{statusDisplay[visit.status].label}</StatusDot>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

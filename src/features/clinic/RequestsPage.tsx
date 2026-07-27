import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { IconCircleCheck } from '@tabler/icons-react';
import { useClinicRequests, useClinicians } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { useClinicianId } from '@/auth/session';
import { flagTone, flaggedObservations } from '@/domain/chart';
import { flagDisplay } from '@/domain/labs';
import { supplyStatus } from '@/domain/medications';
import { canPrescribe, filterQueues, labUrgency, refillOverdue } from '@/domain/requests';
import type { LabItem, RefillItem, RequestScope } from '@/domain/requests';
import { assessRisk, riskLevelDisplay } from '@/domain/risk';
import type { Clinician } from '@/domain/types';
import { formatShortDate, relativeTime } from '@/lib/dates';
import { useNow } from '@/lib/useNow';
import { Button, Card, SegmentedControl, Skeleton, StatusDot, cx } from '@/ui';
import { RefillDecisionDialog, SignOffDialog } from './RequestDialogs';

type Tab = 'refills' | 'labs';

function PatientLine({ snapshot, now }: { snapshot: RefillItem['snapshot']; now: Date }) {
  const { patient } = snapshot;
  const risk = riskLevelDisplay[assessRisk(snapshot, now).level];
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm">
      <Link to={`/clinic/patients/${patient.id}`} className="font-medium hover:underline">
        {patient.preferredName ?? patient.firstName} {patient.lastName}
      </Link>
      <span className="text-xs text-ink-muted">{patient.mrn}</span>
      <StatusDot tone={risk.tone}>{risk.label} risk</StatusDot>
    </p>
  );
}

function RefillCard({
  item,
  now,
  prescriber,
  canAct,
  onDecide,
}: {
  item: RefillItem;
  now: Date;
  prescriber?: Clinician;
  canAct: boolean;
  onDecide: () => void;
}) {
  const { request, medication, allergies } = item;
  const supply = supplyStatus(medication, now);
  const overdue = refillOverdue(request, now);
  const bp = item.snapshot.latestBloodPressure;

  return (
    <li aria-label={`${medication.name} for ${item.snapshot.patient.firstName}`} className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <PatientLine snapshot={item.snapshot} now={now} />
          <p className="mt-1 font-display text-base font-semibold">
            {medication.name} {medication.strength}
          </p>
          <p className="text-sm text-ink-muted">{medication.instructions}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <span className={cx('tabular', overdue ? 'font-semibold text-critical-ink' : 'text-ink-muted')}>
            Requested {relativeTime(request.requestedAt, now)}
            {overdue && ' · Overdue'}
          </span>
          {canAct && (
            <Button size="sm" variant="primary" onClick={onDecide}>
              Review
            </Button>
          )}
        </div>
      </div>
      {request.patientNote && <p className="mt-2 rounded-control bg-surface-sunken px-3 py-2 text-sm">“{request.patientNote}”</p>}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-ink-muted">Supply</dt>
          <dd className={cx('tabular', supply.level !== 'ok' && 'font-semibold text-warn-ink')}>
            {supply.level === 'out' ? 'Run out' : `${supply.daysLeft} days left`}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Refills left</dt>
          <dd className="tabular">{medication.refillsRemaining === 0 ? 'None (renewal)' : medication.refillsRemaining}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Prescriber</dt>
          <dd>{prescriber?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Latest BP</dt>
          <dd className="tabular">{bp ? `${bp.systolic}/${bp.diastolic}` : '—'}</dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-ink-muted">Allergies</dt>
          <dd className={allergies.length ? 'font-medium text-critical-ink' : ''}>
            {allergies.length ? allergies.map((a) => a.substance).join(', ') : 'None recorded'}
          </dd>
        </div>
      </dl>
    </li>
  );
}

function LabCard({ item, now, canAct, onSignOff }: { item: LabItem; now: Date; canAct: boolean; onSignOff: () => void }) {
  const { panel } = item;
  const urgency = labUrgency(panel);
  const flagged = flaggedObservations(panel);

  return (
    <li
      aria-label={`${panel.name} for ${item.snapshot.patient.firstName}`}
      className={cx('rounded-card border bg-surface p-4', urgency === 'critical' ? 'border-critical/50' : 'border-line')}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <PatientLine snapshot={item.snapshot} now={now} />
          <p className="mt-1 font-display text-base font-semibold">{panel.name}</p>
          <p className="text-xs text-ink-muted tabular">
            Collected {formatShortDate(panel.collectedAt)}
            {panel.resultedAt && ` · resulted ${relativeTime(panel.resultedAt, now)}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusDot tone={urgency === 'critical' ? 'critical' : urgency === 'abnormal' ? 'warn' : 'ok'}>
            {urgency === 'critical' ? 'Critical value' : urgency === 'abnormal' ? 'Out of range' : 'All in range'}
          </StatusDot>
          {canAct && (
            <Button size="sm" variant="primary" onClick={onSignOff}>
              Sign off
            </Button>
          )}
        </div>
      </div>
      {flagged.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {flagged.map(({ observation, flag }) => (
            <li key={observation.code} className="flex items-baseline justify-between gap-3">
              <span>{observation.name}</span>
              <StatusDot tone={flagTone(flag)}>
                <span className="tabular">
                  {observation.value} {observation.unit}
                </span>{' '}
                · {flagDisplay[flag].label}

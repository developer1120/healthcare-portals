import { differenceInDays, differenceInHours } from 'date-fns';
import { ageOn, compareAsc, toDate } from '@/lib/dates';
import type { StatusTone } from '@/ui';
import { nextAppointment } from './appointments';
import { flagObservation, isCritical } from './labs';
import type {
  Appointment,
  BloodPressureReading,
  Condition,
  LabPanel,
  Patient,
  RefillRequest,
} from './types';

/** What the roster knows about one patient: the server's summary of their chart. */
export interface PatientSnapshot {
  patient: Patient;
  /** Active conditions only. */
  conditions: Condition[];
  latestBloodPressure?: BloodPressureReading;
  labs: LabPanel[];
  appointments: Appointment[];
  pendingRefills: RefillRequest[];
}

export type RiskFactorKey =
  | 'critical-lab'
  | 'unreviewed-abnormal'
  | 'blood-pressure'
  | 'diabetes-control'
  | 'missed-visit'
  | 'older-adult'
  | 'multimorbidity'
  | 'refill-waiting';

export interface RiskFactor {
  key: RiskFactorKey;
  points: number;
  /** Short reason shown on the roster, e.g. "BP 172/98". */
  label: string;
}

export type RiskLevel = 'high' | 'rising' | 'routine';

export interface RiskAssessment {
  score: number;
  level: RiskLevel;
  /** Highest-weighted first. */
  factors: RiskFactor[];
}

export const RISK_THRESHOLDS = { high: 5, rising: 2 } as const;
export const MISSED_VISIT_WINDOW_DAYS = 90;
export const REFILL_WAIT_HOURS = 24;

const A1C_CODE = '4548-4';

/** Filter chips on the roster, in display order. */
export const riskFactorLabels: Record<RiskFactorKey, string> = {
  'critical-lab': 'Critical labs',
  'unreviewed-abnormal': 'Labs to review',
  'blood-pressure': 'High blood pressure',
  'diabetes-control': 'Diabetes above target',
  'missed-visit': 'Missed visit',
  'older-adult': 'Age 75+',
  multimorbidity: '3+ conditions',
  'refill-waiting': 'Refill waiting',
};

export const riskLevelDisplay: Record<RiskLevel, { label: string; tone: StatusTone }> = {
  high: { label: 'High', tone: 'critical' },
  rising: { label: 'Rising', tone: 'warn' },
  routine: { label: 'Routine', tone: 'ok' },
};

function latestA1c(labs: LabPanel[]): number | undefined {
  const panels = labs
    .filter((p) => p.observations.some((o) => o.code === A1C_CODE))
    .sort((a, b) => compareAsc(b.collectedAt, a.collectedAt));
  return panels[0]?.observations.find((o) => o.code === A1C_CODE)?.value;
}

/**
 * A simple, explainable panel-management score. Each factor adds points and
 * shows up as a reason on the roster, so a clinician can see why a patient is
 * flagged rather than trusting an opaque number. It sorts the list; it is not
 * a clinical prediction.
 */
export function assessRisk(snapshot: PatientSnapshot, now: Date = new Date()): RiskAssessment {
  const factors: RiskFactor[] = [];
  const add = (key: RiskFactorKey, points: number, label: string) => factors.push({ key, points, label });

  // Results nobody has signed off yet.
  const unreviewed = snapshot.labs.filter((p) => p.status === 'final');
  const flags = unreviewed.flatMap((p) => p.observations.map(flagObservation));
  if (flags.some(isCritical)) add('critical-lab', 5, 'Critical lab result');
  else if (flags.some((f) => f !== 'normal')) add('unreviewed-abnormal', 1, 'Abnormal labs to review');

  const bp = snapshot.latestBloodPressure;
  if (bp && (bp.systolic > 180 || bp.diastolic > 120)) add('blood-pressure', 5, `BP ${bp.systolic}/${bp.diastolic}`);
  else if (bp && (bp.systolic >= 140 || bp.diastolic >= 90)) add('blood-pressure', 3, `BP ${bp.systolic}/${bp.diastolic}`);

  const a1c = latestA1c(snapshot.labs);
  if (a1c !== undefined && a1c >= 9) add('diabetes-control', 3, `A1c ${a1c}%`);
  else if (a1c !== undefined && a1c >= 7) add('diabetes-control', 2, `A1c ${a1c}%`);

  const missed = snapshot.appointments.filter(
    (a) => a.status === 'no-show' && differenceInDays(now, toDate(a.start)) <= MISSED_VISIT_WINDOW_DAYS,
  );
  if (missed.length > 0) add('missed-visit', 2, missed.length === 1 ? 'Missed a visit' : `Missed ${missed.length} visits`);

  const age = ageOn(snapshot.patient.dateOfBirth, now);
  if (age >= 75) add('older-adult', 1, `Age ${age}`);

  if (snapshot.conditions.length >= 3) add('multimorbidity', 1, `${snapshot.conditions.length} conditions`);

  if (snapshot.pendingRefills.some((r) => differenceInHours(now, toDate(r.requestedAt)) >= REFILL_WAIT_HOURS)) {
    add('refill-waiting', 1, 'Refill waiting over a day');
  }

  factors.sort((a, b) => b.points - a.points);
  const score = factors.reduce((sum, f) => sum + f.points, 0);
  const level: RiskLevel = score >= RISK_THRESHOLDS.high ? 'high' : score >= RISK_THRESHOLDS.rising ? 'rising' : 'routine';
  return { score, level, factors };
}

export interface RosterRow {
  snapshot: PatientSnapshot;
  risk: RiskAssessment;
  nextVisit?: Appointment;
}

export function rosterRows(snapshots: PatientSnapshot[], now: Date = new Date()): RosterRow[] {
  return snapshots.map((snapshot) => ({
    snapshot,
    risk: assessRisk(snapshot, now),
    nextVisit: nextAppointment(snapshot.appointments, now),
  }));
}

export type RosterSort = 'risk' | 'name' | 'next-visit';
export type RosterScope = 'care-team' | 'primary';

export interface RosterFilters {
  query: string;
  level: RiskLevel | 'all';
  /** Show patients with any of these factors. Empty means no factor filter. */
  factors: RiskFactorKey[];
  scope: RosterScope;
  sort: RosterSort;
}

export const defaultRosterFilters: RosterFilters = { query: '', level: 'all', factors: [], scope: 'care-team', sort: 'risk' };

const byName = (a: RosterRow, b: RosterRow) =>
  `${a.snapshot.patient.lastName} ${a.snapshot.patient.firstName}`.localeCompare(
    `${b.snapshot.patient.lastName} ${b.snapshot.patient.firstName}`,
  );

function matchesQuery(patient: Patient, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [patient.firstName, patient.lastName, patient.preferredName ?? '', patient.mrn]
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  return q
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

/** Everything except the risk level, so the level control can show counts for the other filters. */
export function filterRosterExceptLevel(rows: RosterRow[], filters: RosterFilters, clinicianId: string): RosterRow[] {
  return rows.filter(
    ({ snapshot, risk }) =>
      (filters.scope === 'care-team' || snapshot.patient.primaryClinicianId === clinicianId) &&
      matchesQuery(snapshot.patient, filters.query) &&
      (filters.factors.length === 0 || risk.factors.some((f) => filters.factors.includes(f.key))),
  );
}

export function filterRoster(rows: RosterRow[], filters: RosterFilters, clinicianId: string): RosterRow[] {
  const filtered = filterRosterExceptLevel(rows, filters, clinicianId).filter(
    ({ risk }) => filters.level === 'all' || risk.level === filters.level,
  );
  const sorted = [...filtered];
  if (filters.sort === 'name') sorted.sort(byName);
  else if (filters.sort === 'next-visit') {
    // Patients with no visit booked go last.
    sorted.sort((a, b) => {
      if (!a.nextVisit || !b.nextVisit) return Number(!a.nextVisit) - Number(!b.nextVisit) || byName(a, b);
      return compareAsc(a.nextVisit.start, b.nextVisit.start);
    });
  } else sorted.sort((a, b) => b.risk.score - a.risk.score || byName(a, b));
  return sorted;
}

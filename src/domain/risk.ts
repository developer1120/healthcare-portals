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

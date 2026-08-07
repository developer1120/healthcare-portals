import type { StatusTone } from '@/ui';
import { compareAsc, compareDesc, toDate } from '@/lib/dates';
import { flagDisplay, flagObservation } from './labs';
import type { LabFlag } from './labs';
import type { PatientSnapshot } from './risk';
import type {
  Allergy,
  Appointment,
  BloodPressureReading,
  HeartRateReading,
  Immunization,
  LabObservation,
  LabPanel,
  Medication,
  Sex,
} from './types';

/** Everything the clinician chart shows. A superset of the roster snapshot, so risk scores match. */
export interface PatientChart extends PatientSnapshot {
  allergies: Allergy[];
  medications: Medication[];
  /** Blood pressure and heart rate, oldest first. */
  vitals: (BloodPressureReading | HeartRateReading)[];
  immunizations: Immunization[];
}

export const sexLabels: Record<Sex, string> = {
  female: 'Female',
  male: 'Male',
  intersex: 'Intersex',
  unknown: 'Not recorded',
};

export interface FlaggedObservation {
  observation: LabObservation;
  flag: LabFlag;
}

/** Out-of-range results in a panel, critical ones first. */
export function flaggedObservations(panel: LabPanel): FlaggedObservation[] {
  const rank = (flag: LabFlag) => (flag.startsWith('critical') ? 0 : 1);
  return panel.observations
    .map((observation) => ({ observation, flag: flagObservation(observation) }))
    .filter(({ flag }) => flag !== 'normal')
    .sort((a, b) => rank(a.flag) - rank(b.flag));
}

export function flagTone(flag: LabFlag): StatusTone {
  return flagDisplay[flag].tone;
}

/** Where a result stands from the clinician's side: waiting on the lab, waiting on sign-off, or done. */
export function labReviewState(panel: LabPanel): { label: string; tone: StatusTone } {
  if (panel.status === 'pending') return { label: 'Pending', tone: 'neutral' };
  if (panel.status === 'final') return { label: 'Needs review', tone: 'warn' };
  return { label: 'Reviewed', tone: 'ok' };
}

/** Blood pressure readings in the last `days`, oldest first. */
export function recentBloodPressure(chart: PatientChart, days: number, now: Date = new Date()): BloodPressureReading[] {
  const since = now.getTime() - days * 86_400_000;
  return chart.vitals
    .filter((v): v is BloodPressureReading => v.kind === 'blood-pressure' && toDate(v.takenAt).getTime() >= since)
    .sort((a, b) => compareAsc(a.takenAt, b.takenAt));
}

export function latestHeartRate(chart: PatientChart): HeartRateReading | undefined {
  return chart.vitals
    .filter((v): v is HeartRateReading => v.kind === 'heart-rate')
    .sort((a, b) => compareDesc(a.takenAt, b.takenAt))[0];
}

/** The most recent past visits (any outcome but cancelled), newest first. */
export function pastVisits(appointments: Appointment[], now: Date = new Date(), limit = 3): Appointment[] {
  return appointments
    .filter((a) => a.status !== 'cancelled' && toDate(a.start) < now && a.status !== 'booked')
    .sort((a, b) => compareDesc(a.start, b.start))
    .slice(0, limit);
}

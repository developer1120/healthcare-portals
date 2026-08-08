import { addDays } from 'date-fns';
import { toDate } from '@/lib/dates';
import type { BloodPressureReading, GlucoseReading, HeartRateReading, WeightReading } from './types';
import { assessBloodPressure, assessGlucose, assessHeartRate } from './vitals';

/** Plausible ranges for a home reading. Outside these it's almost certainly a typo. */
export const VITAL_LIMITS = {
  systolic: [70, 250],
  diastolic: [40, 150],
  bpm: [30, 220],
  glucoseMgDl: [20, 600],
  weightKg: [20, 300],
} as const;

/** How far back a reading can be added. */
export const BACKDATE_DAYS = 30;
export const VITAL_NOTE_MAX = 200;

type Omitted = 'id' | 'patientId' | 'source';
export type NewReading =
  | Omit<BloodPressureReading, Omitted>
  | Omit<HeartRateReading, Omitted>
  | Omit<GlucoseReading, Omitted>
  | Omit<WeightReading, Omitted>;

function outside(value: number, [min, max]: readonly [number, number]): boolean {
  return !Number.isFinite(value) || value < min || value > max;
}

/** Everything wrong with a reading, as sentences. Empty when it's fine. */
export function readingProblems(reading: NewReading, now: Date = new Date()): string[] {
  const problems: string[] = [];
  const takenAt = toDate(reading.takenAt);
  if (Number.isNaN(takenAt.getTime())) problems.push('Enter when the reading was taken.');
  else if (takenAt > now) problems.push('That time is in the future.');
  else if (takenAt < addDays(now, -BACKDATE_DAYS)) problems.push(`Readings older than ${BACKDATE_DAYS} days can’t be added here.`);
  if (reading.note && reading.note.length > VITAL_NOTE_MAX) problems.push(`Notes can be up to ${VITAL_NOTE_MAX} characters.`);

  switch (reading.kind) {
    case 'blood-pressure':
      if (outside(reading.systolic, VITAL_LIMITS.systolic)) problems.push('The top number should be between 70 and 250.');
      if (outside(reading.diastolic, VITAL_LIMITS.diastolic)) problems.push('The bottom number should be between 40 and 150.');
      if (reading.systolic <= reading.diastolic) problems.push('The top number should be higher than the bottom number.');
      break;
    case 'heart-rate':
      if (outside(reading.bpm, VITAL_LIMITS.bpm)) problems.push('Heart rate should be between 30 and 220 beats per minute.');
      break;
    case 'glucose':
      if (outside(reading.mgPerDl, VITAL_LIMITS.glucoseMgDl)) problems.push('Glucose should be between 20 and 600 mg/dL.');
      break;
    case 'weight':
      if (outside(reading.kg, VITAL_LIMITS.weightKg)) problems.push('Weight should be between 20 and 300 kg.');
      break;
  }
  return problems;
}

export interface ReadingAdvice {
  urgent: boolean;
  title: string;
  body: string;
}

/**
 * What to do after a worrying reading. Urgent advice is shown prominently;
 * the rest is a gentle next step. Returns null for readings in range.
 */
export function adviceFor(r: NewReading): ReadingAdvice | null {
  switch (r.kind) {
    case 'blood-pressure': {
      const { band } = assessBloodPressure(r.systolic, r.diastolic);
      if (band === 'crisis') {
        return {
          urgent: true,
          title: 'This reading is very high',
          body: 'Rest for 5 minutes and measure again. If it’s still above 180/120, or you have chest pain, shortness of breath, back pain, numbness, weakness, trouble speaking or changes in vision, call 911.',
        };
      }
      if (band === 'low') {
        return {
          urgent: false,
          title: 'This reading is low',
          body: 'Sit or lie down and drink some water. If you feel faint or confused, call 911. Let your care team know if it happens again.',
        };
      }
      if (band === 'stage-2') {
        return {
          urgent: false,
          title: 'Higher than your target',
          body: 'Take your medicines as prescribed and measure again tomorrow morning. Message your care team if most readings this week are this high.',
        };
      }
      return null;
    }
    case 'glucose': {
      const { band } = assessGlucose(r.mgPerDl, r.context);
      if (band === 'very-low' || band === 'low') {
        return {
          urgent: band === 'very-low',
          title: 'Your blood sugar is low',
          body: 'Have 15 g of fast-acting sugar now (half a cup of juice or 4 glucose tablets) and check again in 15 minutes. If you can’t swallow safely or feel confused, call 911.',
        };
      }
      if (band === 'very-high') {
        return {
          urgent: true,
          title: 'Your blood sugar is very high',
          body: 'Drink water and check again in an hour. If you’re vomiting, very drowsy or breathing fast, call 911. Otherwise message your care team today.',
        };
      }
      return null;
    }
    case 'heart-rate': {
      const { band } = assessHeartRate(r.bpm);
      if (band === 'critical') {
        return {
          urgent: true,
          title: 'This heart rate is outside the safe range',
          body: 'Sit down and measure again in a few minutes. If you feel dizzy, faint, short of breath or have chest pain, call 911.',
        };
      }
      return null;
    }
    default:
      return null;
  }
}

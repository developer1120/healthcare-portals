import type { StatusTone } from '@/ui';
import type { BloodPressureReading, GlucoseReading, VitalKind, VitalReading } from './types';

/** A reading's band, with the tone and label used by StatusDot. */
export interface VitalAssessment {
  band: string;
  label: string;
  tone: StatusTone;
}

/**
 * Adult blood pressure categories (ACC/AHA 2017). The higher category of the
 * two numbers wins, e.g. 118/85 is stage 1 because of the diastolic value.
 */
export function assessBloodPressure(systolic: number, diastolic: number): VitalAssessment {
  if (systolic > 180 || diastolic > 120) return { band: 'crisis', label: 'Very high', tone: 'critical' };
  if (systolic >= 140 || diastolic >= 90) return { band: 'stage-2', label: 'High (stage 2)', tone: 'critical' };
  if (systolic >= 130 || diastolic >= 80) return { band: 'stage-1', label: 'High (stage 1)', tone: 'warn' };
  if (systolic < 90 || diastolic < 60) return { band: 'low', label: 'Low', tone: 'warn' };
  if (systolic >= 120) return { band: 'elevated', label: 'Elevated', tone: 'warn' };
  return { band: 'normal', label: 'In range', tone: 'ok' };
}

/** Resting adult heart rate. */
export function assessHeartRate(bpm: number): VitalAssessment {
  if (bpm < 40 || bpm > 130) return { band: 'critical', label: bpm < 40 ? 'Very low' : 'Very high', tone: 'critical' };
  if (bpm < 50) return { band: 'low', label: 'Low', tone: 'warn' };
  if (bpm > 100) return { band: 'high', label: 'High', tone: 'warn' };
  return { band: 'normal', label: 'In range', tone: 'ok' };
}

/**
 * Glucose in mg/dL. Below 54 is clinically significant hypoglycaemia. Fasting
 * targets are tighter than after-meal ones.
 */
export function assessGlucose(mgPerDl: number, context: GlucoseReading['context']): VitalAssessment {
  if (mgPerDl < 54) return { band: 'very-low', label: 'Very low', tone: 'critical' };
  if (mgPerDl < 70) return { band: 'low', label: 'Low', tone: 'warn' };
  if (mgPerDl > 300) return { band: 'very-high', label: 'Very high', tone: 'critical' };
  const highFrom = context === 'fasting' || context === 'before-meal' ? 100 : 180;
  if (mgPerDl >= highFrom) return { band: 'high', label: 'Above target', tone: 'warn' };
  return { band: 'normal', label: 'In range', tone: 'ok' };
}

/** Body mass index from weight and height. */
export function bmi(kg: number, heightCm: number): number {
  const metres = heightCm / 100;
  return kg / (metres * metres);
}

export function assessReading(reading: VitalReading): VitalAssessment | null {
  switch (reading.kind) {
    case 'blood-pressure':
      return assessBloodPressure(reading.systolic, reading.diastolic);
    case 'heart-rate':
      return assessHeartRate(reading.bpm);
    case 'glucose':
      return assessGlucose(reading.mgPerDl, reading.context);
    case 'weight':
      // Weight has no single healthy band without height and goals.
      return null;
  }
}

export const vitalLabels: Record<VitalKind, string> = {
  'blood-pressure': 'Blood pressure',
  'heart-rate': 'Resting heart rate',
  glucose: 'Blood glucose',
  weight: 'Weight',
};

/** Readings of one kind, oldest first, narrowed to that kind's type. */
export function readingsOf<K extends VitalKind>(
  readings: VitalReading[],
  kind: K,
): Extract<VitalReading, { kind: K }>[] {
  return readings
    .filter((r): r is Extract<VitalReading, { kind: K }> => r.kind === kind)
    .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

/** Readings taken in the last `days` days, counting back from `now`. */
export function lastDays<T extends VitalReading>(readings: T[], days: number, now: Date = new Date()): T[] {
  const from = now.getTime() - days * 24 * 60 * 60_000;
  return readings.filter((r) => {
    const time = new Date(r.takenAt).getTime();
    return time >= from && time <= now.getTime();
  });
}

/** Mean systolic and diastolic, rounded, or null when there are no readings. */
export function averageBloodPressure(readings: BloodPressureReading[]): { systolic: number; diastolic: number } | null {
  if (readings.length === 0) return null;
  const sum = readings.reduce((acc, r) => ({ s: acc.s + r.systolic, d: acc.d + r.diastolic }), { s: 0, d: 0 });
  return { systolic: Math.round(sum.s / readings.length), diastolic: Math.round(sum.d / readings.length) };
}

/** Home blood pressure target used for the shaded band on charts (systolic). */
export const SYSTOLIC_TARGET = { low: 90, high: 130 } as const;

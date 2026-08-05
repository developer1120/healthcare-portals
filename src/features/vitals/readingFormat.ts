import type { GlucoseReading, VitalKind, VitalReading } from '@/domain/types';
import type { NewReading } from '@/domain/vitalEntry';
import { formatGlucose, formatWeight } from '@/lib/units';

export const kindOptions: { value: VitalKind; label: string }[] = [
  { value: 'blood-pressure', label: 'Blood pressure' },
  { value: 'heart-rate', label: 'Heart rate' },
  { value: 'glucose', label: 'Glucose' },
  { value: 'weight', label: 'Weight' },
];

export const glucoseContextLabels: Record<GlucoseReading['context'], string> = {
  fasting: 'Fasting',
  'before-meal': 'Before a meal',
  'after-meal': 'After a meal',
  random: 'Any time',
};

export function isVitalKind(value: string | null): value is VitalKind {
  return kindOptions.some((o) => o.value === value);
}

/** "128/82 mmHg", "64 bpm", "108 mg/dL", "73.2 kg". */
export function formatReading(reading: NewReading | VitalReading): string {
  switch (reading.kind) {
    case 'blood-pressure':
      return `${reading.systolic}/${reading.diastolic} mmHg`;
    case 'heart-rate':
      return `${reading.bpm} bpm`;
    case 'glucose':
      return formatGlucose(reading.mgPerDl);
    case 'weight':
      return formatWeight(reading.kg);
  }
}

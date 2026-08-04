import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addDays, format } from 'date-fns';
import { z } from 'zod';
import { IconAlertTriangle, IconDeviceFloppy } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { useAddReading } from '@/api/queries';
import type { GlucoseReading, VitalKind } from '@/domain/types';
import { BACKDATE_DAYS, VITAL_LIMITS, VITAL_NOTE_MAX, adviceFor } from '@/domain/vitalEntry';
import type { NewReading } from '@/domain/vitalEntry';
import { assessBloodPressure, assessGlucose, assessHeartRate } from '@/domain/vitals';
import { lbToKg, mgDlToMmolL, mmolLToMgDl, round } from '@/lib/units';
import { Button, Field, Input, SegmentedControl, Select, StatusDot, Textarea, cx } from '@/ui';
import { formatReading, glucoseContextLabels } from './readingFormat';

const fields = z.object({
  systolic: z.string(),
  diastolic: z.string(),
  bpm: z.string(),
  glucose: z.string(),
  glucoseUnit: z.enum(['mg/dL', 'mmol/L']),
  glucoseContext: z.enum(['fasting', 'before-meal', 'after-meal', 'random']),
  weight: z.string(),
  weightUnit: z.enum(['kg', 'lb']),
  takenAt: z.string(),
  note: z.string().max(VITAL_NOTE_MAX, `Keep it under ${VITAL_NOTE_MAX} characters`),
});

type FormValues = z.infer<typeof fields>;

const toLocalInput = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm");

/** The form for one kind of reading: each field checked in its own words, with its own message. */
function schemaFor(kind: VitalKind) {
  return fields.superRefine((values, ctx) => {
    const issue = (path: keyof FormValues, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });

    /** The field as a number in range, or undefined after recording why not. */
    function numberIn(path: keyof FormValues, label: string, [min, max]: readonly [number, number], unit = '') {
      const raw = values[path].trim();
      const value = Number(raw);
      if (!raw) {
        issue(path, `Enter ${label}`);
      } else if (!Number.isFinite(value)) {
        issue(path, `Enter ${label} as a number`);
      } else if (value < min || value > max) {
        const subject = label[0]!.toUpperCase() + label.slice(1);
        issue(path, `That looks unlikely. ${subject} is usually between ${min} and ${max}${unit}.`);
      } else {
        return value;
      }
      return undefined;
    }

    const takenAt = new Date(values.takenAt);
    const now = new Date();
    if (!values.takenAt || Number.isNaN(takenAt.getTime())) issue('takenAt', 'Enter when you took the reading');
    else if (takenAt > now) issue('takenAt', 'That time is in the future');
    else if (takenAt < addDays(now, -BACKDATE_DAYS)) issue('takenAt', `Readings older than ${BACKDATE_DAYS} days can’t be added`);

    if (kind === 'blood-pressure') {
      const systolic = numberIn('systolic', 'the top number', VITAL_LIMITS.systolic);
      const diastolic = numberIn('diastolic', 'the bottom number', VITAL_LIMITS.diastolic);
      if (systolic !== undefined && diastolic !== undefined && systolic <= diastolic) {
        issue('diastolic', 'The bottom number should be lower than the top number');
      }
    } else if (kind === 'heart-rate') {
      numberIn('bpm', 'your heart rate', VITAL_LIMITS.bpm, ' bpm');
    } else if (kind === 'glucose') {
      const [min, max] = VITAL_LIMITS.glucoseMgDl;
      const limits = values.glucoseUnit === 'mg/dL' ? ([min, max] as const) : ([mgDlToMmolL(min), mgDlToMmolL(max)] as const);
      numberIn('glucose', 'your glucose', limits, ` ${values.glucoseUnit}`);
    } else {
      const [min, max] = VITAL_LIMITS.weightKg;
      const limits = values.weightUnit === 'kg' ? ([min, max] as const) : ([Math.ceil(min * 2.20462), Math.floor(max * 2.20462)] as const);
      numberIn('weight', 'your weight', limits, ` ${values.weightUnit}`);
    }
  });
}

/** Turns valid form values into the reading to save, converting units to the stored ones. */
function toReading(kind: VitalKind, values: FormValues): NewReading {
  const takenAt = new Date(values.takenAt).toISOString();
  const note = values.note.trim() || undefined;
  switch (kind) {
    case 'blood-pressure':
      return { kind, takenAt, note, systolic: Number(values.systolic), diastolic: Number(values.diastolic) };
    case 'heart-rate':
      return { kind, takenAt, note, bpm: Number(values.bpm) };
    case 'glucose': {
      const value = Number(values.glucose);
      return {
        kind,
        takenAt,
        note,
        context: values.glucoseContext,
        mgPerDl: values.glucoseUnit === 'mg/dL' ? Math.round(value) : mmolLToMgDl(value),
      };
    }
    case 'weight': {
      const value = Number(values.weight);
      return { kind, takenAt, note, kg: values.weightUnit === 'kg' ? round(value, 1) : lbToKg(value) };
    }
  }
}

function statusOf(reading: NewReading) {
  switch (reading.kind) {
    case 'blood-pressure':
      return assessBloodPressure(reading.systolic, reading.diastolic);
    case 'heart-rate':
      return assessHeartRate(reading.bpm);
    case 'glucose':
      return assessGlucose(reading.mgPerDl, reading.context);
    default:
      return null;
  }
}

function SavedReading({ reading }: { reading: NewReading }) {
  const status = statusOf(reading);
  const advice = adviceFor(reading);
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-surface-sunken px-3 py-2.5 text-sm">
        <span>
          Saved <span className="font-semibold tabular">{formatReading(reading)}</span>
        </span>
        {status && <StatusDot tone={status.tone}>{status.label}</StatusDot>}
      </p>
      {advice && (
        <div
          role={advice.urgent ? 'alert' : undefined}
          className={cx(
            'flex gap-2 rounded-control px-3 py-2.5 text-sm',

import { addDays, addMinutes, isSameDay, startOfDay } from 'date-fns';
import { atTime, toDate, toIsoDate } from '@/lib/dates';
import type { DoseLog, IsoDate, Medication } from './types';

/** A dose can be marked from this long before it's due. */
export const MARK_EARLY_MINUTES = 60;
/** After this long past the time, an unmarked dose counts as missed. */
export const MISSED_AFTER_MINUTES = 120;

export type DoseState = 'taken' | 'skipped' | 'due' | 'missed' | 'upcoming';

export interface ScheduledDose {
  medication: Medication;
  scheduledFor: Date;
  log?: DoseLog;
  state: DoseState;
}

/** Medicines on a schedule that were being taken on `day`. */
function scheduledOn(medications: Medication[], day: Date): Medication[] {
  const date = toIsoDate(day);
  return medications.filter((m) => {
    if (m.asNeeded || m.doseTimes.length === 0 || m.startDate > date) return false;
    // With an end date, it counts up to that day; without one, only while active.
    return m.endDate ? m.endDate >= date : m.status === 'active';
  });
}

function stateOf(scheduledFor: Date, log: DoseLog | undefined, now: Date): DoseState {
  if (log?.takenAt) return 'taken';
  if (log?.skipped) return 'skipped';
  if (now < addMinutes(scheduledFor, -MARK_EARLY_MINUTES)) return 'upcoming';
  if (now <= addMinutes(scheduledFor, MISSED_AFTER_MINUTES)) return 'due';
  return 'missed';
}

/** Every scheduled dose on `day`, in time order, with what happened to it. */
export function dosesOn(day: Date, medications: Medication[], logs: DoseLog[], now: Date = new Date()): ScheduledDose[] {
  return scheduledOn(medications, day)
    .flatMap((medication) =>
      medication.doseTimes.map((time) => {
        const scheduledFor = atTime(day, 0, time);
        const log = logs.find(
          (l) => l.medicationId === medication.id && toDate(l.scheduledFor).getTime() === scheduledFor.getTime(),
        );
        return { medication, scheduledFor, log, state: stateOf(scheduledFor, log, now) };
      }),
    )
    .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime() || a.medication.name.localeCompare(b.medication.name));
}

/** Whether the patient may record this dose now (not more than an hour early). */
export function canMarkDose(scheduledFor: Date, now: Date = new Date()): boolean {
  return now >= addMinutes(scheduledFor, -MARK_EARLY_MINUTES);
}

export interface DayAdherence {
  date: IsoDate;
  scheduled: number;
  taken: number;
}

export interface AdherenceSummary {
  /** Share of counted doses taken, 0–1, or null when nothing was due. */
  rate: number | null;
  days: DayAdherence[];
  byMedication: { medication: Medication; scheduled: number; taken: number }[];
  /** Consecutive full days with every dose taken, counting back from yesterday. */
  streak: number;
}

/**
 * Adherence over the last `days` days including today. Doses that are still
 * upcoming or due today aren't counted yet, so the rate doesn't dip at breakfast.
 */
export function adherenceSummary(
  medications: Medication[],
  logs: DoseLog[],
  days: number,
  now: Date = new Date(),
): AdherenceSummary {
  const today = startOfDay(now);
  const perDay: DayAdherence[] = [];
  const perMed = new Map<string, { medication: Medication; scheduled: number; taken: number }>();

  for (let offset = days - 1; offset >= 0; offset--) {
    const day = addDays(today, -offset);
    const counted = dosesOn(day, medications, logs, now).filter((d) => d.state !== 'upcoming' && d.state !== 'due');
    const taken = counted.filter((d) => d.state === 'taken').length;
    perDay.push({ date: toIsoDate(day), scheduled: counted.length, taken });
    for (const dose of counted) {
      const entry = perMed.get(dose.medication.id) ?? { medication: dose.medication, scheduled: 0, taken: 0 };
      entry.scheduled += 1;
      if (dose.state === 'taken') entry.taken += 1;
      perMed.set(dose.medication.id, entry);
    }
  }

  const scheduled = perDay.reduce((sum, d) => sum + d.scheduled, 0);
  const taken = perDay.reduce((sum, d) => sum + d.taken, 0);

  let streak = 0;
  for (const day of [...perDay].reverse()) {
    if (isSameDay(toDate(`${day.date}T12:00:00`), today)) continue;
    if (day.scheduled > 0 && day.taken === day.scheduled) streak += 1;
    else break;
  }

  return {
    rate: scheduled === 0 ? null : taken / scheduled,
    days: perDay,
    byMedication: [...perMed.values()].sort((a, b) => a.medication.name.localeCompare(b.medication.name)),
    streak,
  };
}

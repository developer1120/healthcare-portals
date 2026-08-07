import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { StatusTone } from '@/ui';
import type { Allergy, Immunization, Severity } from './types';

/** Vaccines due within this many days count as "due soon". */
export const DUE_SOON_DAYS = 30;
export const ALLERGY_TEXT_MAX = 80;

export type ImmunizationStatus = 'overdue' | 'due-soon' | 'current' | 'complete';

/** Where a vaccine stands against its next due date. "complete" means no further dose is scheduled. */
export function immunizationStatus(immunization: Immunization, now: Date = new Date()): ImmunizationStatus {
  if (!immunization.nextDueOn) return 'complete';
  const days = differenceInCalendarDays(parseISO(immunization.nextDueOn), now);
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due-soon';
  return 'current';
}

export const immunizationDisplay: Record<ImmunizationStatus, { tone: StatusTone; label: string }> = {
  overdue: { tone: 'warn', label: 'Overdue' },
  'due-soon': { tone: 'info', label: 'Due soon' },
  current: { tone: 'ok', label: 'Up to date' },
  complete: { tone: 'ok', label: 'Complete' },
};

export const severityDisplay: Record<Severity, { tone: StatusTone; label: string }> = {
  mild: { tone: 'neutral', label: 'Mild' },
  moderate: { tone: 'warn', label: 'Moderate' },
  severe: { tone: 'critical', label: 'Severe' },
};

/** Overdue first, then due soon, then the rest by most recent dose. */
export function sortImmunizations(list: Immunization[], now: Date = new Date()): Immunization[] {
  const rank: Record<ImmunizationStatus, number> = { overdue: 0, 'due-soon': 1, current: 2, complete: 3 };
  return [...list].sort(
    (a, b) =>
      rank[immunizationStatus(a, now)] - rank[immunizationStatus(b, now)] || b.givenOn.localeCompare(a.givenOn),
  );
}

/** Severe first, then by name. */
export function sortAllergies(list: Allergy[]): Allergy[] {
  const rank: Record<Severity, number> = { severe: 0, moderate: 1, mild: 2 };
  return [...list].sort((a, b) => rank[a.severity] - rank[b.severity] || a.substance.localeCompare(b.substance));
}

/** Whether an allergy to this substance is already listed, ignoring case and spacing. */
export function hasAllergy(list: Allergy[], substance: string): boolean {
  const key = substance.trim().toLowerCase().replace(/\s+/g, ' ');
  return list.some((a) => a.substance.trim().toLowerCase().replace(/\s+/g, ' ') === key);
}

/** The date a vaccine falls due, for display. */
export function dueDate(immunization: Immunization): Date | null {
  return immunization.nextDueOn ? parseISO(immunization.nextDueOn) : null;
}


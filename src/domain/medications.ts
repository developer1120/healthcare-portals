import { addDays, differenceInCalendarDays } from 'date-fns';
import { toDate } from '@/lib/dates';
import type { Medication, RefillRequest } from './types';

/** Refills can be requested from this many days before the supply runs out. */
export const REFILL_WINDOW_DAYS = 10;
/** Supply this low is flagged on the medication card. */
export const LOW_SUPPLY_DAYS = 7;
export const REFILL_NOTE_MAX = 300;

export const pharmacies = [
  'Hawthorne Pharmacy, SE Hawthorne Blvd',
  'Fremont Community Pharmacy',
  'Mendwell Harbour Street Pharmacy',
] as const;

/** "Once daily", "Twice daily", "3 times daily" or "As needed". */
export function frequencyLabel(medication: Medication): string {
  if (medication.asNeeded) return 'As needed';
  const n = medication.doseTimes.length;
  if (n === 1) return 'Once daily';
  if (n === 2) return 'Twice daily';
  return `${n} times daily`;
}

export interface SupplyStatus {
  /** Whole days of medicine left (0 when out). */
  daysLeft: number;
  runsOutOn: Date;
  level: 'ok' | 'low' | 'out';
}

/** How long the last fill lasts, counting from the day it was picked up. */
export function supplyStatus(medication: Medication, now: Date = new Date()): SupplyStatus {
  const runsOutOn = addDays(toDate(medication.lastFilledAt), medication.daysSupply);
  const daysLeft = Math.max(0, differenceInCalendarDays(runsOutOn, now));
  return { daysLeft, runsOutOn, level: daysLeft === 0 ? 'out' : daysLeft <= LOW_SUPPLY_DAYS ? 'low' : 'ok' };
}

/** The patient's most recent refill request for a medication, if any. */
export function latestRefill(medicationId: string, requests: RefillRequest[]): RefillRequest | undefined {
  return requests
    .filter((r) => r.medicationId === medicationId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
}

export type RefillEligibility =
  | { canRequest: true; needsRenewal: boolean }
  | { canRequest: false; reason: 'not-active' | 'pending' | 'too-early'; availableFrom?: Date };

/**
 * Whether a refill can be requested now:
 * - only for active medicines, and not while another request is pending;
 * - from 10 days before the supply runs out, so people don't stockpile;
 * - with no refills left, the request goes to the prescriber as a renewal.
 */
export function refillEligibility(
  medication: Medication,
  requests: RefillRequest[],
  now: Date = new Date(),
): RefillEligibility {
  if (medication.status !== 'active') return { canRequest: false, reason: 'not-active' };
  if (latestRefill(medication.id, requests)?.status === 'pending') return { canRequest: false, reason: 'pending' };
  const { daysLeft, runsOutOn } = supplyStatus(medication, now);
  if (daysLeft > REFILL_WINDOW_DAYS) {
    return { canRequest: false, reason: 'too-early', availableFrom: addDays(runsOutOn, -REFILL_WINDOW_DAYS) };
  }
  return { canRequest: true, needsRenewal: medication.refillsRemaining === 0 };
}

import { toIsoDate } from '@/lib/dates';
import type { Clinician, InsuranceCoverage, Specialty, VisitMode } from './types';

export type CopayBenefit = keyof InsuranceCoverage['copayCents'];

/** How a service is covered: a flat copay, free preventive care, or deductible then coinsurance. */
export type Benefit = { kind: 'copay'; copay: CopayBenefit } | { kind: 'preventive' } | { kind: 'deductible' };

export interface EstimateService {
  id: string;
  label: string;
  /** The clinic's typical negotiated price for the service. */
  priceCents: number;
  benefit: Benefit;
}

/** Common services with Mendwell's typical in-network prices. */
export const estimateServices: EstimateService[] = [
  { id: 'preventive', label: 'Annual preventive visit', priceCents: 24_500, benefit: { kind: 'preventive' } },
  { id: 'primary-care', label: 'Primary care visit', priceCents: 18_000, benefit: { kind: 'copay', copay: 'primary-care' } },
  { id: 'specialist', label: 'Specialist visit', priceCents: 26_000, benefit: { kind: 'copay', copay: 'specialist' } },
  { id: 'video', label: 'Video visit', priceCents: 9_500, benefit: { kind: 'copay', copay: 'video' } },
  { id: 'a1c', label: 'Hemoglobin A1c test', priceCents: 6_800, benefit: { kind: 'deductible' } },
  { id: 'lipid', label: 'Lipid panel', priceCents: 5_400, benefit: { kind: 'deductible' } },
  { id: 'xray', label: 'Chest X-ray', priceCents: 21_000, benefit: { kind: 'deductible' } },
  { id: 'mri', label: 'MRI, knee', priceCents: 120_000, benefit: { kind: 'deductible' } },
];

export const copayLabels: Record<CopayBenefit, string> = {
  'primary-care': 'Primary care',
  specialist: 'Specialist',
  video: 'Video visit',
};

export function isCoverageActive(coverage: InsuranceCoverage, now: Date = new Date()): boolean {
  const today = toIsoDate(now);
  return coverage.validFrom <= today && today <= coverage.validTo;
}

/** The coverage an estimate uses: the active primary plan, if there is one. */
export function activePrimary(coverages: InsuranceCoverage[], now: Date = new Date()): InsuranceCoverage | undefined {
  return coverages.find((c) => c.priority === 'primary' && isCoverageActive(c, now));
}

export interface Accumulator {
  metCents: number;
  limitCents: number;
  remainingCents: number;
  /** 0–1, for progress bars. */
  fraction: number;
}

function accumulator(metCents: number, limitCents: number): Accumulator {
  const met = Math.min(metCents, limitCents);
  return { metCents: met, limitCents, remainingCents: limitCents - met, fraction: limitCents > 0 ? met / limitCents : 1 };
}

/** How far through the deductible and out-of-pocket maximum the patient is this plan year. */
export function coverageProgress(coverage: InsuranceCoverage): { deductible: Accumulator; outOfPocket: Accumulator } {
  return {
    deductible: accumulator(coverage.deductibleMetCents, coverage.deductibleCents),
    outOfPocket: accumulator(coverage.outOfPocketMetCents, coverage.outOfPocketMaxCents),
  };
}

export interface CostEstimate {
  priceCents: number;
  copayCents: number;
  deductibleCents: number;
  coinsuranceCents: number;
  youPayCents: number;
  planPaysCents: number;
  /** The out-of-pocket maximum lowered what the patient pays. */
  cappedByOutOfPocket: boolean;
  /** No active coverage, so the patient pays the full price. */
  selfPay: boolean;
}

/**
 * Estimates the patient's share for one service from today's benefits:
 * preventive care is free, copay services cost the copay (never more than the
 * price), and everything else goes to the deductible first, then coinsurance.
 * The patient never pays more than what's left of the out-of-pocket maximum.
 */
export function estimateCost(service: EstimateService, coverage: InsuranceCoverage | undefined): CostEstimate {
  const price = service.priceCents;
  const blank = { priceCents: price, copayCents: 0, deductibleCents: 0, coinsuranceCents: 0, cappedByOutOfPocket: false };
  if (!coverage) return { ...blank, youPayCents: price, planPaysCents: 0, selfPay: true };

  const { deductible, outOfPocket } = coverageProgress(coverage);
  let copayCents = 0;
  let deductibleCents = 0;
  let coinsuranceCents = 0;

  if (service.benefit.kind === 'copay') {
    const copay = coverage.copayCents[service.benefit.copay];
    if (copay !== undefined) {
      copayCents = Math.min(copay, price);
    } else {
      // No copay for this kind of visit on this plan: treat it like any other service.
      deductibleCents = Math.min(price, deductible.remainingCents);
      coinsuranceCents = Math.round((price - deductibleCents) * coverage.coinsurance);
    }
  } else if (service.benefit.kind === 'deductible') {
    deductibleCents = Math.min(price, deductible.remainingCents);
    coinsuranceCents = Math.round((price - deductibleCents) * coverage.coinsurance);
  }

  const share = copayCents + deductibleCents + coinsuranceCents;
  const youPayCents = Math.min(share, outOfPocket.remainingCents);
  return {
    priceCents: price,
    copayCents,
    deductibleCents,
    coinsuranceCents,
    youPayCents,
    planPaysCents: price - youPayCents,
    cappedByOutOfPocket: youPayCents < share,
    selfPay: false,
  };
}

const primaryCareSpecialties: Specialty[] = ['primary-care', 'nursing', 'care-coordination'];

/** The estimate service matching a visit: video visits have their own copay, then primary care or specialist. */
export function serviceForVisit(clinician: Pick<Clinician, 'specialty'>, mode: VisitMode): EstimateService {
  const id = mode === 'video' ? 'video' : primaryCareSpecialties.includes(clinician.specialty) ? 'primary-care' : 'specialist';
  return estimateServices.find((s) => s.id === id)!;
}

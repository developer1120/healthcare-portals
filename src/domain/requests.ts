import { differenceInBusinessDays } from 'date-fns';
import { compareAsc, toDate } from '@/lib/dates';
import { flaggedObservations } from './chart';
import type { PatientSnapshot } from './risk';
import type { Allergy, Clinician, LabPanel, Medication, RefillRequest } from './types';

/** Patients are told refills take up to this many business days. */
export const REFILL_TURNAROUND_BUSINESS_DAYS = 2;
export const REFILL_COUNT_OPTIONS = [0, 1, 2, 3, 5] as const;
export const DAYS_SUPPLY_OPTIONS = [30, 90] as const;
export const DECISION_NOTE_MAX = 300;
/** Sign-off notes go to the patient, so they need to say something. */
export const SIGN_OFF_NOTE_MIN = 10;

export interface RefillItem {
  request: RefillRequest;
  medication: Medication;
  snapshot: PatientSnapshot;
  allergies: Allergy[];
}

export interface LabItem {
  panel: LabPanel;
  snapshot: PatientSnapshot;
}

export interface RequestQueues {
  refills: RefillItem[];
  labs: LabItem[];
}

/** Physicians and nurse practitioners can prescribe; nurses and coordinators can't. */
export function canPrescribe(clinician: Pick<Clinician, 'role'>): boolean {
  return clinician.role === 'physician' || clinician.role === 'nurse-practitioner';
}

export function refillOverdue(request: RefillRequest, now: Date = new Date()): boolean {
  return differenceInBusinessDays(now, toDate(request.requestedAt)) >= REFILL_TURNAROUND_BUSINESS_DAYS;
}

/** Oldest request first: patients are waiting on these in order. */
export function sortRefills(items: RefillItem[]): RefillItem[] {
  return [...items].sort((a, b) => compareAsc(a.request.requestedAt, b.request.requestedAt));
}

/** Result urgency: any critical value, then other flagged values, then all in range. */
export function labUrgency(panel: LabPanel): 'critical' | 'abnormal' | 'normal' {
  const flagged = flaggedObservations(panel);
  if (flagged.some((f) => f.flag.startsWith('critical'))) return 'critical';
  return flagged.length > 0 ? 'abnormal' : 'normal';
}

/** Critical first, then abnormal, then normal; oldest result first within each. */
export function sortLabs(items: LabItem[]): LabItem[] {
  const rank = { critical: 0, abnormal: 1, normal: 2 } as const;
  return [...items].sort(
    (a, b) =>
      rank[labUrgency(a.panel)] - rank[labUrgency(b.panel)] ||
      compareAsc(a.panel.resultedAt ?? a.panel.collectedAt, b.panel.resultedAt ?? b.panel.collectedAt),
  );
}

export type RequestScope = 'mine' | 'team';

/** "Mine" means I prescribed the medicine or ordered the test. */
export function filterQueues(queues: RequestQueues, scope: RequestScope, clinicianId: string): RequestQueues {
  if (scope === 'team') return { refills: sortRefills(queues.refills), labs: sortLabs(queues.labs) };
  return {
    refills: sortRefills(queues.refills.filter((r) => r.medication.prescriberId === clinicianId)),
    labs: sortLabs(queues.labs.filter((l) => l.panel.orderedById === clinicianId)),
  };
}

export interface RefillDecision {
  decision: 'approve' | 'deny';
  note: string;
  /** Approvals only. */
  refills?: number;
  daysSupply?: number;
}

/** The first problem with a decision, or null. A denial must tell the patient why. */
export function refillDecisionProblem(decision: RefillDecision): string | null {
  const note = decision.note.trim();
  if (note.length > DECISION_NOTE_MAX) return `Keep the note under ${DECISION_NOTE_MAX} characters.`;
  if (decision.decision === 'deny') return note ? null : 'Tell the patient why, and what to do next.';
  if (!REFILL_COUNT_OPTIONS.includes(decision.refills as (typeof REFILL_COUNT_OPTIONS)[number])) {
    return 'Choose how many refills to authorize.';
  }
  if (!DAYS_SUPPLY_OPTIONS.includes(decision.daysSupply as (typeof DAYS_SUPPLY_OPTIONS)[number])) {
    return 'Choose a days supply.';
  }
  return null;
}

export interface SignOff {
  note: string;
  /** Required for critical results: the patient has been told directly. */
  patientContacted: boolean;
}

export function signOffProblem(panel: LabPanel, signOff: SignOff): string | null {
  const note = signOff.note.trim();
  if (note.length < SIGN_OFF_NOTE_MIN) return 'Write a short note for the patient explaining the result.';
  if (note.length > DECISION_NOTE_MAX) return `Keep the note under ${DECISION_NOTE_MAX} characters.`;
  if (labUrgency(panel) === 'critical' && !signOff.patientContacted) {
    return 'Critical results need a call to the patient before sign-off.';
  }
  return null;
}

/** Starting points for the patient-facing sign-off note. */
export const signOffTemplates: { label: string; body: string }[] = [
  { label: 'All normal', body: 'All of these results are in the normal range. Nothing more to do.' },
  {
    label: 'Minor, no action',
    body: 'A couple of values are slightly outside the usual range, but not in a way that needs any change. We’ll recheck at your next routine blood test.',
  },
  { label: 'Discuss at visit', body: 'I’d like to go over these results with you. Please book a visit in the next two weeks.' },
];

/** The rail badge: my refill requests and results waiting on me. */
export function waitingOnMe(queues: RequestQueues, clinicianId: string): number {
  const mine = filterQueues(queues, 'mine', clinicianId);
  return mine.refills.length + mine.labs.length;
}

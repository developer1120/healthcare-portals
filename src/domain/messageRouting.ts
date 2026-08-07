import type { Clinician, Patient, ThreadCategory } from './types';

export interface Routing {
  /** Who the patient may pick. */
  options: Clinician[];
  /** Pre-selected recipient. */
  defaultId: string | undefined;
  /** True when the topic always goes to one team and there's no choice. */
  fixed: boolean;
  /** Why it goes where it goes, shown under the picker. */
  note?: string;
}

/**
 * Where a new message goes, by topic:
 * - Billing goes to Patient services, with no choice.
 * - Test results go to the care team nurse first, who loops in the clinician.
 * - Everything else goes to anyone on the care team, primary clinician by default.
 */
export function routeMessage(category: ThreadCategory, patient: Patient, clinicians: Clinician[]): Routing {
  if (category === 'billing') {
    const coordinators = clinicians.filter((c) => c.role === 'care-coordinator');
    return {
      options: coordinators,
      defaultId: coordinators[0]?.id,
      fixed: true,
      note: 'Billing and insurance questions go to Patient services.',
    };
  }

  const team = patient.careTeamIds
    .map((id) => clinicians.find((c) => c.id === id))
    .filter((c): c is Clinician => Boolean(c) && c!.role !== 'care-coordinator');

  if (category === 'results') {
    const nurse = team.find((c) => c.role === 'nurse');
    return {
      options: team,
      defaultId: nurse?.id ?? patient.primaryClinicianId,
      fixed: false,
      note: nurse ? `${nurse.name} reviews results questions first and brings in your clinician if needed.` : undefined,
    };
  }

  return { options: team, defaultId: patient.primaryClinicianId, fixed: false };
}

/** Whether `assigneeId` is an allowed recipient for this topic. */
export function canRouteTo(category: ThreadCategory, assigneeId: string, patient: Patient, clinicians: Clinician[]): boolean {
  return routeMessage(category, patient, clinicians).options.some((c) => c.id === assigneeId);
}

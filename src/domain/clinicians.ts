import type { Clinician, ClinicianRole, Specialty } from './types';

export const specialtyLabels: Record<Specialty, string> = {
  'primary-care': 'Primary care',
  cardiology: 'Cardiology',
  dermatology: 'Dermatology',
  endocrinology: 'Endocrinology',
  neurology: 'Neurology',
  nursing: 'Nursing',
  'care-coordination': 'Patient services',
};

export const roleLabels: Record<ClinicianRole, string> = {
  physician: 'Physician',
  'nurse-practitioner': 'Nurse practitioner',
  nurse: 'Nurse',
  'care-coordinator': 'Care coordinator',
};

/** "Cardiology" for specialists, "Nurse" for the nursing team, "Primary care" for the PCP. */
export function clinicianSubtitle(clinician: Clinician): string {
  return clinician.specialty === 'nursing' ? roleLabels[clinician.role] : specialtyLabels[clinician.specialty];
}

/** Whether patients can book visits with this clinician directly. */
export function isBookable(clinician: Clinician): boolean {
  return clinician.role === 'physician' || clinician.role === 'nurse-practitioner';
}

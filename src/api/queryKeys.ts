import type { Id, IsoDate, VitalKind } from '@/domain/types';

/**
 * Query keys in one place. Everything about a patient sits under
 * ['patient', id], so invalidating that prefix refreshes all of it.
 */
export const queryKeys = {
  clinicians: () => ['clinicians'] as const,
  availability: (clinicianId: Id) => ['availability', clinicianId] as const,
  patient: (patientId: Id) => ['patient', patientId] as const,
  careTeam: (patientId: Id) => ['patient', patientId, 'care-team'] as const,
  appointments: (patientId: Id) => ['patient', patientId, 'appointments'] as const,
  threads: (patientId: Id) => ['patient', patientId, 'threads'] as const,
  labs: (patientId: Id) => ['patient', patientId, 'labs'] as const,
  medications: (patientId: Id) => ['patient', patientId, 'medications'] as const,
  refills: (patientId: Id) => ['patient', patientId, 'refills'] as const,
  doses: (patientId: Id) => ['patient', patientId, 'doses'] as const,
  vitals: (patientId: Id, kind?: VitalKind) => ['patient', patientId, 'vitals', kind ?? 'all'] as const,
  record: (patientId: Id) => ['patient', patientId, 'record'] as const,
  documents: (patientId: Id) => ['patient', patientId, 'documents'] as const,
  statements: (patientId: Id) => ['patient', patientId, 'statements'] as const,
  insurance: (patientId: Id) => ['patient', patientId, 'insurance'] as const,
  paymentMethods: (patientId: Id) => ['patient', patientId, 'payment-methods'] as const,
  paymentPlans: (patientId: Id) => ['patient', patientId, 'payment-plans'] as const,
  tasks: (patientId: Id) => ['patient', patientId, 'tasks'] as const,
  notifications: (patientId: Id) => ['patient', patientId, 'notifications'] as const,
  reminders: (patientId: Id) => ['patient', patientId, 'reminders'] as const,
  caregivers: (patientId: Id) => ['patient', patientId, 'caregivers'] as const,
  consents: (patientId: Id) => ['patient', patientId, 'consents'] as const,
  accessLog: (patientId: Id) => ['patient', patientId, 'access-log'] as const,
  /** Clinician workspace data sits under ['clinic', id]. */
  roster: (clinicianId: Id) => ['clinic', clinicianId, 'roster'] as const,
  chart: (clinicianId: Id, patientId: Id) => ['clinic', clinicianId, 'chart', patientId] as const,
  schedule: (clinicianId: Id, date: IsoDate) => ['clinic', clinicianId, 'schedule', date] as const,
  inbox: (clinicianId: Id) => ['clinic', clinicianId, 'inbox'] as const,
  requests: (clinicianId: Id) => ['clinic', clinicianId, 'requests'] as const,
  clinic: (clinicianId: Id) => ['clinic', clinicianId] as const,
};

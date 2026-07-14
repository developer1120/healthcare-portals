/**
 * Mendwell domain model. Dates are ISO 8601 strings so records survive JSON
 * round trips through the mock API; money is integer cents.
 */

export type Id = string;
/** Full timestamp, e.g. "2026-10-15T10:30:00.000Z". */
export type IsoDateTime = string;
/** Calendar date without time, e.g. "1988-04-17". */
export type IsoDate = string;

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ── People ──────────────────────────────────────────────────────────────────

export type Sex = 'female' | 'male' | 'intersex' | 'unknown';

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postcode: string;
}

export interface Patient {
  id: Id;
  /** Medical record number shown on documents and to clinicians. */
  mrn: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  pronouns?: string;
  dateOfBirth: IsoDate;
  sex: Sex;
  email: string;
  phone: string;
  address: Address;
  preferredLanguage: string;
  primaryClinicianId: Id;
  careTeamIds: Id[];
}

export type ClinicianRole = 'physician' | 'nurse-practitioner' | 'nurse' | 'care-coordinator';

export interface WorkingHours {
  weekday: Weekday;
  /** "HH:mm" in the clinic's local time. */
  start: string;
  end: string;
}

export interface Clinician {
  id: Id;
  /** Display name including any title, e.g. "Dr. Maya Okafor". */
  name: string;
  role: ClinicianRole;
  credentials: string;
  specialty: Specialty;
  clinic: string;
  languages: string[];
  acceptingNewPatients: boolean;
  offersVideo: boolean;
  bio: string;
  workingHours: WorkingHours[];
  /** Length of a standard visit slot. */
  slotMinutes: number;
}

export type Specialty =
  | 'primary-care'
  | 'cardiology'
  | 'dermatology'
  | 'endocrinology'
  | 'neurology'
  | 'nursing'
  | 'care-coordination';

// ── Appointments ────────────────────────────────────────────────────────────

export type VisitMode = 'in-person' | 'video';
export type AppointmentStatus = 'booked' | 'checked-in' | 'completed' | 'cancelled' | 'no-show';

export interface Appointment {
  id: Id;
  patientId: Id;
  clinicianId: Id;
  start: IsoDateTime;
  durationMinutes: number;
  mode: VisitMode;
  status: AppointmentStatus;
  reason: string;
  location: string;
  createdAt: IsoDateTime;
  cancelledAt?: IsoDateTime;
  cancellationReason?: string;
  /** Cancelled inside the 24-hour window, which carries a fee. */
  lateCancellation?: boolean;
  /** How many times the patient has moved this visit. */
  rescheduleCount?: number;
  /** The start time before the most recent move. */
  rescheduledFrom?: IsoDateTime;
  /** Video visits only: the patient's pre-visit check. */
  precheck?: Precheck;
  /** When the patient entered the waiting room. */
  checkedInAt?: IsoDateTime;
}

export interface Precheck {
  completedAt: IsoDateTime;
  /** Where to call if the video drops. */
  callbackPhone: string;
  /** Anything new since booking, for the clinician. */
  notes?: string;
  /** Whether the camera and microphone test passed. */
  devicesOk: boolean;
  consentAt: IsoDateTime;
}

// ── Messages ────────────────────────────────────────────────────────────────

export type ThreadCategory = 'clinical' | 'results' | 'refill' | 'billing' | 'general';

export interface Attachment {
  id: Id;
  name: string;
  sizeBytes: number;
  mimeType: string;
}

export interface Message {
  id: Id;
  threadId: Id;
  /** A patient id or a clinician id. */
  authorId: Id;
  body: string;
  sentAt: IsoDateTime;
  attachments: Attachment[];
}

export interface MessageThread {
  id: Id;
  patientId: Id;
  subject: string;
  category: ThreadCategory;
  /** Clinician the thread is routed to; others on the care team can see it. */
  assigneeId: Id;
  messages: Message[];
  /** Last time the patient opened the thread. Messages after this are unread. */
  patientReadAt?: IsoDateTime;
  clinicianReadAt?: IsoDateTime;
  /** The care team marked the patient's latest messages as needing no reply. A new patient message reopens it. */
  closedAt?: IsoDateTime;
  archived: boolean;
}

// ── Lab results ─────────────────────────────────────────────────────────────

export interface LabObservation {
  /** LOINC code where one applies. */
  code: string;
  name: string;
  value: number;
  unit: string;
  refLow?: number;
  refHigh?: number;
  /** Values beyond these are critical and need prompt clinical attention. */
  criticalLow?: number;
  criticalHigh?: number;
}

export type LabPanelStatus = 'pending' | 'final' | 'reviewed';

export interface LabPanel {
  id: Id;
  patientId: Id;
  name: string;
  orderedById: Id;
  collectedAt: IsoDateTime;
  resultedAt?: IsoDateTime;
  status: LabPanelStatus;
  observations: LabObservation[];
  /** Plain-language note from the clinician once reviewed. */
  clinicianNote?: string;
  reviewedAt?: IsoDateTime;
  /**
   * When the patient first saw the result. Results are released as soon as
   * they're ready, so this can come before the clinician's review.
   */
  patientViewedAt?: IsoDateTime;
}

// ── Medications ─────────────────────────────────────────────────────────────

export type MedicationStatus = 'active' | 'paused' | 'stopped';

export interface Medication {
  id: Id;
  patientId: Id;
  name: string;
  strength: string;
  form: 'tablet' | 'capsule' | 'inhaler' | 'injection' | 'cream' | 'liquid';
  /** Directions as written on the label. */
  instructions: string;
  /** Times of day to take a dose, "HH:mm". Empty for as-needed medicines. */
  doseTimes: string[];
  asNeeded: boolean;
  prescriberId: Id;
  startDate: IsoDate;
  endDate?: IsoDate;
  status: MedicationStatus;
  refillsRemaining: number;
  daysSupply: number;
  lastFilledAt: IsoDateTime;
  pharmacy: string;
}

export type RefillStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

export interface RefillRequest {
  id: Id;
  medicationId: Id;
  patientId: Id;
  requestedAt: IsoDateTime;
  status: RefillStatus;
  patientNote?: string;
  /** Where the patient wants it filled. */
  pharmacy?: string;
  decidedAt?: IsoDateTime;
  decidedById?: Id;
  decisionNote?: string;
}

export interface DoseLog {
  id: Id;
  medicationId: Id;
  /** The scheduled time this entry is for. */
  scheduledFor: IsoDateTime;
  takenAt?: IsoDateTime;
  skipped: boolean;
}

// ── Vitals ──────────────────────────────────────────────────────────────────

export type VitalSource = 'home' | 'clinic' | 'device';

interface VitalBase {
  id: Id;
  patientId: Id;
  takenAt: IsoDateTime;
  source: VitalSource;
  note?: string;
}

export interface BloodPressureReading extends VitalBase {
  kind: 'blood-pressure';
  systolic: number;
  diastolic: number;
}

export interface HeartRateReading extends VitalBase {
  kind: 'heart-rate';
  bpm: number;
}

export interface GlucoseReading extends VitalBase {
  kind: 'glucose';
  /** Stored in mg/dL. */
  mgPerDl: number;
  context: 'fasting' | 'before-meal' | 'after-meal' | 'random';
}

export interface WeightReading extends VitalBase {
  kind: 'weight';
  /** Stored in kilograms. */
  kg: number;
}

export type VitalReading = BloodPressureReading | HeartRateReading | GlucoseReading | WeightReading;
export type VitalKind = VitalReading['kind'];

// ── Health record ───────────────────────────────────────────────────────────

export type Severity = 'mild' | 'moderate' | 'severe';

export interface Allergy {
  id: Id;
  patientId: Id;
  substance: string;
  reaction: string;
  severity: Severity;
  recordedAt: IsoDate;
  /** Patients can add allergies; a clinician confirms them at the next visit. */
  reportedBy?: 'patient' | 'clinician';
  verified?: boolean;
}

export interface Condition {
  id: Id;
  patientId: Id;
  name: string;
  /** ICD-10 code. */
  code: string;
  status: 'active' | 'resolved';
  onset: IsoDate;
  resolvedOn?: IsoDate;
}

export interface Immunization {
  id: Id;
  patientId: Id;
  vaccine: string;
  dose?: string;
  givenOn: IsoDate;
  site?: string;
  /** When the next dose is due, if any. */
  nextDueOn?: IsoDate;
}

export type DocumentKind = 'visit-summary' | 'referral' | 'imaging' | 'letter';

export interface ClinicalDocument {
  id: Id;
  patientId: Id;
  appointmentId?: Id;
  kind: DocumentKind;
  title: string;
  authorId: Id;
  createdAt: IsoDateTime;
  sections: { heading: string; body: string }[];
}

// ── Billing and insurance ───────────────────────────────────────────────────

export interface StatementLine {
  id: Id;
  description: string;
  serviceDate: IsoDate;
  chargeCents: number;
  insurancePaidCents: number;
  adjustmentCents: number;
}

export interface Payment {
  id: Id;
  paidAt: IsoDateTime;
  amountCents: number;
  method: 'card' | 'bank' | 'plan-instalment';
  /** The saved method used, when paid through the portal. */
  methodId?: Id;
}

/** A card or bank account the patient saved with the billing office. Only the last digits are kept. */
export interface PaymentMethod {
  id: Id;
  patientId: Id;
  kind: 'card' | 'bank';
  /** "Visa", "Checking". */
  label: string;
  last4: string;
}

export interface PaymentPlan {
  id: Id;
  patientId: Id;
  statementId: Id;
  totalCents: number;
  months: number;
  /** The regular instalment; the last one absorbs any rounding. */
  monthlyCents: number;
  methodId: Id;
  createdAt: IsoDateTime;
  status: 'active' | 'completed' | 'cancelled';
}

export interface Statement {
  id: Id;
  patientId: Id;
  issuedAt: IsoDate;
  dueOn: IsoDate;
  lines: StatementLine[];
  payments: Payment[];
}

export interface InsuranceCoverage {
  id: Id;
  patientId: Id;
  payer: string;
  plan: string;
  memberId: string;
  groupNumber: string;
  priority: 'primary' | 'secondary';
  copayCents: Partial<Record<'primary-care' | 'specialist' | 'video', number>>;
  deductibleCents: number;
  deductibleMetCents: number;
  outOfPocketMaxCents: number;
  outOfPocketMetCents: number;
  /** Share of costs the patient pays after the deductible, 0–1. */
  coinsurance: number;
  validFrom: IsoDate;
  validTo: IsoDate;
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export type TaskKind = 'form' | 'log-vitals' | 'refill' | 'pre-check' | 'payment' | 'read-result';

/** Something the patient needs to do, shown on the dashboard and in the care panel. */
export interface PatientTask {
  id: Id;
  patientId: Id;
  kind: TaskKind;
  title: string;
  dueAt?: IsoDateTime;
  completedAt?: IsoDateTime;
  /** In-app path that completes the task. */
  href: string;
  /** The record the task is about, e.g. the medication to refill. */
  relatedId?: Id;
}

// ── Notifications and reminders ─────────────────────────────────────────────

export type NotificationKind =
  | 'message'
  | 'result'
  | 'result-reviewed'
  | 'refill'
  | 'appointment'
  | 'check-in'
  | 'dose'
  | 'billing'
  | 'immunization';

/** How and when the patient wants reminders. Messages and results always notify. */
export interface ReminderPrefs {
  patientId: Id;
  appointmentLeadHours: 2 | 24 | 48;
  medicationReminders: boolean;
  billingReminders: boolean;
  /** Also send to the email and phone on file (simulated in the demo). */
  email: boolean;
  sms: boolean;
}

/** What the patient has read or cleared. Notifications themselves are worked out from their records. */
export interface NotificationState {
  patientId: Id;
  readIds: string[];
  /** "Mark all as read": anything that happened before this counts as read. */
  readAllBefore?: IsoDateTime;
  dismissedIds: string[];
}

// ── Profile, caregivers and privacy ─────────────────────────────────────────

/** Parts of the portal a caregiver can see or act on. */
export type CaregiverScope = 'appointments' | 'messages' | 'results' | 'medications' | 'billing';

/** Someone the patient lets into their portal, e.g. a parent or adult child. */
export interface CaregiverGrant {
  id: Id;
  patientId: Id;
  name: string;
  email: string;
  relationship: string;
  scopes: CaregiverScope[];
  status: 'invited' | 'active' | 'revoked';
  invitedAt: IsoDateTime;
  acceptedAt?: IsoDateTime;
  revokedAt?: IsoDateTime;
  /** Access ends after this day, e.g. for a short stay. */
  expiresOn?: IsoDate;
}

export type ConsentKind = 'records-exchange' | 'research' | 'surveys';

export interface Consent {
  patientId: Id;
  kind: ConsentKind;
  granted: boolean;
  updatedAt: IsoDateTime;
}

export type AccessAction = 'viewed-chart' | 'reviewed-results' | 'replied-message' | 'updated-billing';

/** Who opened or changed the patient's record, for the patient's own access log. */
export interface AccessLogEntry {
  id: Id;
  patientId: Id;
  actorId: Id;
  action: AccessAction;
  at: IsoDateTime;
}

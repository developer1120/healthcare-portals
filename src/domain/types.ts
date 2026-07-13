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

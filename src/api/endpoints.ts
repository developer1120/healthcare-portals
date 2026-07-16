import { addMinutes, isSameDay } from 'date-fns';
import { MARK_EARLY_MINUTES, canMarkDose } from '@/domain/adherence';
import { ALLERGY_TEXT_MAX, hasAllergy } from '@/domain/healthRecord';
import { endOf, isActive } from '@/domain/appointments';
import { LATE_CANCEL_FEE_CENTS, MAX_RESCHEDULES, changePolicy } from '@/domain/appointmentPolicy';
import { availability, canBookWith, isSlotAvailable } from '@/domain/availability';
import {
  PRECHECK_WINDOW_DAYS,
  WAITING_ROOM_OPENS_MINUTES,
  normalisePhone,
  telehealthStage,
} from '@/domain/telehealth';
import { MIN_PAYMENT_CENTS, planOptions, statementStatus, statementTotals } from '@/domain/billing';
import type { PatientChart } from '@/domain/chart';
import { allScopes, consentKinds, contactProblems, inviteProblems, normaliseContact } from '@/domain/profile';
import type { CaregiverInvite, ContactUpdate } from '@/domain/profile';
import { LEAD_HOUR_OPTIONS, buildNotifications, defaultReminderPrefs, withState } from '@/domain/notifications';
import type { PatientSnapshot } from '@/domain/risk';
import { applyVisitAction, visitActions } from '@/domain/schedule';
import type { DaySchedule, VisitAction } from '@/domain/schedule';
import type { InboxItem } from '@/domain/triage';
import { canPrescribe, refillDecisionProblem, signOffProblem } from '@/domain/requests';
import type { RefillDecision, RequestQueues, SignOff } from '@/domain/requests';
import { isBookable } from '@/domain/clinicians';
import { MAX_ATTACHMENTS, attachmentProblem } from '@/domain/attachments';
import type { AttachmentInput } from '@/domain/attachments';
import { isNewResult } from '@/domain/labs';
import { REFILL_NOTE_MAX, refillEligibility } from '@/domain/medications';
import { canRouteTo } from '@/domain/messageRouting';
import { readingProblems } from '@/domain/vitalEntry';
import type { NewReading } from '@/domain/vitalEntry';
import { MESSAGE_MAX, SUBJECT_MAX } from '@/domain/messages';
import type {
  AccessAction,
  Allergy,
  Appointment,
  BloodPressureReading,
  CaregiverGrant,
  CaregiverScope,
  Consent,
  ConsentKind,
  HeartRateReading,
  DoseLog,
  Id,
  IsoDate,
  IsoDateTime,
  Message,
  MessageThread,
  NotificationState,
  Patient,
  Payment,
  PaymentPlan,
  PatientTask,
  RefillRequest,
  ReminderPrefs,
  ThreadCategory,
  VisitMode,
  VitalKind,
  VitalReading,
} from '@/domain/types';
import { atTime, compareAsc, compareDesc, toDate, toIsoDate } from '@/lib/dates';
import { respond } from './client';
import type { RespondOptions } from './client';
import { ApiError, notFound } from './errors';
import { getDb, writeDb } from './mockDb';
import type { SeedData } from '@/data/seed';

type Options = RespondOptions;

export interface CancellationRequest {
  patientId: Id;
  appointmentId: Id;
  reason: string;
  /** Required when cancelling inside 24 hours. */
  acceptLateFee?: boolean;
}

export interface PrecheckRequest {
  patientId: Id;
  appointmentId: Id;
  callbackPhone: string;
  notes?: string;
  devicesOk: boolean;
  consent: boolean;
}

export interface RescheduleRequest {
  patientId: Id;
  appointmentId: Id;
  start: IsoDateTime;
  mode: VisitMode;
}

/** The patient's own appointment, or a 404 (another patient's visit looks the same as a missing one). */
function ownAppointment(appointments: Appointment[], { patientId, appointmentId }: { patientId: Id; appointmentId: Id }) {
  const appointment = appointments.find((a) => a.id === appointmentId && a.patientId === patientId);
  if (!appointment) throw notFound('That appointment');
  return appointment;
}

export interface ReplyRequest {
  patientId: Id;
  threadId: Id;
  body: string;
  attachments?: AttachmentInput[];
}

export interface NewThreadRequest {
  patientId: Id;
  category: ThreadCategory;
  assigneeId: Id;
  subject: string;
  body: string;
  attachments?: AttachmentInput[];
}

/** Validates and builds a patient message. Only file details are kept; the mock has no file storage. */
function newMessage(threadId: Id, authorId: Id, rawBody: string, files: AttachmentInput[], sentAt: string): Message {
  const body = rawBody.trim();
  if (!body) throw new ApiError('Write a message before sending.', { status: 400, code: 'validation' });
  if (body.length > MESSAGE_MAX) {
    throw new ApiError(`Messages can be up to ${MESSAGE_MAX} characters.`, { status: 400, code: 'validation' });
  }
  if (files.length > MAX_ATTACHMENTS) {
    throw new ApiError(`You can attach up to ${MAX_ATTACHMENTS} files.`, { status: 400, code: 'validation' });
  }
  for (const file of files) {
    const problem = attachmentProblem(file);
    if (problem) throw new ApiError(problem, { status: 400, code: 'validation' });
  }
  return {
    id: `msg-${crypto.randomUUID().slice(0, 8)}`,
    threadId,
    authorId,
    body,
    sentAt,
    attachments: files.map((file) => ({
      id: `att-${crypto.randomUUID().slice(0, 8)}`,
      name: file.name,
      sizeBytes: file.sizeBytes,
      mimeType: file.mimeType,
    })),
  };
}

export interface PaymentRequest {
  patientId: Id;
  statementId: Id;
  amountCents: number;
  methodId: Id;
}

export interface PlanRequest {
  patientId: Id;
  statementId: Id;
  months: number;
  methodId: Id;
  /** The patient agreed to automatic monthly charges. */
  agreed: boolean;
}

function ownStatementAndMethod(db: SeedData, request: { patientId: Id; statementId: Id; methodId: Id }) {
  const statement = db.statements.find((s) => s.id === request.statementId && s.patientId === request.patientId);
  if (!statement) throw notFound('That statement');
  const method = db.paymentMethods.find((m) => m.id === request.methodId && m.patientId === request.patientId);
  if (!method) throw new ApiError('Choose one of your saved payment methods.', { status: 400, code: 'validation' });
  return { statement, method };
}

/**
 * Completes plans whose statement is paid off, and ticks off the payment task
 * once nothing is left to arrange: every statement is paid or on a plan.
 */
function settleBilling(db: SeedData, patientId: Id): void {
  const plans = db.paymentPlans.filter((p) => p.patientId === patientId);
  for (const plan of plans) {
    const statement = db.statements.find((s) => s.id === plan.statementId);
    if (plan.status === 'active' && statement && statementTotals(statement).balance === 0) plan.status = 'completed';
  }
  const open = db.statements.some((s) => {
    if (s.patientId !== patientId) return false;
    const status = statementStatus(s, plans);
    return status === 'due' || status === 'overdue';
  });
  if (open) return;
  const now = new Date().toISOString();
  for (const task of db.tasks) {
    if (task.patientId === patientId && task.kind === 'payment' && !task.completedAt) task.completedAt = now;
  }
}

function ownThread(threads: MessageThread[], patientId: Id, threadId: Id): MessageThread {
  const thread = threads.find((t) => t.id === threadId && t.patientId === patientId);
  if (!thread) throw notFound('That conversation');
  return thread;
}

export interface DoseRecordRequest {
  patientId: Id;
  medicationId: Id;
  scheduledFor: IsoDateTime;
  action: 'taken' | 'skipped' | 'clear';
}

export interface RefillRequestInput {
  patientId: Id;
  medicationId: Id;
  pharmacy?: string;
  note?: string;
}

export interface BookingRequest {
  patientId: Id;
  clinicianId: Id;
  start: IsoDateTime;
  mode: VisitMode;
  reason: string;
}

/**
 * Mock REST endpoints, grouped by resource. Lists come back in the order the
 * UI shows them, as a real API would sort server-side.
 */
export const api = {
  patients: {
    get: (patientId: Id, options?: Options) =>
      respond(() => {
        const patient = getDb().patients.find((p) => p.id === patientId);
        if (!patient) throw notFound('That patient');
        return patient;
      }, options),

    /** Saves the contact details patients manage themselves. */
    updateContact: (patientId: Id, update: ContactUpdate, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const patient = db.patients.find((p) => p.id === patientId);
            if (!patient) throw notFound('That patient');
            const problem = Object.values(contactProblems(update))[0];
            if (problem) throw new ApiError(problem, { status: 400, code: 'validation' });
            Object.assign(patient, normaliseContact(update));
            return patient;
          }),
        options,
      ),
  },

  caregivers: {
    /** Newest first, including past ones so the patient can see the history. */
    list: (patientId: Id, options?: Options) =>
      respond(
        () =>
          getDb()
            .caregivers.filter((g) => g.patientId === patientId)
            .sort((a, b) => compareDesc(a.invitedAt, b.invitedAt)),
        options,
      ),

    /** Sends an invitation. They get access once they accept it from the email. */
    invite: (patientId: Id, invite: CaregiverInvite, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const patient = db.patients.find((p) => p.id === patientId);
            if (!patient) throw notFound('That patient');
            const existing = db.caregivers.filter((g) => g.patientId === patientId);
            const problem = Object.values(inviteProblems(invite, { existing, patientEmail: patient.email }))[0];
            if (problem) throw new ApiError(problem, { status: 400, code: 'validation' });
            const grant: CaregiverGrant = {
              id: `cg-${crypto.randomUUID().slice(0, 8)}`,
              patientId,
              name: invite.name.trim(),
              email: invite.email.trim().toLowerCase(),
              relationship: invite.relationship.trim(),
              scopes: allScopes.filter((s) => invite.scopes.includes(s)),
              status: 'invited',
              invitedAt: new Date().toISOString(),
              expiresOn: invite.expiresOn || undefined,
            };
            db.caregivers.push(grant);
            return grant;
          }),
        options,
      ),

    updateScopes: (patientId: Id, grantId: Id, scopes: CaregiverScope[], options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const grant = ownGrant(db, patientId, grantId);
            if (scopes.length === 0) {
              throw new ApiError('Choose at least one thing they can see, or remove their access.', {
                status: 400,
                code: 'validation',
              });
            }
            grant.scopes = allScopes.filter((s) => scopes.includes(s));
            return grant;
          }),
        options,
      ),

    /** Ends access straight away, or withdraws an invitation. */
    revoke: (patientId: Id, grantId: Id, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const grant = ownGrant(db, patientId, grantId);
            if (grant.status !== 'revoked') {
              grant.status = 'revoked';
              grant.revokedAt = new Date().toISOString();
            }
            return grant;
          }),
        options,
      ),
  },

  privacy: {
    /** Every consent, in display order. Anything never answered counts as not given. */
    consents: (patientId: Id, options?: Options) =>
      respond(
        () =>
          consentKinds.map(
            (kind): Consent =>
              getDb().consents.find((c) => c.patientId === patientId && c.kind === kind) ?? {
                patientId,
                kind,
                granted: false,
                updatedAt: '',
              },
          ),
        options,
      ),

    setConsent: (patientId: Id, kind: ConsentKind, granted: boolean, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            if (!db.patients.some((p) => p.id === patientId)) throw notFound('That patient');
            if (!consentKinds.includes(kind)) throw new ApiError('Unknown consent.', { status: 400, code: 'validation' });
            const consent: Consent = { patientId, kind, granted, updatedAt: new Date().toISOString() };
            db.consents = [...db.consents.filter((c) => !(c.patientId === patientId && c.kind === kind)), consent];
            return consent;
          }),
        options,
      ),

    /** Who opened or changed the record, newest first. */
    accessLog: (patientId: Id, options?: Options) =>
      respond(
        () =>
          getDb()
            .accessLog.filter((entry) => entry.patientId === patientId)
            .sort((a, b) => compareDesc(a.at, b.at)),
        options,
      ),
  },

  clinicians: {
    list: (options?: Options) => respond(() => getDb().clinicians, options),

    /** The patient's care team, primary clinician first. */
    careTeam: (patientId: Id, options?: Options) =>
      respond(() => {
        const db = getDb();
        const patient = db.patients.find((p) => p.id === patientId);
        if (!patient) throw notFound('That patient');
        return patient.careTeamIds
          .map((id) => db.clinicians.find((c) => c.id === id)!)
          .sort((a, b) => Number(b.id === patient.primaryClinicianId) - Number(a.id === patient.primaryClinicianId));
      }, options),
  },

  appointments: {
    list: (patientId: Id, options?: Options) =>
      respond(
        () => getDb().appointments.filter((a) => a.patientId === patientId).sort((a, b) => compareAsc(a.start, b.start)),
        options,
      ),

    /**
     * Books a visit after re-checking everything the booking page showed, since
     * the slot may have gone or the rules changed while the patient was choosing.
     */
    book: (request: BookingRequest, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const now = new Date();
            const patient = db.patients.find((p) => p.id === request.patientId);
            if (!patient) throw notFound('That patient');
            const clinician = db.clinicians.find((c) => c.id === request.clinicianId);
            if (!clinician || !isBookable(clinician)) throw notFound('That clinician');

            if (!canBookWith(clinician, patient)) {
              throw new ApiError(`${clinician.name} isn’t taking new patients right now.`, {
                status: 403,
                code: 'forbidden',
              });
            }
            if (request.mode === 'video' && !clinician.offersVideo) {
              throw new ApiError(`${clinician.name} only sees patients in person.`, {
                status: 400,
                code: 'validation',
              });
            }
            const reason = request.reason.trim();
            if (reason.length < 3) {
              throw new ApiError('Add a short reason for the visit.', { status: 400, code: 'validation' });
            }

            const start = toDate(request.start);
            if (!isSlotAvailable(clinician, db.appointments, start, now)) {
              throw new ApiError('That time was just taken. Pick another time.', { status: 409, code: 'conflict' });
            }
            const end = addMinutes(start, clinician.slotMinutes);
            const clash = db.appointments.some(
              (a) => a.patientId === patient.id && isActive(a) && toDate(a.start) < end && start < endOf(a),
            );
            if (clash) {
              throw new ApiError('You already have a visit at that time.', { status: 409, code: 'conflict' });
            }

            const appointment: Appointment = {
              id: `apt-${crypto.randomUUID().slice(0, 8)}`,
              patientId: patient.id,
              clinicianId: clinician.id,
              start: start.toISOString(),
              durationMinutes: clinician.slotMinutes,
              mode: request.mode,
              status: 'booked',
              reason,
              location: request.mode === 'video' ? 'Video visit' : clinician.clinic,
              createdAt: now.toISOString(),
            };
            db.appointments.push(appointment);
            // Booking someone new brings them onto the care team.
            if (!patient.careTeamIds.includes(clinician.id)) patient.careTeamIds.push(clinician.id);
            return appointment;
          }),
        options,
      ),

    /** Cancels under the 24-hour policy. A late cancellation needs the fee accepted and adds it to the bill. */
    cancel: (request: CancellationRequest, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const now = new Date();
            const appointment = ownAppointment(db.appointments, request);
            const policy = changePolicy(appointment, now);
            if (!policy.canCancel) {
              throw new ApiError('This visit can no longer be cancelled online.', { status: 409, code: 'conflict' });
            }
            if (policy.lateCancellation && !request.acceptLateFee) {
              throw new ApiError('Confirm the late cancellation fee to cancel within 24 hours.', {
                status: 400,
                code: 'validation',
              });
            }

            appointment.status = 'cancelled';
            appointment.cancelledAt = now.toISOString();
            appointment.cancellationReason = request.reason.trim() || 'No reason given';
            appointment.lateCancellation = policy.lateCancellation;

            if (policy.lateCancellation) {
              const statement = db.statements
                .filter((s) => s.patientId === request.patientId)
                .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0];
              statement?.lines.push({
                id: `stl-late-${appointment.id}`,
                description: 'Late cancellation fee',
                serviceDate: appointment.start.slice(0, 10),
                chargeCents: LATE_CANCEL_FEE_CENTS,
                insurancePaidCents: 0,
                adjustmentCents: 0,
              });
            }
            return appointment;
          }),
        options,
      ),

    /**
     * Saves the video visit pre-check. Requires telehealth consent and a callback
     * number, and ticks off the matching "pre-check" task.
     */
    precheck: (request: PrecheckRequest, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const now = new Date();
            const appointment = ownAppointment(db.appointments, request);
            const stage = telehealthStage(appointment, now);
            if (stage === 'not-video') {
              throw new ApiError('Pre-check is only for video visits.', { status: 400, code: 'validation' });
            }
            if (stage === 'too-early') {
              throw new ApiError(`Pre-check opens ${PRECHECK_WINDOW_DAYS} days before your visit.`, {
                status: 409,
                code: 'conflict',
              });
            }
            if (stage !== 'precheck' && stage !== 'waiting-soon' && stage !== 'waiting-open') {
              throw new ApiError('This visit can no longer be pre-checked.', { status: 409, code: 'conflict' });
            }
            if (!request.consent) {
              throw new ApiError('Consent to a video visit is needed to continue.', { status: 400, code: 'validation' });
            }
            const callbackPhone = normalisePhone(request.callbackPhone);
            if (!callbackPhone) {
              throw new ApiError('Enter a 10-digit phone number.', { status: 400, code: 'validation' });
            }

            const nowIso = now.toISOString();
            appointment.precheck = {
              completedAt: nowIso,
              callbackPhone,
              notes: request.notes?.trim() || undefined,
              devicesOk: request.devicesOk,
              consentAt: nowIso,
            };
            for (const task of db.tasks) {
              if (task.kind === 'pre-check' && task.href.includes(appointment.id) && !task.completedAt) {
                task.completedAt = nowIso;
              }
            }
            return appointment;
          }),
        options,
      ),

    /** Puts the patient in the video waiting room, from 15 minutes before the start. */
    checkIn: (request: { patientId: Id; appointmentId: Id }, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const now = new Date();
            const appointment = ownAppointment(db.appointments, request);
            const stage = telehealthStage(appointment, now);
            if (stage === 'checked-in') return appointment;
            if (stage === 'precheck') {
              throw new ApiError('Finish your pre-check first.', { status: 409, code: 'conflict' });
            }
            if (stage !== 'waiting-open') {
              throw new ApiError(
                `The waiting room opens ${WAITING_ROOM_OPENS_MINUTES} minutes before your visit.`,
                { status: 409, code: 'conflict' },
              );
            }
            appointment.status = 'checked-in';
            appointment.checkedInAt = now.toISOString();
            return appointment;
          }),
        options,
      ),

    /** Moves a visit to another free slot with the same clinician, keeping its id. */
    reschedule: (request: RescheduleRequest, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const now = new Date();
            const appointment = ownAppointment(db.appointments, request);
            const policy = changePolicy(appointment, now);
            if (!policy.canReschedule) {
              const message =
                policy.rescheduleBlock === 'limit-reached'
                  ? `This visit has been moved ${MAX_RESCHEDULES} times. Call the clinic to change it again.`
                  : 'This visit can no longer be moved online. Call the clinic to change it.';
              throw new ApiError(message, { status: 409, code: 'conflict' });
            }
            const clinician = db.clinicians.find((c) => c.id === appointment.clinicianId)!;
            if (request.mode === 'video' && !clinician.offersVideo) {
              throw new ApiError(`${clinician.name} only sees patients in person.`, { status: 400, code: 'validation' });
            }

            // The visit's own time doesn't count as taken.
            const others = db.appointments.filter((a) => a.id !== appointment.id);
            const start = toDate(request.start);
            if (!isSlotAvailable(clinician, others, start, now)) {
              throw new ApiError('That time was just taken. Pick another time.', { status: 409, code: 'conflict' });
            }
            const end = addMinutes(start, appointment.durationMinutes);
            const clash = others.some(
              (a) => a.patientId === appointment.patientId && isActive(a) && toDate(a.start) < end && start < endOf(a),
            );
            if (clash) {
              throw new ApiError('You already have a visit at that time.', { status: 409, code: 'conflict' });
            }

            appointment.rescheduledFrom = appointment.start;
            appointment.start = start.toISOString();
            appointment.mode = request.mode;
            appointment.location = request.mode === 'video' ? 'Video visit' : clinician.clinic;
            appointment.rescheduleCount = (appointment.rescheduleCount ?? 0) + 1;
            return appointment;
          }),
        options,
      ),
  },

  telehealth: {
    /**
     * Times a small round trip to the video service, for the pre-check connection
     * test. A ping is far lighter than a data request, so it gets its own latency.
     */
    connectionCheck: async (options?: Options) => {
      const started = performance.now();
      await respond(() => ({ ok: true }), { ...options, kind: 'ping' });
      return { roundTripMs: Math.round(performance.now() - started) };
    },
  },

  availability: {
    /** Free slots per day for the booking window. Other patients' visits are only ever seen as busy time. */
    list: (clinicianId: Id, options?: Options) =>
      respond(() => {
        const db = getDb();
        const clinician = db.clinicians.find((c) => c.id === clinicianId);
        if (!clinician || !isBookable(clinician)) throw notFound('That clinician');
        return availability(clinician, db.appointments, new Date());
      }, options),
  },

  threads: {
    /** Newest activity first. */
    list: (patientId: Id, options?: Options) =>
      respond(
        () =>
          getDb()
            .threads.filter((t) => t.patientId === patientId)
            .sort((a, b) => compareDesc(a.messages.at(-1)!.sentAt, b.messages.at(-1)!.sentAt)),
        options,
      ),

    markRead: (patientId: Id, threadId: Id, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const thread = ownThread(db.threads, patientId, threadId);
            thread.patientReadAt = new Date().toISOString();
            return thread;
          }),
        options,
      ),

    /** Adds the patient's reply. Replying to an archived thread brings it back to the inbox. */
    reply: (request: ReplyRequest, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const thread = ownThread(db.threads, request.patientId, request.threadId);
            const now = new Date().toISOString();
            thread.messages.push(newMessage(thread.id, request.patientId, request.body, request.attachments ?? [], now));
            thread.patientReadAt = now;
            thread.archived = false;
            return thread;
          }),
        options,
      ),

    /** Starts a conversation, routed to a recipient the topic allows. */
    create: (request: NewThreadRequest, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const patient = db.patients.find((p) => p.id === request.patientId);
            if (!patient) throw notFound('That patient');
            if (!canRouteTo(request.category, request.assigneeId, patient, db.clinicians)) {
              throw new ApiError('Choose someone from your care team to send this to.', {
                status: 400,
                code: 'validation',
              });
            }
            const subject = request.subject.trim();
            if (!subject) throw new ApiError('Add a subject.', { status: 400, code: 'validation' });
            if (subject.length > SUBJECT_MAX) {
              throw new ApiError(`Subjects can be up to ${SUBJECT_MAX} characters.`, { status: 400, code: 'validation' });
            }

            const id = `thr-${crypto.randomUUID().slice(0, 8)}`;
            const now = new Date().toISOString();
            const thread: MessageThread = {
              id,
              patientId: patient.id,
              subject,
              category: request.category,
              assigneeId: request.assigneeId,
              archived: false,
              patientReadAt: now,
              messages: [newMessage(id, patient.id, request.body, request.attachments ?? [], now)],
            };
            db.threads.push(thread);
            return thread;
          }),
        options,
      ),

    setArchived: (patientId: Id, threadId: Id, archived: boolean, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const thread = ownThread(db.threads, patientId, threadId);
            thread.archived = archived;
            return thread;
          }),
        options,
      ),
  },

  labs: {
    /** Newest collection first. */
    list: (patientId: Id, options?: Options) =>
      respond(
        () =>
          getDb()
            .labPanels.filter((p) => p.patientId === patientId)
            .sort((a, b) => compareDesc(a.collectedAt, b.collectedAt)),
        options,
      ),

    /**
     * Records that the patient has seen these results. Once nothing new is left,
     * the "review your new lab results" task ticks itself off.
     */
    markViewed: (patientId: Id, panelIds: Id[], options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const now = new Date().toISOString();
            const own = db.labPanels.filter((p) => p.patientId === patientId);
            for (const panel of own) {
              if (panelIds.includes(panel.id) && isNewResult(panel)) panel.patientViewedAt = now;
            }
            if (!own.some(isNewResult)) {
              for (const task of db.tasks) {
                if (task.patientId === patientId && task.kind === 'read-result' && !task.completedAt) task.completedAt = now;
              }
            }
            return own.filter((p) => panelIds.includes(p.id));
          }),
        options,
      ),
  },

  medications: {
    list: (patientId: Id, options?: Options) =>
      respond(() => getDb().medications.filter((m) => m.patientId === patientId), options),
  },

  doses: {
    /** Dose history for the patient's medicines. */
    list: (patientId: Id, options?: Options) =>
      respond(() => {
        const db = getDb();
        const ids = new Set(db.medications.filter((m) => m.patientId === patientId).map((m) => m.id));
        return db.doseLogs.filter((l) => ids.has(l.medicationId));
      }, options),

    /**
     * Marks a scheduled dose taken or skipped, or clears the mark. Only real
     * dose times of the patient's own scheduled medicines, and not too early.
     */
    record: (request: DoseRecordRequest, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const medication = db.medications.find(
              (m) => m.id === request.medicationId && m.patientId === request.patientId,
            );
            if (!medication) throw notFound('That medication');
            const scheduledFor = toDate(request.scheduledFor);
            const isDoseTime = medication.doseTimes.some(
              (time) => atTime(scheduledFor, 0, time).getTime() === scheduledFor.getTime(),
            );
            if (medication.asNeeded || !isDoseTime) {
              throw new ApiError('That isn’t one of this medicine’s dose times.', { status: 400, code: 'validation' });
            }
            const now = new Date();
            if (!canMarkDose(scheduledFor, now)) {
              throw new ApiError(`You can mark a dose from ${MARK_EARLY_MINUTES} minutes before it’s due.`, {
                status: 409,
                code: 'conflict',
              });
            }

            const index = db.doseLogs.findIndex(
              (l) => l.medicationId === medication.id && toDate(l.scheduledFor).getTime() === scheduledFor.getTime(),
            );
            if (request.action === 'clear') {
              if (index >= 0) db.doseLogs.splice(index, 1);
              return null;
            }
            const log: DoseLog = {
              id: index >= 0 ? db.doseLogs[index]!.id : `dose-${crypto.randomUUID().slice(0, 8)}`,
              medicationId: medication.id,
              scheduledFor: scheduledFor.toISOString(),
              skipped: request.action === 'skipped',
              takenAt: request.action === 'taken' ? now.toISOString() : undefined,
            };
            if (index >= 0) db.doseLogs[index] = log;
            else db.doseLogs.push(log);
            return log;
          }),
        options,
      ),
  },

  refills: {
    /** Newest first. */
    list: (patientId: Id, options?: Options) =>
      respond(
        () =>
          getDb()
            .refillRequests.filter((r) => r.patientId === patientId)
            .sort((a, b) => compareDesc(a.requestedAt, b.requestedAt)),
        options,
      ),

    /** Asks the prescriber for a refill, re-checking eligibility, and ticks off a matching refill task. */
    request: (request: RefillRequestInput, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const medication = db.medications.find(
              (m) => m.id === request.medicationId && m.patientId === request.patientId,
            );
            if (!medication) throw notFound('That medication');
            const own = db.refillRequests.filter((r) => r.patientId === request.patientId);
            const eligibility = refillEligibility(medication, own, new Date());
            if (!eligibility.canRequest) {
              const message =
                eligibility.reason === 'pending'
                  ? 'A refill request for this medication is already with your care team.'
                  : eligibility.reason === 'too-early'
                    ? 'It’s too early to refill this medication.'
                    : 'This medication is no longer active.';
              throw new ApiError(message, { status: 409, code: 'conflict' });
            }
            const note = request.note?.trim();
            if (note && note.length > REFILL_NOTE_MAX) {
              throw new ApiError(`Notes can be up to ${REFILL_NOTE_MAX} characters.`, { status: 400, code: 'validation' });
            }

            const now = new Date().toISOString();
            const created: RefillRequest = {
              id: `rfl-${crypto.randomUUID().slice(0, 8)}`,
              medicationId: medication.id,
              patientId: request.patientId,
              requestedAt: now,
              status: 'pending',
              pharmacy: request.pharmacy || medication.pharmacy,
              patientNote: note || undefined,
            };
            db.refillRequests.push(created);
            for (const task of db.tasks) {
              if (task.kind === 'refill' && task.relatedId === medication.id && !task.completedAt) task.completedAt = now;
            }
            return created;
          }),
        options,
      ),

    /** Withdraws a request the care team hasn't acted on yet. */
    cancel: (patientId: Id, requestId: Id, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const refill = db.refillRequests.find((r) => r.id === requestId && r.patientId === patientId);
            if (!refill) throw notFound('That refill request');
            if (refill.status !== 'pending') {
              throw new ApiError('Your care team has already answered this request.', { status: 409, code: 'conflict' });
            }
            refill.status = 'cancelled';
            refill.decidedAt = new Date().toISOString();
            return refill;
          }),
        options,
      ),
  },

  vitals: {
    /** Oldest first, ready for charting. */
    list: (patientId: Id, kind?: VitalKind, options?: Options) =>
      respond(
        () =>
          getDb()
            .vitals.filter((v) => v.patientId === patientId && (!kind || v.kind === kind))
            .sort((a, b) => compareAsc(a.takenAt, b.takenAt)),
        options,
      ),

    /** Adds a home reading after the same checks the form makes. A blood pressure taken today ticks off that task. */
    add: (patientId: Id, input: NewReading, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const now = new Date();
            const problems = readingProblems(input, now);
            if (problems.length > 0) throw new ApiError(problems[0]!, { status: 400, code: 'validation' });

            const reading = {
              ...input,
              note: input.note?.trim() || undefined,
              id: `vit-${crypto.randomUUID().slice(0, 8)}`,
              patientId,
              source: 'home',
            } as VitalReading;
            db.vitals.push(reading);

            if (reading.kind === 'blood-pressure' && isSameDay(toDate(reading.takenAt), now)) {
              for (const task of db.tasks) {
                if (task.patientId === patientId && task.kind === 'log-vitals' && !task.completedAt) {
                  task.completedAt = now.toISOString();
                }
              }
            }
            return reading;
          }),
        options,
      ),
  },

  records: {
    get: (patientId: Id, options?: Options) =>
      respond(() => {
        const db = getDb();
        return {
          allergies: db.allergies.filter((a) => a.patientId === patientId),
          conditions: db.conditions.filter((c) => c.patientId === patientId),
          immunizations: db.immunizations.filter((i) => i.patientId === patientId),
        };
      }, options),

    /** Adds a self-reported allergy, marked unconfirmed until a clinician reviews it. */
    addAllergy: (patientId: Id, input: Pick<Allergy, 'substance' | 'reaction' | 'severity'>, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const substance = input.substance.trim();
            const reaction = input.reaction.trim();
            if (!substance || !reaction) {
              throw new ApiError('Add what you’re allergic to and what happens.', { status: 400, code: 'validation' });
            }
            if (substance.length > ALLERGY_TEXT_MAX || reaction.length > ALLERGY_TEXT_MAX) {
              throw new ApiError(`Keep each answer under ${ALLERGY_TEXT_MAX} characters.`, { status: 400, code: 'validation' });
            }
            const own = db.allergies.filter((a) => a.patientId === patientId);
            if (hasAllergy(own, substance)) {
              throw new ApiError(`${substance} is already on your allergy list.`, { status: 409, code: 'conflict' });
            }
            const allergy: Allergy = {
              id: `alg-${crypto.randomUUID().slice(0, 8)}`,
              patientId,
              substance,
              reaction,
              severity: input.severity,
              recordedAt: toIsoDate(new Date()),
              reportedBy: 'patient',
              verified: false,
            };
            db.allergies.push(allergy);
            return allergy;
          }),
        options,
      ),
  },

  documents: {
    list: (patientId: Id, options?: Options) =>
      respond(
        () =>
          getDb()
            .documents.filter((d) => d.patientId === patientId)
            .sort((a, b) => compareDesc(a.createdAt, b.createdAt)),
        options,
      ),
  },

  billing: {
    statements: (patientId: Id, options?: Options) =>
      respond(
        () =>
          getDb()
            .statements.filter((s) => s.patientId === patientId)
            .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)),
        options,
      ),
    insurance: (patientId: Id, options?: Options) =>
      respond(() => getDb().insurance.filter((i) => i.patientId === patientId), options),
    methods: (patientId: Id, options?: Options) =>
      respond(() => getDb().paymentMethods.filter((m) => m.patientId === patientId), options),
    plans: (patientId: Id, options?: Options) =>
      respond(
        () =>
          getDb()
            .paymentPlans.filter((p) => p.patientId === patientId)
            .sort((a, b) => compareDesc(a.createdAt, b.createdAt)),
        options,
      ),

    /**
     * Pays part or all of a statement with a saved method. Once nothing is left
     * to pay or arrange, the "payment" task is ticked off.
     */
    pay: (request: PaymentRequest, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const { statement, method } = ownStatementAndMethod(db, request);
            const { balance } = statementTotals(statement);
            if (balance === 0) throw new ApiError('This statement is already paid.', { status: 409, code: 'conflict' });
            if (!Number.isInteger(request.amountCents) || request.amountCents < Math.min(MIN_PAYMENT_CENTS, balance)) {
              throw new ApiError('Enter an amount of at least $1.00.', { status: 400, code: 'validation' });
            }
            if (request.amountCents > balance) {
              throw new ApiError('That is more than the balance on this statement.', { status: 400, code: 'validation' });
            }

            const payment: Payment = {
              id: `pay-${crypto.randomUUID().slice(0, 8)}`,
              paidAt: new Date().toISOString(),
              amountCents: request.amountCents,
              method: method.kind,
              methodId: method.id,
            };
            statement.payments.push(payment);
            settleBilling(db, request.patientId);
            return payment;
          }),
        options,
      ),

    /**
     * Spreads a statement's balance over monthly instalments and takes the first
     * one today. Only the options `planOptions` offers are accepted.
     */
    createPlan: (request: PlanRequest, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const { statement, method } = ownStatementAndMethod(db, request);
            if (db.paymentPlans.some((p) => p.statementId === statement.id && p.status === 'active')) {
              throw new ApiError('This statement already has a payment plan.', { status: 409, code: 'conflict' });
            }
            const { balance } = statementTotals(statement);
            const option = planOptions(balance).find((o) => o.months === request.months);
            if (!option) {
              throw new ApiError('That plan isn’t available for this balance.', { status: 400, code: 'validation' });
            }
            if (!request.agreed) {
              throw new ApiError('Agree to automatic monthly payments to set up a plan.', {
                status: 400,
                code: 'validation',
              });
            }

            const now = new Date().toISOString();
            const plan: PaymentPlan = {
              id: `ppl-${crypto.randomUUID().slice(0, 8)}`,
              patientId: request.patientId,
              statementId: statement.id,
              totalCents: balance,
              months: option.months,
              monthlyCents: option.monthlyCents,
              methodId: method.id,
              createdAt: now,
              status: 'active',
            };
            db.paymentPlans.push(plan);
            statement.payments.push({
              id: `pay-${crypto.randomUUID().slice(0, 8)}`,
              paidAt: now,
              amountCents: option.monthlyCents,
              method: 'plan-instalment',
              methodId: method.id,
            });
            settleBilling(db, request.patientId);
            return plan;
          }),
        options,
      ),
  },

  notifications: {
    /** Worked out from the patient's records now, with their read and dismissed state applied. */
    list: (patientId: Id, options?: Options) =>
      respond(() => {
        const db = getDb();
        if (!db.patients.some((p) => p.id === patientId)) throw notFound('That patient');
        const own = ownRecords(patientId);
        const prefs = db.reminderPrefs.find((p) => p.patientId === patientId) ?? defaultReminderPrefs(patientId);
        const items = buildNotifications(
          {
            patientId,
            threads: own(db.threads),
            labs: own(db.labPanels),
            refills: own(db.refillRequests),
            medications: own(db.medications),
            doseLogs: db.doseLogs.filter((log) => own(db.medications).some((m) => m.id === log.medicationId)),
            appointments: own(db.appointments),
            statements: own(db.statements),
            plans: own(db.paymentPlans),
            immunizations: own(db.immunizations),
            clinicians: db.clinicians,
          },
          prefs,
        );
        return withState(items, db.notificationStates.find((s) => s.patientId === patientId));
      }, options),

    markRead: (patientId: Id, ids: string[], options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const state = notificationStateFor(db, patientId);
            state.readIds = [...new Set([...state.readIds, ...ids])];
            return state;
          }),
        options,
      ),

    markAllRead: (patientId: Id, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const state = notificationStateFor(db, patientId);
            state.readAllBefore = new Date().toISOString();
            return state;
          }),
        options,
      ),

    dismiss: (patientId: Id, id: string, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const state = notificationStateFor(db, patientId);
            if (!state.dismissedIds.includes(id)) state.dismissedIds.push(id);
            return state;
          }),
        options,
      ),
  },

  reminders: {
    get: (patientId: Id, options?: Options) =>
      respond(
        () => getDb().reminderPrefs.find((p) => p.patientId === patientId) ?? defaultReminderPrefs(patientId),
        options,
      ),

    update: (prefs: ReminderPrefs, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            if (!db.patients.some((p) => p.id === prefs.patientId)) throw notFound('That patient');
            if (!LEAD_HOUR_OPTIONS.includes(prefs.appointmentLeadHours)) {
              throw new ApiError('Choose 2, 24 or 48 hours before a visit.', { status: 400, code: 'validation' });
            }
            const clean: ReminderPrefs = {
              patientId: prefs.patientId,
              appointmentLeadHours: prefs.appointmentLeadHours,
              medicationReminders: Boolean(prefs.medicationReminders),
              billingReminders: Boolean(prefs.billingReminders),
              email: Boolean(prefs.email),
              sms: Boolean(prefs.sms),
            };
            db.reminderPrefs = [...db.reminderPrefs.filter((p) => p.patientId !== prefs.patientId), clean];
            return clean;
          }),
        options,
      ),
  },

  tasks: {
    /** Open tasks first (soonest due first), then completed ones. */
    list: (patientId: Id, options?: Options) =>
      respond(
        () =>
          getDb()
            .tasks.filter((t) => t.patientId === patientId)
            .sort(byTaskOrder),
        options,
      ),

    setCompleted: (taskId: Id, completed: boolean, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const task = db.tasks.find((t) => t.id === taskId);
            if (!task) throw notFound('That task');
            task.completedAt = completed ? new Date().toISOString() : undefined;
            return task;
          }),
        options,
      ),
  },

  clinic: {
    /**
     * A chart summary for every patient whose care team includes this
     * clinician. Clinicians only ever see their own panel.
     */
    roster: (clinicianId: Id, options?: Options) =>
      respond((): PatientSnapshot[] => {
        const db = getDb();
        if (!db.clinicians.some((c) => c.id === clinicianId)) throw notFound('That clinician');
        return db.patients.filter((p) => p.careTeamIds.includes(clinicianId)).map((p) => snapshotOf(db, p));
      }, options),

    /**
     * One patient's chart. A patient outside the clinician's care team looks
     * the same as a missing one, so the panel can't be probed by id. Opening a
     * chart is recorded in the patient's access log.
     */
    chart: (clinicianId: Id, patientId: Id, options?: Options) =>
      respond((): PatientChart => {
        const db = getDb();
        const patient = db.patients.find((p) => p.id === patientId && p.careTeamIds.includes(clinicianId));
        if (!patient) throw notFound('That patient');
        writeDb((data) => logAccess(data, patient.id, clinicianId, 'viewed-chart'));
        const own = ownRecords(patient.id);
        return {
          ...snapshotOf(db, patient),
          allergies: own(db.allergies),
          medications: own(db.medications).filter((m) => m.status !== 'stopped'),
          vitals: own(db.vitals)
            .filter((v): v is BloodPressureReading | HeartRateReading => v.kind === 'blood-pressure' || v.kind === 'heart-rate')
            .sort((a, b) => compareAsc(a.takenAt, b.takenAt)),
          immunizations: own(db.immunizations),
        };
      }, options),

    /** The clinician's visits on one calendar day (clinic local time), earliest first, with each patient's snapshot. */
    schedule: (clinicianId: Id, date: IsoDate, options?: Options) =>
      respond((): DaySchedule => {
        const db = getDb();
        const clinician = db.clinicians.find((c) => c.id === clinicianId);
        if (!clinician) throw notFound('That clinician');
        const entries = db.appointments
          .filter((a) => a.clinicianId === clinicianId && toIsoDate(toDate(a.start)) === date)
          .sort((a, b) => compareAsc(a.start, b.start))
          .map((appointment) => ({
            appointment,
            snapshot: snapshotOf(db, db.patients.find((p) => p.id === appointment.patientId)!),
          }));
        return { clinician, entries };
      }, options),

    /** Marks a visit arrived, complete, missed, or un-missed, if the clinic's rules allow it now. */
    updateVisit: (request: { clinicianId: Id; appointmentId: Id; action: VisitAction }, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const now = new Date();
            const appointment = db.appointments.find(
              (a) => a.id === request.appointmentId && a.clinicianId === request.clinicianId,
            );
            if (!appointment) throw notFound('That visit');
            if (!visitActions(appointment, now).includes(request.action)) {
              throw new ApiError('That change isn’t possible for this visit right now.', { status: 409, code: 'conflict' });
            }
            applyVisitAction(appointment, request.action, now);
            return appointment;
          }),
        options,
      ),

    /** Every conversation with the clinician's care-team patients, with each patient's snapshot for triage. */
    inbox: (clinicianId: Id, options?: Options) =>
      respond((): InboxItem[] => {
        const db = getDb();
        if (!db.clinicians.some((c) => c.id === clinicianId)) throw notFound('That clinician');
        return db.threads.flatMap((thread) => {
          const patient = db.patients.find((p) => p.id === thread.patientId);
          return patient?.careTeamIds.includes(clinicianId) ? [{ thread, snapshot: snapshotOf(db, patient) }] : [];
        });
      }, options),

    markThreadRead: (request: { clinicianId: Id; threadId: Id }, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const thread = teamThread(db, request.clinicianId, request.threadId);
            thread.clinicianReadAt = new Date().toISOString();
            return thread;
          }),
        options,
      ),

    /** Replies as the clinician. A thread the patient archived comes back to their inbox. */
    reply: (request: { clinicianId: Id; threadId: Id; body: string }, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const thread = teamThread(db, request.clinicianId, request.threadId);
            const now = new Date().toISOString();
            thread.messages.push(newMessage(thread.id, request.clinicianId, request.body, [], now));
            logAccess(db, thread.patientId, request.clinicianId, 'replied-message');
            thread.clinicianReadAt = now;
            thread.archived = false;
            return thread;
          }),
        options,
      ),

    /** Pending refill requests and unreviewed results for the clinician's care-team patients. */
    requests: (clinicianId: Id, options?: Options) =>
      respond((): RequestQueues => {
        const db = getDb();
        if (!db.clinicians.some((c) => c.id === clinicianId)) throw notFound('That clinician');
        const team = db.patients.filter((p) => p.careTeamIds.includes(clinicianId));
        const snapshots = new Map(team.map((p) => [p.id, snapshotOf(db, p)]));
        return {
          refills: db.refillRequests.flatMap((request) => {
            const snapshot = snapshots.get(request.patientId);
            const medication = db.medications.find((m) => m.id === request.medicationId);
            if (request.status !== 'pending' || !snapshot || !medication) return [];
            return [{ request, medication, snapshot, allergies: db.allergies.filter((a) => a.patientId === request.patientId) }];
          }),
          labs: db.labPanels.flatMap((panel) => {
            const snapshot = snapshots.get(panel.patientId);
            return panel.status === 'final' && snapshot ? [{ panel, snapshot }] : [];
          }),
        };
      }, options),

    /**
     * Approves or denies a pending refill. Approval renews the prescription with
     * the chosen refills and supply and sends it to the patient's pharmacy.
     */
    decideRefill: (request: { clinicianId: Id; requestId: Id } & RefillDecision, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const now = new Date().toISOString();
            const clinician = db.clinicians.find((c) => c.id === request.clinicianId);
            const refill = db.refillRequests.find((r) => r.id === request.requestId);
            const patient = refill && db.patients.find((p) => p.id === refill.patientId);
            if (!clinician || !refill || !patient?.careTeamIds.includes(clinician.id)) throw notFound('That request');
            if (!canPrescribe(clinician)) {
              throw new ApiError('Only prescribers can approve or deny refills.', { status: 403, code: 'forbidden' });
            }
            if (refill.status !== 'pending') {
              throw new ApiError('This request has already been dealt with.', { status: 409, code: 'conflict' });
            }
            const problem = refillDecisionProblem(request);
            if (problem) throw new ApiError(problem, { status: 400, code: 'validation' });

            refill.status = request.decision === 'approve' ? 'approved' : 'denied';
            refill.decidedAt = now;
            refill.decidedById = clinician.id;
            refill.decisionNote = request.note.trim() || undefined;
            if (request.decision === 'approve') {
              const medication = db.medications.find((m) => m.id === refill.medicationId)!;
              medication.refillsRemaining = request.refills!;
              medication.daysSupply = request.daysSupply!;
              medication.lastFilledAt = now;
              if (refill.pharmacy) medication.pharmacy = refill.pharmacy;
            }
            return refill;
          }),
        options,
      ),

    /** Reviews a result and releases a plain-language note to the patient. */
    signOffLab: (request: { clinicianId: Id; panelId: Id } & SignOff, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const clinician = db.clinicians.find((c) => c.id === request.clinicianId);
            const panel = db.labPanels.find((p) => p.id === request.panelId);
            const patient = panel && db.patients.find((p) => p.id === panel.patientId);
            if (!clinician || !panel || !patient?.careTeamIds.includes(clinician.id)) throw notFound('That result');
            if (!canPrescribe(clinician)) {
              throw new ApiError('Only physicians and nurse practitioners can sign off results.', {
                status: 403,
                code: 'forbidden',
              });
            }
            if (panel.status !== 'final') {
              throw new ApiError(
                panel.status === 'pending' ? 'This result isn’t back from the lab yet.' : 'This result is already signed off.',
                { status: 409, code: 'conflict' },
              );
            }
            const problem = signOffProblem(panel, request);
            if (problem) throw new ApiError(problem, { status: 400, code: 'validation' });

            panel.status = 'reviewed';
            panel.reviewedAt = new Date().toISOString();
            panel.clinicianNote = request.note.trim();
            logAccess(db, panel.patientId, request.clinicianId, 'reviewed-results');
            return panel;
          }),
        options,
      ),

    /** Clears a conversation from "needs reply" without answering, e.g. after a "thank you". */
    closeThread: (request: { clinicianId: Id; threadId: Id }, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const thread = teamThread(db, request.clinicianId, request.threadId);
            const now = new Date().toISOString();
            thread.closedAt = now;
            thread.clinicianReadAt = now;
            return thread;
          }),
        options,
      ),

    /** Hands a conversation to someone else the patient could have written to about this topic. */
    reassign: (request: { clinicianId: Id; threadId: Id; assigneeId: Id }, options?: Options) =>
      respond(
        () =>
          writeDb((db) => {
            const thread = teamThread(db, request.clinicianId, request.threadId);
            const patient = db.patients.find((p) => p.id === thread.patientId)!;
            if (!canRouteTo(thread.category, request.assigneeId, patient, db.clinicians)) {
              throw new ApiError('Choose someone on this patient’s care team who handles this topic.', {
                status: 400,
                code: 'validation',
              });
            }
            thread.assigneeId = request.assigneeId;
            return thread;
          }),
        options,
      ),
  },
};

/** A conversation with one of the clinician's care-team patients, or a 404. */
function teamThread(db: SeedData, clinicianId: Id, threadId: Id): MessageThread {
  const thread = db.threads.find((t) => t.id === threadId);
  const patient = thread && db.patients.find((p) => p.id === thread.patientId);
  if (!thread || !patient?.careTeamIds.includes(clinicianId)) throw notFound('That conversation');
  return thread;
}

function ownGrant(db: SeedData, patientId: Id, grantId: Id): CaregiverGrant {
  const grant = db.caregivers.find((g) => g.id === grantId && g.patientId === patientId);
  if (!grant) throw notFound('That caregiver');
  return grant;
}

/** Adds to the patient's access log, at most once an hour per person and action. */
function logAccess(db: SeedData, patientId: Id, actorId: Id, action: AccessAction): void {
  const now = new Date();
  const recent = db.accessLog.some(
    (e) =>
      e.patientId === patientId &&
      e.actorId === actorId &&
      e.action === action &&
      now.getTime() - toDate(e.at).getTime() < 60 * 60_000,
  );
  if (!recent) {
    db.accessLog.push({ id: `log-${crypto.randomUUID().slice(0, 8)}`, patientId, actorId, action, at: now.toISOString() });
  }
}

function notificationStateFor(db: SeedData, patientId: Id): NotificationState {
  if (!db.patients.some((p) => p.id === patientId)) throw notFound('That patient');
  let state = db.notificationStates.find((s) => s.patientId === patientId);
  if (!state) {
    state = { patientId, readIds: [], dismissedIds: [] };
    db.notificationStates.push(state);
  }
  return state;
}

function ownRecords(patientId: Id) {
  return <T extends { patientId: Id }>(records: T[]) => records.filter((r) => r.patientId === patientId);
}

/** The roster's summary of one patient's chart. */
function snapshotOf(db: SeedData, patient: Patient): PatientSnapshot {
  const own = ownRecords(patient.id);
  return {
    patient,
    conditions: own(db.conditions).filter((c) => c.status === 'active'),
    latestBloodPressure: own(db.vitals)
      .filter((v): v is BloodPressureReading => v.kind === 'blood-pressure')
      .sort((a, b) => compareDesc(a.takenAt, b.takenAt))[0],
    labs: own(db.labPanels).sort((a, b) => compareDesc(a.collectedAt, b.collectedAt)),
    appointments: own(db.appointments).sort((a, b) => compareAsc(a.start, b.start)),
    pendingRefills: own(db.refillRequests).filter((r) => r.status === 'pending'),
  };
}

export function byTaskOrder(a: PatientTask, b: PatientTask): number {
  if (Boolean(a.completedAt) !== Boolean(b.completedAt)) return a.completedAt ? 1 : -1;
  if (a.completedAt && b.completedAt) return compareDesc(a.completedAt, b.completedAt);
  // Tasks without a due date go after dated ones.
  if (!a.dueAt || !b.dueAt) return Number(!a.dueAt) - Number(!b.dueAt);
  return compareAsc(a.dueAt, b.dueAt);
}

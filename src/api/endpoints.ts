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

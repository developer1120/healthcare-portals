import { addMinutes, getDay } from 'date-fns';
import { flagObservation } from '@/domain/labs';
import { minutesUntil, parseTime, toDate } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { createRandom } from '../random';
import { PRIMARY_PATIENT_ID, createSeed } from '.';

const seed = createSeed(TEST_NOW);
const patientIds = new Set(seed.patients.map((p) => p.id));
const clinicianIds = new Set(seed.clinicians.map((c) => c.id));

describe('createRandom', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
  });

  it('keeps int() inside its bounds', () => {
    const random = createRandom(7);
    for (let i = 0; i < 500; i++) {
      const value = random.int(-3, 3);
      expect(value).toBeGreaterThanOrEqual(-3);
      expect(value).toBeLessThanOrEqual(3);
    }
  });
});

describe('seed data', () => {
  it('is deterministic for a given now', () => {
    expect(createSeed(TEST_NOW)).toEqual(seed);
  });

  it('uses unique ids within each collection', () => {
    for (const [name, records] of Object.entries(seed) as [string, Record<string, unknown>[]][]) {
      // Settings-style collections are keyed by patient instead of by id.
      if (!records.every((r) => 'id' in r)) continue;
      const ids = records.map((r) => r.id);
      expect(new Set(ids).size, name).toBe(ids.length);
    }
    const consentKeys = seed.consents.map((c) => `${c.patientId}:${c.kind}`);
    expect(new Set(consentKeys).size).toBe(consentKeys.length);
  });

  it('only references patients and clinicians that exist', () => {
    for (const patient of seed.patients) {
      expect(clinicianIds.has(patient.primaryClinicianId)).toBe(true);
      for (const id of patient.careTeamIds) expect(clinicianIds.has(id)).toBe(true);
    }
    for (const appointment of seed.appointments) {
      expect(patientIds.has(appointment.patientId)).toBe(true);
      expect(clinicianIds.has(appointment.clinicianId)).toBe(true);
    }
    for (const thread of seed.threads) {
      expect(clinicianIds.has(thread.assigneeId)).toBe(true);
      for (const message of thread.messages) {
        expect(message.threadId).toBe(thread.id);
        expect(message.authorId === thread.patientId || clinicianIds.has(message.authorId)).toBe(true);
      }
    }
    const medicationIds = new Set(seed.medications.map((m) => m.id));
    for (const request of seed.refillRequests) expect(medicationIds.has(request.medicationId)).toBe(true);
    for (const log of seed.doseLogs) expect(medicationIds.has(log.medicationId)).toBe(true);
    for (const panel of seed.labPanels) expect(clinicianIds.has(panel.orderedById)).toBe(true);
  });

  it('never double-books a clinician', () => {
    const active = seed.appointments.filter((a) => a.status !== 'cancelled');
    for (const a of active) {
      for (const b of active) {
        if (a === b || a.clinicianId !== b.clinicianId) continue;
        const aEnd = addMinutes(toDate(a.start), a.durationMinutes);
        const overlaps = toDate(a.start) < addMinutes(toDate(b.start), b.durationMinutes) && toDate(b.start) < aEnd;
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it('books visits only on days and hours the clinician works', () => {
    for (const appointment of seed.appointments) {
      const clinician = seed.clinicians.find((c) => c.id === appointment.clinicianId)!;
      const start = toDate(appointment.start);
      const hours = clinician.workingHours.find((h) => h.weekday === getDay(start));
      expect(hours, `${appointment.id} on a day off`).toBeDefined();
      const minutes = start.getHours() * 60 + start.getMinutes();
      const open = parseTime(hours!.start);
      const close = parseTime(hours!.end);
      expect(minutes).toBeGreaterThanOrEqual(open.hours * 60 + open.minutes);
      expect(minutes + appointment.durationMinutes).toBeLessThanOrEqual(close.hours * 60 + close.minutes);
    }
  });

  it('marks past visits completed (or missed, or cancelled) and future ones booked', () => {
    for (const appointment of seed.appointments) {
      if (appointment.status === 'cancelled') continue;
      const past = toDate(appointment.start) < TEST_NOW;
      expect(past ? ['completed', 'no-show'] : ['booked']).toContain(appointment.status);
    }
  });

  it('gives the primary patient an upcoming video visit with cardiology', () => {
    const next = seed.appointments
      .filter((a) => a.patientId === PRIMARY_PATIENT_ID && a.status === 'booked')
      .sort((a, b) => a.start.localeCompare(b.start))[0]!;
    expect(next).toMatchObject({ clinicianId: 'cln-okafor', mode: 'video', location: 'Video visit' });
    expect(minutesUntil(next.start, TEST_NOW)).toBeGreaterThan(24 * 60);
  });

  it('ends the home blood pressure log on yesterday’s 128/82', () => {
    const readings = seed.vitals
      .filter((v) => v.patientId === PRIMARY_PATIENT_ID && v.kind === 'blood-pressure' && v.source === 'home')
      .sort((a, b) => a.takenAt.localeCompare(b.takenAt));
    expect(readings.length).toBeGreaterThan(60);
    expect(readings.at(-1)).toMatchObject({ systolic: 128, diastolic: 82 });
    expect(readings.every((r) => toDate(r.takenAt) < TEST_NOW)).toBe(true);
  });

  it('includes results with something to flag, and one panel still pending', () => {
    const avaPanels = seed.labPanels.filter((p) => p.patientId === PRIMARY_PATIENT_ID);
    const flags = avaPanels.flatMap((p) => p.observations.map(flagObservation));
    expect(flags).toContain('high');
    expect(avaPanels.some((p) => p.status === 'pending' && p.observations.length === 0)).toBe(true);
    expect(avaPanels.filter((p) => p.name === 'Hemoglobin A1c')).toHaveLength(3);
  });

  it('includes a critical result for the clinician views', () => {
    const critical = seed.labPanels.flatMap((p) => p.observations).map(flagObservation);
    expect(critical).toContain('critical-high');
  });

  it('keeps every timestamp before now except upcoming visits and due dates', () => {
    for (const thread of seed.threads)
      for (const message of thread.messages) expect(toDate(message.sentAt) <= TEST_NOW).toBe(true);
    for (const log of seed.doseLogs) expect(toDate(log.scheduledFor) <= TEST_NOW).toBe(true);
    for (const panel of seed.labPanels) expect(toDate(panel.collectedAt) < TEST_NOW).toBe(true);
  });

  it('balances the open statement', () => {
    const open = seed.statements.find((s) => s.payments.length === 0)!;
    const owed = open.lines.reduce(
      (sum, line) => sum + line.chargeCents - line.insurancePaidCents - line.adjustmentCents,
      0,
    );
    // The preventive visit is fully covered; the two diagnostic labs are not.
    expect(owed).toBe(6_100);
  });

  it('leaves the primary patient a mix of open and done tasks', () => {
    const tasks = seed.tasks.filter((t) => t.patientId === PRIMARY_PATIENT_ID);
    expect(tasks.some((t) => t.completedAt)).toBe(true);
    expect(tasks.filter((t) => !t.completedAt).length).toBeGreaterThanOrEqual(4);
  });
});

describe.each([0, 1, 2, 3, 4, 5, 6])('seed built %i days after the test date', (offset) => {
  const shifted = createSeed(new Date(TEST_NOW.getTime() + offset * 24 * 60 * 60_000));

  it('still avoids double bookings and days off', () => {
    const active = shifted.appointments.filter((a) => a.status !== 'cancelled');
    for (const a of active) {
      const clinician = shifted.clinicians.find((c) => c.id === a.clinicianId)!;
      expect(clinician.workingHours.some((h) => h.weekday === getDay(toDate(a.start)))).toBe(true);
      for (const b of active) {
        if (a === b || a.clinicianId !== b.clinicianId) continue;
        const overlaps =
          toDate(a.start) < addMinutes(toDate(b.start), b.durationMinutes) &&
          toDate(b.start) < addMinutes(toDate(a.start), a.durationMinutes);
        expect(overlaps, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });
});

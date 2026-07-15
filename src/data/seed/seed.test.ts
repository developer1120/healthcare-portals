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

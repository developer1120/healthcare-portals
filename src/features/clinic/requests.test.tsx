import { screen, waitFor, within } from '@testing-library/react';
import { api } from '@/api/endpoints';
import { getDb } from '@/api/mockDb';
import { clinicians } from '@/data/seed/people';
import {
  canPrescribe,
  filterQueues,
  labUrgency,
  refillDecisionProblem,
  refillOverdue,
  signOffProblem,
  waitingOnMe,
} from '@/domain/requests';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';
import { signInAs } from '@/test/session';

const now = TEST_NOW;
const ME = 'cln-lindqvist';
const role = (id: string) => clinicians.find((c) => c.id === id)!;
const panel = (patientId: string, name: string) => getDb().labPanels.find((p) => p.patientId === patientId && p.name === name)!;

describe('request rules', () => {
  it('lets only physicians and nurse practitioners decide', () => {
    expect(canPrescribe(role('cln-lindqvist'))).toBe(true);
    expect(canPrescribe(role('cln-okafor'))).toBe(true);
    expect(canPrescribe(role('cln-delgado'))).toBe(false);
    expect(canPrescribe(role('cln-brooks'))).toBe(false);
  });

  it('checks refill decisions and sign-offs', () => {
    expect(refillDecisionProblem({ decision: 'approve', note: '', refills: 3, daysSupply: 90 })).toBeNull();
    expect(refillDecisionProblem({ decision: 'approve', note: '', refills: 4, daysSupply: 90 })).toMatch(/refills/);
    expect(refillDecisionProblem({ decision: 'approve', note: '', refills: 3, daysSupply: 60 })).toMatch(/days supply/);
    expect(refillDecisionProblem({ decision: 'deny', note: '  ' })).toMatch(/Tell the patient why/);

    const critical = panel('pat-grace', 'Basic metabolic panel');
    expect(labUrgency(critical)).toBe('critical');
    expect(labUrgency(panel('pat-marcus', 'Hemoglobin A1c'))).toBe('abnormal');
    expect(signOffProblem(critical, { note: 'Short', patientContacted: true })).toMatch(/short note/);
    expect(signOffProblem(critical, { note: 'Potassium is high; stop the supplement.', patientContacted: false })).toMatch(/call/);
    expect(signOffProblem(critical, { note: 'Potassium is high; stop the supplement.', patientContacted: true })).toBeNull();
  });

  it('queues mine oldest first and results critical first', async () => {
    const queues = await api.clinic.requests(ME);
    const mine = filterQueues(queues, 'mine', ME);
    expect(mine.refills.map((r) => r.request.id)).toEqual(['rfl-005', 'rfl-002', 'rfl-004']);
    expect(refillOverdue(mine.refills[0]!.request, now)).toBe(true);
    expect(refillOverdue(mine.refills[2]!.request, now)).toBe(false);
    expect(mine.labs.map((l) => `${l.snapshot.patient.firstName} ${l.panel.name}`)).toEqual([
      'Grace Basic metabolic panel',
      'Marcus Hemoglobin A1c',
    ]);

    const team = filterQueues(queues, 'team', ME);
    expect(team.labs.map((l) => l.snapshot.patient.firstName)).toEqual(['Grace', 'Ava', 'Ava', 'Ava', 'Marcus']);
    expect(waitingOnMe(queues, ME)).toBe(5);
  });
});

describe('request endpoints', () => {
  const decide = (fields: Partial<Parameters<typeof api.clinic.decideRefill>[0]> = {}) =>
    api.clinic.decideRefill({
      clinicianId: ME,
      requestId: 'rfl-002',
      decision: 'approve',
      note: '',
      refills: 3,
      daysSupply: 90,
      ...fields,
    });

  it('approves a refill, renewing the prescription', async () => {
    await expect(decide({ note: ' Take at bedtime. ' })).resolves.toMatchObject({
      status: 'approved',
      decidedById: ME,
      decisionNote: 'Take at bedtime.',
    });
    expect(getDb().medications.find((m) => m.id === 'med-marcus-atorvastatin')).toMatchObject({
      refillsRemaining: 3,
      daysSupply: 90,
      lastFilledAt: now.toISOString(),
    });
    await expect(decide()).rejects.toMatchObject({ status: 409 });
  });

  it('declines only with a reason, and only for prescribers on the care team', async () => {
    await expect(decide({ decision: 'deny', note: '' })).rejects.toMatchObject({ status: 400 });
    await expect(decide({ clinicianId: 'cln-delgado' })).rejects.toMatchObject({ status: 403 });
    await expect(decide({ clinicianId: 'cln-okafor', requestId: 'rfl-004' })).rejects.toMatchObject({ status: 404 });
    await expect(decide({ decision: 'deny', note: 'Please book a cholesterol check first.' })).resolves.toMatchObject({
      status: 'denied',
    });
    expect(getDb().medications.find((m) => m.id === 'med-marcus-atorvastatin')!.refillsRemaining).toBe(0);
  });

  it('signs off results and releases the note to the patient', async () => {
    const id = panel('pat-grace', 'Basic metabolic panel').id;

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
    const signOff = (fields: { clinicianId?: string; panelId?: string; note?: string; patientContacted?: boolean } = {}) =>
      api.clinic.signOffLab({ clinicianId: ME, panelId: id, note: 'Potassium is high. We spoke by phone.', patientContacted: true, ...fields });

    await expect(signOff({ patientContacted: false })).rejects.toMatchObject({ status: 400 });
    await expect(signOff({ clinicianId: 'cln-delgado' })).rejects.toMatchObject({ status: 403 });
    await expect(signOff()).resolves.toMatchObject({ status: 'reviewed', reviewedAt: now.toISOString() });
    const visible = (await api.labs.list('pat-grace')).find((p) => p.id === id)!;
    expect(visible.clinicianNote).toBe('Potassium is high. We spoke by phone.');
    await expect(signOff()).rejects.toMatchObject({ status: 409 });
    await expect(signOff({ panelId: panel('pat-ava', 'Vitamin D, 25-hydroxy').id })).rejects.toMatchObject({ status: 409 });
  });
});

describe('requests page', () => {
  const refillList = () => screen.getByRole('list', { name: 'Refill requests, oldest first' });

  it('lists refills oldest first with what the prescriber needs to see', async () => {
    renderRoute('/clinic/requests', { as: 'clinician' });
    await screen.findByRole('list', { name: 'Refill requests, oldest first' });
    expect(within(refillList()).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
      'Levothyroxine for Mei',
      'Atorvastatin for Marcus',
      'Fluticasone inhaler for Lucía',
    ]);
    const marcus = within(refillList()).getByRole('listitem', { name: 'Atorvastatin for Marcus' });
    expect(marcus).toHaveTextContent('“Running out on Friday.”');
    expect(marcus).toHaveTextContent('Refills leftNone (renewal)');
    expect(marcus).toHaveTextContent('AllergiesShellfish');
    expect(within(refillList()).getByRole('listitem', { name: 'Levothyroxine for Mei' })).toHaveTextContent('Overdue');
    expect(screen.getByRole('radio', { name: 'Results to sign 2' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Requests, 5 waiting' })).toBeInTheDocument();
  });

  it('approves a refill', async () => {
    const { user } = renderRoute('/clinic/requests', { as: 'clinician' });
    await screen.findByRole('list', { name: 'Refill requests, oldest first' });
    await user.click(within(refillList()).getByRole('listitem', { name: 'Atorvastatin for Marcus' }).querySelector('button')!);

    const dialog = screen.getByRole('dialog', { name: 'Refill Atorvastatin 40 mg' });
    expect(within(dialog).getByRole('combobox', { name: 'Refills' })).toHaveValue('3');
    expect(within(dialog).getByRole('combobox', { name: 'Days supply' })).toHaveValue('90');
    await user.click(within(dialog).getByRole('button', { name: 'Approve and send' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Atorvastatin 40 mg approved for Marcus Bell');
    await waitFor(() => expect(within(refillList()).getAllByRole('listitem')).toHaveLength(2));
    expect(screen.getByRole('link', { name: 'Requests, 4 waiting' })).toBeInTheDocument();
  });

  it('needs a reason to decline', async () => {
    const { user } = renderRoute('/clinic/requests', { as: 'clinician' });
    await screen.findByRole('list', { name: 'Refill requests, oldest first' });
    await user.click(within(refillList()).getByRole('listitem', { name: 'Levothyroxine for Mei' }).querySelector('button')!);
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: 'Decline' }));
    await user.click(within(dialog).getByRole('button', { name: 'Decline refill' }));
    expect(within(dialog).getByText('Tell the patient why, and what to do next.')).toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox', { name: /Reason, for the patient/ }), 'Let’s recheck your TSH first.');
    await user.click(within(dialog).getByRole('button', { name: 'Decline refill' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Levothyroxine 75 mcg refill declined for Mei Chen');
    expect(getDb().refillRequests.find((r) => r.id === 'rfl-005')).toMatchObject({
      status: 'denied',
      decisionNote: 'Let’s recheck your TSH first.',
    });
  });

  it('signs off a critical result only after the patient is contacted', async () => {
    const { user } = renderRoute('/clinic/requests?tab=labs', { as: 'clinician' });
    const labs = await screen.findByRole('list', { name: 'Results to sign off, critical first' });
    const grace = within(labs).getByRole('listitem', { name: 'Basic metabolic panel for Grace' });
    expect(grace).toHaveTextContent('Critical value');
    expect(grace).toHaveTextContent('Potassium6.4 mmol/L · Critically high');

    await user.click(within(grace).getByRole('button', { name: 'Sign off' }));
    const dialog = screen.getByRole('dialog', { name: 'Sign off Basic metabolic panel' });
    await user.click(within(dialog).getByRole('button', { name: 'Discuss at visit' }));
    expect(within(dialog).getByRole('textbox', { name: /Note for the patient/ })).toHaveValue(
      'I’d like to go over these results with you. Please book a visit in the next two weeks.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Sign off and release' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Critical results need a call to the patient before sign-off.');

    await user.click(within(dialog).getByRole('checkbox', { name: /spoken with the patient/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Sign off and release' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Basic metabolic panel signed off for Grace Whitfield');
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Results to sign off, critical first' })).getAllByRole('listitem', { name: / for / }),
      ).toHaveLength(1),
    );
  });

  it('is read-only for nurses', async () => {
    signInAs('clinician', { subjectId: 'cln-delgado', displayName: 'Rosa Delgado' });
    renderRoute('/clinic/requests?scope=team', { as: null });
    expect(await screen.findByText(/only physicians and nurse practitioners can approve/)).toBeInTheDocument();
    await screen.findByRole('list', { name: 'Refill requests, oldest first' });
    expect(within(refillList()).queryByRole('button')).not.toBeInTheDocument();
  });
});

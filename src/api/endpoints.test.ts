import { PRIMARY_PATIENT_ID } from '@/data/seed';
import { TEST_NOW } from '@/test/clock';
import { api } from './endpoints';
import { DB_STORAGE_KEY, DB_VERSION, getDb, resetMockServer, writeDb } from './mockDb';

const AVA = PRIMARY_PATIENT_ID;

describe('mock database', () => {
  it('seeds around the current time and saves itself', () => {
    const db = getDb();
    expect(db.patients.length).toBeGreaterThan(1);
    const stored = JSON.parse(localStorage.getItem(DB_STORAGE_KEY)!);
    expect(stored).toMatchObject({ version: DB_VERSION, seededOn: '2026-10-13' });
  });

  it('keeps changes across a reload of the page', () => {
    writeDb((db) => {
      db.patients[0]!.phone = '(503) 555-0199';
    });
    // Simulate a reload: drop the in-memory copy but keep storage.
    const saved = localStorage.getItem(DB_STORAGE_KEY);
    resetMockServer();
    localStorage.setItem(DB_STORAGE_KEY, saved!);

    expect(getDb().patients[0]!.phone).toBe('(503) 555-0199');
  });

  it('reseeds on a new calendar day so dates stay current', () => {
    writeDb((db) => {
      db.patients[0]!.phone = 'changed';
    });
    const saved = localStorage.getItem(DB_STORAGE_KEY)!;
    resetMockServer();
    localStorage.setItem(DB_STORAGE_KEY, saved);
    vi.setSystemTime(new Date(TEST_NOW.getTime() + 24 * 60 * 60_000));

    expect(getDb().patients[0]!.phone).not.toBe('changed');
  });

  it('recovers from unreadable storage', () => {
    localStorage.setItem(DB_STORAGE_KEY, '{not json');
    expect(getDb().patients.length).toBeGreaterThan(0);
  });
});

describe('endpoints', () => {
  it('returns a patient, or a 404 for an unknown id', async () => {
    await expect(api.patients.get(AVA)).resolves.toMatchObject({ firstName: 'Ava', lastName: 'Thompson' });
    await expect(api.patients.get('pat-nobody')).rejects.toMatchObject({ status: 404 });
  });

  it('lists the care team with the primary clinician first', async () => {
    const team = await api.clinicians.careTeam(AVA);
    expect(team.map((c) => c.name)).toEqual(['Jonas Lindqvist', 'Dr. Maya Okafor', 'Dr. Tomás Ferreira', 'Rosa Delgado']);
  });

  it('only returns the requested patient’s records', async () => {
    const [appointments, labs, meds, threads] = await Promise.all([
      api.appointments.list(AVA),
      api.labs.list(AVA),
      api.medications.list(AVA),
      api.threads.list(AVA),
    ]);
    for (const record of [...appointments, ...labs, ...meds, ...threads]) expect(record.patientId).toBe(AVA);
  });

  it('sorts lists the way the UI shows them', async () => {
    const appointments = await api.appointments.list(AVA);
    expect(appointments.map((a) => a.start)).toEqual([...appointments.map((a) => a.start)].sort());

    const labs = await api.labs.list(AVA);
    expect(labs.map((l) => l.collectedAt)).toEqual([...labs.map((l) => l.collectedAt)].sort().reverse());

    const threads = await api.threads.list(AVA);
    expect(threads[0]!.subject).toBe('Your lab results are ready');
  });

  it('filters vitals by kind, oldest first', async () => {
    const readings = await api.vitals.list(AVA, 'weight');
    expect(readings.length).toBeGreaterThan(5);
    expect(readings.every((r) => r.kind === 'weight')).toBe(true);
    expect(readings[0]!.takenAt < readings.at(-1)!.takenAt).toBe(true);
  });

  it('bundles the health record', async () => {
    const record = await api.records.get(AVA);
    expect(record.allergies.map((a) => a.substance)).toContain('Penicillin');
    expect(record.conditions.length).toBeGreaterThan(0);
    expect(record.immunizations.length).toBeGreaterThan(0);
  });

  it('orders tasks open-first by due date, undated after dated, completed last', async () => {
    const tasks = await api.tasks.list(AVA);
    expect(tasks.map((t) => t.id)).toEqual(['tsk-1', 'tsk-3', 'tsk-2', 'tsk-5', 'tsk-4', 'tsk-6']);
  });

  it('completes and reopens a task, and saves the change', async () => {
    const done = await api.tasks.setCompleted('tsk-1', true);
    expect(done.completedAt).toBe(TEST_NOW.toISOString());
    expect(getDb().tasks.find((t) => t.id === 'tsk-1')!.completedAt).toBeDefined();

    const reopened = await api.tasks.setCompleted('tsk-1', false);
    expect(reopened.completedAt).toBeUndefined();

    await expect(api.tasks.setCompleted('tsk-nope', true)).rejects.toMatchObject({ status: 404 });
  });
});

import { screen, within } from '@testing-library/react';
import { api } from '@/api/endpoints';
import { assessRisk, filterRoster, defaultRosterFilters, rosterRows } from '@/domain/risk';
import type { PatientSnapshot } from '@/domain/risk';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';
import { signInAs } from '@/test/session';

const now = TEST_NOW;
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

async function snapshotOf(patientId: string, clinicianId = 'cln-lindqvist'): Promise<PatientSnapshot> {
  const roster = await api.clinic.roster(clinicianId);
  return roster.find((s) => s.patient.id === patientId)!;
}

describe('risk scoring', () => {
  it('explains each patient’s score with the factors behind it', async () => {
    const grace = assessRisk(await snapshotOf('pat-grace'), now);
    expect(grace).toMatchObject({ score: 7, level: 'high' });
    expect(grace.factors.map((f) => f.label)).toEqual(['Critical lab result', 'Age 77', '4 conditions']);

    const ruth = assessRisk(await snapshotOf('pat-ruth'), now);
    expect(ruth.factors.map((f) => f.label)).toEqual(['BP 172/98', 'Missed a visit', 'Age 87', '3 conditions']);

    const marcus = assessRisk(await snapshotOf('pat-marcus'), now);
    expect(marcus).toMatchObject({ score: 4, level: 'rising' });
    expect(marcus.factors.map((f) => f.key)).toEqual(['diabetes-control', 'unreviewed-abnormal', 'multimorbidity']);

    expect(assessRisk(await snapshotOf('pat-lucia'), now)).toEqual({ score: 0, level: 'routine', factors: [] });
  });

  it('counts reviewed results toward A1c but not toward labs to review', async () => {
    const samir = assessRisk(await snapshotOf('pat-samir', 'cln-okafor'), now);
    expect(samir.level).toBe('high');
    expect(samir.factors.map((f) => f.label)).toEqual([
      'BP 158/96',
      'A1c 9.6%',
      '3 conditions',
      'Refill waiting over a day',
    ]);
  });

  it('weighs a blood pressure crisis, older missed visits and fresh refill requests', async () => {
    const base = await snapshotOf('pat-lucia');
    const crisis = { ...base.latestBloodPressure!, systolic: 186, diastolic: 104 };
    expect(assessRisk({ ...base, latestBloodPressure: crisis }, now)).toMatchObject({ score: 5, level: 'high' });

    const ruth = await snapshotOf('pat-ruth');
    const later = new Date(now.getTime() + 70 * 86_400_000);
    expect(assessRisk(ruth, later).factors.some((f) => f.key === 'missed-visit')).toBe(false);

    const refill = { id: 'r', medicationId: 'm', patientId: base.patient.id, status: 'pending' as const };
    expect(assessRisk({ ...base, pendingRefills: [{ ...refill, requestedAt: hoursAgo(3) }] }, now).score).toBe(0);
    expect(assessRisk({ ...base, pendingRefills: [{ ...refill, requestedAt: hoursAgo(30) }] }, now).score).toBe(1);
  });

  it('filters by level, factors (any of), scope and search, and sorts', async () => {
    const rows = rosterRows(await api.clinic.roster('cln-okafor'), now);
    const names = (filters: Partial<typeof defaultRosterFilters>) =>
      filterRoster(rows, { ...defaultRosterFilters, ...filters }, 'cln-okafor').map((r) => r.snapshot.patient.firstName);

    expect(names({})).toHaveLength(7);
    expect(names({ scope: 'primary' })).toEqual(['Samir', 'Oluwaseun']);
    expect(names({ level: 'high' })).toEqual(['Samir', 'Ruth', 'Grace']);
    expect(names({ factors: ['missed-visit', 'critical-lab'] })).toEqual(['Ruth', 'Grace']);
    expect(names({ query: 'MW-1033' })).toEqual([]);
    expect(names({ query: 'whit gra' })).toEqual(['Grace']);
    expect(names({ sort: 'name' })[0]).toBe('Oluwaseun');
  });
});

describe('roster endpoint', () => {
  it('returns only the clinician’s care-team patients', async () => {
    const lindqvist = await api.clinic.roster('cln-lindqvist');
    expect(lindqvist).toHaveLength(10);
    expect(lindqvist.map((s) => s.patient.id)).not.toContain('pat-samir');

    const okafor = await api.clinic.roster('cln-okafor');
    expect(okafor.map((s) => s.patient.id)).toEqual(
      expect.arrayContaining(['pat-ava', 'pat-samir', 'pat-olu', 'pat-grace']),
    );
    expect(okafor.map((s) => s.patient.id)).not.toContain('pat-lucia');

    await expect(api.clinic.roster('cln-nobody')).rejects.toMatchObject({ status: 404 });
  });

  it('summarises the chart: active conditions, latest BP, pending refills', async () => {

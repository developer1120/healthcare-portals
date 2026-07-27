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
    const ava = await snapshotOf('pat-ava');
    expect(ava.conditions.every((c) => c.status === 'active')).toBe(true);
    expect(ava.conditions.map((c) => c.code)).not.toContain('M72.2');
    expect(ava.latestBloodPressure).toMatchObject({ systolic: 128, diastolic: 82 });
    const marcus = await snapshotOf('pat-marcus');
    expect(marcus.pendingRefills.map((r) => r.id)).toEqual(['rfl-002']);
  });
});

describe('roster page', () => {
  const patientNames = () =>
    within(screen.getByRole('table')).getAllByRole('rowheader').map((cell) => cell.querySelector('p')!.textContent);

  it('lists the panel highest risk first, with reasons', async () => {
    renderRoute('/clinic/patients', { as: 'clinician' });
    await screen.findByRole('table');
    expect(patientNames()).toEqual([
      'Ruth Gallagher',
      'Grace Whitfield',
      'Marcus Bell',
      'Ethan Cole',
      'Ava Thompson',
      'Mei Chen',
      'Dev Kapoor',
      'Kai Nakamura',
      'Lucía Navarro',
      'Noor Rahman',
    ]);
    expect(screen.getByRole('status')).toHaveTextContent('10 patients');

    const ruth = screen.getByRole('row', { name: /Ruth Gallagher/ });
    expect(within(ruth).getByText('High')).toBeInTheDocument();
    expect(within(ruth).getByRole('list', { name: 'Reasons' })).toHaveTextContent('BP 172/98');
    expect(within(ruth).getByText('172/98')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Noor Rahman/ })).getByText('Nothing flagged')).toBeInTheDocument();
  });

  it('filters by risk level and flags, keeping them in the URL', async () => {
    const { user, router } = renderRoute('/clinic/patients', { as: 'clinician' });
    await screen.findByRole('table');

    const levels = screen.getByRole('group', { name: 'Risk level' });
    expect(within(levels).getByRole('radio', { name: 'Rising 3' })).toBeInTheDocument();
    await user.click(within(levels).getByRole('radio', { name: 'High 2' }));
    expect(patientNames()).toEqual(['Ruth Gallagher', 'Grace Whitfield']);
    expect(screen.getByRole('status')).toHaveTextContent('2 of 10 patients');
    expect(router.state.location.search).toBe('?risk=high');

    await user.click(within(levels).getByRole('radio', { name: 'All 10' }));
    const flags = screen.getByRole('group', { name: 'Show patients with any of' });
    await user.click(within(flags).getByRole('button', { name: 'Missed visit' }));
    expect(within(flags).getByRole('button', { name: 'Missed visit' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(within(flags).getByRole('button', { name: 'Labs to review' }));
    expect(patientNames()).toEqual(['Ruth Gallagher', 'Marcus Bell', 'Ava Thompson']);
    // Level counts follow the other filters.
    expect(within(levels).getByRole('radio', { name: 'High 1' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(patientNames()).toHaveLength(10);
    expect(router.state.location.search).toBe('');
  });

  it('searches by name ignoring accents, and says when nothing matches', async () => {
    const { user } = renderRoute('/clinic/patients', { as: 'clinician' });
    const search = await screen.findByRole('searchbox', { name: 'Search patients' });
    await user.type(search, 'lucia');
    expect(patientNames()).toEqual(['Lucía Navarro']);
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.getByText('No patients match these filters.')).toBeInTheDocument();
  });

  it('restores filters and sort from the URL', async () => {
    renderRoute('/clinic/patients?risk=rising&sort=name', { as: 'clinician' });
    await screen.findByRole('table');
    expect(patientNames()).toEqual(['Marcus Bell', 'Ethan Cole', 'Ava Thompson']);
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('name');
  });

  it('narrows to primary-care patients', async () => {
    signInAs('clinician', { subjectId: 'cln-okafor', displayName: 'Dr. Maya Okafor' });
    const { user } = renderRoute('/clinic/patients', { as: null });
    await screen.findByRole('table');
    expect(patientNames()).toHaveLength(7);
    await user.click(screen.getByRole('radio', { name: 'Primary care' }));
    expect(patientNames()).toEqual(['Samir Haddad', 'Oluwaseun Adeyemi']);
  });
});

import { screen, within } from '@testing-library/react';
import { api } from '@/api/endpoints';
import { flaggedObservations, labReviewState, pastVisits, recentBloodPressure } from '@/domain/chart';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const now = TEST_NOW;
const chartOf = (patientId: string, clinicianId = 'cln-lindqvist') => api.clinic.chart(clinicianId, patientId);

describe('chart helpers', () => {
  it('lists flagged results critical first and labels review state', async () => {
    const grace = await chartOf('pat-grace');
    const bmp = grace.labs.find((p) => p.name === 'Basic metabolic panel')!;
    expect(flaggedObservations(bmp).map(({ observation, flag }) => [observation.name, flag])).toEqual([
      ['Potassium', 'critical-high'],
      ['Creatinine', 'high'],
    ]);
    expect(labReviewState(bmp)).toEqual({ label: 'Needs review', tone: 'warn' });
    expect(labReviewState({ ...bmp, status: 'reviewed' }).label).toBe('Reviewed');
    expect(labReviewState({ ...bmp, status: 'pending' }).label).toBe('Pending');
  });

  it('picks recent visits and blood pressure', async () => {
    const ruth = await chartOf('pat-ruth');
    expect(pastVisits(ruth.appointments, now).map((a) => a.status)).toEqual(['no-show']);

    const ava = await chartOf('pat-ava');
    const bp = recentBloodPressure(ava, 90, now);
    expect(bp.length).toBeGreaterThan(30);
    expect(bp.map((r) => r.takenAt)).toEqual([...bp.map((r) => r.takenAt)].sort());
    expect(recentBloodPressure(ava, 3, now).length).toBeLessThanOrEqual(3);
  });
});

describe('chart endpoint', () => {
  it('returns the whole chart for a care-team patient', async () => {
    const grace = await chartOf('pat-grace');
    expect(grace.patient.lastName).toBe('Whitfield');
    expect(grace.allergies.map((a) => a.substance)).toEqual(['Sulfonamide antibiotics']);
    expect(grace.medications.map((m) => m.name)).toEqual(['Apixaban', 'Metoprolol succinate', 'Furosemide']);
    expect(grace.conditions).toHaveLength(4);
    expect(grace.vitals.every((v) => v.kind === 'blood-pressure' || v.kind === 'heart-rate')).toBe(true);
  });

  it('leaves out stopped medicines', async () => {
    const ava = await chartOf('pat-ava');
    expect(ava.medications.map((m) => m.id)).toContain('med-lisinopril');
    expect(ava.medications.map((m) => m.id)).not.toContain('med-naproxen');
  });

  it('hides patients outside the care team behind a 404', async () => {
    await expect(chartOf('pat-samir')).rejects.toMatchObject({ status: 404 });
    await expect(chartOf('pat-samir', 'cln-okafor')).resolves.toMatchObject({ patient: { firstName: 'Samir' } });
    await expect(chartOf('pat-nobody')).rejects.toMatchObject({ status: 404 });
  });
});

describe('chart page', () => {
  it('opens from the roster and returns to the same filtered list', async () => {
    const { user, router } = renderRoute('/clinic/patients?risk=high', { as: 'clinician' });
    await user.click(await screen.findByRole('link', { name: 'Grace Whitfield' }));
    expect(router.state.location.pathname).toBe('/clinic/patients/pat-grace');
    expect(await screen.findByRole('heading', { level: 1, name: 'Grace Whitfield' })).toBeInTheDocument();

    await user.click(within(screen.getByRole('main')).getByRole('link', { name: 'Patients' }));
    expect(router.state.location.search).toBe('?risk=high');
    expect(await screen.findByRole('status')).toHaveTextContent('2 of 10 patients');
  });

  it('shows allergies, risk, problems, medicines and labs to review', async () => {
    renderRoute('/clinic/patients/pat-grace', { as: 'clinician' });
    const allergies = await screen.findByRole('region', { name: 'Allergies' });
    expect(allergies).toHaveTextContent('Sulfonamide antibiotics: widespread rash (moderate)');

    const risk = screen.getByRole('region', { name: 'Risk' });
    expect(risk).toHaveTextContent('High risk · 7');
    expect(within(risk).getByText('Critical lab result').nextSibling).toHaveTextContent('+5');

    expect(screen.getByRole('region', { name: 'Problem list' })).toHaveTextContent('Atrial fibrillationI48.91');
    const meds = screen.getByRole('region', { name: 'Medications' });
    expect(meds).toHaveTextContent('Apixaban 5 mg');
    expect(meds).toHaveTextContent('Take 1 tablet by mouth twice daily.');

    const bmp = within(screen.getByRole('region', { name: 'Recent labs' })).getByRole('listitem', {
      name: 'Basic metabolic panel',
    });
    expect(within(bmp).getByText('Needs review')).toBeInTheDocument();
    expect(bmp).toHaveTextContent('Potassium6.4 mmol/L · Critically high');
    expect(screen.getByText('MW-102891')).toBeInTheDocument();
  });

  it('shows vitals and missed visits', async () => {
    renderRoute('/clinic/patients/pat-ruth', { as: 'clinician' });
    const vitals = await screen.findByRole('region', { name: 'Vitals' });
    expect(vitals).toHaveTextContent('172/98');
    expect(vitals).toHaveTextContent('High (stage 2)');
    const visits = screen.getByRole('region', { name: 'Visits' });
    expect(within(visits).getByText('Missed')).toBeInTheDocument();
    expect(visits).toHaveTextContent('Blood pressure check');
  });

  it('draws the blood pressure trend when there is enough data', async () => {
    renderRoute('/clinic/patients/pat-ava', { as: 'clinician' });
    const vitals = await screen.findByRole('region', { name: 'Vitals' });
    expect(within(vitals).getByRole('img', { name: /^Systolic from \d+ to 128 over \d+ readings/ })).toBeInTheDocument();
  });

  it('says when no allergies are recorded', async () => {
    renderRoute('/clinic/patients/pat-lucia', { as: 'clinician' });
    expect(await screen.findByText(/No allergies recorded/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Allergies' })).not.toBeInTheDocument();
  });

  it('does not open charts outside the care team', async () => {
    renderRoute('/clinic/patients/pat-samir', { as: 'clinician' });
    expect(await screen.findByRole('heading', { name: 'Patient not found' })).toBeInTheDocument();
    expect(screen.queryByText('Samir')).not.toBeInTheDocument();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import { api } from '@/api/endpoints';
import { getDb } from '@/api/mockDb';
import { frequencyLabel, refillEligibility, supplyStatus } from '@/domain/medications';
import type { Medication, RefillRequest } from '@/domain/types';
import { atTime, formatDay } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const now = TEST_NOW;
const AVA = 'pat-ava';
const med = (id: string) => getDb().medications.find((m) => m.id === id)!;

function medication(fields: Partial<Medication> = {}): Medication {
  return {
    ...med('med-lisinopril'),
    ...fields,
  };
}

describe('medication rules', () => {
  it('describes how often a medicine is taken', () => {
    expect(frequencyLabel(medication({ doseTimes: ['08:00'] }))).toBe('Once daily');
    expect(frequencyLabel(medication({ doseTimes: ['08:00', '19:00'] }))).toBe('Twice daily');
    expect(frequencyLabel(medication({ doseTimes: ['08:00', '14:00', '20:00'] }))).toBe('3 times daily');
    expect(frequencyLabel(medication({ asNeeded: true, doseTimes: [] }))).toBe('As needed');
  });

  it('works out the supply left from the last fill', () => {
    const filled = (daysAgo: number) => atTime(now, -daysAgo, '12:00').toISOString();
    expect(supplyStatus(medication({ lastFilledAt: filled(27), daysSupply: 30 }), now)).toMatchObject({
      daysLeft: 3,
      level: 'low',
    });
    expect(supplyStatus(medication({ lastFilledAt: filled(40), daysSupply: 30 }), now)).toMatchObject({
      daysLeft: 0,
      level: 'out',
    });
    expect(supplyStatus(medication({ lastFilledAt: filled(10), daysSupply: 90 }), now).level).toBe('ok');
  });

  it('opens refills 10 days before running out, one request at a time', () => {
    const lisinopril = med('med-lisinopril');
    expect(refillEligibility(lisinopril, [], now)).toEqual({ canRequest: true, needsRenewal: true });

    const pending = { medicationId: lisinopril.id, status: 'pending', requestedAt: now.toISOString() } as RefillRequest;
    expect(refillEligibility(lisinopril, [pending], now)).toEqual({ canRequest: false, reason: 'pending' });

    const metformin = refillEligibility(med('med-metformin'), [], now);
    expect(metformin).toMatchObject({ canRequest: false, reason: 'too-early' });
    expect(refillEligibility(med('med-naproxen'), [], now)).toEqual({ canRequest: false, reason: 'not-active' });
  });
});

describe('refill endpoints', () => {
  it('records a pending request and ticks off the refill task', async () => {
    const request = await api.refills.request({ patientId: AVA, medicationId: 'med-lisinopril', note: ' Running low ' });
    expect(request).toMatchObject({
      status: 'pending',
      patientNote: 'Running low',
      pharmacy: 'Hawthorne Pharmacy, SE Hawthorne Blvd',
    });
    expect(getDb().tasks.find((t) => t.id === 'tsk-2')!.completedAt).toBeDefined();

    await expect(api.refills.request({ patientId: AVA, medicationId: 'med-lisinopril' })).rejects.toMatchObject({
      status: 409,
      message: 'A refill request for this medication is already with your care team.',
    });
  });

  it('refuses refills that are too early or for someone else’s medicine', async () => {
    await expect(api.refills.request({ patientId: AVA, medicationId: 'med-metformin' })).rejects.toMatchObject({
      message: 'It’s too early to refill this medication.',
    });
    await expect(api.refills.request({ patientId: AVA, medicationId: 'med-samir-metformin' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('cancels only requests still waiting', async () => {
    const request = await api.refills.request({ patientId: AVA, medicationId: 'med-lisinopril' });
    await expect(api.refills.cancel(AVA, request.id)).resolves.toMatchObject({ status: 'cancelled' });
    await expect(api.refills.cancel(AVA, 'rfl-001')).rejects.toMatchObject({
      message: 'Your care team has already answered this request.',
    });
  });
});

function card(name: RegExp) {
  return screen.getByRole('region', { name });
}

describe('MedicationsPage', () => {
  it('groups medicines and reminds about allergies', async () => {
    renderRoute('/medications');
    expect(await screen.findByRole('region', { name: 'Taken on a schedule' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Taken as needed' })).toHaveTextContent('Cetirizine 10 mg');
    expect(screen.getByText('Past medications (1)')).toBeInTheDocument();
    expect(await screen.findByText(/Penicillin \(hives\), Latex \(skin rash\)/)).toBeInTheDocument();
  });

  it('shows supply, refills left and when a refill becomes available', async () => {
    renderRoute('/medications');
    const lisinopril = await screen.findByRole('region', { name: /Lisinopril 10 mg/ });
    expect(lisinopril).toHaveTextContent('Tablet · Once daily');
    expect(lisinopril).toHaveTextContent(/About 3 days left · runs out around/);
    expect(within(lisinopril).getByText('Refills left').nextSibling).toHaveTextContent('0');
    expect(within(lisinopril).getByRole('button', { name: 'Request refill' })).toHaveClass('bg-accent');
    expect(lisinopril).toHaveTextContent('No refills left: your clinician will review a renewal.');

    const metformin = card(/Metformin 500 mg/);
    const from = formatDay(new Date(new Date(med('med-metformin').lastFilledAt).getTime() + 80 * 86_400_000));
    expect(metformin).toHaveTextContent(`You can request a refill from ${from}.`);
    expect(metformin).toHaveTextContent(/Refill approved .* Approved for 90 days with 3 refills./);
    expect(within(metformin).queryByRole('button', { name: 'Request refill' })).not.toBeInTheDocument();
  });

  it('requests a refill through a dialog and shows it waiting', async () => {
    const { user } = renderRoute('/medications');
    const lisinopril = await screen.findByRole('region', { name: /Lisinopril 10 mg/ });
    await user.click(within(lisinopril).getByRole('button', { name: 'Request refill' }));

    const dialog = screen.getByRole('dialog', { name: 'Refill Lisinopril 10 mg' });
    expect(dialog).toHaveAccessibleDescription('Goes to Dr. Maya Okafor for approval.');
    expect(dialog).toHaveTextContent('no refills left, so your clinician will review a renewal');
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Pharmacy' }), 'Fremont Community Pharmacy');
    await user.type(within(dialog).getByRole('textbox', { name: /Note for your care team/ }), 'Out on Friday');
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(lisinopril).getByText('Refill request sent to Dr. Maya Okafor.')).toBeInTheDocument();
    expect(await within(lisinopril).findByText(/Refill requested today\. Waiting for Dr\. Maya Okafor\./)).toBeInTheDocument();
    expect(within(lisinopril).queryByRole('button', { name: 'Request refill' })).not.toBeInTheDocument();
    expect(getDb().refillRequests.at(-1)).toMatchObject({ pharmacy: 'Fremont Community Pharmacy', patientNote: 'Out on Friday' });
  });

  it('lets a waiting request be cancelled', async () => {
    await api.refills.request({ patientId: AVA, medicationId: 'med-lisinopril' });
    const { user } = renderRoute('/medications');
    const lisinopril = await screen.findByRole('region', { name: /Lisinopril 10 mg/ });

    await user.click(await within(lisinopril).findByRole('button', { name: 'Cancel request' }));
    expect(await within(lisinopril).findByRole('button', { name: 'Request refill' })).toBeInTheDocument();
  });

  it('keeps stopped medicines under past medications without refill actions', async () => {
    const { user } = renderRoute('/medications');
    await user.click(await screen.findByText('Past medications (1)'));
    const naproxen = card(/Naproxen 250 mg/);
    expect(naproxen).toHaveTextContent('Taken');
    expect(within(naproxen).queryByRole('button')).not.toBeInTheDocument();
  });
});

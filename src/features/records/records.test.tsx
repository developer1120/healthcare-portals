import { screen, waitFor, within } from '@testing-library/react';
import { api } from '@/api/endpoints';
import { getDb } from '@/api/mockDb';
import { hasAllergy, immunizationStatus, sortAllergies, sortImmunizations } from '@/domain/healthRecord';
import type { Allergy, Immunization } from '@/domain/types';
import { atTime, toIsoDate } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const now = TEST_NOW;
const AVA = 'pat-ava';
const day = (offset: number) => toIsoDate(atTime(now, offset, '12:00'));

function vaccine(id: string, nextDueOn?: string, givenOn = '2025-01-01'): Immunization {
  return { id, patientId: AVA, vaccine: id, givenOn, nextDueOn };
}

describe('health record rules', () => {
  it('works out where each vaccine stands', () => {
    expect(immunizationStatus(vaccine('a', day(-1)), now)).toBe('overdue');
    expect(immunizationStatus(vaccine('b', day(10)), now)).toBe('due-soon');
    expect(immunizationStatus(vaccine('c', day(200)), now)).toBe('current');
    expect(immunizationStatus(vaccine('d'), now)).toBe('complete');
  });

  it('puts overdue vaccines first and severe allergies first', () => {
    const list = [vaccine('later', day(200)), vaccine('done'), vaccine('late', day(-3))];
    expect(sortImmunizations(list, now).map((v) => v.id)).toEqual(['late', 'later', 'done']);

    const allergy = (substance: string, severity: Allergy['severity']) => ({ substance, severity }) as Allergy;
    expect(sortAllergies([allergy('Latex', 'mild'), allergy('Peanuts', 'severe')]).map((a) => a.substance)).toEqual([
      'Peanuts',
      'Latex',
    ]);
  });

  it('matches allergies regardless of case and spacing', () => {
    expect(hasAllergy([{ substance: 'Penicillin' } as Allergy], '  penicillin ')).toBe(true);
    expect(hasAllergy([{ substance: 'Bee stings' } as Allergy], 'bee   stings')).toBe(true);
  });
});

describe('addAllergy endpoint', () => {
  it('adds an unconfirmed, patient-reported allergy', async () => {
    const allergy = await api.records.addAllergy(AVA, { substance: ' Ibuprofen ', reaction: 'Swelling', severity: 'moderate' });
    expect(allergy).toMatchObject({ substance: 'Ibuprofen', reportedBy: 'patient', verified: false });
  });

  it('refuses duplicates and empty answers', async () => {
    await expect(api.records.addAllergy(AVA, { substance: 'PENICILLIN', reaction: 'Rash', severity: 'mild' })).rejects.toMatchObject({
      status: 409,
      message: 'PENICILLIN is already on your allergy list.',
    });
    await expect(api.records.addAllergy(AVA, { substance: ' ', reaction: 'Rash', severity: 'mild' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('HealthRecordPage', () => {
  it('summarises who the record belongs to', async () => {
    renderRoute('/records');
    expect(await screen.findByRole('heading', { level: 2, name: 'Ava Thompson' })).toBeInTheDocument();
    expect(screen.getByText('Medical record number MW-104582')).toBeInTheDocument();
    expect(screen.getByText('17 Apr 1984 (42)')).toBeInTheDocument();
    expect(screen.getByText('Female · she/her')).toBeInTheDocument();
    const primary = screen.getByText('Primary clinician').nextElementSibling!;
    await waitFor(() => expect(primary).toHaveTextContent('Jonas Lindqvist'));
  });

  it('lists allergies by severity and conditions with past ones folded away', async () => {
    renderRoute('/records');
    const allergies = await screen.findByRole('region', { name: 'Allergies' });
    const items = within(allergies).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('PenicillinHives');
    expect(within(items[0]!).getByText('Moderate')).toHaveAttribute('data-tone', 'warn');

    const conditions = screen.getByRole('region', { name: 'Conditions' });
    expect(conditions).toHaveTextContent('Essential hypertension');
    expect(conditions).toHaveTextContent('I10');
    expect(within(conditions).getByText('Past conditions (1)')).toBeInTheDocument();
  });

  it('flags the overdue flu vaccine first, with a way to book it', async () => {
    renderRoute('/records');
    const card = await screen.findByRole('region', { name: 'Immunizations' });
    const first = within(card).getAllByRole('listitem')[0]!;
    expect(first).toHaveTextContent('Influenza (seasonal)');
    expect(within(first).getByText('Overdue')).toHaveAttribute('data-tone', 'warn');
    expect(within(first).getByRole('link', { name: 'Book' })).toHaveAttribute('href', '/appointments/book?clinician=cln-lindqvist');
    expect(card).toHaveTextContent('Hepatitis B · Dose 3 of 3');
  });

  it('adds an allergy through a dialog', async () => {
    const { user } = renderRoute('/records');
    const allergies = await screen.findByRole('region', { name: 'Allergies' });
    await user.click(within(allergies).getByRole('button', { name: 'Add' }));

    const dialog = screen.getByRole('dialog', { name: 'Add an allergy' });
    await user.click(within(dialog).getByRole('button', { name: 'Add allergy' }));
    expect(within(dialog).getByRole('textbox', { name: /Allergic to/ })).toHaveAccessibleDescription('Enter what you’re allergic to');

    await user.type(within(dialog).getByRole('textbox', { name: /Allergic to/ }), 'Peanuts');
    await user.type(within(dialog).getByRole('textbox', { name: /What happens/ }), 'Throat swelling');
    await user.click(within(dialog).getByRole('radio', { name: 'Severe' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add allergy' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(allergies).getByText('Peanuts added to your allergies.')).toBeInTheDocument();
    const first = (await within(allergies).findAllByRole('listitem'))[0]!;
    expect(first).toHaveTextContent('Peanuts');
    expect(first).toHaveTextContent('Reported by you · not yet confirmed');
    expect(getDb().allergies.some((a) => a.substance === 'Peanuts')).toBe(true);
  });

  it('explains a duplicate allergy', async () => {
    const { user } = renderRoute('/records');
    await user.click(within(await screen.findByRole('region', { name: 'Allergies' })).getByRole('button', { name: 'Add' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /Allergic to/ }), 'latex');
    await user.type(within(dialog).getByRole('textbox', { name: /What happens/ }), 'Rash');
    await user.click(within(dialog).getByRole('button', { name: 'Add allergy' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('latex is already on your allergy list.');
  });
});

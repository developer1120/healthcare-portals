import { screen, waitFor, within } from '@testing-library/react';
import { addDays, addMinutes } from 'date-fns';
import { api } from '@/api/endpoints';
import { getDb } from '@/api/mockDb';
import { caregiverStatus, contactProblems, inviteProblems, normaliseContact } from '@/domain/profile';
import type { CaregiverInvite, ContactUpdate } from '@/domain/profile';
import type { CaregiverGrant } from '@/domain/types';
import { toIsoDate } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const AVA = 'pat-ava';
const ava = () => getDb().patients.find((p) => p.id === AVA)!;

function contact(fields: Partial<ContactUpdate> = {}): ContactUpdate {
  const { preferredName, pronouns, email, phone, address, preferredLanguage } = ava();
  return { preferredName, pronouns, email, phone, address: { ...address }, preferredLanguage, ...fields };
}

const invite = (fields: Partial<CaregiverInvite> = {}): CaregiverInvite => ({
  name: 'Daniel Thompson',
  email: 'dan.thompson@example.com',
  relationship: 'Father',
  scopes: ['results', 'appointments'],
  ...fields,
});

describe('profile rules', () => {
  it('checks contact details field by field', () => {
    expect(contactProblems(contact())).toEqual({});
    const bad = contactProblems(
      contact({ email: 'ava@', phone: '555-01', address: { line1: ' ', city: 'Portland', region: 'Oregon', postcode: '972' } }),
    );
    expect(Object.keys(bad).sort()).toEqual(['email', 'line1', 'phone', 'postcode', 'region']);
  });

  it('tidies details before saving', () => {
    const tidy = normaliseContact(
      contact({ preferredName: '  ', email: ' Ava.T@Example.com ', phone: '503.555.0199', address: { line1: ' 1 Main St ', line2: '', city: 'Portland', region: 'or', postcode: '97214' } }),
    );
    expect(tidy).toMatchObject({ preferredName: undefined, email: 'ava.t@example.com', phone: '(503) 555-0199' });
    expect(tidy.address).toEqual({ line1: '1 Main St', line2: undefined, city: 'Portland', region: 'OR', postcode: '97214' });
  });

  it('checks caregiver invitations', () => {
    const existing = getDb().caregivers;
    const check = (fields: Partial<CaregiverInvite>, others: CaregiverGrant[] = existing) =>
      inviteProblems(invite(fields), { existing: others, patientEmail: ava().email, now: TEST_NOW });

    expect(check({})).toEqual({});
    expect(check({ email: 'ava.thompson@example.com' }).email).toMatch(/your own email/);
    expect(check({ email: 'MIA.thompson@example.com' }).email).toMatch(/already has access/);
    expect(check({ scopes: [] }).scopes).toBeDefined();
    expect(check({ expiresOn: toIsoDate(TEST_NOW) }).expiresOn).toBeDefined();
    const four = Array.from({ length: 4 }, (_, i) => ({ ...existing[0]!, id: `x${i}`, email: `x${i}@example.com` }));
    expect(check({}, four).form).toMatch(/up to 4 caregivers/);
    // Removed caregivers don't count towards the limit or block their email.
    expect(check({ email: 'mia.thompson@example.com' }, [{ ...existing[0]!, status: 'revoked' }])).toEqual({});
  });

  it('expires access after the end date', () => {
    const grant = { ...getDb().caregivers[0]!, expiresOn: toIsoDate(TEST_NOW) };
    expect(caregiverStatus(grant, TEST_NOW)).toBe('active');
    expect(caregiverStatus(grant, addDays(TEST_NOW, 1))).toBe('expired');
  });
});

describe('profile endpoints', () => {
  it('saves contact details, refusing bad ones', async () => {
    await expect(api.patients.updateContact(AVA, contact({ phone: '503 555 0199', address: { ...ava().address, region: 'wa' } }))).resolves.toMatchObject({
      phone: '(503) 555-0199',
      address: { region: 'WA' },
    });
    await expect(api.patients.updateContact(AVA, contact({ email: 'nope' }))).rejects.toMatchObject({ status: 400 });
    // Legal details can't be changed this way.
    await api.patients.updateContact(AVA, { ...contact(), firstName: 'Eve' } as ContactUpdate);
    expect(ava().firstName).toBe('Ava');
  });

  it('invites, edits and removes caregivers', async () => {
    const grant = await api.caregivers.invite(AVA, invite({ email: ' Dan.Thompson@Example.com ' }));
    expect(grant).toMatchObject({ status: 'invited', email: 'dan.thompson@example.com', scopes: ['appointments', 'results'] });
    await expect(api.caregivers.invite(AVA, invite())).rejects.toMatchObject({ status: 400 });

    await expect(api.caregivers.updateScopes(AVA, grant.id, [])).rejects.toMatchObject({ status: 400 });
    await expect(api.caregivers.updateScopes(AVA, grant.id, ['billing', 'messages'])).resolves.toMatchObject({ scopes: ['messages', 'billing'] });
    await expect(api.caregivers.revoke(AVA, grant.id)).resolves.toMatchObject({ status: 'revoked', revokedAt: TEST_NOW.toISOString() });
    await expect(api.caregivers.revoke('pat-marcus', 'cg-1')).rejects.toMatchObject({ status: 404 });
  });

  it('records consent choices', async () => {
    const consents = await api.privacy.consents(AVA);
    expect(consents.map((c) => [c.kind, c.granted])).toEqual([
      ['records-exchange', true],
      ['research', false],
      ['surveys', true],
    ]);
    await api.privacy.setConsent(AVA, 'research', true);
    expect((await api.privacy.consents(AVA))[1]).toMatchObject({ granted: true, updatedAt: TEST_NOW.toISOString() });
    expect((await api.privacy.consents('pat-marcus')).every((c) => !c.granted)).toBe(true);
  });

  it('logs chart views, replies and sign-offs, once an hour each', async () => {
    const before = (await api.privacy.accessLog(AVA)).length;
    await api.clinic.chart('cln-lindqvist', AVA);
    await api.clinic.chart('cln-lindqvist', AVA);
    let log = await api.privacy.accessLog(AVA);
    expect(log).toHaveLength(before + 1);
    expect(log[0]).toMatchObject({ actorId: 'cln-lindqvist', action: 'viewed-chart' });

    vi.setSystemTime(addMinutes(TEST_NOW, 61));
    await api.clinic.chart('cln-lindqvist', AVA);
    await api.clinic.reply({ clinicianId: 'cln-lindqvist', threadId: 'thr-dizzy', body: 'How are the mornings now?' });
    log = await api.privacy.accessLog(AVA);
    expect(log.slice(0, 2).map((e) => e.action).sort()).toEqual(['replied-message', 'viewed-chart']);
    expect(log).toHaveLength(before + 3);
  });
});

describe('profile page', () => {
  it('edits contact details with field errors', async () => {
    const { user } = renderRoute('/profile');
    const details = await screen.findByRole('region', { name: 'Your details' });
    expect(details).toHaveTextContent('Legal nameAva Thompson');
    const phone = within(details).getByRole('textbox', { name: /Mobile phone/ });
    const zip = within(details).getByRole('textbox', { name: /ZIP code/ });

    await user.clear(zip);
    await user.type(zip, '97');
    await user.click(within(details).getByRole('button', { name: 'Save details' }));
    expect(within(details).getByText('Enter a 5-digit ZIP code.')).toBeInTheDocument();
    expect(zip).toHaveAttribute('aria-invalid', 'true');

    await user.clear(zip);
    await user.type(zip, '97202');
    await user.clear(phone);
    await user.type(phone, '5035550123');
    await user.click(within(details).getByRole('button', { name: 'Save details' }));
    expect(await within(details).findByRole('status')).toHaveTextContent('Saved');
    expect(phone).toHaveValue('(503) 555-0123');
    expect(ava()).toMatchObject({ phone: '(503) 555-0123', address: { postcode: '97202' } });
  });

  it('invites a caregiver', async () => {
    const { user } = renderRoute('/profile');
    const card = await screen.findByRole('region', { name: 'Caregiver access' });
    const mia = await within(card).findByRole('listitem', { name: 'Mia Thompson' });
    expect(mia).toHaveTextContent('Can see: Appointments, Messages');
    expect(within(mia).getByText('Active')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Invite a caregiver' }));
    const dialog = screen.getByRole('dialog', { name: 'Invite a caregiver' });
    await user.click(within(dialog).getByRole('checkbox', { name: /Appointments/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    expect(within(dialog).getByText('Enter their name.')).toBeInTheDocument();
    expect(within(dialog).getByText('Choose at least one thing they can see.')).toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox', { name: /Their name/ }), 'Daniel Thompson');
    await user.type(within(dialog).getByRole('textbox', { name: /Relationship/ }), 'Father');
    await user.type(within(dialog).getByRole('textbox', { name: /Their email/ }), 'dan.thompson@example.com');
    await user.click(within(dialog).getByRole('checkbox', { name: /Test results/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));

    expect(await within(card).findByRole('status')).toHaveTextContent('Invitation sent to Daniel Thompson.');
    const dan = await within(card).findByRole('listitem', { name: 'Daniel Thompson' });
    expect(within(dan).getByText('Invitation sent')).toBeInTheDocument();
    expect(dan).toHaveTextContent('Can see: Test results');
  });

  it('changes and removes a caregiver’s access', async () => {
    const { user } = renderRoute('/profile');
    const card = await screen.findByRole('region', { name: 'Caregiver access' });
    const mia = await within(card).findByRole('listitem', { name: 'Mia Thompson' });

    await user.click(within(mia).getByRole('button', { name: 'Edit access' }));
    await user.click(within(mia).getByRole('checkbox', { name: /Messages/ }));
    await user.click(within(mia).getByRole('checkbox', { name: /Billing/ }));
    await user.click(within(mia).getByRole('button', { name: 'Save access' }));
    await waitFor(() => expect(mia).toHaveTextContent('Can see: Appointments, Billing'));

    await user.click(within(mia).getByRole('button', { name: 'Remove' }));
    const confirm = screen.getByRole('dialog', { name: 'Remove Mia Thompson’s access?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove access' }));
    expect(await within(card).findByRole('status')).toHaveTextContent('Mia Thompson no longer has access.');
    expect(within(card).getByText('No one else has access to your portal.')).toBeInTheDocument();
    expect(within(card).getByText('Past caregivers (1)')).toBeInTheDocument();
  });

  it('toggles privacy choices and shows who looked at the record', async () => {
    const { user } = renderRoute('/profile');
    const research = await screen.findByRole('switch', { name: 'Use my de-identified data for research' });
    expect(research).toHaveAttribute('aria-checked', 'false');
    await user.click(research);
    expect(research).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(getDb().consents.find((c) => c.kind === 'research')!.granted).toBe(true));

    const log = await screen.findByRole('list', { name: 'Access history' });
    expect(await within(log).findByText('Rosa Delgado')).toBeInTheDocument();
    expect(log.firstElementChild).toHaveTextContent('Reviewed your results');
  });

  it('is linked from the patient’s account menu', async () => {
    const { user } = renderRoute('/');
    await user.click(await screen.findByRole('button', { name: /account/ }));
    expect(screen.getByRole('link', { name: 'Profile and privacy' })).toHaveAttribute('href', '/profile');
  });

  it('is not offered to clinicians', async () => {
    const { user } = renderRoute('/clinic', { as: 'clinician' });
    await user.click(await screen.findByRole('button', { name: /account/ }));
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Profile and privacy' })).not.toBeInTheDocument();
  });
});

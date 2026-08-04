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

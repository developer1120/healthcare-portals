import { toIsoDate } from '@/lib/dates';
import { normalisePhone } from './telehealth';
import type { AccessAction, Address, CaregiverGrant, CaregiverScope, ConsentKind, Patient } from './types';

// ── Contact details ─────────────────────────────────────────────────────────

/** What patients can change themselves. Legal name, date of birth and MRN go through the front desk. */
export type ContactUpdate = Pick<Patient, 'preferredName' | 'pronouns' | 'email' | 'phone' | 'address' | 'preferredLanguage'>;

export type ContactField = 'preferredName' | 'pronouns' | 'email' | 'phone' | 'line1' | 'city' | 'region' | 'postcode' | 'preferredLanguage';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ZIP = /^\d{5}(-\d{4})?$/;
export const NAME_MAX = 60;

export const languages = ['English', 'Spanish', 'Vietnamese', 'Chinese', 'Russian', 'Somali', 'Swedish', 'Igbo'];

/** Problems by field, so the form can show each under its input. Empty when it's all fine. */
export function contactProblems(input: ContactUpdate): Partial<Record<ContactField, string>> {
  const problems: Partial<Record<ContactField, string>> = {};
  if ((input.preferredName ?? '').trim().length > NAME_MAX) problems.preferredName = `Keep it under ${NAME_MAX} characters.`;
  if ((input.pronouns ?? '').trim().length > 30) problems.pronouns = 'Keep it under 30 characters.';
  if (!EMAIL.test(input.email.trim())) problems.email = 'Enter an email address like name@example.com.';
  if (!normalisePhone(input.phone)) problems.phone = 'Enter a 10-digit US phone number.';
  if (!input.address.line1.trim()) problems.line1 = 'Enter your street address.';
  if (!input.address.city.trim()) problems.city = 'Enter your city.';
  if (!/^[A-Za-z]{2}$/.test(input.address.region.trim())) problems.region = 'Use the 2-letter state code, like OR.';
  if (!ZIP.test(input.address.postcode.trim())) problems.postcode = 'Enter a 5-digit ZIP code.';
  if (!languages.includes(input.preferredLanguage)) problems.preferredLanguage = 'Choose a language.';
  return problems;
}

/** Tidies valid input for saving: trimmed, phone formatted, state upper-cased, blanks dropped. */
export function normaliseContact(input: ContactUpdate): ContactUpdate {
  const optional = (value?: string) => value?.trim() || undefined;
  const address: Address = {
    line1: input.address.line1.trim(),
    line2: optional(input.address.line2),
    city: input.address.city.trim(),
    region: input.address.region.trim().toUpperCase(),
    postcode: input.address.postcode.trim(),
  };
  return {
    preferredName: optional(input.preferredName),
    pronouns: optional(input.pronouns),
    email: input.email.trim().toLowerCase(),
    phone: normalisePhone(input.phone) ?? input.phone,
    address,
    preferredLanguage: input.preferredLanguage,
  };
}

// ── Caregivers ──────────────────────────────────────────────────────────────

export const MAX_CAREGIVERS = 4;

export const scopeLabels: Record<CaregiverScope, { label: string; detail: string }> = {
  appointments: { label: 'Appointments', detail: 'See, book and cancel visits' },
  messages: { label: 'Messages', detail: 'Read and send messages to your care team' },
  results: { label: 'Test results', detail: 'See results and clinician notes' },
  medications: { label: 'Medications', detail: 'See medicines and request refills' },
  billing: { label: 'Billing', detail: 'See statements and make payments' },
};
export const allScopes = Object.keys(scopeLabels) as CaregiverScope[];

export type CaregiverInvite = Pick<CaregiverGrant, 'name' | 'email' | 'relationship' | 'scopes' | 'expiresOn'>;

export type CaregiverStatus = 'invited' | 'active' | 'expired' | 'revoked';

export function caregiverStatus(grant: CaregiverGrant, now: Date = new Date()): CaregiverStatus {
  if (grant.status === 'revoked') return 'revoked';
  if (grant.expiresOn && grant.expiresOn < toIsoDate(now)) return 'expired';
  return grant.status;
}

/** Caregivers who still have, or are about to have, access. */
export function currentCaregivers(grants: CaregiverGrant[], now: Date = new Date()): CaregiverGrant[] {
  return grants.filter((g) => ['invited', 'active'].includes(caregiverStatus(g, now)));
}

export function inviteProblems(
  invite: CaregiverInvite,
  { existing, patientEmail, now = new Date() }: { existing: CaregiverGrant[]; patientEmail: string; now?: Date },
): Partial<Record<'name' | 'email' | 'relationship' | 'scopes' | 'expiresOn' | 'form', string>> {
  const problems: ReturnType<typeof inviteProblems> = {};
  const email = invite.email.trim().toLowerCase();
  if (!invite.name.trim()) problems.name = 'Enter their name.';
  else if (invite.name.trim().length > NAME_MAX) problems.name = `Keep it under ${NAME_MAX} characters.`;
  if (!EMAIL.test(email)) problems.email = 'Enter an email address like name@example.com.';
  else if (email === patientEmail.toLowerCase()) problems.email = 'That’s your own email. Invite someone else.';
  else if (currentCaregivers(existing, now).some((g) => g.email.toLowerCase() === email)) {
    problems.email = 'This person already has access or an invitation.';
  }
  if (!invite.relationship.trim()) problems.relationship = 'Say how you know them, like Parent or Partner.';
  if (invite.scopes.length === 0) problems.scopes = 'Choose at least one thing they can see.';
  if (invite.expiresOn && invite.expiresOn <= toIsoDate(now)) problems.expiresOn = 'Choose a date after today.';
  if (currentCaregivers(existing, now).length >= MAX_CAREGIVERS) {
    problems.form = `You can have up to ${MAX_CAREGIVERS} caregivers. Remove one to invite someone new.`;
  }
  return problems;
}

// ── Privacy ─────────────────────────────────────────────────────────────────

export const consentDetails: Record<ConsentKind, { title: string; body: string }> = {
  'records-exchange': {
    title: 'Share my records with other providers',
    body: 'Hospitals and clinics treating you can see your Mendwell records through the regional health exchange. Turning this off can slow down care elsewhere, especially in an emergency.',
  },
  research: {
    title: 'Use my de-identified data for research',
    body: 'Your name and contact details are removed first. It never affects your care either way.',
  },
  surveys: {
    title: 'Ask me about my experience',
    body: 'Short surveys after some visits, by email.',
  },
};
export const consentKinds = Object.keys(consentDetails) as ConsentKind[];

export const accessActionLabels: Record<AccessAction, string> = {
  'viewed-chart': 'Viewed your chart',
  'reviewed-results': 'Reviewed your results',
  'replied-message': 'Replied to your message',
  'updated-billing': 'Worked on your account',
};

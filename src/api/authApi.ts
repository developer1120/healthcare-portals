import { addHours, addMinutes } from 'date-fns';
import type { Credentials, Session } from '@/auth/types';
import { demoAccounts } from '@/data/seed/accounts';
import { respond } from './client';
import { ApiError } from './errors';

export const SESSION_HOURS = 8;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 5;

/** Failed sign-ins per email, so repeated guessing locks the account for a while. */
const failures = new Map<string, { count: number; lockedUntil?: Date }>();

function normalise(email: string): string {
  return email.trim().toLowerCase();
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function checkCredentials({ email, password }: Credentials): Session {
  const key = normalise(email);
  const now = new Date();
  const record = failures.get(key);

  if (record?.lockedUntil && record.lockedUntil > now) {
    throw new ApiError(`Too many attempts. Try again in ${LOCKOUT_MINUTES} minutes or reset your password.`, {
      status: 429,
      code: 'rate-limited',
    });
  }

  const account = demoAccounts.find((a) => a.email === key);
  if (!account || account.password !== password) {
    const count = (record?.lockedUntil ? 0 : (record?.count ?? 0)) + 1;
    failures.set(key, {
      count,
      lockedUntil: count >= MAX_FAILED_ATTEMPTS ? addMinutes(now, LOCKOUT_MINUTES) : undefined,
    });
    // Same message whether the email exists or not, so accounts can't be discovered.
    throw new ApiError('That email and password don’t match our records.', { status: 401, code: 'unauthorized' });
  }

  failures.delete(key);
  return {
    token: newToken(),
    accountId: account.id,
    role: account.role,
    subjectId: account.subjectId,
    displayName: account.displayName,
    issuedAt: now.toISOString(),
    expiresAt: addHours(now, SESSION_HOURS).toISOString(),
  };
}

export const authApi = {
  signIn: (credentials: Credentials) => respond(() => checkCredentials(credentials)),
  /** Ends the session on the server. The mock has nothing to revoke, but keeps the round trip. */
  signOut: (_token: string) => respond(() => undefined),
};

export function resetAuthServer(): void {
  failures.clear();
}

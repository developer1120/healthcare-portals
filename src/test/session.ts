import { addHours } from 'date-fns';
import { useSessionStore } from '@/auth/sessionStore';
import type { Role, Session } from '@/auth/types';
import { demoAccounts } from '@/data/seed/accounts';

/** A valid session for the first demo account with this role (Ava, or Jonas Lindqvist). */
export function demoSession(role: Role, overrides: Partial<Session> = {}): Session {
  const account = demoAccounts.find((a) => a.role === role)!;
  const now = new Date();
  return {
    token: `test-token-${account.id}`,
    accountId: account.id,
    role,
    subjectId: account.subjectId,
    displayName: account.displayName,
    issuedAt: now.toISOString(),
    expiresAt: addHours(now, 8).toISOString(),
    ...overrides,
  };
}

/** Puts a session in the store as if the user had just signed in. */
export function signInAs(role: Role, overrides: Partial<Session> = {}): Session {
  const session = demoSession(role, overrides);
  useSessionStore.getState().setSession(session, false);
  return session;
}

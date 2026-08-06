import { screen, waitFor, within } from '@testing-library/react';
import { addHours, addMinutes } from 'date-fns';
import { LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS, SESSION_HOURS, authApi } from '@/api/authApi';
import { configureApi } from '@/api/config';
import { queryKeys } from '@/api/queryKeys';
import { DEMO_PASSWORD } from '@/data/seed/accounts';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';
import { demoSession, signInAs } from '@/test/session';
import { isExpired, pathAllowedFor, redirectAfterSignIn } from './session';
import { SESSION_STORAGE_KEY, useSessionStore } from './sessionStore';

const AVA_EMAIL = 'ava.thompson@example.com';

describe('redirectAfterSignIn', () => {
  it('returns to the page the user asked for when it belongs to their role', () => {
    expect(redirectAfterSignIn('patient', '/results?panel=lab-007')).toBe('/results?panel=lab-007');
    expect(redirectAfterSignIn('clinician', '/clinic/inbox')).toBe('/clinic/inbox');
  });

  it('falls back to the role’s home for the other role’s pages', () => {
    expect(redirectAfterSignIn('patient', '/clinic/patients')).toBe('/');
    expect(redirectAfterSignIn('clinician', '/medications')).toBe('/clinic');
    expect(redirectAfterSignIn('patient', '/sign-in')).toBe('/');
    expect(redirectAfterSignIn('patient', null)).toBe('/');
  });

  it.each(['https://evil.example/', '//evil.example', '/\\evil.example', 'javascript:alert(1)'])(
    'refuses to leave the site for %s',
    (target) => {
      expect(redirectAfterSignIn('patient', target)).toBe('/');
    },
  );

  it('tells the two halves of the app apart without being fooled by prefixes', () => {
    expect(pathAllowedFor('clinician', '/clinic')).toBe(true);
    expect(pathAllowedFor('clinician', '/clinical-trials')).toBe(false);
    expect(pathAllowedFor('patient', '/clinical-trials')).toBe(true);
  });
});

describe('authApi.signIn', () => {
  it('issues a session that lasts a working day', async () => {
    const session = await authApi.signIn({ email: AVA_EMAIL, password: DEMO_PASSWORD });
    expect(session).toMatchObject({ role: 'patient', subjectId: 'pat-ava', displayName: 'Ava Thompson' });
    expect(session.token).toMatch(/^[0-9a-f]{48}$/);
    expect(session.expiresAt).toBe(addHours(TEST_NOW, SESSION_HOURS).toISOString());
  });

  it('ignores case and surrounding spaces in the email', async () => {
    await expect(authApi.signIn({ email: `  ${AVA_EMAIL.toUpperCase()} `, password: DEMO_PASSWORD })).resolves.toMatchObject({
      subjectId: 'pat-ava',
    });
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await authApi.signIn({ email: AVA_EMAIL, password: 'nope' }).catch((e: unknown) => e);
    const unknownEmail = await authApi.signIn({ email: 'nobody@example.com', password: 'nope' }).catch((e: unknown) => e);
    expect(wrongPassword).toMatchObject({ status: 401, code: 'unauthorized' });
    expect((unknownEmail as Error).message).toBe((wrongPassword as Error).message);
  });

  it('locks the account after repeated failures, even for the right password, then unlocks', async () => {
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await authApi.signIn({ email: AVA_EMAIL, password: 'guess' }).catch(() => undefined);
    }
    await expect(authApi.signIn({ email: AVA_EMAIL, password: DEMO_PASSWORD })).rejects.toMatchObject({
      status: 429,
      code: 'rate-limited',
    });

    vi.setSystemTime(addMinutes(TEST_NOW, LOCKOUT_MINUTES + 1));
    await expect(authApi.signIn({ email: AVA_EMAIL, password: DEMO_PASSWORD })).resolves.toMatchObject({
      subjectId: 'pat-ava',
    });
  });
});

describe('session store', () => {
  it('keeps a remembered session in localStorage, otherwise only for this tab', () => {
    const session = demoSession('patient');
    useSessionStore.getState().setSession(session, true);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    useSessionStore.getState().setSession(session, false);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();

    useSessionStore.getState().clearSession();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(useSessionStore.getState().session).toBeNull();
  });

  it('knows when a session has expired', () => {
    expect(isExpired(demoSession('patient'))).toBe(false);
    expect(isExpired(demoSession('patient', { expiresAt: TEST_NOW.toISOString() }))).toBe(true);
  });
});

describe('route guards', () => {
  it('sends signed-out visitors to sign in, remembering where they were going', () => {
    const { router } = renderRoute('/results?tab=trends', { as: null });
    expect(router.state.location.pathname).toBe('/sign-in');
    expect(new URLSearchParams(router.state.location.search).get('redirect')).toBe('/results?tab=trends');
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('keeps clinicians out of the patient portal and patients out of the clinic', () => {
    const clinician = renderRoute('/medications', { as: 'clinician' });
    expect(clinician.router.state.location.pathname).toBe('/clinic');
    clinician.unmount();

    const patient = renderRoute('/clinic/patients', { as: 'patient' });
    expect(patient.router.state.location.pathname).toBe('/');
  });

  it('signs out an expired session and explains why', async () => {
    signInAs('patient', { expiresAt: addMinutes(TEST_NOW, -1).toISOString() });
    const { router } = renderRoute('/vitals', { as: null });

    expect(router.state.location.pathname).toBe('/sign-in');
    expect(await screen.findByRole('status')).toHaveTextContent('Your session expired');
    await waitFor(() => expect(useSessionStore.getState().session).toBeNull());
  });

  it('skips the sign-in page for someone already signed in', () => {
    const { router } = renderRoute('/sign-in', { as: 'clinician' });
    expect(router.state.location.pathname).toBe('/clinic');

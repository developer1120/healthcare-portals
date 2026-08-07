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
  });
});

describe('SignInPage', () => {
  it('explains what is missing before calling the server', async () => {
    const signIn = vi.spyOn(authApi, 'signIn');
    const { user } = renderRoute('/sign-in', { as: null });

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription('Enter your email address');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password');
    expect(signIn).not.toHaveBeenCalled();

    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ava@');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription(
      'Enter an email address like name@example.com',
    );
  });

  it('signs in and continues to the page that was asked for', async () => {
    const { user, router } = renderRoute('/sign-in?redirect=%2Fresults', { as: null });

    await user.type(screen.getByRole('textbox', { name: 'Email' }), AVA_EMAIL);
    await user.type(screen.getByLabelText('Password'), DEMO_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/results'));
    expect(useSessionStore.getState().session).toMatchObject({ subjectId: 'pat-ava' });
    // Not remembered: the session lives only for this tab.
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('remembers the session on this device when asked', async () => {
    const { user } = renderRoute('/sign-in', { as: null });
    await user.type(screen.getByRole('textbox', { name: 'Email' }), AVA_EMAIL);
    await user.type(screen.getByLabelText('Password'), DEMO_PASSWORD);
    await user.click(screen.getByRole('checkbox', { name: 'Keep me signed in on this device' }));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toBeNull());
  });

  it('shows a wrong-password error and puts the cursor back in the password field', async () => {
    const { user } = renderRoute('/sign-in', { as: null });
    await user.type(screen.getByRole('textbox', { name: 'Email' }), AVA_EMAIL);
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That email and password don’t match our records.');
    expect(screen.getByLabelText('Password')).toHaveFocus();
  });

  it('can show the password while typing', async () => {
    const { user } = renderRoute('/sign-in', { as: null });
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers one-click demo accounts for each role', async () => {
    const { user, router } = renderRoute('/sign-in', { as: null });

    await user.click(screen.getByRole('button', { name: /Continue as Jonas Lindqvist/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/clinic'));
    const nav = await screen.findByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByRole('link', { name: 'Patients' })).toHaveAttribute('href', '/clinic/patients');
    expect(within(nav).queryByRole('link', { name: 'Medications' })).not.toBeInTheDocument();
    // Clinicians get no patient care panel.
    expect(screen.queryByRole('complementary', { name: 'Care panel' })).not.toBeInTheDocument();
  });

  it('reports a dropped connection', async () => {
    configureApi({ failureRate: 1 });
    const { user } = renderRoute('/sign-in', { as: null });
    await user.click(screen.getByRole('button', { name: /Continue as Ava Thompson/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The connection dropped.');
  });
});

describe('account menu', () => {
  it('shows who is signed in and closes with Escape', async () => {
    const { user } = renderRoute('/');
    const trigger = screen.getByRole('button', { name: /Ava Thompson/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByText('Patient account').closest('div')!.parentElement!;
    expect(within(panel).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');

    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('signs out, clears cached health data and confirms on the sign-in page', async () => {
    const { user, router, queryClient } = renderRoute('/');
    await screen.findByText('Dr. Maya Okafor');
    expect(queryClient.getQueryData(queryKeys.careTeam('pat-ava'))).toBeDefined();

    await user.click(screen.getByRole('button', { name: /Ava Thompson/ }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/sign-in'));
    expect(useSessionStore.getState().session).toBeNull();
    expect(await screen.findByRole('status')).toHaveTextContent('You’ve signed out.');
    await waitFor(() => expect(queryClient.getQueryData(queryKeys.careTeam('pat-ava'))).toBeUndefined());
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('leaves no patient data behind even when sign-out interrupts loading', async () => {
    // Slow responses, so the dashboard and care panel are still loading at sign-out.
    configureApi({ latency: { min: 40, max: 40 } });
    const { user, queryClient } = renderRoute('/');
    await user.click(screen.getByRole('button', { name: /Ava Thompson/ }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await screen.findByRole('heading', { level: 1, name: 'Sign in' });
    // Wait past the latency so any late responses have landed.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(queryClient.getQueryCache().getAll().filter((query) => query.state.data !== undefined)).toEqual([]);
  });
});

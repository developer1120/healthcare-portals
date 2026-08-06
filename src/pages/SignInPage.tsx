import { useEffect, useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import {
  IconCalendarEvent,
  IconEye,
  IconEyeOff,
  IconLock,
  IconMessage2,
  IconStethoscope,
  IconTestPipe,
  IconUser,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { authApi } from '@/api/authApi';
import { errorMessage } from '@/api/errors';
import { isExpired, redirectAfterSignIn, useSession } from '@/auth/session';
import { useSessionStore } from '@/auth/sessionStore';
import type { SessionEndReason } from '@/auth/sessionStore';
import type { Credentials } from '@/auth/types';
import { demoAccounts } from '@/data/seed/accounts';
import type { DemoAccount } from '@/data/seed/accounts';
import { Button, Field, IconButton, Input } from '@/ui';

const signInSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').pipe(z.email('Enter an email address like name@example.com')),
  password: z.string().min(1, 'Enter your password'),
  remember: z.boolean(),
});

type SignInValues = z.infer<typeof signInSchema>;

const notices: Record<SessionEndReason, string> = {
  expired: 'Your session expired. Sign in again to pick up where you left off.',
  'signed-out': 'You’ve signed out. Your health information has been cleared from this device.',
};

const highlights: { icon: Icon; text: string }[] = [
  { icon: IconCalendarEvent, text: 'Book, move and join visits' },
  { icon: IconMessage2, text: 'Message your care team securely' },
  { icon: IconTestPipe, text: 'See results with plain-language notes' },
];

const demoIcons: Record<DemoAccount['role'], Icon> = { patient: IconUser, clinician: IconStethoscope };

export function SignInPage() {
  const session = useSession();
  const setSession = useSessionStore((state) => state.setSession);
  const endReason = useSessionStore((state) => state.endReason);
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const formId = useId();

  const {
    register,
    handleSubmit,
    getValues,
    setFocus,
    formState: { errors },
  } = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '', remember: false },
  });

  const signIn = useMutation({
    mutationFn: (credentials: Credentials) => authApi.signIn(credentials),
    onSuccess: (newSession) => {
      // Never show one person's cached data to the next.
      queryClient.clear();
      // The page re-renders signed in and redirects below.
      setSession(newSession, getValues('remember'));
    },
  });

  useEffect(() => {
    document.title = 'Sign in · Mendwell';
  }, []);

  useEffect(() => {
    if (signIn.isError) setFocus('password');
  }, [signIn.isError, setFocus]);

  // Already signed in (or just signed in): carry on to where they were going.
  if (session && !isExpired(session)) {
    return <Navigate to={redirectAfterSignIn(session.role, params.get('redirect'))} replace />;
  }

  const notice = endReason ? notices[endReason] : undefined;
  const onSubmit = handleSubmit(({ email, password }) => signIn.mutate({ email, password }));

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-rail p-10 text-rail-ink lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-[12px] bg-accent font-display text-lg font-semibold text-on-accent">
            m
          </span>
          <span className="font-display text-xl font-semibold text-white">Mendwell</span>
        </div>
        <div className="max-w-sm">
          <p className="font-display text-4xl leading-tight font-semibold text-white">Care that keeps up with you.</p>
          <ul className="mt-8 flex flex-col gap-4">
            {highlights.map(({ icon: HighlightIcon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-control bg-rail-active text-white">
                  <HighlightIcon aria-hidden size={18} stroke={1.75} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs">A demo portal. All people and records are fictional.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-[12px] bg-accent font-display text-lg font-semibold text-on-accent">
              m
            </span>
            <span className="font-display text-xl font-semibold">Mendwell</span>
          </div>
          <h1 className="text-3xl">Sign in</h1>
          <p className="mt-1 text-sm text-ink-muted">Patients and care teams use the same sign-in.</p>

          {notice && (
            <p role="status" className="mt-6 rounded-control bg-data-soft px-3 py-2.5 text-sm text-data-ink">
              {notice}
            </p>
          )}

          <form id={formId} noValidate onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            {signIn.isError && (
              <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
                {errorMessage(signIn.error)}
              </p>
            )}
            <Field label="Email" error={errors.email?.message}>
              <Input type="email" autoComplete="username" placeholder="name@example.com" {...register('email')} />
            </Field>
            <Field label="Password" error={errors.password?.message}>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="pr-11"
                  {...register('password')}
                />
                <IconButton
                  icon={showPassword ? IconEyeOff : IconEye}
                  label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword((shown) => !shown)}
                  className="absolute top-1 right-1"
                />
              </div>
            </Field>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--mw-ok)]" {...register('remember')} />
              Keep me signed in on this device
            </label>
            <Button type="submit" variant="primary" icon={IconLock} loading={signIn.isPending} className="mt-1">
              Sign in
            </Button>
          </form>

          <section aria-labelledby={`${formId}-demo`} className="mt-10 border-t border-line pt-6">
            <h2 id={`${formId}-demo`} className="font-sans text-sm font-semibold tracking-normal">
              Try the demo
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">Sign in as one of these fictional people.</p>
            <ul className="mt-3 flex flex-col gap-2">
              {demoAccounts.map((account) => {
                const DemoIcon = demoIcons[account.role];
                return (
                  <li key={account.id}>
                    <button
                      type="button"
                      disabled={signIn.isPending}
                      onClick={() => signIn.mutate({ email: account.email, password: account.password })}
                      className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-line-strong disabled:opacity-60"
                    >
                      <span className="flex size-9 items-center justify-center rounded-control bg-surface-sunken text-ink-muted">
                        <DemoIcon aria-hidden size={18} stroke={1.75} />
                      </span>
                      <span className="text-sm">
                        <span className="block font-medium">Continue as {account.displayName}</span>
                        <span className="block text-xs text-ink-muted">
                          {account.role === 'patient' ? 'Patient portal' : 'Clinician workspace'}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}

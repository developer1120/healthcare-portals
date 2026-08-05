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

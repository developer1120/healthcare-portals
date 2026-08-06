import { toDate } from '@/lib/dates';
import { useSessionStore } from './sessionStore';
import type { Role, Session } from './types';

export const homePathFor: Record<Role, string> = {
  patient: '/',
  clinician: '/clinic',
};

export function isExpired(session: Session, now: Date = new Date()): boolean {
  return toDate(session.expiresAt) <= now;
}

/** Whether a path belongs to the given role's part of the app. */
export function pathAllowedFor(role: Role, path: string): boolean {
  const inClinic = path === '/clinic' || path.startsWith('/clinic/') || path.startsWith('/clinic?');
  return role === 'clinician' ? inClinic : !inClinic;
}

/**
 * Where to go after signing in. Only same-site paths are honoured, so a crafted
 * ?redirect=https://evil.example link can't send people elsewhere.
 */
export function redirectAfterSignIn(role: Role, requested: string | null): string {
  const safe = requested && requested.startsWith('/') && !requested.startsWith('//') && !requested.includes('\\');
  if (safe && requested !== '/sign-in' && pathAllowedFor(role, requested)) return requested;
  return homePathFor[role];
}

export function useSession(): Session | null {
  return useSessionStore((state) => state.session);
}

/** The signed-in session. Only for components rendered behind a route guard. */
export function useRequiredSession(): Session {
  const session = useSession();
  if (!session) throw new Error('useRequiredSession was used outside a signed-in route.');
  return session;
}

/** The signed-in patient's id. Only for patient routes. */
export function usePatientId(): string {
  const session = useRequiredSession();
  if (session.role !== 'patient') throw new Error('usePatientId was used outside the patient portal.');
  return session.subjectId;
}

/** The signed-in clinician's id. Only for clinician routes. */
export function useClinicianId(): string {
  const session = useRequiredSession();
  if (session.role !== 'clinician') throw new Error('useClinicianId was used outside the clinician workspace.');
  return session.subjectId;
}

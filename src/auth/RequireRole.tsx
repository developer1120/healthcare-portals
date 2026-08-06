import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { homePathFor, isExpired, useSession } from './session';
import { useSessionStore } from './sessionStore';
import type { Role } from './types';

function RequireRole({ role }: { role: Role }) {
  const session = useSession();
  const clearSession = useSessionStore((state) => state.clearSession);
  const location = useLocation();
  const expired = session ? isExpired(session) : false;

  useEffect(() => {
    if (expired) clearSession('expired');
  }, [expired, clearSession]);

  if (!session || expired) {
    const params = new URLSearchParams({ redirect: location.pathname + location.search });
    return <Navigate to={`/sign-in?${params}`} replace />;
  }

  // Signed in, but this part of the app belongs to the other role.
  if (session.role !== role) return <Navigate to={homePathFor[session.role]} replace />;

  return <Outlet />;
}

export function PatientGate() {
  return <RequireRole role="patient" />;
}

export function ClinicianGate() {
  return <RequireRole role="clinician" />;
}

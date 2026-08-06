import { create } from 'zustand';
import type { Session } from './types';

export const SESSION_STORAGE_KEY = 'mendwell:session';

/** Why the last session ended, so the sign-in page can say so. */
export type SessionEndReason = 'signed-out' | 'expired';

/**
 * "Keep me signed in" stores the session in localStorage; otherwise it lives in
 * sessionStorage and ends when the browser tab closes. Only one copy exists.
 */
function readStoredSession(): Session | null {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(SESSION_STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Session;
    } catch {
      // Ignore unreadable entries and blocked storage.
    }
  }
  return null;
}

function writeStoredSession(session: Session | null, remember: boolean): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    if (session) (remember ? localStorage : sessionStorage).setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked: the session still works until the page reloads.
  }
}

interface SessionState {
  session: Session | null;
  endReason: SessionEndReason | null;
  setSession: (session: Session, remember: boolean) => void;
  clearSession: (reason?: SessionEndReason) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  session: readStoredSession(),
  endReason: null,
  setSession: (session, remember) => {
    writeStoredSession(session, remember);
    set({ session, endReason: null });
  },
  clearSession: (reason) => {
    writeStoredSession(null, false);
    set({ session: null, endReason: reason ?? null });
  },
}));

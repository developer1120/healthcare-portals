import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { authApi } from '@/api/authApi';
import { useSessionStore } from './sessionStore';

/**
 * Signs out: ends the server session, then drops the local session and every
 * cached query so no health data stays in memory for the next person.
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useCallback(async () => {
    const { session, clearSession } = useSessionStore.getState();
    if (session) {
      // Signing out locally must work even when the network doesn't.
      await authApi.signOut(session.token).catch(() => undefined);
    }
    clearSession('signed-out');
    // Stop anything still loading, leave the signed-in pages, and only then
    // empty the cache, so a page that is still mounted can't refill it.
    await queryClient.cancelQueries();
    await navigate('/sign-in', { replace: true });
    queryClient.clear();
  }, [navigate, queryClient]);
}

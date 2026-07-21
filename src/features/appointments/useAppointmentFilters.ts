import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { AppointmentFilters } from '@/domain/appointments';
import type { AppointmentStatus, VisitMode } from '@/domain/types';

export type AppointmentView = 'upcoming' | 'past';

const modes: VisitMode[] = ['video', 'in-person'];
const statuses: AppointmentStatus[] = ['completed', 'cancelled', 'no-show'];

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/**
 * The appointments view and filters, kept in the URL so they survive a reload
 * and can be shared or bookmarked. Unknown values are ignored.
 */
export function useAppointmentFilters() {
  const [params, setParams] = useSearchParams();

  const view: AppointmentView = params.get('view') === 'past' ? 'past' : 'upcoming';
  const filters = useMemo<AppointmentFilters>(
    () => ({
      clinicianId: params.get('clinician') ?? undefined,
      mode: oneOf(params.get('mode'), modes),
      // Outcome only applies to past visits.
      status: view === 'past' ? oneOf(params.get('status'), statuses) : undefined,
      query: params.get('q') ?? undefined,
    }),
    [params, view],
  );
  const hasFilters = Boolean(filters.clinicianId || filters.mode || filters.status || filters.query);

  const update = useCallback(
    (changes: Record<string, string | undefined>, options: { replace?: boolean } = { replace: true }) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: options.replace, preventScrollReset: true },
      );
    },
    [setParams],
  );

  return {
    view,
    filters,
    hasFilters,
    // Switching view is a real navigation, so Back returns to the other list.
    setView: (next: AppointmentView) =>
      update({ view: next === 'upcoming' ? undefined : next, status: undefined }, { replace: false }),
    setClinician: (id: string) => update({ clinician: id || undefined }),
    setMode: (mode: string) => update({ mode: mode || undefined }),
    setStatus: (status: string) => update({ status: status || undefined }),
    setQuery: (query: string) => update({ q: query || undefined }),
    clear: () => update({ clinician: undefined, mode: undefined, status: undefined, q: undefined }),
  };
}

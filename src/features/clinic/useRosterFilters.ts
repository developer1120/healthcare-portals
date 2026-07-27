import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { defaultRosterFilters, riskFactorLabels } from '@/domain/risk';
import type { RiskFactorKey, RiskLevel, RosterFilters, RosterScope, RosterSort } from '@/domain/risk';

const levels: RiskLevel[] = ['high', 'rising', 'routine'];
const sorts: RosterSort[] = ['risk', 'name', 'next-visit'];
const factorKeys = Object.keys(riskFactorLabels) as RiskFactorKey[];

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

/**
 * Roster filters kept in the URL, so a filtered list survives opening a chart
 * and coming back. Unknown values fall back to the defaults.
 */
export function useRosterFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<RosterFilters>(
    () => ({
      query: params.get('q') ?? '',
      level: oneOf(params.get('risk'), levels) ?? 'all',
      factors: (params.get('flags') ?? '')
        .split(',')
        .filter((key): key is RiskFactorKey => factorKeys.includes(key as RiskFactorKey)),
      scope: params.get('scope') === 'primary' ? 'primary' : 'care-team',
      sort: oneOf(params.get('sort'), sorts) ?? defaultRosterFilters.sort,
    }),
    [params],
  );
  const hasFilters = Boolean(filters.query || filters.level !== 'all' || filters.factors.length || filters.scope !== 'care-team');

  const update = useCallback(
    (changes: Record<string, string | undefined>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(changes)) {
            if (value) next.set(key, value);
            else next.delete(key);
          }
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setParams],
  );

  return {
    filters,
    hasFilters,
    setQuery: (query: string) => update({ q: query || undefined }),
    setLevel: (level: RiskLevel | 'all') => update({ risk: level === 'all' ? undefined : level }),
    toggleFactor: (key: RiskFactorKey) => {
      const next = filters.factors.includes(key) ? filters.factors.filter((k) => k !== key) : [...filters.factors, key];
      // Keep the chip order stable in the URL.
      update({ flags: factorKeys.filter((k) => next.includes(k)).join(',') || undefined });
    },
    setScope: (scope: RosterScope) => update({ scope: scope === 'care-team' ? undefined : scope }),
    setSort: (sort: RosterSort) => update({ sort: sort === 'risk' ? undefined : sort }),
    clear: () => update({ q: undefined, risk: undefined, flags: undefined, scope: undefined }),
  };
}

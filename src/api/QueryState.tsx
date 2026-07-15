import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { IconRefresh } from '@tabler/icons-react';
import { Button, Skeleton } from '@/ui';
import { errorMessage } from './errors';

interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  /** What is loading, for screen readers and the error message, e.g. "your care team". */
  label: string;
  /** Shown while loading. Defaults to three skeleton lines. */
  loading?: ReactNode;
  children: (data: T) => ReactNode;
}

/** Renders a query's loading, error (with retry) and success states consistently. */
export function QueryState<T>({ query, label, loading, children }: QueryStateProps<T>) {
  if (query.isPending) {
    return (
      <div role="status" aria-label={`Loading ${label}`} className="flex flex-col gap-2">
        {loading ?? (
          <>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </>
        )}
      </div>
    );
  }

  // Only an error with nothing to show replaces the content. If a background
  // refresh fails, keep showing what was already loaded (and anything the
  // person was typing next to it); the next refresh will try again.
  if (query.data === undefined) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 rounded-control bg-critical-soft px-3 py-2.5">
        <p className="text-sm text-critical-ink">
          We couldn't load {label}. {errorMessage(query.error)}
        </p>
        <Button size="sm" icon={IconRefresh} loading={query.isFetching} onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return <>{children(query.data)}</>;
}

import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './errors';

/** Retry dropped connections up to twice; never retry a 404 or validation error. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return isApiError(error) && error.retryable && failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        retryDelay: (attempt) => Math.min(400 * 2 ** attempt, 3_000),
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { createQueryClient } from '@/api/queryClient';
import { routes } from '@/app/routes';
import type { Role } from '@/auth/types';
import { signInAs } from './session';

/** The app's query client, minus retry back-off so failing tests stay fast. */
export function createTestQueryClient(): QueryClient {
  const client = createQueryClient();
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retryDelay: 0, gcTime: Infinity },
  });
  return client;
}

export function withQueryClient(queryClient: QueryClient = createTestQueryClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

interface RenderRouteOptions {
  queryClient?: QueryClient;
  /** Who is signed in. Defaults to the demo patient; null renders signed out. */
  as?: Role | null;
}

/** Renders the real route table at `path` in memory, with a fresh query client. */
export function renderRoute(
  path = '/',
  { queryClient = createTestQueryClient(), as = 'patient' }: RenderRouteOptions = {},
) {
  if (as) signInAs(as);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  const utils = render(<RouterProvider router={router} />, { wrapper: withQueryClient(queryClient) });
  return { ...utils, router, user, queryClient };
}

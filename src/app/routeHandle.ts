import { useMatches } from 'react-router';

/** Metadata attached to a route via `handle`. */
export interface RouteHandle {
  /** Page heading in the top bar and the document title. */
  title: string;
}

function isRouteHandle(value: unknown): value is RouteHandle {
  return typeof value === 'object' && value !== null && typeof (value as RouteHandle).title === 'string';
}

/** The handle of the deepest matched route that has one. */
export function useRouteHandle(): RouteHandle {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i]?.handle;
    if (isRouteHandle(handle)) return handle;
  }
  return { title: 'Mendwell' };
}

export function documentTitleFor(title: string): string {
  return title === 'Home' || title === 'Mendwell' ? 'Mendwell' : `${title} · Mendwell`;
}

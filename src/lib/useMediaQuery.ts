import { useCallback, useSyncExternalStore } from 'react';

/** Below Tailwind's md breakpoint: phones get the bottom navigation. */
export const PHONE_QUERY = '(max-width: 767px)';
/** Tailwind's xl breakpoint: wide enough for the care panel beside the page. */
export const WIDE_QUERY = '(min-width: 1280px)';

/** Whether a media query matches, kept up to date as the window changes. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
}

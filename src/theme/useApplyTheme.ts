import { useEffect, useSyncExternalStore } from 'react';
import type { ThemeName } from './palette';
import { DARK_QUERY, resolveTheme, systemPrefersDark, useThemeStore } from './themeStore';

function subscribeToSystemTheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** The theme in effect right now, following the OS when the preference is "system". */
export function useResolvedTheme(): ThemeName {
  const preference = useThemeStore((state) => state.preference);
  const prefersDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark, () => false);
  return resolveTheme(preference, prefersDark);
}

/** Writes the resolved theme to <html data-theme> so the CSS tokens switch. */
export function useApplyTheme(): ThemeName {
  const theme = useResolvedTheme();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0A1511' : '#183A2F');
  }, [theme]);

  return theme;
}

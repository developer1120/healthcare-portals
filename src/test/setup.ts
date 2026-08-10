import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { resetAuthServer } from '@/api/authApi';
import { configureApi, resetApiConfig } from '@/api/config';
import { preloadAllPages } from '@/app/pages';
import { resetMockServer } from '@/api/mockDb';
import { useSessionStore } from '@/auth/sessionStore';
import { useLayoutStore } from '@/shell/layoutStore';
import { useThemeStore } from '@/theme/themeStore';
import { TEST_NOW } from './clock';
import { installMatchMedia, resetMatchMedia } from './matchMedia';

// The demo clinic is in Portland, Oregon. Pinning its time zone makes date
// assertions mean the same on every machine; TEST_TZ overrides it to try others.
// Set at runtime because Node on Windows ignores TZ given at startup.
process.env.TZ = process.env.TEST_TZ || 'America/Los_Angeles';

installMatchMedia();

// Pages load on demand in the app. Tests load them all first so a page renders on the
// first pass, as it does once cached in the browser; lazyPage.test covers the loading path.
beforeAll(() => preloadAllPages());

// jsdom does not implement scrolling; the router's ScrollRestoration calls it.
window.scrollTo = () => {};

beforeEach(() => {
  // Only Date is faked, so user events and waitFor keep their real timers.
  vi.useFakeTimers({ toFake: ['Date'], now: TEST_NOW });
  // The pretend API answers instantly and never fails unless a test asks it to.
  configureApi({ latency: { min: 0, max: 0 }, pingLatency: { min: 0, max: 0 }, failureRate: 0 });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetApiConfig();
  // Changes made in one test must not leak into the next.
  resetMockServer();
  resetAuthServer();
  useSessionStore.setState({ session: null, endReason: null });
  localStorage.clear();
  sessionStorage.clear();
  resetMatchMedia();
  useThemeStore.setState({ preference: 'system' });
  useLayoutStore.setState({ carePanelOpen: true, careDrawerOpen: false });
  delete document.documentElement.dataset.theme;
  document.title = '';
});

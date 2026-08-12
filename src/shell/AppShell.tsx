import { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router';
import { navFor } from '@/app/navigation';
import { preloadPage } from '@/app/pages';
import { documentTitleFor, useRouteHandle } from '@/app/routeHandle';
import { useRequiredSession } from '@/auth/session';
import { PHONE_QUERY, WIDE_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { cx } from '@/ui';
import { BottomNav } from './BottomNav';
import { CareDrawer, CarePanel } from './CarePanel';
import { IconRail } from './IconRail';
import { PageSkeleton } from './PageSkeleton';
import { TopBar } from './TopBar';
import { useLayoutStore } from './layoutStore';
import { PageHeadingContext } from './pageHeading';

/**
 * The frame around every signed-in page. On wide screens: icon rail | page |
 * care panel (patients only, and it can be hidden). Below that the care panel
 * becomes a drawer, and on phones the rail moves to a bottom bar.
 */
/**
 * Tells screen reader users that a new page has loaded, since an in-app
 * navigation doesn't reload the page. Quiet on the first page.
 */
function RouteAnnouncer({ page }: { page: string }) {
  const { pathname } = useLocation();
  const [message, setMessage] = useState('');
  const lastPath = useRef(pathname);
  const navigated = useRef(false);

  // The heading can settle after the path changes (e.g. a patient's name loading), so follow both.
  useEffect(() => {
    if (pathname !== lastPath.current) {
      lastPath.current = pathname;
      navigated.current = true;
    }
    if (navigated.current) setMessage(page);
  }, [pathname, page]);

  return (
    <p aria-live="polite" aria-atomic="true" className="sr-only" data-testid="route-announcer">
      {message}
    </p>
  );
}

export function AppShell() {
  const { title } = useRouteHandle();
  const { role } = useRequiredSession();
  const { pathname } = useLocation();
  const phone = useMediaQuery(PHONE_QUERY);
  const wide = useMediaQuery(WIDE_QUERY);
  const carePanelOpen = useLayoutStore((state) => state.carePanelOpen);
  const setCareDrawerOpen = useLayoutStore((state) => state.setCareDrawerOpen);
  const showCarePanel = role === 'patient' && wide && carePanelOpen;
  const [heading, setHeading] = useState<string | null>(null);

  useEffect(() => {
    document.title = documentTitleFor(title);
  }, [title]);

  // Once the first page is up, fetch the rest of this role's sections in idle time.
  useEffect(() => {
    const paths = [...navFor[role].main, ...navFor[role].utility].map((item) => item.to);
    const run = () => paths.forEach(preloadPage);
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(run, 2000);
    return () => window.clearTimeout(id);
  }, [role]);

  // Following a link out of the drawer, or widening the window, closes it.
  useEffect(() => {
    setCareDrawerOpen(false);
  }, [pathname, wide, setCareDrawerOpen]);

  return (
    <div
      className={cx(
        'grid min-h-dvh print:block',
        phone ? 'grid-cols-[minmax(0,1fr)]' : showCarePanel ? 'grid-cols-[76px_minmax(0,1fr)_300px]' : 'grid-cols-[76px_minmax(0,1fr)]',
      )}
    >
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-accent px-4 py-2 font-semibold text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to main content
      </a>
      {!phone && <IconRail />}
      <div className="flex min-w-0 flex-col">
        <TopBar heading={heading ?? title} />
        <main
          id="main"
          tabIndex={-1}
          className={cx('flex-1 px-4 outline-none sm:px-6 lg:px-8', phone ? 'pb-28' : 'pb-12')}
        >
          <PageHeadingContext.Provider value={setHeading}>
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </PageHeadingContext.Provider>
        </main>
      </div>
      {showCarePanel && <CarePanel className="print:hidden" />}
      {role === 'patient' && !wide && <CareDrawer />}
      {phone && <BottomNav />}
      <RouteAnnouncer page={heading ?? title} />
      <ScrollRestoration />
    </div>
  );
}

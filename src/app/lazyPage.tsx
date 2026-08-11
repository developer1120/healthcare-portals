import type { ComponentType } from 'react';

export interface LazyPage {
  (): React.JSX.Element;
  /** Starts loading the page's code, e.g. when a link to it is hovered. */
  preload: () => Promise<unknown>;
  displayName?: string;
}

/**
 * A page whose code is fetched on first use. Unlike React.lazy it renders
 * straight away once loaded, so a preloaded page never flashes its skeleton.
 * Until then it suspends, and the nearest Suspense boundary shows a skeleton.
 *
 * A failed download is thrown as an error for the error boundary, and stays
 * failed until something deliberately calls preload() again. Rendering alone
 * never retries, so a dead network can't turn into a download loop.
 */
export function lazyPage(load: () => Promise<ComponentType>, name: string): LazyPage {
  let Loaded: ComponentType | undefined;
  let pending: Promise<unknown> | undefined;
  let failure: { error: unknown } | undefined;

  const fetchPage = () =>
    (pending ??= load().then(
      (component) => {
        Loaded = component;
      },
      (error: unknown) => {
        failure = { error };
        pending = undefined;
        throw error;
      },
    ));

  const preload = () => {
    failure = undefined;
    return fetchPage();
  };

  const Page = (() => {
    if (Loaded) return <Loaded />;
    if (failure) throw failure.error;
    throw fetchPage();
  }) as LazyPage;
  Page.preload = preload;
  Page.displayName = `Lazy(${name})`;
  return Page;
}

import { createContext, useContext, useEffect } from 'react';

/** Lets a page replace the route title in the top bar, e.g. the dashboard greeting. */
export const PageHeadingContext = createContext<(heading: string | null) => void>(() => {});

/** Shows `heading` as the page's h1 while the calling page is mounted. */
export function usePageHeading(heading: string | null): void {
  const setHeading = useContext(PageHeadingContext);
  useEffect(() => {
    setHeading(heading);
    return () => setHeading(null);
  }, [heading, setHeading]);
}

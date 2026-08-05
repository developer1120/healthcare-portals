import { Skeleton, cx } from '@/ui';

/**
 * Stand-in while a page's code downloads: the rough shape of a page (a feature
 * card, a row of tiles, a list) rather than a spinner, so the layout doesn't jump.
 */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading page" aria-busy="true" className="flex max-w-6xl flex-col gap-5">
      <Skeleton className="h-36 rounded-card" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className={cx('h-28 rounded-card', i > 1 && 'hidden xl:block')} />
        ))}
      </div>
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}

/** The detail side of a two-pane layout, e.g. an open conversation. */
export function PaneSkeleton() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="flex flex-1 flex-col gap-3">
      <Skeleton className="h-20 rounded-card" />
      <Skeleton className="min-h-64 flex-1 rounded-card" />
    </div>
  );
}

import { cx } from './cx';

/** Grey placeholder block shown while content loads. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx('block animate-pulse rounded-[8px] bg-surface-sunken', className)} />;
}

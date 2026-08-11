import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { Button } from './Button';
import { cx } from './cx';

interface PaginationProps {
  /** What is being paged, for the nav's name, e.g. "Readings pages". */
  label: string;
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  onChange: (page: number) => void;
  /** Button words; newest-first lists read better as Newer and Older. */
  previousLabel?: string;
  nextLabel?: string;
  className?: string;
}

/**
 * Previous / next with where you are. Hidden when everything fits on one page.
 * The position is announced politely so screen reader users hear the change.
 */
export function Pagination({
  label,
  page,
  pageCount,
  from,
  to,
  total,
  onChange,
  previousLabel = 'Previous',
  nextLabel = 'Next',
  className,
}: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={label} className={cx('flex flex-wrap items-center justify-between gap-2', className)}>
      <p aria-live="polite" className="text-xs text-ink-muted tabular">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" icon={IconChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          {previousLabel}
        </Button>
        <span className="text-xs text-ink-muted tabular">
          Page {page} of {pageCount}
        </span>
        <Button size="sm" disabled={page >= pageCount} onClick={() => onChange(page + 1)} className="pr-2">
          {nextLabel}
          <IconChevronRight aria-hidden size={18} stroke={1.75} />
        </Button>
      </div>
    </nav>
  );
}

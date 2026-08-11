import { cx } from './cx';

interface SpinnerProps {
  className?: string;
  /** Announced to screen readers. Omit when a parent already says what is loading. */
  label?: string;
}

export function Spinner({ className, label }: SpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx(
        'inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    />
  );
}

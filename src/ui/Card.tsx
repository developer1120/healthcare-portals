import type { HTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { cx } from './cx';

export type CardTone = 'surface' | 'sunken' | 'pine';

const tones: Record<CardTone, string> = {
  surface: 'border border-line bg-surface',
  sunken: 'bg-surface-sunken',
  // The dark feature card, e.g. "next visit" on the dashboard.
  pine: 'bg-rail text-rail-ink',
};

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  tone?: CardTone;
  /** Renders a <section> labelled by its title instead of a plain <div>. */
  title?: ReactNode;
  description?: ReactNode;
  /** Shown at the right of the header, e.g. a "View all" link or a segmented control. */
  action?: ReactNode;
  /** Heading level for the title, so cards fit the page outline. */
  headingLevel?: 2 | 3;
  padded?: boolean;
}

/** 14px card with a hairline border and no shadow. */
export function Card({
  tone = 'surface',
  title,
  description,
  action,
  headingLevel = 2,
  padded = true,
  className,
  children,
  ...rest
}: CardProps) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const classes = cx('rounded-card', tones[tone], padded && 'p-4 sm:p-5', className);

  if (!title) {
    return (
      <div className={classes} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className={classes} {...rest}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading id={headingId} className={cx('text-base', tone === 'pine' && 'text-white')}>
            {title}
          </Heading>
          {description && (
            <p className={cx('mt-0.5 text-sm', tone === 'pine' ? 'text-rail-ink' : 'text-ink-muted')}>{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}

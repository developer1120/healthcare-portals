import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from '@tabler/icons-react';
import { IconButton } from './Button';
import { cx } from './cx';

/** A centred dialog, a panel sliding in from the right, or a sheet rising from the bottom. */
export type DialogVariant = 'center' | 'drawer' | 'sheet';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  variant?: DialogVariant;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const backdrops: Record<DialogVariant, string> = {
  center: 'items-end justify-center p-4 sm:items-center',
  drawer: 'justify-end',
  sheet: 'items-end',
};

const panels: Record<DialogVariant, string> = {
  center: 'w-full max-w-md rounded-panel border border-line p-5 sm:p-6',
  drawer: 'h-full w-[min(22rem,calc(100vw-3rem))] overflow-y-auto border-l border-line px-5 py-6',
  sheet:
    'max-h-[85dvh] w-full overflow-y-auto rounded-t-panel border-t border-line px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]',
};

/**
 * Modal dialog: focus moves inside on open and returns to the opener on close,
 * Tab stays within the dialog, and Escape or a click on the backdrop closes it.
 * Drawers and sheets also get a close button, since they often hold only links.
 */
export function Dialog({ open, onClose, title, description, children, variant = 'center' }: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current!;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel).focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;
      const firstEl = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className={cx('fixed inset-0 z-50 flex bg-ink/40 dark:bg-black/60', backdrops[variant])}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx('bg-surface shadow-[0_16px_48px_rgb(0_0_0/0.18)] outline-none', panels[variant])}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg">
            {title}
          </h2>
          {variant !== 'center' && <IconButton icon={IconX} label="Close" variant="ghost" size="sm" onClick={onClose} />}
        </div>
        {description && (
          <div id={descriptionId} className="mt-1 text-sm text-ink-muted">
            {description}
          </div>
        )}
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

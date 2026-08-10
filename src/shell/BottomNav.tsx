import { useState } from 'react';
import { useLocation } from 'react-router';
import { IconDots } from '@tabler/icons-react';
import { navFor } from '@/app/navigation';
import { useRequiredSession } from '@/auth/session';
import { Dialog, cx } from '@/ui';
import { NavEntry } from './NavEntry';

/** A bottom bar fits five targets comfortably on a phone. */
const SLOTS = 5;

/**
 * Phone navigation along the bottom edge, in thumb reach. Everything fits for
 * clinicians; patients get their first four sections and "More" for the rest.
 */
export function BottomNav() {
  const { role } = useRequiredSession();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const all = [...navFor[role].main, ...navFor[role].utility];
  const fits = all.length <= SLOTS;
  const shown = fits ? all : all.slice(0, SLOTS - 1);
  const rest = fits ? [] : all.slice(SLOTS - 1);
  const moreActive = rest.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rail-active bg-rail px-1 pb-[env(safe-area-inset-bottom)] print:hidden"
    >
      <ul className="grid auto-cols-fr grid-flow-col">
        {shown.map((item) => (
          <li key={item.to}>
            <NavEntry item={item} variant="bar" />
          </li>
        ))}
        {rest.length > 0 && (
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setMoreOpen(true)}
              className={cx(
                'flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-[12px] text-[11px] font-medium transition-colors',
                moreActive ? 'text-white' : 'text-rail-ink hover:text-white',
              )}
            >
              <span className={cx('flex h-7 w-12 items-center justify-center rounded-full', moreActive && 'bg-rail-active')}>
                <IconDots aria-hidden size={21} stroke={1.75} />
              </span>
              More
            </button>
          </li>
        )}
      </ul>
      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="More" variant="sheet">
        <ul className="flex flex-col gap-1">
          {rest.map((item) => (
            <li key={item.to}>
              <NavEntry item={item} variant="sheet" onNavigate={() => setMoreOpen(false)} />
            </li>
          ))}
        </ul>
      </Dialog>
    </nav>
  );
}

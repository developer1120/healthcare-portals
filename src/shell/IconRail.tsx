import { Link } from 'react-router';
import { navFor } from '@/app/navigation';
import { homePathFor, useRequiredSession } from '@/auth/session';
import { NavEntry } from './NavEntry';

/** Narrow dark pine navigation rail on the left edge, from tablet width up. */
export function IconRail() {
  const { role } = useRequiredSession();
  const nav = navFor[role];
  return (
    <aside className="sticky top-0 flex h-dvh w-[76px] flex-col items-center gap-2 bg-rail py-4 print:hidden dark:border-r dark:border-line">
      <Link
        to={homePathFor[role]}
        aria-label="Mendwell home"
        className="mb-3 flex size-10 items-center justify-center rounded-[12px] bg-accent font-display text-lg font-semibold text-on-accent"
      >
        m
      </Link>
      <nav aria-label="Primary" className="flex flex-1 flex-col items-center">
        <ul className="flex flex-col items-center gap-1.5">
          {nav.main.map((item) => (
            <li key={item.to}>
              <NavEntry item={item} variant="rail" />
            </li>
          ))}
        </ul>
        <ul className="mt-auto flex flex-col items-center gap-1.5">
          {nav.utility.map((item) => (
            <li key={item.to}>
              <NavEntry item={item} variant="rail" />
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

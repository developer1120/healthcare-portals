import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { IconArrowLeft } from '@tabler/icons-react';

/** "← All appointments" style link back to a parent list. */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-ink-muted hover:text-ink"
    >
      <IconArrowLeft aria-hidden size={16} stroke={1.75} />
      {children}
    </Link>
  );
}

import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconChevronDown, IconLogout, IconSettings, IconUserCircle } from '@tabler/icons-react';
import { navFor } from '@/app/navigation';
import { useRequiredSession } from '@/auth/session';
import { useSignOut } from '@/auth/useSignOut';
import { Avatar, Button, cx } from '@/ui';

const roleLabel = { patient: 'Patient', clinician: 'Clinician' } as const;

/**
 * Avatar button that opens a small account popover with settings and sign-out.
 * A disclosure rather than an ARIA menu: Tab moves through its two actions and
 * Escape or a click outside closes it.
 */
export function AccountMenu() {
  const session = useRequiredSession();
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const settings = navFor[session.role].utility[0]!;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-control border border-transparent py-1 pr-2 pl-1 transition-colors hover:border-line hover:bg-surface"
      >
        <Avatar name={session.displayName} decorative />
        <span className="hidden text-left text-sm leading-tight sm:block">
          <span className="block font-medium">{session.displayName}</span>
          <span className="block text-xs text-ink-muted">{roleLabel[session.role]}</span>
        </span>
        <span className="sr-only sm:hidden">{session.displayName}</span>
        <span className="sr-only">account</span>
        <IconChevronDown aria-hidden size={16} className={cx('text-ink-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute top-full right-0 z-30 mt-2 w-64 rounded-card border border-line bg-surface p-2 shadow-[0_8px_24px_rgb(0_0_0/0.08)]"
        >
          <div className="px-2 pt-1 pb-3">
            <p className="text-sm font-medium">{session.displayName}</p>
            <p className="text-xs text-ink-muted">{roleLabel[session.role]} account</p>
          </div>
          {session.role === 'patient' && (
            <Link
              to="/profile"
              onClick={() => setOpen(false)}
              className="flex h-9 items-center gap-2 rounded-[8px] px-2 text-sm hover:bg-surface-sunken"
            >
              <IconUserCircle aria-hidden size={18} stroke={1.75} />
              Profile and privacy
            </Link>
          )}
          <Link
            to={settings.to}
            onClick={() => setOpen(false)}
            className="flex h-9 items-center gap-2 rounded-[8px] px-2 text-sm hover:bg-surface-sunken"
          >
            <IconSettings aria-hidden size={18} stroke={1.75} />
            Settings
          </Link>
          <Button
            variant="ghost"
            icon={IconLogout}
            loading={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut();
            }}
            className="h-9 w-full justify-start px-2 font-normal text-ink"
          >
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}

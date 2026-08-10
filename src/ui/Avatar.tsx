import { cx } from './cx';
import { initialsOf, toneFor } from './initials';
import type { AvatarTone } from './initials';

export type AvatarSize = 'sm' | 'md' | 'lg';

const tones: Record<AvatarTone, string> = {
  coral: 'bg-accent-soft text-accent-ink',
  glacier: 'bg-data-soft text-data-ink',
  sage: 'bg-ok-soft text-ok-ink',
};

const sizes: Record<AvatarSize, string> = {
  sm: 'size-7 rounded-[8px] text-2xs',
  md: 'size-9 rounded-control text-xs',
  lg: 'size-12 rounded-[14px] text-base',
};

interface AvatarProps {
  name: string;
  size?: AvatarSize;
  tone?: AvatarTone;
  className?: string;
  /** Set when the name is already written next to the avatar, so it is not read twice. */
  decorative?: boolean;
}

/** Rounded-square initials avatar. */
export function Avatar({ name, size = 'md', tone, className, decorative = false }: AvatarProps) {
  return (
    <span
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cx(
        'inline-flex shrink-0 items-center justify-center font-semibold select-none',
        tones[tone ?? toneFor(name)],
        sizes[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

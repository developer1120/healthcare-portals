import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Icon } from '@tabler/icons-react';
import { cx } from './cx';
import { buttonBase as base, buttonSizes as sizes, buttonVariants as variants } from './buttonStyles';
import type { ButtonSize, ButtonVariant } from './buttonStyles';
import { Spinner } from './Spinner';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Tabler icon shown before the label. */
  icon?: Icon;
  /** Shows a spinner, marks the button busy and ignores clicks. */
  loading?: boolean;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: IconComponent, loading = false, className, children, onClick, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // Buttons inside forms should not submit unless asked to.
      type={type ?? 'button'}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={cx(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {loading ? <Spinner /> : IconComponent && <IconComponent aria-hidden size={18} stroke={1.75} />}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: Icon;
  /** Required: an icon-only button has no other accessible name. */
  label: string;
  variant?: Exclude<ButtonVariant, 'danger'>;
  size?: ButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: IconComponent, label, variant = 'secondary', size = 'md', className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cx(base, variants[variant], size === 'sm' ? 'size-8' : 'size-10', className)}
      {...rest}
    >
      <IconComponent aria-hidden size={size === 'sm' ? 16 : 18} stroke={1.75} />
    </button>
  );
});

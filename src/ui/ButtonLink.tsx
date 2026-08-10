import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { LinkProps } from 'react-router';
import type { Icon } from '@tabler/icons-react';
import { buttonBase, buttonSizes, buttonVariants } from './buttonStyles';
import type { ButtonSize, ButtonVariant } from './buttonStyles';
import { cx } from './cx';

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: Icon;
  children: ReactNode;
}

/** A router link that looks like a Button, for actions that navigate. */
export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  icon: IconComponent,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={cx(buttonBase, buttonVariants[variant], buttonSizes[size], className as string)} {...rest}>
      {IconComponent && <IconComponent aria-hidden size={18} stroke={1.75} />}
      {children}
    </Link>
  );
}

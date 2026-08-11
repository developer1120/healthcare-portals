import type { ReactNode } from 'react';
import { cx } from './cx';

export type StatusTone = 'ok' | 'warn' | 'critical' | 'info' | 'neutral';

const dots: Record<StatusTone, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  critical: 'bg-critical',
  info: 'bg-data',
  neutral: 'bg-ink-subtle',
};

interface StatusDotProps {
  tone: StatusTone;
  /** Always required: colour alone never carries the meaning. */
  children: ReactNode;
  className?: string;
}

/** A coloured dot plus a text label, Mendwell's way of showing status instead of filled pills. */
export function StatusDot({ tone, children, className }: StatusDotProps) {
  return (
    <span data-tone={tone} className={cx('inline-flex items-center gap-1.5 text-xs text-ink-muted', className)}>
      <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', dots[tone])} />
      {children}
    </span>
  );
}

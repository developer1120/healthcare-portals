export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-55 aria-busy:cursor-progress';

export const buttonVariants: Record<ButtonVariant, string> = {
  // Coral carries pine text, never white (see palette.ts).
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-ink hover:border-line-strong hover:bg-surface-sunken',
  ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
  danger: 'border border-critical/40 bg-critical-soft text-critical-ink hover:border-critical',
};

export const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

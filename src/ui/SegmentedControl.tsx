import { useId } from 'react';
import { cx } from './cx';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  /** Accessible name for the group, e.g. "Colour theme" or "Time range". */
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * A row of mutually exclusive options on a sunken track. Built on native radios
 * so arrow keys, focus and form semantics work without extra code.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    // A fieldset won't shrink below its content by default; let it, and scroll if the labels don't fit.
    <fieldset className={cx('inline-flex max-w-full min-w-0 overflow-x-auto rounded-control bg-surface-sunken p-0.5', className)}>
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={cx(
            'cursor-pointer rounded-[8px] whitespace-nowrap text-ink-muted transition-colors has-checked:bg-surface has-checked:text-ink',
            'has-focus-visible:outline-2 has-focus-visible:outline-focus',
            size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

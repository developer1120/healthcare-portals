import { useId } from 'react';
import type { ReactNode } from 'react';
import { cx } from '@/ui';

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  detail?: ReactNode;
}

interface ChoiceListProps<T extends string> {
  legend: string;
  choices: Choice<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  error?: string;
  columns?: 1 | 2 | 3;
}

/** Radio buttons drawn as selectable rows, for short lists like payment methods. */
export function ChoiceList<T extends string>({ legend, choices, value, onChange, error, columns = 1 }: ChoiceListProps<T>) {
  const name = useId();
  const errorId = `${name}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined} className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-ink">{legend}</legend>
      <div className={cx('grid gap-2', columns === 2 && 'sm:grid-cols-2', columns === 3 && 'sm:grid-cols-3')}>
        {choices.map((choice) => (
          <label
            key={choice.value}
            className={cx(
              'flex cursor-pointer items-start gap-2.5 rounded-control border border-line bg-surface px-3 py-2.5 text-sm',
              'transition-colors hover:border-line-strong has-checked:border-ink has-checked:bg-surface-sunken',
              'has-focus-visible:outline-2 has-focus-visible:outline-focus',
            )}
          >
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              aria-invalid={error ? true : undefined}
              className="mt-0.5 size-4 shrink-0 accent-[var(--mw-ink)]"
            />
            <span className="min-w-0">
              <span className="block font-medium text-ink">{choice.label}</span>
              {choice.detail && <span className="block text-xs text-ink-muted tabular">{choice.detail}</span>}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-critical">
          {error}
        </p>
      )}
    </fieldset>
  );
}

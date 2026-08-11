import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { cx } from './cx';
import { controlClasses, useFieldProps } from './fieldContext';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: SelectOption[];
  /** Adds a first, empty option, e.g. "Any specialty". */
  placeholder?: string;
}

/** Native <select> for reliable keyboard and mobile behaviour, styled to match Input. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, className, ...rest },
  ref,
) {
  const fieldProps = useFieldProps(rest);
  return (
    <div className="relative">
      <select
        ref={ref}
        {...rest}
        {...fieldProps}
        className={cx(controlClasses, 'h-10 cursor-pointer appearance-none pr-9', className)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <IconChevronDown
        aria-hidden
        size={16}
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted"
      />
    </div>
  );
});

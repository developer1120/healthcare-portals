import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cx } from './cx';
import { FieldContext, controlClasses, useFieldProps } from './fieldContext';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Shown under the control and announced; also marks the control invalid. */
  error?: ReactNode;
  required?: boolean;
  /** Hide the label visually but keep it for screen readers, e.g. a search box with a placeholder. */
  hideLabel?: boolean;
  /** Id for the control. Generated when omitted. */
  id?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required = false, hideLabel = false, id, className, children }: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ id: controlId, describedBy, invalid: Boolean(error), required }}>
      <div className={cx('flex flex-col gap-1.5', className)}>
        <label htmlFor={controlId} className={cx('text-sm font-medium text-ink', hideLabel && 'sr-only')}>
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-critical">
              *
            </span>
          )}
        </label>
        {children}
        {hint && (
          <p id={hintId} className="text-xs text-ink-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-critical">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  const fieldProps = useFieldProps(rest);
  return <input ref={ref} {...rest} {...fieldProps} className={cx(controlClasses, 'h-10', className)} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...rest }, ref) {
    const fieldProps = useFieldProps(rest);
    return (
      <textarea
        ref={ref}
        rows={rows}
        {...rest}
        {...fieldProps}
        className={cx(controlClasses, 'resize-y py-2 leading-relaxed', className)}
      />
    );
  },
);

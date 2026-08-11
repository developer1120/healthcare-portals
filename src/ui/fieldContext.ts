import { createContext, useContext } from 'react';

export interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

/** Ids and state from the surrounding <Field>, so controls wire up their label, hint and error. */
export function useFieldControl(): FieldContextValue | null {
  return useContext(FieldContext);
}

/**
 * Props a control spreads to join its <Field>. Inside a Field the field's id wins,
 * so the label always points at the control; set the id on <Field> instead.
 */
export function useFieldProps(props: {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false' | 'grammar' | 'spelling';
  required?: boolean;
}) {
  const field = useFieldControl();
  return {
    id: field?.id ?? props.id,
    'aria-describedby': props['aria-describedby'] ?? field?.describedBy,
    // A control used outside a Field can still mark itself invalid.
    'aria-invalid': field?.invalid || props['aria-invalid'] || undefined,
    required: props.required ?? field?.required,
  };
}

/** Shared look for text-like controls (Input, Textarea, Select). */
export const controlClasses =
  'w-full rounded-control border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-muted ' +
  'transition-colors hover:border-line-strong focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-0 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted ' +
  'aria-invalid:border-critical aria-invalid:focus-visible:outline-critical';

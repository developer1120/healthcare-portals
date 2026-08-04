import { allScopes, scopeLabels } from '@/domain/profile';
import type { CaregiverScope } from '@/domain/types';

interface ScopeChecklistProps {
  legend: string;
  value: CaregiverScope[];
  onChange: (scopes: CaregiverScope[]) => void;
  error?: string;
}

/** Checkboxes for what a caregiver can see, in a fixed order. */
export function ScopeChecklist({ legend, value, onChange, error }: ScopeChecklistProps) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      {allScopes.map((scope) => (
        <label key={scope} className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={value.includes(scope)}
            onChange={(event) =>
              onChange(event.target.checked ? allScopes.filter((s) => s === scope || value.includes(s)) : value.filter((s) => s !== scope))
            }
            aria-invalid={error ? true : undefined}
            className="mt-0.5 size-4 shrink-0 accent-[var(--mw-ink)]"
          />
          <span>
            <span className="block font-medium">{scopeLabels[scope].label}</span>
            <span className="block text-xs text-ink-muted">{scopeLabels[scope].detail}</span>
          </span>
        </label>
      ))}
      {error && (
        <p role="alert" className="text-xs font-medium text-critical">
          {error}
        </p>
      )}
    </fieldset>
  );
}

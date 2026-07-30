import { useState } from 'react';
import { IconCircleCheck } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { usePatient, useReminderPrefs, useUpdateReminderPrefs } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { LEAD_HOUR_OPTIONS } from '@/domain/notifications';
import type { ReminderPrefs } from '@/domain/types';
import { Button, Card, SegmentedControl, Skeleton } from '@/ui';

type Editable = Omit<ReminderPrefs, 'patientId'>;

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--mw-ink)]"
      />
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
    </label>
  );
}

function ReminderForm({ initial }: { initial: ReminderPrefs }) {
  const patientId = usePatientId();
  const patient = usePatient(patientId);
  const update = useUpdateReminderPrefs(patientId);
  const [prefs, setPrefs] = useState<Editable>(initial);
  const [saved, setSaved] = useState(false);
  const change = (fields: Partial<Editable>) => {
    setPrefs((current) => ({ ...current, ...fields }));
    setSaved(false);
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate(prefs, { onSuccess: () => setSaved(true) });
      }}
      className="flex flex-col gap-5"
    >
      <div className="flex flex-col gap-1.5">
        <SegmentedControl<string>
          label="Remind me before a visit"
          value={String(prefs.appointmentLeadHours)}
          onChange={(value) => change({ appointmentLeadHours: Number(value) as Editable['appointmentLeadHours'] })}
          className="self-start"
          options={LEAD_HOUR_OPTIONS.map((hours) => ({ value: String(hours), label: `${hours} hours` }))}
        />
        <p className="text-xs text-ink-muted">Video visits also tell you when the waiting room opens.</p>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Also remind me about</legend>
        <Toggle
          label="Medicine doses"
          hint="When a scheduled dose is due and not marked yet."
          checked={prefs.medicationReminders}
          onChange={(medicationReminders) => change({ medicationReminders })}
        />
        <Toggle
          label="Bills"
          hint="A week before a statement is due, and if it becomes overdue."
          checked={prefs.billingReminders}
          onChange={(billingReminders) => change({ billingReminders })}
        />
      </fieldset>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Send copies by</legend>
        <Toggle
          label="Email"
          hint={patient.data?.email}
          checked={prefs.email}
          onChange={(email) => change({ email })}
        />
        <Toggle
          label="Text message"
          hint={patient.data && `${patient.data.phone}. Texts never include test results or message content.`}
          checked={prefs.sms}
          onChange={(sms) => change({ sms })}
        />
      </fieldset>
      <p className="text-xs text-ink-muted">
        Messages from your care team and new results always appear in Mendwell, whatever you choose here.
      </p>
      {update.isError && (
        <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
          {errorMessage(update.error)}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" loading={update.isPending}>
          Save reminders
        </Button>
        {saved && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-ok-ink">
            <IconCircleCheck aria-hidden size={16} />
            Saved
          </p>
        )}
      </div>
    </form>
  );
}

/** The patient's reminder choices, on the Settings page. */
export function ReminderSettings() {
  const prefs = useReminderPrefs(usePatientId());
  return (
    <Card title="Reminders" description="Choose what Mendwell reminds you about, and how.">
      <QueryState query={prefs} label="your reminder settings" loading={<Skeleton className="h-48" />}>
        {(data) => <ReminderForm initial={data} />}
      </QueryState>
    </Card>
  );
}

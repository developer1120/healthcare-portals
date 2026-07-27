import { useState } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { useDecideRefill, useSignOffLab } from '@/api/queries';
import {
  DAYS_SUPPLY_OPTIONS,
  DECISION_NOTE_MAX,
  REFILL_COUNT_OPTIONS,
  labUrgency,
  refillDecisionProblem,
  signOffProblem,
  signOffTemplates,
} from '@/domain/requests';
import type { LabItem, RefillItem } from '@/domain/requests';
import { Button, Dialog, Field, SegmentedControl, Select, Textarea } from '@/ui';

function patientName({ patient }: RefillItem['snapshot']) {
  return `${patient.preferredName ?? patient.firstName} ${patient.lastName}`;
}

interface RefillDialogProps {
  item: RefillItem;
  clinicianId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}

export function RefillDecisionDialog({ item, clinicianId, onClose, onDone }: RefillDialogProps) {
  const decide = useDecideRefill(clinicianId);
  const { medication, request } = item;
  const [decision, setDecision] = useState<'approve' | 'deny'>('approve');
  const [refills, setRefills] = useState(String(Math.max(medication.refillsRemaining, 3)));
  const [daysSupply, setDaysSupply] = useState(String(medication.daysSupply === 30 ? 30 : 90));
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const label = `${medication.name} ${medication.strength}`;

  function submit() {
    const values = { decision, note, refills: Number(refills), daysSupply: Number(daysSupply) };
    const found = refillDecisionProblem(values);
    setProblem(found);
    if (found) return;
    decide.mutate(
      { requestId: request.id, ...values },
      {
        onSuccess: () =>
          onDone(
            decision === 'approve'
              ? `${label} approved for ${patientName(item.snapshot)} and sent to the pharmacy.`
              : `${label} refill declined for ${patientName(item.snapshot)}. They’ve been told why.`,
          ),
      },
    );
  }

  return (
    <Dialog open onClose={onClose} title={`Refill ${label}`} description={`For ${patientName(item.snapshot)}.`}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <SegmentedControl<'approve' | 'deny'>
          label="Decision"
          value={decision}
          onChange={(next) => {
            setDecision(next);
            setProblem(null);
          }}
          className="self-start"
          options={[
            { value: 'approve', label: 'Approve' },
            { value: 'deny', label: 'Decline' },
          ]}
        />
        {decision === 'approve' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Refills">
              <Select
                value={refills}
                onChange={(event) => setRefills(event.target.value)}
                options={REFILL_COUNT_OPTIONS.map((n) => ({ value: String(n), label: n === 0 ? 'No refills' : `${n} refills` }))}
              />
            </Field>
            <Field label="Days supply">
              <Select
                value={daysSupply}
                onChange={(event) => setDaysSupply(event.target.value)}
                options={DAYS_SUPPLY_OPTIONS.map((n) => ({ value: String(n), label: `${n} days` }))}
              />
            </Field>
          </div>
        )}
        <Field
          label={decision === 'deny' ? 'Reason, for the patient' : 'Note for the patient (optional)'}
          hint={`${note.length}/${DECISION_NOTE_MAX} · ${request.pharmacy ?? medication.pharmacy}`}
          error={problem ?? undefined}
          required={decision === 'deny'}
        >
          <Textarea rows={3} maxLength={DECISION_NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {decide.isError && (
          <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
            {errorMessage(decide.error)}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={decision === 'deny' ? 'danger' : 'primary'} loading={decide.isPending}>
            {decision === 'approve' ? 'Approve and send' : 'Decline refill'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

interface SignOffDialogProps {
  item: LabItem;
  clinicianId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}

export function SignOffDialog({ item, clinicianId, onClose, onDone }: SignOffDialogProps) {
  const signOff = useSignOffLab(clinicianId);
  const { panel } = item;
  const critical = labUrgency(panel) === 'critical';
  const [note, setNote] = useState('');
  const [contacted, setContacted] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    const values = { note, patientContacted: contacted };
    const found = signOffProblem(panel, values);
    setProblem(found);
    if (found) return;
    signOff.mutate(
      { panelId: panel.id, ...values },
      { onSuccess: () => onDone(`${panel.name} signed off for ${patientName(item.snapshot)}. Your note is now visible to them.`) },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Sign off ${panel.name}`}
      description={`For ${patientName(item.snapshot)}. Your note is shown to the patient with the result.`}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <div role="group" aria-label="Note templates" className="flex flex-wrap gap-1.5">
          {signOffTemplates.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() => setNote(template.body)}
              className="h-7 rounded-full border border-line bg-surface px-3 text-xs font-medium text-ink-muted hover:border-line-strong hover:text-ink"
            >
              {template.label}
            </button>
          ))}
        </div>
        <Field label="Note for the patient" hint={`${note.length}/${DECISION_NOTE_MAX}`} required>
          <Textarea rows={4} maxLength={DECISION_NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {critical && (
          <div className="flex flex-col gap-2 rounded-control border border-critical/40 bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
            <p className="flex items-start gap-2">
              <IconAlertTriangle aria-hidden size={18} className="mt-px shrink-0" />
              This result has a critical value. Call the patient before signing off.
            </p>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={contacted}
                onChange={(event) => setContacted(event.target.checked)}
                className="mt-0.5 size-4 accent-[var(--mw-critical)]"
              />
              I’ve spoken with the patient about this result.
            </label>
          </div>
        )}
        {problem && (
          <p role="alert" className="text-sm font-medium text-critical">
            {problem}
          </p>
        )}
        {signOff.isError && (
          <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
            {errorMessage(signOff.error)}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={signOff.isPending}>
            Sign off and release
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

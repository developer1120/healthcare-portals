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

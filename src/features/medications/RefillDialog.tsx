import { useState } from 'react';
import { IconSend } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { useRequestRefill } from '@/api/queries';
import { REFILL_NOTE_MAX, pharmacies } from '@/domain/medications';
import type { Clinician, Medication } from '@/domain/types';
import { Button, Dialog, Field, Select, Textarea } from '@/ui';

interface RefillDialogProps {
  medication: Medication;
  prescriber?: Clinician;
  needsRenewal: boolean;
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}

export function RefillDialog({ medication, prescriber, needsRenewal, open, onClose, onSent }: RefillDialogProps) {
  const request = useRequestRefill(medication.patientId);
  const [pharmacy, setPharmacy] = useState(medication.pharmacy);
  const [note, setNote] = useState('');
  const options = [...new Set([medication.pharmacy, ...pharmacies])].map((p) => ({ value: p, label: p }));

  function close() {
    request.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Refill ${medication.name} ${medication.strength}`}
      description={`Goes to ${prescriber?.name ?? 'your prescriber'} for approval.`}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          request.mutate({ medicationId: medication.id, pharmacy, note }, { onSuccess: onSent });
        }}
        className="flex flex-col gap-4"
      >
        {needsRenewal && (
          <p className="rounded-control bg-data-soft px-3 py-2.5 text-sm text-data-ink">
            This prescription has no refills left, so your clinician will review a renewal. That can take up to 2
            business days.
          </p>
        )}
        <Field label="Pharmacy">
          <Select options={options} value={pharmacy} onChange={(event) => setPharmacy(event.target.value)} />
        </Field>
        <Field label="Note for your care team (optional)" hint={`${note.length}/${REFILL_NOTE_MAX}`}>
          <Textarea rows={3} maxLength={REFILL_NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        {request.isError && (
          <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
            {errorMessage(request.error)}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" icon={IconSend} loading={request.isPending}>
            Send request
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

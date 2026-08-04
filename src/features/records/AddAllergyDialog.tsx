import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { errorMessage } from '@/api/errors';
import { useAddAllergy } from '@/api/queries';
import { ALLERGY_TEXT_MAX, severityDisplay } from '@/domain/healthRecord';
import type { Severity } from '@/domain/types';
import { Button, Dialog, Field, Input } from '@/ui';

const schema = z.object({
  substance: z.string().trim().min(1, 'Enter what you’re allergic to').max(ALLERGY_TEXT_MAX),
  reaction: z.string().trim().min(1, 'Describe what happens, like hives or swelling').max(ALLERGY_TEXT_MAX),
  severity: z.enum(['mild', 'moderate', 'severe']),
});

type Values = z.infer<typeof schema>;

interface AddAllergyDialogProps {
  patientId: string;
  open: boolean;
  onClose: () => void;
  onAdded: (substance: string) => void;
}

export function AddAllergyDialog({ patientId, open, onClose, onAdded }: AddAllergyDialogProps) {
  const add = useAddAllergy(patientId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { substance: '', reaction: '', severity: 'mild' },
  });

  function close() {
    reset();
    add.reset();
    onClose();
  }

  const onSubmit = handleSubmit((values) =>
    add.mutate(values, {
      onSuccess: (allergy) => {
        reset();
        onAdded(allergy.substance);
      },
    }),
  );

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add an allergy"
      description="Your care team will confirm it at your next visit. Until then it shows as reported by you."
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Allergic to" error={errors.substance?.message} required>
          <Input placeholder="Peanuts, ibuprofen, bee stings" maxLength={ALLERGY_TEXT_MAX} {...register('substance')} />
        </Field>
        <Field label="What happens" error={errors.reaction?.message} required>
          <Input placeholder="Hives, swelling, trouble breathing" maxLength={ALLERGY_TEXT_MAX} {...register('reaction')} />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">How bad is it?</legend>
          <div className="flex flex-wrap gap-2">
            {(['mild', 'moderate', 'severe'] as Severity[]).map((severity) => (
              <label
                key={severity}
                className="cursor-pointer rounded-control border border-line px-3 py-1.5 text-sm has-checked:border-ink has-checked:bg-ink has-checked:text-canvas has-focus-visible:outline-2 has-focus-visible:outline-focus"
              >
                <input type="radio" value={severity} className="sr-only" {...register('severity')} />
                {severityDisplay[severity].label}
              </label>
            ))}
          </div>
        </fieldset>
        {add.isError && (
          <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
            {errorMessage(add.error)}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={add.isPending}>
            Add allergy
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

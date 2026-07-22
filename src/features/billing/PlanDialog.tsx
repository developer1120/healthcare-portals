import { useState } from 'react';
import { errorMessage } from '@/api/errors';
import { useCreatePaymentPlan } from '@/api/queries';
import { methodLabel, planOptions } from '@/domain/billing';
import type { PaymentMethod, PaymentPlan, Statement } from '@/domain/types';
import { formatMoney } from '@/lib/units';
import { Button, Dialog } from '@/ui';
import { ChoiceList } from './ChoiceList';

interface PlanDialogProps {
  statement: Statement;
  balanceCents: number;
  methods: PaymentMethod[];
  open: boolean;
  onClose: () => void;
  onCreated: (plan: PaymentPlan) => void;
}

export function PlanDialog({ statement, balanceCents, methods, open, onClose, onCreated }: PlanDialogProps) {
  const create = useCreatePaymentPlan(statement.patientId);
  const options = planOptions(balanceCents);
  const [months, setMonths] = useState<string | undefined>(options[0] ? String(options[0].months) : undefined);
  const [methodId, setMethodId] = useState<string | undefined>(methods[0]?.id);
  const [agreed, setAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const chosen = options.find((o) => String(o.months) === months);

  function close() {
    create.reset();
    setSubmitted(false);
    setAgreed(false);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Set up a payment plan"
      description={`Spread ${formatMoney(balanceCents)} over monthly payments with no interest or fees.`}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!chosen || !methodId || !agreed) return;
          create.mutate(
            { statementId: statement.id, months: chosen.months, methodId, agreed },
            {
              onSuccess: (plan) => {
                setSubmitted(false);
                setAgreed(false);
                onCreated(plan);
              },
            },
          );
        }}
        className="flex flex-col gap-4"
      >
        <ChoiceList
          legend="Length"
          value={months}
          onChange={setMonths}
          columns={3}
          error={submitted && !chosen ? 'Choose a plan length.' : undefined}
          choices={options.map((o) => ({
            value: String(o.months),
            label: `${o.months} months`,
            detail:
              o.lastCents === o.monthlyCents
                ? `${formatMoney(o.monthlyCents)}/month`
                : `${formatMoney(o.monthlyCents)}/month, last ${formatMoney(o.lastCents)}`,
          }))}
        />
        <ChoiceList
          legend="Monthly payments from"
          value={methodId}
          onChange={setMethodId}
          error={submitted && !methodId ? 'Choose how to pay.' : undefined}
          choices={methods.map((m) => ({ value: m.id, label: methodLabel(m) }))}
        />
        {chosen && (
          <p className="rounded-control bg-surface-sunken px-3 py-2.5 text-sm tabular">
            The first payment of {formatMoney(chosen.monthlyCents)} is taken today, then on the same day each month.
          </p>
        )}
        <div>
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              aria-invalid={submitted && !agreed ? true : undefined}
              className="mt-0.5 size-4 accent-[var(--mw-ink)]"
            />
            I agree to automatic monthly payments until the balance is paid.
          </label>
          {submitted && !agreed && (
            <p role="alert" className="mt-1 text-xs font-medium text-critical">
              Agree to automatic payments to set up a plan.
            </p>
          )}
        </div>
        {create.isError && (
          <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
            {errorMessage(create.error)}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Start plan
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

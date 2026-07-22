import { useState } from 'react';
import { IconLock } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { usePayStatement } from '@/api/queries';
import { MIN_PAYMENT_CENTS, methodLabel, parseMoney } from '@/domain/billing';
import type { Payment, PaymentMethod, Statement } from '@/domain/types';
import { formatMoney } from '@/lib/units';
import { Button, Dialog, Field, Input } from '@/ui';
import { ChoiceList } from './ChoiceList';

interface PayDialogProps {
  statement: Statement;
  balanceCents: number;
  methods: PaymentMethod[];
  open: boolean;
  onClose: () => void;
  onPaid: (payment: Payment) => void;
}

type AmountChoice = 'full' | 'other';

/** Checks a typed amount against the balance; returns cents or a message. */
function checkAmount(input: string, balanceCents: number): { cents: number } | { error: string } {
  const cents = parseMoney(input);
  if (cents === null) return { error: 'Enter an amount in dollars, like 25.00.' };
  if (cents < Math.min(MIN_PAYMENT_CENTS, balanceCents)) return { error: 'The smallest payment is $1.00.' };
  if (cents > balanceCents) return { error: `That’s more than the ${formatMoney(balanceCents)} you owe.` };
  return { cents };
}

export function PayDialog({ statement, balanceCents, methods, open, onClose, onPaid }: PayDialogProps) {
  const pay = usePayStatement(statement.patientId);
  const [amountChoice, setAmountChoice] = useState<AmountChoice>('full');
  const [otherAmount, setOtherAmount] = useState('');
  const [methodId, setMethodId] = useState<string | undefined>(methods[0]?.id);
  const [submitted, setSubmitted] = useState(false);

  const amount = amountChoice === 'full' ? { cents: balanceCents } : checkAmount(otherAmount, balanceCents);
  const amountError = submitted && 'error' in amount ? amount.error : undefined;
  const methodError = submitted && !methodId ? 'Choose how to pay.' : undefined;

  function close() {
    pay.reset();
    setSubmitted(false);
    onClose();
  }

  return (
    <Dialog open={open} onClose={close} title="Make a payment" description={`You owe ${formatMoney(balanceCents)}.`}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if ('error' in amount || !methodId) return;
          pay.mutate(
            { statementId: statement.id, amountCents: amount.cents, methodId },
            {
              onSuccess: (payment) => {
                setSubmitted(false);
                onPaid(payment);
              },
            },
          );
        }}
        className="flex flex-col gap-4"
      >
        <ChoiceList<AmountChoice>
          legend="Amount"
          value={amountChoice}
          onChange={setAmountChoice}
          columns={2}
          choices={[
            { value: 'full', label: 'Full balance', detail: formatMoney(balanceCents) },
            { value: 'other', label: 'Another amount', detail: 'Pay part now, the rest later' },
          ]}
        />
        {amountChoice === 'other' && (
          <Field label="Amount to pay" hint="In US dollars" error={amountError}>
            <Input
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={otherAmount}
              onChange={(event) => setOtherAmount(event.target.value)}
              className="tabular"
            />
          </Field>
        )}
        {methods.length > 0 ? (
          <ChoiceList
            legend="Pay with"
            value={methodId}
            onChange={setMethodId}
            error={methodError}
            choices={methods.map((m) => ({
              value: m.id,
              label: methodLabel(m),
              detail: m.kind === 'card' ? 'Card on file' : 'Bank account on file',
            }))}
          />
        ) : (
          <p className="rounded-control bg-warn-soft px-3 py-2.5 text-sm text-warn-ink">
            You have no saved payment methods. Call the billing office to add one.
          </p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <IconLock aria-hidden size={14} />
          Saved methods are kept by the billing office. Mendwell never shows full card or account numbers.
        </p>
        {pay.isError && (
          <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
            {errorMessage(pay.error)}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pay.isPending} disabled={methods.length === 0}>
            {'cents' in amount ? `Pay ${formatMoney(amount.cents)}` : 'Pay'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

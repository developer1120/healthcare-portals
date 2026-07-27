import { format } from 'date-fns';
import { lineOwed, methodLabel, statementStatusDisplay, statementTotals } from '@/domain/billing';
import type { StatementStatus } from '@/domain/billing';
import type { PaymentMethod, Statement } from '@/domain/types';
import { formatShortDate, toDate } from '@/lib/dates';
import { formatMoney } from '@/lib/units';
import { Card, StatusDot } from '@/ui';

const paymentKinds = { card: 'Card', bank: 'Bank transfer', 'plan-instalment': 'Plan instalment' } as const;

function Money({ cents, credit = false }: { cents: number; credit?: boolean }) {
  if (cents === 0) return <span className="text-ink-muted">—</span>;
  return <>{credit ? `−${formatMoney(cents)}` : formatMoney(cents)}</>;
}

function LineTable({ statement }: { statement: Statement }) {
  const totals = statementTotals(statement);
  const cell = 'px-2 py-2 text-right tabular';
  return (
    <div className="relative -mx-2 overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">Charges on this statement</caption>
        <thead className="text-xs text-ink-muted">
          <tr className="border-b border-line">
            <th scope="col" className="px-2 py-2 text-left font-medium">
              Service
            </th>
            <th scope="col" className={`${cell} font-medium`}>
              Charge
            </th>
            <th scope="col" className={`${cell} font-medium`}>
              Insurance paid
            </th>
            <th scope="col" className={`${cell} font-medium`}>
              Adjustment
            </th>
            <th scope="col" className={`${cell} font-medium`}>
              You owe
            </th>
          </tr>
        </thead>
        <tbody>
          {statement.lines.map((line) => (
            <tr key={line.id} className="border-b border-line">
              <th scope="row" className="px-2 py-2 text-left font-normal">
                <span className="block text-ink">{line.description}</span>
                <span className="block text-xs text-ink-muted">{formatShortDate(line.serviceDate)}</span>
              </th>
              <td className={cell}>{formatMoney(line.chargeCents)}</td>
              <td className={cell}>
                <Money cents={line.insurancePaidCents} credit />
              </td>
              <td className={cell}>
                <Money cents={line.adjustmentCents} credit />
              </td>
              <td className={`${cell} font-medium`}>{formatMoney(lineOwed(line))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="px-2 py-2 text-left font-semibold">
              Totals
            </th>
            <td className={`${cell} font-semibold`}>{formatMoney(totals.charges)}</td>
            <td className={`${cell} font-semibold`}>
              <Money cents={totals.insurance} credit />
            </td>
            <td className={`${cell} font-semibold`}>
              <Money cents={totals.adjustments} credit />
            </td>
            <td className={`${cell} font-semibold`}>{formatMoney(totals.owed)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

interface StatementCardProps {
  statement: Statement;
  status: StatementStatus;
  methods: PaymentMethod[];
}

export function StatementCard({ statement, status, methods }: StatementCardProps) {
  const totals = statementTotals(statement);
  const display = statementStatusDisplay[status];
  const title = `${format(toDate(statement.issuedAt), 'MMMM yyyy')} statement`;

  const summary = (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs text-ink-muted">Issued</dt>
        <dd className="tabular">{formatShortDate(statement.issuedAt)}</dd>
      </div>
      <div>
        <dt className="text-xs text-ink-muted">Due</dt>
        <dd className="tabular">{formatShortDate(statement.dueOn)}</dd>
      </div>
      <div>
        <dt className="text-xs text-ink-muted">Paid</dt>
        <dd className="tabular">{formatMoney(totals.paid)}</dd>
      </div>
      <div>
        <dt className="text-xs text-ink-muted">Balance</dt>
        <dd className="font-semibold tabular">{formatMoney(totals.balance)}</dd>
      </div>
    </dl>
  );

  const details = (
    <>
      <LineTable statement={statement} />
      {statement.payments.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold">Payments</h4>
          <ul className="mt-1.5 divide-y divide-line text-sm">
            {statement.payments.map((payment) => {
              const method = methods.find((m) => m.id === payment.methodId);
              return (
                <li key={payment.id} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-1.5">
                  <span>
                    {formatShortDate(payment.paidAt)} · {paymentKinds[payment.method]}
                    {method && <span className="text-ink-muted"> · {methodLabel(method)}</span>}
                  </span>
                  <span className="font-medium tabular">{formatMoney(payment.amountCents)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );

  return (
    <Card
      title={title}
      headingLevel={3}
      action={<StatusDot tone={display.tone}>{display.label}</StatusDot>}
    >
      <div className="flex flex-col gap-4">
        {summary}
        {status === 'paid' ? (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-data-ink">Show charges and payments</summary>
            <div className="mt-3">{details}</div>
          </details>
        ) : (
          details
        )}
      </div>
    </Card>
  );
}

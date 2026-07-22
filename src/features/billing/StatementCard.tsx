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

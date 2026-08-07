import { addMonths, differenceInCalendarDays, parseISO } from 'date-fns';
import type { StatusTone } from '@/ui';
import type { PaymentMethod, PaymentPlan, Statement, StatementLine } from './types';

/** Plans are offered for balances of at least this much. */
export const PLAN_MIN_BALANCE_CENTS = 5_000;
/** No instalment smaller than this. */
export const PLAN_MIN_MONTHLY_CENTS = 1_000;
export const PLAN_MONTH_OPTIONS = [3, 6, 12] as const;
export const MIN_PAYMENT_CENTS = 100;

/** What the patient owes for one line after insurance and adjustments. */
export function lineOwed(line: StatementLine): number {
  return Math.max(0, line.chargeCents - line.insurancePaidCents - line.adjustmentCents);
}

export interface StatementTotals {
  charges: number;
  insurance: number;
  adjustments: number;
  /** What insurance left for the patient. */
  owed: number;
  paid: number;
  balance: number;
}

export function statementTotals(statement: Statement): StatementTotals {
  const sum = (pick: (line: StatementLine) => number) => statement.lines.reduce((total, line) => total + pick(line), 0);
  const owed = sum(lineOwed);
  const paid = statement.payments.reduce((total, p) => total + p.amountCents, 0);
  return {
    charges: sum((l) => l.chargeCents),
    insurance: sum((l) => l.insurancePaidCents),
    adjustments: sum((l) => l.adjustmentCents),
    owed,
    paid,
    balance: Math.max(0, owed - paid),
  };
}

export type StatementStatus = 'paid' | 'on-plan' | 'due' | 'overdue';

export function statementStatus(statement: Statement, plans: PaymentPlan[], now: Date = new Date()): StatementStatus {
  if (statementTotals(statement).balance === 0) return 'paid';
  if (plans.some((p) => p.statementId === statement.id && p.status === 'active')) return 'on-plan';
  return differenceInCalendarDays(parseISO(statement.dueOn), now) < 0 ? 'overdue' : 'due';
}

export const statementStatusDisplay: Record<StatementStatus, { tone: StatusTone; label: string }> = {
  paid: { tone: 'ok', label: 'Paid' },
  'on-plan': { tone: 'info', label: 'On a payment plan' },
  due: { tone: 'warn', label: 'Payment due' },
  overdue: { tone: 'critical', label: 'Overdue' },
};

export interface PlanOption {
  months: number;
  monthlyCents: number;
  /** The final instalment, which absorbs rounding. */
  lastCents: number;
}

/**
 * Monthly plans for a balance: none below the minimum balance, and no option
 * whose instalment would fall under the minimum. Instalments round up to the
 * cent and the last one takes up the difference, so the total is exact.
 */
export function planOptions(balanceCents: number): PlanOption[] {
  if (balanceCents < PLAN_MIN_BALANCE_CENTS) return [];
  return PLAN_MONTH_OPTIONS.map((months) => {
    const monthlyCents = Math.ceil(balanceCents / months);
    return { months, monthlyCents, lastCents: balanceCents - monthlyCents * (months - 1) };
  }).filter((option) => option.monthlyCents >= PLAN_MIN_MONTHLY_CENTS && option.lastCents > 0);
}

/** "12.50" or "$12.50" → 1250; null for anything that isn't a positive amount with at most two decimals. */
export function parseMoney(input: string): number | null {
  const match = /^\$?\s*(\d{1,6})(?:\.(\d{1,2}))?$/.exec(input.trim().replace(/,/g, ''));
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return cents > 0 ? cents : null;
}

export interface PlanProgress {
  /** Instalments taken so far, including the first one at sign-up. */
  paidCount: number;
  remainingCents: number;
  /** Undefined once the plan is paid off. */
  nextOn?: Date;
  nextCents: number;
}

/** Where a plan stands, from the instalments recorded on its statement. */
export function planProgress(plan: PaymentPlan, statement: Statement): PlanProgress {
  const paidCount = statement.payments.filter((p) => p.method === 'plan-instalment').length;
  const remainingCents = statementTotals(statement).balance;
  if (remainingCents === 0) return { paidCount, remainingCents, nextCents: 0 };
  return {
    paidCount,
    remainingCents,
    nextOn: addMonths(parseISO(plan.createdAt), paidCount),
    nextCents: Math.min(plan.monthlyCents, remainingCents),
  };
}

/** "Visa ending 4242". Only the last four digits are ever stored or shown. */
export function methodLabel(method: Pick<PaymentMethod, 'label' | 'last4'>): string {
  return `${method.label} ending ${method.last4}`;
}

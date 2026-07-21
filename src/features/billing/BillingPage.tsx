import { useState } from 'react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { IconCalendarRepeat, IconCircleCheck, IconCreditCard, IconMessage, IconShieldCheck } from '@tabler/icons-react';
import { useInsurance, usePaymentMethods, usePaymentPlans, useStatements } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { methodLabel, planOptions, planProgress, statementStatus, statementTotals } from '@/domain/billing';
import { activePrimary, coverageProgress } from '@/domain/insurance';
import type { PaymentMethod, PaymentPlan, Statement } from '@/domain/types';
import { formatDay, formatShortDate } from '@/lib/dates';
import { useNow } from '@/lib/useNow';
import { formatMoney } from '@/lib/units';
import { Button, ButtonLink, Card, Skeleton } from '@/ui';
import { PayDialog } from './PayDialog';
import { PlanDialog } from './PlanDialog';
import { StatementCard } from './StatementCard';

type Open = { kind: 'pay' | 'plan'; statement: Statement; balanceCents: number } | null;

function dueText(dueOn: string, now: Date): string {
  const days = differenceInCalendarDays(parseISO(dueOn), now);
  if (days < 0) return `Overdue since ${formatDay(dueOn, now)}`;
  if (days === 0) return 'Due today';
  return `Due ${formatDay(dueOn, now)} · in ${days} ${days === 1 ? 'day' : 'days'}`;
}

interface BalanceCardProps {
  statements: Statement[];
  plans: PaymentPlan[];
  methodsReady: boolean;
  now: Date;
  onOpen: (open: NonNullable<Open>) => void;
}

/** The dark summary card: what's owed, by when, and the two ways to deal with it. */
function BalanceCard({ statements, plans, methodsReady, now, onOpen }: BalanceCardProps) {
  const total = statements.reduce((sum, s) => sum + statementTotals(s).balance, 0);
  // The oldest statement still needing action is the one the buttons act on.
  const payable = statements
    .filter((s) => ['due', 'overdue'].includes(statementStatus(s, plans, now)))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
  const activePlan = plans.find((p) => p.status === 'active');
  const planStatement = activePlan && statements.find((s) => s.id === activePlan.statementId);
  const progress = activePlan && planStatement ? planProgress(activePlan, planStatement) : undefined;

  if (total === 0) {
    return (
      <Card tone="pine" role="region" aria-label="Account balance">
        <p className="flex items-center gap-2 text-lg font-semibold text-white">
          <IconCircleCheck aria-hidden size={22} />
          You’re all paid up
        </p>
        <p className="mt-1 text-sm">Nothing is owed on your account. Thank you.</p>
      </Card>
    );
  }

  const payableBalance = payable ? statementTotals(payable).balance : 0;
  return (
    <Card tone="pine" role="region" aria-label="Account balance">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs">Account balance</p>
          <p className="mt-1 font-display text-3xl font-semibold text-white tabular">You owe {formatMoney(total)}</p>
          {payable && <p className="mt-1 text-sm text-white/90">{dueText(payable.dueOn, now)}</p>}
          {progress?.nextOn && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90 tabular">
              <IconCalendarRepeat aria-hidden size={16} />
              Next plan payment {formatMoney(progress.nextCents)} on {formatDay(progress.nextOn, now)}
            </p>
          )}
        </div>
        {payable && (
          <div className="flex flex-wrap gap-2">
            {planOptions(payableBalance).length > 0 && (
              <Button
                variant="secondary"
                disabled={!methodsReady}
                onClick={() => onOpen({ kind: 'plan', statement: payable, balanceCents: payableBalance })}
              >
                Set up a payment plan
              </Button>
            )}
            <Button
              variant="primary"
              icon={IconCreditCard}
              disabled={!methodsReady}
              onClick={() => onOpen({ kind: 'pay', statement: payable, balanceCents: payableBalance })}
            >
              Pay now
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function PlansCard({ plans, statements, methods }: { plans: PaymentPlan[]; statements: Statement[]; methods: PaymentMethod[] }) {
  if (plans.length === 0) return null;
  return (
    <Card title="Payment plans" headingLevel={2}>
      <ul className="flex flex-col gap-3 text-sm">
        {plans.map((plan) => {
          const statement = statements.find((s) => s.id === plan.statementId);
          const progress = statement ? planProgress(plan, statement) : undefined;
          const method = methods.find((m) => m.id === plan.methodId);
          return (
            <li key={plan.id} className="rounded-control bg-surface-sunken px-3 py-2.5">
              <p className="font-medium tabular">
                {formatMoney(plan.monthlyCents)}/month for {plan.months} months
              </p>
              <p className="text-xs text-ink-muted tabular">
                {plan.status === 'active' && progress
                  ? `${progress.paidCount} of ${plan.months} paid · ${formatMoney(progress.remainingCents)} left`
                  : `Completed · started ${formatShortDate(plan.createdAt)}`}
                {method && ` · ${methodLabel(method)}`}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Compact coverage summary linking through to the full insurance page. */
function InsuranceSummary({ patientId, now }: { patientId: string; now: Date }) {
  const insurance = useInsurance(patientId);
  return (
    <Card title="Insurance">
      <QueryState query={insurance} label="your insurance">
        {(coverages) => {
          const primary = activePrimary(coverages, now);
          if (!primary) return <p className="text-sm text-ink-muted">No active insurance on file.</p>;
          const { deductible } = coverageProgress(primary);
          return (
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-medium">{primary.plan}</p>
              <p className="text-ink-muted tabular">

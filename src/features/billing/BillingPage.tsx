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
                Member ID <span className="font-mono">{primary.memberId}</span>
              </p>
              <p className="text-ink-muted tabular">
                {deductible.remainingCents === 0
                  ? 'Deductible met for this year'
                  : `${formatMoney(deductible.remainingCents)} left on your deductible`}
              </p>
            </div>
          );
        }}
      </QueryState>
      <ButtonLink to="/billing/insurance" icon={IconShieldCheck} className="mt-3">
        Card and cost estimates
      </ButtonLink>
    </Card>
  );
}

export function BillingPage() {
  const patientId = usePatientId();
  const statements = useStatements(patientId);
  const plans = usePaymentPlans(patientId);
  const methods = usePaymentMethods(patientId);
  const now = useNow(60_000);
  const [open, setOpen] = useState<Open>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      {notice && (
        <p role="status" className="flex items-center gap-2 rounded-card bg-ok-soft px-4 py-3 text-sm text-ok-ink">
          <IconCircleCheck aria-hidden size={18} />
          {notice}
        </p>
      )}
      <QueryState
        query={statements}
        label="your statements"
        loading={
          <>
            <Skeleton className="h-32 rounded-card" />
            <Skeleton className="h-64 rounded-card" />
          </>
        }
      >
        {(statementList) => (
          <QueryState query={plans} label="your payment plans" loading={<Skeleton className="h-32 rounded-card" />}>
            {(planList) => (
              <>
                <BalanceCard
                  statements={statementList}
                  plans={planList}
                  methodsReady={methods.data !== undefined}
                  now={now}
                  onOpen={(next) => {
                    setNotice(null);
                    setOpen(next);
                  }}
                />
                <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_20rem]">
                  <section aria-labelledby="statements-heading" className="flex min-w-0 flex-col gap-3">
                    <h2 id="statements-heading" className="font-sans text-sm font-semibold tracking-normal text-ink-muted">
                      Statements
                    </h2>
                    {statementList.length === 0 && <p className="text-sm text-ink-muted">You have no statements yet.</p>}
                    {statementList.map((statement) => (
                      <StatementCard
                        key={statement.id}
                        statement={statement}
                        status={statementStatus(statement, planList, now)}
                        methods={methods.data ?? []}
                      />
                    ))}
                  </section>
                  <div className="grid items-start gap-5 md:grid-cols-2 2xl:grid-cols-1">
                    <PlansCard plans={planList} statements={statementList} methods={methods.data ?? []} />
                    <InsuranceSummary patientId={patientId} now={now} />
                    <Card title="Payment methods" description="Kept on file by the billing office.">
                      <QueryState query={methods} label="your payment methods">
                        {(list) =>
                          list.length === 0 ? (
                            <p className="text-sm text-ink-muted">No saved methods.</p>
                          ) : (
                            <ul className="flex flex-col gap-2 text-sm">
                              {list.map((m) => (
                                <li key={m.id} className="flex items-center gap-2">
                                  <IconCreditCard aria-hidden size={18} className="text-ink-muted" />
                                  {methodLabel(m)}
                                </li>
                              ))}
                            </ul>
                          )
                        }
                      </QueryState>
                      <p className="mt-3 text-xs text-ink-muted">To add or change a method, call (503) 555-0142.</p>
                    </Card>
                    <Card title="Question about a bill?" description="The billing team usually replies within 2 business days.">
                      <ButtonLink to="/messages/new?topic=billing" icon={IconMessage}>
                        Message billing
                      </ButtonLink>
                    </Card>
                  </div>
                </div>
              </>
            )}
          </QueryState>
        )}
      </QueryState>

      {open?.kind === 'pay' && methods.data && (
        <PayDialog
          open
          statement={open.statement}
          balanceCents={open.balanceCents}
          methods={methods.data}
          onClose={() => setOpen(null)}
          onPaid={(payment) => {
            setOpen(null);
            setNotice(`Payment of ${formatMoney(payment.amountCents)} received. Thank you.`);
          }}
        />
      )}
      {open?.kind === 'plan' && methods.data && (
        <PlanDialog
          open
          statement={open.statement}
          balanceCents={open.balanceCents}
          methods={methods.data}
          onClose={() => setOpen(null)}
          onCreated={(plan) => {
            setOpen(null);
            setNotice(
              `Payment plan set up: ${plan.months} monthly payments. The first ${formatMoney(plan.monthlyCents)} was taken today.`,
            );
          }}
        />
      )}
    </div>
  );
}

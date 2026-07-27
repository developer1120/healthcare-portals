import { screen, within } from '@testing-library/react';
import { api } from '@/api/endpoints';
import { getDb } from '@/api/mockDb';
import {
  methodLabel,
  parseMoney,
  planOptions,
  planProgress,
  statementStatus,
  statementTotals,
} from '@/domain/billing';
import type { PaymentPlan, Statement } from '@/domain/types';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const AVA = 'pat-ava';
const now = TEST_NOW;
const statement = (id: string): Statement => getDb().statements.find((s) => s.id === id)!;
const paymentTask = () => getDb().tasks.find((t) => t.id === 'tsk-5')!;

function plan(fields: Partial<PaymentPlan> = {}): PaymentPlan {
  return {
    id: 'ppl-test',
    patientId: AVA,
    statementId: 'stm-2026-10',
    totalCents: 6_100,
    months: 3,
    monthlyCents: 2_034,
    methodId: 'pm-card',
    createdAt: now.toISOString(),
    status: 'active',
    ...fields,
  };
}

describe('billing rules', () => {
  it('works out what insurance left and what is still owed', () => {
    expect(statementTotals(statement('stm-2026-10'))).toMatchObject({ owed: 6_100, paid: 0, balance: 6_100 });
    expect(statementTotals(statement('stm-2026-08'))).toMatchObject({
      charges: 18_500,
      insurance: 15_000,
      adjustments: 2_000,
      owed: 1_500,
      paid: 1_500,
      balance: 0,
    });
  });

  it('gives each statement a status', () => {
    const october = statement('stm-2026-10');
    expect(statementStatus(statement('stm-2026-08'), [], now)).toBe('paid');
    expect(statementStatus(october, [], now)).toBe('due');
    expect(statementStatus(october, [plan()], now)).toBe('on-plan');
    expect(statementStatus(october, [plan({ status: 'cancelled' })], now)).toBe('due');
    expect(statementStatus(october, [], new Date(now.getTime() + 21 * 86_400_000))).toBe('overdue');
  });

  it('offers plans only above $50, with no instalment under $10, and an exact total', () => {
    expect(planOptions(4_999)).toEqual([]);
    expect(planOptions(5_000)).toEqual([{ months: 3, monthlyCents: 1_667, lastCents: 1_666 }]);
    expect(planOptions(6_100)).toEqual([
      { months: 3, monthlyCents: 2_034, lastCents: 2_032 },
      { months: 6, monthlyCents: 1_017, lastCents: 1_015 },
    ]);
    expect(planOptions(24_000).map((o) => o.months)).toEqual([3, 6, 12]);
    for (const option of planOptions(12_345)) {
      expect(option.monthlyCents * (option.months - 1) + option.lastCents).toBe(12_345);
    }
  });

  it('reads typed amounts as cents', () => {
    expect(parseMoney('12.5')).toBe(1_250);
    expect(parseMoney(' $1,234.56 ')).toBe(123_456);
    expect(parseMoney('7')).toBe(700);
    for (const bad of ['', '0', '0.00', '12.345', '-5', 'ten', '1e3']) expect(parseMoney(bad)).toBeNull();
  });

  it('tracks a plan from the instalments on its statement', () => {
    const october = structuredClone(statement('stm-2026-10'));
    october.payments.push({ id: 'p1', paidAt: now.toISOString(), amountCents: 2_034, method: 'plan-instalment' });
    const progress = planProgress(plan(), october);
    expect(progress).toMatchObject({ paidCount: 1, remainingCents: 4_066, nextCents: 2_034 });
    expect(progress.nextOn?.getMonth()).toBe(now.getMonth() + 1);

    october.payments.push({ id: 'p2', paidAt: now.toISOString(), amountCents: 4_066, method: 'card' });
    expect(planProgress(plan(), october)).toEqual({ paidCount: 1, remainingCents: 0, nextCents: 0 });
  });

  it('shows only the last four digits of a method', () => {
    expect(methodLabel({ label: 'Visa', last4: '4242' })).toBe('Visa ending 4242');
  });
});

describe('billing endpoints', () => {
  const pay = (amountCents: number, fields: Partial<Parameters<typeof api.billing.pay>[0]> = {}) =>
    api.billing.pay({ patientId: AVA, statementId: 'stm-2026-10', amountCents, methodId: 'pm-card', ...fields });

  it('takes part payments and ticks off the task once the balance is cleared', async () => {
    const first = await pay(1_000);
    expect(first).toMatchObject({ amountCents: 1_000, method: 'card', methodId: 'pm-card' });
    expect(statementTotals(statement('stm-2026-10')).balance).toBe(5_100);
    expect(paymentTask().completedAt).toBeUndefined();

    await pay(5_100, { methodId: 'pm-bank' });
    expect(statementTotals(statement('stm-2026-10')).balance).toBe(0);
    expect(statement('stm-2026-10').payments.at(-1)).toMatchObject({ method: 'bank' });
    expect(paymentTask().completedAt).toBe(now.toISOString());
  });

  it('rejects bad payments', async () => {
    await expect(pay(6_101)).rejects.toMatchObject({ status: 400 });
    await expect(pay(0)).rejects.toMatchObject({ status: 400 });
    await expect(pay(50)).rejects.toMatchObject({ status: 400 });
    await expect(pay(10.5)).rejects.toMatchObject({ status: 400 });
    await expect(pay(1_000, { methodId: 'pm-someone-else' })).rejects.toMatchObject({ status: 400 });
    await expect(pay(1_000, { patientId: 'pat-other' })).rejects.toMatchObject({ status: 404 });
    await expect(pay(1_000, { statementId: 'stm-2026-08' })).rejects.toMatchObject({ status: 409 });
    expect(statement('stm-2026-10').payments).toHaveLength(0);
  });

  it('sets up a plan, takes the first instalment and completes it when paid off', async () => {
    const request = { patientId: AVA, statementId: 'stm-2026-10', months: 3, methodId: 'pm-bank', agreed: true };
    const created = await api.billing.createPlan(request);
    expect(created).toMatchObject({ months: 3, monthlyCents: 2_034, totalCents: 6_100, status: 'active' });
    expect(statement('stm-2026-10').payments).toEqual([
      expect.objectContaining({ amountCents: 2_034, method: 'plan-instalment', methodId: 'pm-bank' }),
    ]);
    expect(paymentTask().completedAt).toBeDefined();
    await expect(api.billing.plans(AVA)).resolves.toHaveLength(1);

    await expect(api.billing.createPlan(request)).rejects.toMatchObject({ status: 409 });

    await pay(4_066);
    expect(getDb().paymentPlans[0]!.status).toBe('completed');
  });

  it('only accepts the plans on offer, with agreement', async () => {
    const request = { patientId: AVA, statementId: 'stm-2026-10', methodId: 'pm-card', agreed: true };
    await expect(api.billing.createPlan({ ...request, months: 12 })).rejects.toMatchObject({ status: 400 });
    await expect(api.billing.createPlan({ ...request, months: 3, agreed: false })).rejects.toMatchObject({ status: 400 });
    await expect(api.billing.createPlan({ ...request, statementId: 'stm-2026-08', months: 3 })).rejects.toMatchObject({
      status: 400,
    });
    expect(getDb().paymentPlans).toHaveLength(0);
  });
});

describe('billing page', () => {
  const balanceCard = () => screen.findByRole('region', { name: 'Account balance' });

  it('shows the balance, the due date and each statement', async () => {
    renderRoute('/billing');
    const balance = await balanceCard();
    expect(balance).toHaveTextContent('You owe $61.00');
    expect(balance).toHaveTextContent(/in 20 days/);

    const october = await screen.findByRole('region', { name: 'October 2026 statement' });
    expect(within(october).getByText('Payment due')).toBeInTheDocument();
    expect(within(october).getByRole('table', { name: 'Charges on this statement' })).toBeInTheDocument();
    expect(within(october).getByRole('row', { name: /Totals/ })).toHaveTextContent('$61.00');

    const august = screen.getByRole('region', { name: 'August 2026 statement' });
    expect(august.querySelector('[data-tone="ok"]')).toHaveTextContent('Paid');
    // Paid statements keep their detail folded away.
    expect(within(august).getByText('Show charges and payments')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Message billing' })).toHaveAttribute('href', '/messages/new?topic=billing');
  });

  it('pays the full balance with a saved card', async () => {
    const { user } = renderRoute('/billing');
    await user.click(within(await balanceCard()).getByRole('button', { name: 'Pay now' }));

    const dialog = screen.getByRole('dialog', { name: 'Make a payment' });
    // Saved methods only: there is nowhere to type a card number.
    expect(within(dialog).queryAllByRole('textbox')).toHaveLength(0);
    expect(within(dialog).getByRole('radio', { name: /Visa ending 4242/ })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Pay $61.00' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Payment of $61.00 received. Thank you.');
    expect(await screen.findByText('You’re all paid up')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('checks a part payment against the balance', async () => {
    const { user } = renderRoute('/billing');
    await user.click(within(await balanceCard()).getByRole('button', { name: 'Pay now' }));
    const dialog = screen.getByRole('dialog', { name: 'Make a payment' });

    await user.click(within(dialog).getByRole('radio', { name: /Another amount/ }));
    const amount = within(dialog).getByRole('textbox', { name: 'Amount to pay' });
    await user.type(amount, '70');
    await user.click(within(dialog).getByRole('button', { name: 'Pay' }));
    expect(within(dialog).getByText('That’s more than the $61.00 you owe.')).toBeInTheDocument();
    expect(amount).toHaveAttribute('aria-invalid', 'true');

    await user.clear(amount);
    await user.type(amount, '20');
    await user.click(within(dialog).getByRole('radio', { name: /Checking ending 6789/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Pay $20.00' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Payment of $20.00 received.');
    expect(await balanceCard()).toHaveTextContent('You owe $41.00');
    expect(statement('stm-2026-10').payments.at(-1)).toMatchObject({ amountCents: 2_000, methodId: 'pm-bank' });
  });

  it('sets up a payment plan after agreement', async () => {
    const { user } = renderRoute('/billing');
    await user.click(within(await balanceCard()).getByRole('button', { name: 'Set up a payment plan' }));
    const dialog = screen.getByRole('dialog', { name: 'Set up a payment plan' });

    expect(within(dialog).getAllByRole('radio', { name: /months/ })).toHaveLength(2);
    expect(within(dialog).getByRole('radio', { name: /3 months/ })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Start plan' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Agree to automatic payments');
    expect(getDb().paymentPlans).toHaveLength(0);

    await user.click(within(dialog).getByRole('checkbox', { name: /I agree to automatic monthly payments/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Start plan' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Payment plan set up: 3 monthly payments');
    const balance = await balanceCard();
    expect(await within(balance).findByText(/Next plan payment \$20\.34/)).toBeInTheDocument();
    expect(within(balance).queryByRole('button', { name: 'Pay now' })).not.toBeInTheDocument();
    expect(await screen.findByText('On a payment plan')).toBeInTheDocument();
    const plans = screen.getByRole('region', { name: 'Payment plans' });
    expect(plans).toHaveTextContent('1 of 3 paid · $40.66 left');
  });
});

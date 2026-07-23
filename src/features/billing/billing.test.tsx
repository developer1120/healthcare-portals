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

import { screen, within } from '@testing-library/react';
import { getDb } from '@/api/mockDb';
import {
  activePrimary,
  coverageProgress,
  estimateCost,
  estimateServices,
  isCoverageActive,
  serviceForVisit,
} from '@/domain/insurance';
import type { InsuranceCoverage } from '@/domain/types';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const now = TEST_NOW;
const service = (id: string) => estimateServices.find((s) => s.id === id)!;

/** Ava's plan: $380 left on the deductible, 20% coinsurance, $4,155 left before the out-of-pocket maximum. */
function coverage(fields: Partial<InsuranceCoverage> = {}): InsuranceCoverage {
  return { ...getDb().insurance[0]!, ...fields };
}

describe('insurance rules', () => {
  it('tracks the deductible and out-of-pocket maximum', () => {
    const { deductible, outOfPocket } = coverageProgress(coverage());
    expect(deductible).toMatchObject({ metCents: 112_000, limitCents: 150_000, remainingCents: 38_000 });
    expect(deductible.fraction).toBeCloseTo(0.747, 3);
    expect(outOfPocket.remainingCents).toBe(415_500);
    // Over-reported totals never show more than 100%.
    expect(coverageProgress(coverage({ deductibleMetCents: 200_000 })).deductible).toMatchObject({
      remainingCents: 0,
      fraction: 1,
    });
  });

  it('only uses coverage that is in date', () => {
    expect(isCoverageActive(coverage(), now)).toBe(true);
    const lapsed = coverage({ validFrom: '2025-01-01', validTo: '2025-12-31' });
    expect(isCoverageActive(lapsed, now)).toBe(false);
    expect(activePrimary([lapsed], now)).toBeUndefined();
    expect(activePrimary([coverage({ priority: 'secondary' }), coverage()], now)?.priority).toBe('primary');
  });

  it('estimates copay visits, free preventive care and deductible services', () => {
    expect(estimateCost(service('preventive'), coverage())).toMatchObject({ youPayCents: 0, planPaysCents: 24_500 });
    expect(estimateCost(service('primary-care'), coverage())).toMatchObject({ copayCents: 2_500, youPayCents: 2_500 });
    expect(estimateCost(service('specialist'), coverage()).youPayCents).toBe(5_000);
    expect(estimateCost(service('video'), coverage()).youPayCents).toBe(1_500);
    expect(estimateCost(service('a1c'), coverage())).toMatchObject({ deductibleCents: 6_800, youPayCents: 6_800, planPaysCents: 0 });
    // $380 to finish the deductible, then 20% of the remaining $820.
    expect(estimateCost(service('mri'), coverage())).toMatchObject({
      deductibleCents: 38_000,
      coinsuranceCents: 16_400,
      youPayCents: 54_400,
      planPaysCents: 65_600,
    });
  });

  it('handles the edges: deductible met, no copay, copay above price, the cap and no insurance', () => {
    expect(estimateCost(service('a1c'), coverage({ deductibleMetCents: 150_000 })).youPayCents).toBe(1_360);
    expect(estimateCost(service('primary-care'), coverage({ copayCents: {} }))).toMatchObject({
      copayCents: 0,
      deductibleCents: 18_000,
      youPayCents: 18_000,
    });
    expect(estimateCost(service('video'), coverage({ copayCents: { video: 20_000 } })).youPayCents).toBe(9_500);

    const nearCap = estimateCost(service('mri'), coverage({ outOfPocketMetCents: 595_000 }));
    expect(nearCap).toMatchObject({ youPayCents: 5_000, planPaysCents: 115_000, cappedByOutOfPocket: true });

    expect(estimateCost(service('mri'), undefined)).toMatchObject({ youPayCents: 120_000, planPaysCents: 0, selfPay: true });
  });

  it('matches a visit to the right benefit', () => {
    expect(serviceForVisit({ specialty: 'primary-care' }, 'in-person').id).toBe('primary-care');
    expect(serviceForVisit({ specialty: 'nursing' }, 'in-person').id).toBe('primary-care');
    expect(serviceForVisit({ specialty: 'cardiology' }, 'in-person').id).toBe('specialist');
    expect(serviceForVisit({ specialty: 'cardiology' }, 'video').id).toBe('video');
  });
});

describe('insurance page', () => {
  it('shows the member card and copies the member ID', async () => {
    const { user } = renderRoute('/billing/insurance');
    const card = await screen.findByRole('article', { name: 'Cedarline Health insurance card' });
    expect(card).toHaveTextContent('Cedarline Silver PPO');
    expect(await within(card).findByText('Ava Thompson')).toBeInTheDocument();
    expect(card).toHaveTextContent('CDL-4821-7730');
    expect(card).toHaveTextContent('G-20931');
    expect(within(card).getByText('Specialist').previousSibling).toHaveTextContent('$50.00');
    expect(within(card).getByText('Active')).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Copy member ID' }));
    expect(within(card).getByRole('button', { name: 'Member ID copied' })).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toBe('CDL-4821-7730');
  });

  it('shows plan-year progress', async () => {
    renderRoute('/billing/insurance');
    const deductible = await screen.findByRole('meter', { name: 'Deductible' });
    expect(deductible).toHaveAttribute('aria-valuetext', '$1,120.00 of $1,500.00 met');
    expect(screen.getByRole('meter', { name: 'Out-of-pocket maximum' })).toHaveAttribute('aria-valuenow', '1845');
    expect(screen.getByText('$380.00 to go')).toBeInTheDocument();
  });

  it('estimates the cost of a chosen service', async () => {
    const { user } = renderRoute('/billing/insurance');
    const estimator = await screen.findByRole('region', { name: 'Cost estimate' });
    const estimate = within(estimator).getByLabelText('Estimate');
    expect(estimate).toHaveTextContent('Copay$25.00');
    expect(estimate).toHaveTextContent('You pay about$25.00');

    await user.selectOptions(within(estimator).getByRole('combobox', { name: 'Service' }), 'MRI, knee');
    expect(estimate).toHaveTextContent('Typical price$1,200.00');
    expect(estimate).toHaveTextContent('Toward your deductible$380.00');
    expect(estimate).toHaveTextContent('Coinsurance (20%)$164.00');
    expect(estimate).toHaveTextContent('Plan pays$656.00');
    expect(estimate).toHaveTextContent('You pay about$544.00');

    await user.selectOptions(within(estimator).getByRole('combobox', { name: 'Service' }), 'Annual preventive visit');
    expect(estimate).toHaveTextContent('You pay about$0.00');
    expect(within(estimator).getByText('Preventive care is covered in full.')).toBeInTheDocument();
  });

  it('falls back to self-pay prices without active coverage', async () => {
    getDb().insurance[0]!.validTo = '2026-01-31';
    const { user } = renderRoute('/billing/insurance');
    const card = await screen.findByRole('article', { name: 'Cedarline Health insurance card' });
    expect(within(card).getByText('Not active')).toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();

    const estimator = screen.getByRole('region', { name: 'Cost estimate' });
    await user.selectOptions(within(estimator).getByRole('combobox', { name: 'Service' }), 'Chest X-ray');
    expect(within(estimator).getByText('No active insurance on file, so this is the self-pay price.')).toBeInTheDocument();
    expect(within(estimator).getByText('You pay about').nextSibling).toHaveTextContent('$210.00');
  });

  it('summarises coverage on the billing page', async () => {
    renderRoute('/billing');
    const summary = await screen.findByRole('region', { name: 'Insurance' });
    expect(await within(summary).findByText('$380.00 left on your deductible')).toBeInTheDocument();
    expect(within(summary).getByRole('link', { name: 'Card and cost estimates' })).toHaveAttribute(
      'href',
      '/billing/insurance',
    );
  });
});

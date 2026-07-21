import { useState } from 'react';
import { estimateCost, estimateServices } from '@/domain/insurance';
import type { InsuranceCoverage } from '@/domain/types';
import { formatMoney } from '@/lib/units';
import { Card, Field, Select } from '@/ui';

function Row({ label, cents, strong = false }: { label: string; cents: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className={strong ? 'font-semibold' : 'text-ink-muted'}>{label}</dt>
      <dd className={strong ? 'text-lg font-semibold tabular' : 'tabular'}>{formatMoney(cents)}</dd>
    </div>
  );
}

/** Pick a common service and see roughly what it would cost under today's benefits. */
export function CostEstimator({ coverage }: { coverage: InsuranceCoverage | undefined }) {
  const [serviceId, setServiceId] = useState(estimateServices[1]!.id);
  const service = estimateServices.find((s) => s.id === serviceId) ?? estimateServices[0]!;
  const estimate = estimateCost(service, coverage);
  const coinsurancePercent = coverage ? Math.round(coverage.coinsurance * 100) : 0;

  return (
    <Card title="Cost estimate" description="See roughly what a visit or test would cost you.">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Service">
          <Select
            options={estimateServices.map((s) => ({ value: s.id, label: s.label }))}
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
          />
        </Field>
        <div aria-live="polite">
          <dl aria-label="Estimate" className="divide-y divide-line text-sm">
            <Row label="Typical price" cents={estimate.priceCents} />
            {estimate.copayCents > 0 && <Row label="Copay" cents={estimate.copayCents} />}
            {estimate.deductibleCents > 0 && <Row label="Toward your deductible" cents={estimate.deductibleCents} />}
            {estimate.coinsuranceCents > 0 && (
              <Row label={`Coinsurance (${coinsurancePercent}%)`} cents={estimate.coinsuranceCents} />
            )}
            {!estimate.selfPay && <Row label="Plan pays" cents={estimate.planPaysCents} />}
            <Row label="You pay about" cents={estimate.youPayCents} strong />
          </dl>
          {estimate.selfPay && (
            <p className="mt-2 text-xs text-warn-ink">No active insurance on file, so this is the self-pay price.</p>
          )}
          {!estimate.selfPay && service.benefit.kind === 'preventive' && (
            <p className="mt-2 text-xs text-ok-ink">Preventive care is covered in full.</p>
          )}
          {estimate.cappedByOutOfPocket && (
            <p className="mt-2 text-xs text-ok-ink">Lowered because you’re close to your out-of-pocket maximum.</p>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs text-ink-muted">
        An estimate from your benefits today, not a guarantee. The final cost depends on what is billed and how your
        plan processes the claim.
      </p>
    </Card>
  );
}

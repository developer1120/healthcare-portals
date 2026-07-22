import { coverageProgress } from '@/domain/insurance';
import type { Accumulator } from '@/domain/insurance';
import type { InsuranceCoverage } from '@/domain/types';
import { formatMoney } from '@/lib/units';
import { cx } from '@/ui';

function Meter({ label, value, tone }: { label: string; value: Accumulator; tone: 'data' | 'ok' }) {
  const percent = Math.round(value.fraction * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-ink-muted tabular">
          {formatMoney(value.metCents)} of {formatMoney(value.limitCents)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={value.limitCents / 100}
        aria-valuenow={value.metCents / 100}
        aria-valuetext={`${formatMoney(value.metCents)} of ${formatMoney(value.limitCents)} met`}
        className="h-2 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className={cx('h-full rounded-full', tone === 'data' ? 'bg-data' : 'bg-ok')}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-ink-muted tabular">
        {value.remainingCents === 0 ? 'Met for this plan year' : `${formatMoney(value.remainingCents)} to go`}
      </p>
    </div>
  );
}

/** Deductible and out-of-pocket progress for the plan year. */
export function CoverageMeters({ coverage }: { coverage: InsuranceCoverage }) {
  const { deductible, outOfPocket } = coverageProgress(coverage);
  return (
    <div className="flex flex-col gap-4">
      <Meter label="Deductible" value={deductible} tone="data" />
      <Meter label="Out-of-pocket maximum" value={outOfPocket} tone="ok" />
    </div>
  );
}

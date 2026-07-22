import { useState } from 'react';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { copayLabels, isCoverageActive } from '@/domain/insurance';
import type { CopayBenefit } from '@/domain/insurance';
import type { InsuranceCoverage } from '@/domain/types';
import { formatShortDate } from '@/lib/dates';
import { formatMoney } from '@/lib/units';
import { IconButton, StatusDot } from '@/ui';

interface InsuranceCardProps {
  coverage: InsuranceCoverage;
  memberName: string;
  now?: Date;
}

/** A digital copy of the member's insurance card, for the front desk or a pharmacy. */
export function InsuranceCard({ coverage, memberName, now = new Date() }: InsuranceCardProps) {
  const [copied, setCopied] = useState(false);
  const active = isCoverageActive(coverage, now);
  const copays = Object.entries(coverage.copayCents) as [CopayBenefit, number][];

  async function copyMemberId() {
    try {
      await navigator.clipboard.writeText(coverage.memberId);
      setCopied(true);
    } catch {
      // Clipboard blocked: the ID is still on screen to read out or type.
    }
  }

  return (
    <article
      aria-label={`${coverage.payer} insurance card`}
      className="overflow-hidden rounded-panel border border-line bg-surface print:break-inside-avoid"
    >
      <header className="flex items-start justify-between gap-3 bg-rail px-5 py-4 text-rail-ink">
        <div className="min-w-0">
          <h2 className="text-lg text-white">{coverage.payer}</h2>
          <p className="text-sm">{coverage.plan}</p>
        </div>
        <span className="shrink-0 rounded-control bg-rail-active px-2 py-0.5 text-xs font-semibold capitalize text-white">
          {coverage.priority}
        </span>
      </header>
      <div className="flex flex-col gap-4 px-5 py-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="col-span-2">
            <dt className="text-xs text-ink-muted">Member</dt>
            <dd className="font-medium">{memberName}</dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-xs text-ink-muted">Member ID</dt>
            <dd className="flex items-center gap-1.5 font-mono font-medium">
              <span className="whitespace-nowrap">{coverage.memberId}</span>
              <IconButton
                icon={copied ? IconCheck : IconCopy}
                label={copied ? 'Member ID copied' : 'Copy member ID'}
                variant="ghost"
                size="sm"
                className="print:hidden"
                onClick={() => void copyMemberId()}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Group</dt>
            <dd className="font-mono font-medium">{coverage.groupNumber}</dd>
          </div>
        </dl>
        {copays.length > 0 && (
          <div>
            <h3 className="font-sans text-xs font-medium tracking-normal text-ink-muted">Copays</h3>
            <ul className="mt-1.5 grid grid-cols-3 gap-2 text-center">
              {copays.map(([benefit, cents]) => (
                <li key={benefit} className="rounded-control bg-surface-sunken px-2 py-2">
                  <span className="block text-base font-semibold tabular">{formatMoney(cents)}</span>
                  <span className="block text-xs text-ink-muted">{copayLabels[benefit]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <span className="tabular">
            Valid {formatShortDate(coverage.validFrom)} – {formatShortDate(coverage.validTo)}
          </span>
          {active ? <StatusDot tone="ok">Active</StatusDot> : <StatusDot tone="critical">Not active</StatusDot>}
        </div>
      </div>
    </article>
  );
}

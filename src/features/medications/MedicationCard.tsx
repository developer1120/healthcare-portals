import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { IconPill, IconRefresh } from '@tabler/icons-react';
import { useCancelRefill } from '@/api/queries';
import { frequencyLabel, latestRefill, refillEligibility, supplyStatus } from '@/domain/medications';
import type { Clinician, Medication, RefillRequest } from '@/domain/types';
import { formatDay, formatShortDate, relativeDay } from '@/lib/dates';
import { Button, StatusDot, cx } from '@/ui';
import { RefillDialog } from './RefillDialog';

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

const supplyTone = { ok: 'bg-ok', low: 'bg-warn', out: 'bg-critical' } as const;

function SupplyBar({ medication }: { medication: Medication }) {
  const supply = supplyStatus(medication);
  const share = Math.min(1, supply.daysLeft / medication.daysSupply);
  const label =
    supply.level === 'out'
      ? 'Should have run out by now'
      : `About ${supply.daysLeft} ${supply.daysLeft === 1 ? 'day' : 'days'} left · runs out around ${formatDay(supply.runsOutOn)}`;
  return (
    <div className="flex flex-col gap-1.5">
      <div aria-hidden="true" className="h-1.5 rounded-full bg-surface-sunken">
        <div className={cx('h-full rounded-full', supplyTone[supply.level])} style={{ width: `${share * 100}%` }} />
      </div>
      <StatusDot tone={supply.level === 'ok' ? 'ok' : supply.level === 'low' ? 'warn' : 'critical'}>{label}</StatusDot>
    </div>
  );
}

function RefillState({ refill, prescriber }: { refill: RefillRequest; prescriber?: Clinician }) {
  const cancel = useCancelRefill(refill.patientId);
  switch (refill.status) {
    case 'pending':
      return (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-data-soft px-3 py-2 text-sm text-data-ink">
          <span>
            Refill requested {relativeDay(refill.requestedAt).toLowerCase()}. Waiting for {prescriber?.name ?? 'your prescriber'}.
          </span>
          <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(refill.id)}>
            Cancel request
          </Button>
        </div>
      );
    case 'approved':
      return (
        <p className="rounded-control bg-ok-soft px-3 py-2 text-sm text-ok-ink">
          Refill approved {refill.decidedAt ? formatShortDate(refill.decidedAt) : ''}
          {refill.pharmacy ? ` · sent to ${refill.pharmacy}` : ''}.{refill.decisionNote ? ` ${refill.decisionNote}` : ''}
        </p>
      );
    case 'denied':
      return (
        <p className="rounded-control bg-warn-soft px-3 py-2 text-sm text-warn-ink">
          Refill not approved{refill.decisionNote ? `: ${refill.decisionNote}` : '.'} Message your care team if you have
          questions.
        </p>
      );
    default:
      return null;
  }
}

interface MedicationCardProps {
  medication: Medication;
  refills: RefillRequest[];
  prescriber?: Clinician;
}

export function MedicationCard({ medication, refills, prescriber }: MedicationCardProps) {
  const headingId = useId();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const eligibility = refillEligibility(medication, refills);
  const latest = latestRefill(medication.id, refills);
  const supply = medication.status === 'active' ? supplyStatus(medication) : null;
  const active = medication.status === 'active';

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-ink">
          <IconPill aria-hidden size={20} stroke={1.75} />
        </span>
        <div className="min-w-0">
          <h3 id={headingId} className="text-base">
            {medication.name} {medication.strength}
          </h3>
          <p className="text-sm text-ink-muted">
            {medication.form[0]!.toUpperCase() + medication.form.slice(1)} · {frequencyLabel(medication)}
          </p>
        </div>
      </header>

      <p className="text-sm">{medication.instructions}</p>

      {active && !medication.asNeeded && <SupplyBar medication={medication} />}

      <dl className="grid gap-3 sm:grid-cols-3">
        <Detail label="Prescribed by">{prescriber?.name ?? '—'}</Detail>
        <Detail label="Pharmacy">{medication.pharmacy}</Detail>
        {active ? (
          <Detail label="Refills left">{medication.refillsRemaining}</Detail>
        ) : (
          <Detail label="Taken">
            {formatShortDate(medication.startDate)} – {medication.endDate ? formatShortDate(medication.endDate) : 'now'}
          </Detail>
        )}
      </dl>

      {active && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <div role="status">
            {justSent && (
              <p className="text-sm font-medium text-ok-ink">Refill request sent to {prescriber?.name ?? 'your prescriber'}.</p>
            )}
          </div>
          {latest && <RefillState refill={latest} prescriber={prescriber} />}
          {eligibility.canRequest ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant={supply && supply.level !== 'ok' ? 'primary' : 'secondary'}
                icon={IconRefresh}
                onClick={() => {
                  setJustSent(false);
                  setDialogOpen(true);
                }}
              >
                Request refill
              </Button>
              {eligibility.needsRenewal && (
                <span className="text-xs text-ink-muted">No refills left: your clinician will review a renewal.</span>
              )}
            </div>
          ) : eligibility.reason === 'too-early' && eligibility.availableFrom ? (
            <p className="text-sm text-ink-muted">You can request a refill from {formatDay(eligibility.availableFrom)}.</p>
          ) : null}
        </div>
      )}

      {eligibility.canRequest && (
        <RefillDialog
          medication={medication}
          prescriber={prescriber}
          needsRenewal={eligibility.needsRenewal}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSent={() => {
            setDialogOpen(false);
            setJustSent(true);
          }}
        />
      )}
    </section>
  );
}

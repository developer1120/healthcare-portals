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

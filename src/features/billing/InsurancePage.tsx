import { Link } from 'react-router';
import { IconMessage } from '@tabler/icons-react';
import { useInsurance, usePatient } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { activePrimary } from '@/domain/insurance';
import { useNow } from '@/lib/useNow';
import { BackLink, ButtonLink, Card, Skeleton } from '@/ui';
import { CostEstimator } from './CostEstimator';
import { CoverageMeters } from './CoverageMeters';
import { InsuranceCard } from './InsuranceCard';

export function InsurancePage() {
  const patientId = usePatientId();
  const insurance = useInsurance(patientId);
  const patient = usePatient(patientId);
  const now = useNow(60_000);
  // Cards show the legal name, as the insurer has it.
  const memberName = patient.data ? `${patient.data.firstName} ${patient.data.lastName}` : '';

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <BackLink to="/billing">Billing</BackLink>
      <QueryState
        query={insurance}
        label="your insurance"
        loading={
          <div className="grid gap-5 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-panel" />
            <Skeleton className="h-64 rounded-card" />
          </div>
        }
      >
        {(coverages) => {
          const primary = activePrimary(coverages, now);
          return (
            <>
              {coverages.length === 0 ? (
                <Card title="No insurance on file" description="Send us your insurance details and we’ll add them.">
                  <ButtonLink to="/messages/new?topic=billing" icon={IconMessage}>
                    Message billing
                  </ButtonLink>
                </Card>
              ) : (
                <div className="grid items-start gap-5 lg:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    {coverages.map((coverage) => (
                      <InsuranceCard key={coverage.id} coverage={coverage} memberName={memberName} now={now} />
                    ))}
                    <p className="text-xs text-ink-muted">
                      Show this at check-in or to a pharmacy. Insurance changed?{' '}
                      <Link to="/messages/new?topic=billing" className="font-medium text-data-ink underline">
                        Let billing know
                      </Link>
                      .
                    </p>
                  </div>
                  {primary && (
                    <Card title="This plan year" description={`${primary.plan}, used so far.`}>
                      <CoverageMeters coverage={primary} />
                      <p className="mt-4 text-xs text-ink-muted">
                        After the deductible you pay {Math.round(primary.coinsurance * 100)}% of most costs, until you
                        reach the out-of-pocket maximum. Copays and preventive care don’t wait for the deductible.
                      </p>
                    </Card>
                  )}
                </div>
              )}
              <CostEstimator coverage={primary} />
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

import { Link } from 'react-router';
import { useLabPanels } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { isNewResult, panelStatus } from '@/domain/labs';
import { formatShortDate } from '@/lib/dates';
import { Card, StatusDot } from '@/ui';

const SHOWN = 4;

export function LatestResults({ patientId }: { patientId: string }) {
  const query = useLabPanels(patientId);
  return (
    <Card
      title="Latest results"
      action={
        <Link to="/results" className="text-sm font-medium text-ink-muted hover:text-ink hover:underline">
          View all
        </Link>
      }
    >
      <QueryState query={query} label="your results">
        {(panels) =>
          panels.length === 0 ? (
            <p className="text-sm text-ink-muted">Results from tests you have will appear here.</p>
          ) : (
            <ul className="-my-2 divide-y divide-line">
              {panels.slice(0, SHOWN).map((panel) => {
                const status = panelStatus(panel);
                return (
                  <li key={panel.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {panel.status === 'pending' ? (
                          <span className="truncate">{panel.name}</span>
                        ) : (
                          <Link to={`/results/${panel.id}`} className="truncate hover:underline">
                            {panel.name}
                          </Link>
                        )}
                        {isNewResult(panel) && (
                          <span className="rounded-[6px] bg-accent-soft px-1.5 text-2xs font-semibold text-accent-ink">
                            New
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink-muted">Collected {formatShortDate(panel.collectedAt)}</p>
                    </div>
                    <StatusDot tone={status.tone} className="shrink-0 pt-0.5">
                      {status.label}
                    </StatusDot>
                  </li>
                );
              })}
            </ul>
          )
        }
      </QueryState>
    </Card>
  );
}

import { useState } from 'react';
import { useAccessLog, useClinicians, useConsents, useSetConsent } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { accessActionLabels, consentDetails } from '@/domain/profile';
import { formatShortDate, relativeTime } from '@/lib/dates';
import { paginate } from '@/lib/paginate';
import { useNow } from '@/lib/useNow';
import { Card, Pagination, Skeleton, cx } from '@/ui';

export function ConsentsCard({ patientId }: { patientId: string }) {
  const consents = useConsents(patientId);
  const setConsent = useSetConsent(patientId);

  return (
    <Card title="Privacy choices" description="Your care is the same whatever you choose. Change these any time.">
      <QueryState query={consents} label="your privacy choices" loading={<Skeleton className="h-32" />}>
        {(list) => (
          <ul className="divide-y divide-line">
            {list.map((consent) => {
              const details = consentDetails[consent.kind];
              return (
                <li key={consent.kind} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p id={`consent-${consent.kind}`} className="text-sm font-medium">
                      {details.title}
                    </p>
                    <p className="text-xs text-ink-muted">{details.body}</p>
                    {consent.updatedAt && (
                      <p className="mt-1 text-xs text-ink-muted">Last changed {formatShortDate(consent.updatedAt)}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={consent.granted}
                    aria-labelledby={`consent-${consent.kind}`}
                    onClick={() => setConsent.mutate({ kind: consent.kind, granted: !consent.granted })}
                    className={cx(
                      'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
                      consent.granted ? 'bg-ok' : 'bg-line-strong',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cx(
                        'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform',
                        consent.granted && 'translate-x-5',
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
    </Card>
  );
}

const ACCESS_LOG_PAGE = 8;

export function AccessLogCard({ patientId }: { patientId: string }) {
  const log = useAccessLog(patientId);
  const clinicians = useClinicians();
  const now = useNow(60_000);
  const [page, setPage] = useState(1);

  return (
    <Card title="Who has looked at your record" description="Every time your care team opens or works on your record.">
      <QueryState query={log} label="your record’s access history" loading={<Skeleton className="h-24" />}>
        {(entries) => {
          if (entries.length === 0) return <p className="text-sm text-ink-muted">No one has opened your record yet.</p>;
          const { items, ...position } = paginate(entries, page, ACCESS_LOG_PAGE);
          return (
            <div className="flex flex-col gap-3">
              <ul aria-label="Access history" className="divide-y divide-line text-sm">
                {items.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                    <span>
                      <span className="font-medium">{clinicians.data?.find((c) => c.id === entry.actorId)?.name ?? 'Mendwell staff'}</span>{' '}
                      <span className="text-ink-muted">· {accessActionLabels[entry.action]}</span>
                    </span>
                    <span className="text-xs text-ink-muted tabular">{relativeTime(entry.at, now)}</span>
                  </li>
                ))}
              </ul>
              <Pagination label="Access history pages" {...position} onChange={setPage} previousLabel="Newer" nextLabel="Older" />
            </div>
          );
        }}
      </QueryState>
      <p className="mt-3 text-xs text-ink-muted">
        Something look wrong? Message Patient services about billing and privacy, or call (503) 555-0100.
      </p>
    </Card>
  );
}

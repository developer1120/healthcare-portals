import { useState } from 'react';
import { Link } from 'react-router';
import { IconFileDescription } from '@tabler/icons-react';
import { useClinicians, useDocuments } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { documentKindLabels } from '@/domain/documents';
import type { DocumentKind } from '@/domain/types';
import { formatShortDate } from '@/lib/dates';
import { Card, SegmentedControl, Skeleton } from '@/ui';

type Filter = DocumentKind | 'all';

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'visit-summary', label: 'Visit summaries' },
  { value: 'imaging', label: 'Imaging' },
  { value: 'referral', label: 'Referrals' },
];

/** Visit summaries, imaging reports, referrals and letters, newest first. */
export function DocumentsCard({ patientId }: { patientId: string }) {
  const documents = useDocuments(patientId);
  const clinicians = useClinicians();
  const [filter, setFilter] = useState<Filter>('all');

  return (
    <Card
      title="Documents"
      action={<SegmentedControl<Filter> label="Document type" size="sm" value={filter} onChange={setFilter} options={filters} />}
    >
      <QueryState query={documents} label="your documents" loading={<Skeleton className="h-40" />}>
        {(list) => {
          const shown = list.filter((d) => filter === 'all' || d.kind === filter);
          if (shown.length === 0) {
            return <p className="text-sm text-ink-muted">Nothing here yet. Documents from your visits will appear here.</p>;
          }
          return (
            <ul className="divide-y divide-line">
              {shown.map((document) => {
                const author = clinicians.data?.find((c) => c.id === document.authorId);
                return (
                  <li key={document.id}>
                    <Link
                      to={`/records/documents/${document.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-control px-2 py-2.5 hover:bg-surface-sunken"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-ink">
                        <IconFileDescription aria-hidden size={18} stroke={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{document.title}</span>
                        <span className="block truncate text-xs text-ink-muted">
                          {documentKindLabels[document.kind]}
                          {author && ` · ${author.name}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-ink-muted">{formatShortDate(document.createdAt)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </QueryState>
    </Card>
  );
}

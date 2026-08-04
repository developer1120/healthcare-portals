import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';
import { useClinicians, useLabPanels, useMarkResultsViewed } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { isNewResult, summarizePanel } from '@/domain/labs';
import type { LabPanel } from '@/domain/types';
import { Card, Field, Input, SegmentedControl, Skeleton } from '@/ui';
import { PanelCard } from './PanelCard';

type Show = 'all' | 'attention' | 'waiting';

function matchesShow(panel: LabPanel, show: Show): boolean {
  if (show === 'waiting') return panel.status === 'pending';
  if (show === 'attention') return panel.status !== 'pending' && summarizePanel(panel).outOfRange > 0;
  return true;
}

function ResultsList({ panels }: { panels: LabPanel[] }) {
  const patientId = usePatientId();
  const clinicians = useClinicians();
  const markViewed = useMarkResultsViewed(patientId);
  const [params, setParams] = useSearchParams();
  const show = (['attention', 'waiting'].includes(params.get('show') ?? '') ? params.get('show') : 'all') as Show;
  const query = params.get('q') ?? '';

  // Remember what was new when the page opened, so the badges stay for this
  // visit even after the results are marked as seen.
  const newIds = useRef<Set<string> | null>(null);
  newIds.current ??= new Set(panels.filter(isNewResult).map((p) => p.id));

  useEffect(() => {
    const ids = [...newIds.current!];
    if (ids.length > 0) markViewed.mutate(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mark once when the page opens
  }, []);

  function update(key: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  const needle = query.trim().toLowerCase();
  const shown = panels.filter(
    (p) =>
      matchesShow(p, show) &&
      (!needle || [p.name, ...p.observations.map((o) => o.name)].join(' ').toLowerCase().includes(needle)),
  );
  const newCount = newIds.current.size;
  const attention = panels.filter((p) => matchesShow(p, 'attention')).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        {newCount > 0 ? `${newCount} new ${newCount === 1 ? 'result' : 'results'} since you last looked. ` : ''}
        Results appear here as soon as the lab sends them.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<Show>
          label="Show"
          value={show}
          onChange={(next) => update('show', next === 'all' ? '' : next)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'attention', label: `Outside range (${attention})` },
            { value: 'waiting', label: 'Waiting' },
          ]}
        />
        <Field label="Search results" hideLabel className="w-full sm:w-64">
          <Input
            type="search"
            placeholder="Test name, like LDL"
            value={query}
            onChange={(event) => update('q', event.target.value)}
          />
        </Field>
      </div>

      {shown.length === 0 ? (
        <Card tone="sunken" className="text-sm text-ink-muted">
          {needle || show !== 'all' ? 'No results match.' : 'Your test results will appear here.'}
        </Card>
      ) : (
        shown.map((panel) => (
          <PanelCard
            key={panel.id}
            panel={panel}
            orderedBy={clinicians.data?.find((c) => c.id === panel.orderedById)}
            isNew={newIds.current!.has(panel.id)}
          />
        ))
      )}
    </div>
  );
}

export function ResultsPage() {
  const patientId = usePatientId();
  const labs = useLabPanels(patientId);

  return (
    <div className="max-w-5xl">
      <QueryState
        query={labs}
        label="your results"
        loading={
          <div className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-48 rounded-card" />
            ))}
          </div>
        }
      >
        {(panels) => <ResultsList panels={panels} />}
      </QueryState>
    </div>
  );
}

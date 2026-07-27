import { Link, useLocation } from 'react-router';
import { IconSearch, IconX } from '@tabler/icons-react';
import { useRoster } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { useClinicianId } from '@/auth/session';
import {
  filterRoster,
  filterRosterExceptLevel,
  riskFactorLabels,
  riskLevelDisplay,
  rosterRows,
} from '@/domain/risk';
import type { RiskFactorKey, RiskLevel, RosterRow, RosterScope, RosterSort } from '@/domain/risk';
import { ageOn, formatDay, formatTime, relativeDay } from '@/lib/dates';
import { useNow } from '@/lib/useNow';
import { Avatar, Button, Card, Field, Input, SegmentedControl, Select, Skeleton, StatusDot, cx } from '@/ui';
import type { ChartLinkState } from './ChartPage';
import { useRosterFilters } from './useRosterFilters';

const sexLabels = { female: 'F', male: 'M', intersex: 'X', unknown: '—' } as const;

function PatientCell({ row, now }: { row: RosterRow; now: Date }) {
  const location = useLocation();
  const { patient } = row.snapshot;
  const name = `${patient.preferredName ?? patient.firstName} ${patient.lastName}`;
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} decorative />
      <div className="min-w-0">
        <p className="font-medium text-ink">
          <Link
            to={`/clinic/patients/${patient.id}`}
            state={{ rosterSearch: location.search } satisfies ChartLinkState}
            className="hover:underline focus-visible:underline"
          >
            {name}
          </Link>
        </p>
        <p className="text-xs text-ink-muted tabular">
          {ageOn(patient.dateOfBirth, now)} · {sexLabels[patient.sex]}
          {patient.pronouns && ` · ${patient.pronouns}`} · {patient.mrn}
        </p>
      </div>
    </div>
  );
}

function RosterTable({ rows, now }: { rows: RosterRow[]; now: Date }) {
  const head = 'px-3 py-2.5 text-left text-xs font-medium text-ink-muted';
  const cell = 'px-3 py-3 align-top';
  return (
    <div className="relative -mx-4 overflow-x-auto sm:-mx-5">
      <table className="w-full min-w-[46rem] text-sm">
        <caption className="sr-only">Patients, {rows.length} shown</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={cx(head, 'pl-4 sm:pl-5')}>
              Patient
            </th>
            <th scope="col" className={head}>
              Risk
            </th>
            <th scope="col" className={head}>
              Why
            </th>
            <th scope="col" className={head}>
              Latest BP
            </th>
            <th scope="col" className={cx(head, 'pr-4 sm:pr-5')}>
              Next visit
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const display = riskLevelDisplay[row.risk.level];
            const bp = row.snapshot.latestBloodPressure;
            return (
              <tr key={row.snapshot.patient.id} className="border-b border-line last:border-0">
                <th scope="row" className={cx(cell, 'pl-4 text-left font-normal sm:pl-5')}>
                  <PatientCell row={row} now={now} />
                </th>
                <td className={cell}>
                  <StatusDot tone={display.tone}>
                    {display.label}
                    <span className="text-ink-muted tabular"> · {row.risk.score}</span>
                  </StatusDot>
                </td>
                <td className={cell}>
                  {row.risk.factors.length === 0 ? (
                    <span className="text-ink-muted">Nothing flagged</span>
                  ) : (
                    <ul className="flex flex-wrap gap-1" aria-label="Reasons">
                      {row.risk.factors.map((factor) => (
                        <li
                          key={factor.key}
                          className={cx(
                            'rounded-[6px] px-1.5 py-0.5 text-xs whitespace-nowrap',
                            factor.points >= 3 ? 'bg-critical-soft text-critical-ink' : 'bg-surface-sunken text-ink-muted',
                          )}
                        >
                          {factor.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className={cx(cell, 'tabular')}>
                  {bp ? (
                    <>
                      <span className="block">
                        {bp.systolic}/{bp.diastolic}
                      </span>
                      <span className="block text-xs text-ink-muted">{relativeDay(bp.takenAt, now)}</span>
                    </>
                  ) : (
                    <span className="text-ink-muted">None</span>
                  )}
                </td>
                <td className={cx(cell, 'pr-4 tabular sm:pr-5')}>
                  {row.nextVisit ? (
                    <>
                      <span className="block">{formatDay(row.nextVisit.start, now)}</span>
                      <span className="block text-xs text-ink-muted">{formatTime(row.nextVisit.start)}</span>
                    </>
                  ) : (
                    <span className="text-ink-muted">None booked</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RosterPage() {
  const clinicianId = useClinicianId();
  const roster = useRoster(clinicianId);
  const now = useNow(60_000);
  const { filters, hasFilters, setQuery, setLevel, toggleFactor, setScope, setSort, clear } = useRosterFilters();

  return (
    <div className="flex max-w-7xl flex-col gap-4">
      <QueryState
        query={roster}
        label="your patients"
        loading={<Skeleton className="h-96 rounded-card" />}
      >
        {(snapshots) => {
          const rows = rosterRows(snapshots, now);
          const beforeLevel = filterRosterExceptLevel(rows, filters, clinicianId);
          const count = (level: RiskLevel) => beforeLevel.filter((r) => r.risk.level === level).length;
          const shown = filterRoster(rows, filters, clinicianId);
          const factorsInPanel = (Object.keys(riskFactorLabels) as RiskFactorKey[]).filter(
            (key) => filters.factors.includes(key) || rows.some((r) => r.risk.factors.some((f) => f.key === key)),
          );

          return (
            <>
              <Card padded={false} className="flex flex-col gap-4 p-4 sm:p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Search patients" hideLabel className="min-w-56 flex-1">
                    <div className="relative">
                      <IconSearch
                        aria-hidden
                        size={16}
                        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
                      />
                      <Input
                        type="search"
                        placeholder="Name or MRN"
                        value={filters.query}
                        onChange={(event) => setQuery(event.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </Field>
                  <SegmentedControl<RosterScope>
                    label="Whose patients"
                    value={filters.scope}
                    onChange={setScope}
                    options={[
                      { value: 'care-team', label: 'Care team' },
                      { value: 'primary', label: 'Primary care' },
                    ]}
                  />
                  <Field label="Sort by" className="w-40">
                    <Select
                      value={filters.sort}
                      onChange={(event) => setSort(event.target.value as RosterSort)}
                      options={[
                        { value: 'risk', label: 'Highest risk' },
                        { value: 'name', label: 'Name' },
                        { value: 'next-visit', label: 'Next visit' },
                      ]}
                    />
                  </Field>
                </div>
                <SegmentedControl<RiskLevel | 'all'>
                  label="Risk level"
                  value={filters.level}
                  onChange={setLevel}
                  className="self-start"
                  options={[
                    { value: 'all', label: `All ${beforeLevel.length}` },
                    { value: 'high', label: `High ${count('high')}` },
                    { value: 'rising', label: `Rising ${count('rising')}` },
                    { value: 'routine', label: `Routine ${count('routine')}` },
                  ]}
                />
                <div role="group" aria-label="Show patients with any of" className="flex flex-wrap items-center gap-1.5">
                  <span aria-hidden="true" className="mr-1 text-xs text-ink-muted">
                    Show patients with any of
                  </span>
                  {factorsInPanel.map((key) => {
                    const on = filters.factors.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleFactor(key)}
                        className={cx(
                          'h-7 rounded-full border px-3 text-xs font-medium transition-colors',
                          on
                            ? 'border-ink bg-ink text-canvas'
                            : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
                        )}
                      >
                        {riskFactorLabels[key]}
                      </button>
                    );
                  })}
                  {hasFilters && (
                    <Button size="sm" variant="ghost" icon={IconX} onClick={clear} className="ml-auto">
                      Clear filters
                    </Button>
                  )}
                </div>
              </Card>

              <Card padded={false} className="px-4 pb-1 sm:px-5">
                <p role="status" className="py-3 text-sm text-ink-muted">
                  {shown.length === rows.length
                    ? `${rows.length} patients`
                    : `${shown.length} of ${rows.length} patients`}
                </p>
                {shown.length === 0 ? (
                  <p className="border-t border-line py-8 text-center text-sm text-ink-muted">
                    No patients match these filters.
                  </p>
                ) : (
                  <RosterTable rows={shown} now={now} />
                )}
              </Card>
              <p className="text-xs text-ink-muted">
                Risk adds up flagged items such as critical or unreviewed labs, blood pressure, A1c, missed visits, age
                and number of conditions. It helps order the list and is not a clinical prediction.
              </p>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}

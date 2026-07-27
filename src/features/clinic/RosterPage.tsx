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

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useVitals } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { Sparkline } from '@/charts/Sparkline';
import { assessBloodPressure, assessGlucose, assessHeartRate, readingsOf } from '@/domain/vitals';
import type { VitalReading } from '@/domain/types';
import { relativeDay } from '@/lib/dates';
import { round } from '@/lib/units';
import { Skeleton, StatusDot } from '@/ui';
import type { StatusTone } from '@/ui';

/** How many recent readings each tile's sparkline shows. */
const SPARK_POINTS = 14;

interface TileProps {
  label: string;
  value: ReactNode;
  unit: string;
  status: { tone: StatusTone; label: string };
  takenAt?: string;
  trend: number[];
  href: string;
}

function VitalTile({ label, value, unit, status, takenAt, trend, href }: TileProps) {
  return (
    <li>
      <Link
        to={href}
        className="flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-4 transition-colors hover:border-line-strong"
      >
        <span className="text-xs text-ink-muted">{label}</span>
        <span className="font-display text-2xl font-semibold tabular">
          {value} <span className="font-sans text-xs font-normal text-ink-muted">{unit}</span>
        </span>
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <StatusDot tone={status.tone}>{status.label}</StatusDot>
          {takenAt && <span className="text-xs text-ink-muted">{relativeDay(takenAt)}</span>}
        </span>
        <Sparkline series={[{ values: trend, color: 'var(--mw-data)' }]} markLast className="mt-auto h-8" />
      </Link>
    </li>
  );
}

function tilesFor(readings: VitalReading[]): TileProps[] {
  const tiles: TileProps[] = [];

  const bp = readingsOf(readings, 'blood-pressure');
  const lastBp = bp.at(-1);
  if (lastBp) {
    tiles.push({
      label: 'Blood pressure',
      value: `${lastBp.systolic}/${lastBp.diastolic}`,
      unit: 'mmHg',
      status: assessBloodPressure(lastBp.systolic, lastBp.diastolic),
      takenAt: lastBp.takenAt,
      trend: bp.slice(-SPARK_POINTS).map((r) => r.systolic),
      href: '/vitals?kind=blood-pressure',
    });
  }

  const hr = readingsOf(readings, 'heart-rate');
  const lastHr = hr.at(-1);
  if (lastHr) {
    tiles.push({
      label: 'Resting heart rate',
      value: lastHr.bpm,
      unit: 'bpm',
      status: assessHeartRate(lastHr.bpm),
      takenAt: lastHr.takenAt,
      trend: hr.slice(-SPARK_POINTS).map((r) => r.bpm),
      href: '/vitals?kind=heart-rate',
    });
  }

  const fasting = readingsOf(readings, 'glucose').filter((r) => r.context === 'fasting');
  const lastGlucose = fasting.at(-1);
  if (lastGlucose) {
    tiles.push({
      label: 'Fasting glucose',
      value: lastGlucose.mgPerDl,
      unit: 'mg/dL',
      status: assessGlucose(lastGlucose.mgPerDl, 'fasting'),
      takenAt: lastGlucose.takenAt,
      trend: fasting.slice(-SPARK_POINTS).map((r) => r.mgPerDl),
      href: '/vitals?kind=glucose',
    });
  }

  const weight = readingsOf(readings, 'weight');
  const lastWeight = weight.at(-1);
  if (lastWeight) {
    const change = round(lastWeight.kg - weight[0]!.kg, 1);
    tiles.push({
      label: 'Weight',
      value: lastWeight.kg.toFixed(1),
      unit: 'kg',
      status: {
        tone: 'info',
        label: change === 0 ? 'No change' : `${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(1)} kg since first log`,
      },
      takenAt: lastWeight.takenAt,
      trend: weight.slice(-SPARK_POINTS).map((r) => r.kg),
      href: '/vitals?kind=weight',
    });
  }

  return tiles;
}

/** Latest reading of each vital with its status and a short trend. */
export function VitalsTiles({ patientId }: { patientId: string }) {
  const query = useVitals(patientId);
  return (
    <section aria-labelledby="vitals-tiles-heading">
      <h2 id="vitals-tiles-heading" className="sr-only">
        Latest vitals
      </h2>
      <QueryState
        query={query}
        label="your vitals"
        loading={
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36 rounded-card" />
            ))}
          </div>
        }
      >
        {(readings) => {
          const tiles = tilesFor(readings);
          if (tiles.length === 0) {
            return (
              <p className="rounded-card bg-surface-sunken p-4 text-sm text-ink-muted">
                No readings yet. <Link to="/vitals" className="font-medium text-ink underline">Log your first one</Link>.
              </p>
            );
          }
          return (
            <ul className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
              {tiles.map((tile) => (
                <VitalTile key={tile.label} {...tile} />
              ))}
            </ul>
          );
        }}
      </QueryState>
    </section>
  );
}

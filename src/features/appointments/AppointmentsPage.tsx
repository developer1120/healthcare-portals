import { useMemo } from 'react';
import { IconCalendarPlus, IconX } from '@tabler/icons-react';
import { useAppointments, useClinicians } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { filterAppointments, groupByMonth, modeLabels, splitAppointments, statusDisplay } from '@/domain/appointments';
import type { Appointment, Clinician } from '@/domain/types';
import { Button, ButtonLink, Card, Field, Input, SegmentedControl, Select, Skeleton } from '@/ui';
import { AppointmentRow } from './AppointmentRow';
import { useAppointmentFilters } from './useAppointmentFilters';
import type { AppointmentView } from './useAppointmentFilters';

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function AppointmentList({ appointments, clinicians }: { appointments: Appointment[]; clinicians: Clinician[] }) {
  const { view, filters, hasFilters, setView, setClinician, setMode, setStatus, setQuery, clear } =
    useAppointmentFilters();
  const { upcoming, past } = useMemo(() => splitAppointments(appointments), [appointments]);
  const source = view === 'upcoming' ? upcoming : past;
  const shown = filterAppointments(source, filters, clinicians);
  const groups = groupByMonth(shown);

  // Only offer clinicians who appear in this list.
  const clinicianOptions = clinicians
    .filter((c) => source.some((a) => a.clinicianId === c.id))
    .map((c) => ({ value: c.id, label: c.name }));

  const noun = view === 'upcoming' ? 'upcoming visit' : 'past visit';
  const countText = hasFilters
    ? `Showing ${shown.length} of ${plural(source.length, noun)}`
    : plural(source.length, noun);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<AppointmentView>
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: 'upcoming', label: `Upcoming (${upcoming.length})` },
            { value: 'past', label: `Past (${past.length})` },
          ]}
        />
        <ButtonLink to="/appointments/book" variant="primary" icon={IconCalendarPlus}>
          Book a visit
        </ButtonLink>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Search appointments" hideLabel>
          <Input
            type="search"
            placeholder="Reason, clinician or place"
            value={filters.query ?? ''}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        <Field label="Clinician" hideLabel>
          <Select
            options={clinicianOptions}
            placeholder="All clinicians"
            value={filters.clinicianId ?? ''}
            onChange={(event) => setClinician(event.target.value)}
          />
        </Field>
        <Field label="Visit type" hideLabel>
          <Select
            options={[
              { value: 'video', label: modeLabels.video },
              { value: 'in-person', label: modeLabels['in-person'] },
            ]}
            placeholder="Any visit type"
            value={filters.mode ?? ''}
            onChange={(event) => setMode(event.target.value)}
          />
        </Field>
        {view === 'past' && (
          <Field label="Outcome" hideLabel>
            <Select
              options={(['completed', 'cancelled', 'no-show'] as const).map((status) => ({
                value: status,
                label: statusDisplay[status].label,
              }))}
              placeholder="Any outcome"
              value={filters.status ?? ''}
              onChange={(event) => setStatus(event.target.value)}
            />
          </Field>
        )}
      </div>

      <div className="flex min-h-8 items-center justify-between gap-3">
        <p role="status" className="text-sm text-ink-muted">
          {countText}
        </p>
        {hasFilters && (
          <Button variant="ghost" size="sm" icon={IconX} onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>

      {shown.length === 0 ? (
        <Card tone="sunken" className="text-sm text-ink-muted">
          {hasFilters
            ? 'No visits match these filters. Try clearing them.'
            : view === 'upcoming'
              ? 'You have no upcoming visits.'
              : 'Your past visits will appear here.'}
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.month} aria-labelledby={`month-${group.month}`} className="flex flex-col gap-2">
            <h2 id={`month-${group.month}`} className="font-sans text-sm font-semibold tracking-normal text-ink-muted">
              {group.month}
            </h2>
            <ul className="flex flex-col gap-2">
              {group.appointments.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  clinician={clinicians.find((c) => c.id === appointment.clinicianId)}
                  upcoming={view === 'upcoming'}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export function AppointmentsPage() {
  const patientId = usePatientId();
  const appointments = useAppointments(patientId);
  const clinicians = useClinicians();

  return (
    <div className="max-w-4xl">
      <QueryState
        query={appointments}
        label="your appointments"
        loading={
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-card" />
            ))}
          </div>
        }
      >
        {(list) => <AppointmentList appointments={list} clinicians={clinicians.data ?? []} />}
      </QueryState>
    </div>
  );
}

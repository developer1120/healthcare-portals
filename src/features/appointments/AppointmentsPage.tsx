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

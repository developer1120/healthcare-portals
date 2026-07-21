import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { IconCalendarRepeat, IconPhone } from '@tabler/icons-react';
import { errorMessage, isApiError } from '@/api/errors';
import { useAppointments, useAvailability, useClinicians, useRescheduleAppointment } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { CLINIC_PHONE, MAX_RESCHEDULES, changePolicy } from '@/domain/appointmentPolicy';
import { modeLabels } from '@/domain/appointments';
import type { Appointment, Clinician, VisitMode } from '@/domain/types';
import { formatTimeRange } from '@/lib/dates';
import { BackLink, Button, Card, SegmentedControl, Skeleton } from '@/ui';
import { SlotPicker } from '@/features/booking/SlotPicker';

function RescheduleForm({ appointment, clinician }: { appointment: Appointment; clinician: Clinician }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<VisitMode>(appointment.mode);
  const [chosenDate, setChosenDate] = useState<string>();
  const [slot, setSlot] = useState<string>();
  const [slotError, setSlotError] = useState<string>();
  const availability = useAvailability(clinician.id);
  const reschedule = useRescheduleAppointment();
  const date = chosenDate ?? availability.data?.find((d) => d.slots.length > 0)?.date;
  const policy = changePolicy(appointment);

  if (!policy.canReschedule) {
    const reason =
      policy.rescheduleBlock === 'within-cutoff'
        ? 'Your visit is less than 24 hours away, so it can no longer be moved online.'
        : policy.rescheduleBlock === 'limit-reached'
          ? `This visit has already been moved ${MAX_RESCHEDULES} times online.`
          : 'This visit can no longer be changed.';
    return (
      <Card tone="sunken" className="flex flex-col items-start gap-3 text-sm">
        <p>{reason}</p>
        {policy.canCancel && (
          <a
            href={`tel:${CLINIC_PHONE.replace(/[^\d]/g, '')}`}
            className="inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-4 font-semibold"
          >
            <IconPhone aria-hidden size={18} stroke={1.75} />
            Call {CLINIC_PHONE}
          </a>
        )}
      </Card>
    );
  }

  function submit() {
    if (!slot) {
      setSlotError('Choose a new time.');
      return;
    }
    reschedule.mutate(
      { patientId: appointment.patientId, appointmentId: appointment.id, start: slot, mode },
      {
        onSuccess: (moved) =>
          navigate(`/appointments/${moved.id}`, { replace: true, state: { notice: 'rescheduled' } }),
        onError: (error) => {
          if (isApiError(error) && error.code === 'conflict') setSlot(undefined);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Card tone="sunken" className="text-sm">
        <p className="text-ink-muted">Currently</p>
        <p className="mt-0.5 font-medium">
          {appointment.reason} with {clinician.name}
        </p>
        <p className="tabular">
          {formatTimeRange(appointment.start, appointment.durationMinutes)} · {modeLabels[appointment.mode]}
        </p>
      </Card>

      <Card title="Choose a new time">
        <div className="flex flex-col gap-4">
          {clinician.offersVideo && (

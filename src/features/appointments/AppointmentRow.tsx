import { Link } from 'react-router';
import { addMinutes, format } from 'date-fns';
import { IconMapPin, IconVideo } from '@tabler/icons-react';
import { statusDisplay } from '@/domain/appointments';
import { specialtyLabels } from '@/domain/clinicians';
import type { Appointment, Clinician } from '@/domain/types';
import { formatTime, relativeDay, toDate } from '@/lib/dates';
import { StatusDot, cx } from '@/ui';

interface AppointmentRowProps {
  appointment: Appointment;
  clinician?: Clinician;
  /** Upcoming rows say how soon the visit is. */
  upcoming: boolean;
}

/** One visit in the appointments list, linking to its detail page. */
export function AppointmentRow({ appointment, clinician, upcoming }: AppointmentRowProps) {
  const start = toDate(appointment.start);
  const end = addMinutes(start, appointment.durationMinutes);
  const status = statusDisplay[appointment.status];
  const ModeIcon = appointment.mode === 'video' ? IconVideo : IconMapPin;
  const cancelled = appointment.status === 'cancelled';

  return (
    <li>
      <Link
        to={`/appointments/${appointment.id}`}
        className="flex items-center gap-4 rounded-card border border-line bg-surface p-3 pr-4 transition-colors hover:border-line-strong sm:p-4"
      >
        <span
          aria-hidden="true"
          className={cx(
            'flex size-14 shrink-0 flex-col items-center justify-center rounded-[12px] leading-none',
            upcoming ? 'bg-rail text-white' : 'bg-surface-sunken text-ink-muted',
          )}
        >
          <span className="text-2xs font-medium uppercase">{format(start, 'EEE')}</span>
          <span className="font-display text-xl font-semibold">{format(start, 'd')}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate text-sm font-medium', cancelled && 'text-ink-muted line-through')}>
            {appointment.reason}
          </span>
          <span className="block truncate text-sm text-ink-muted">
            {clinician ? `${clinician.name} · ${specialtyLabels[clinician.specialty]}` : 'Clinician'}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            <span className="tabular">
              {format(start, 'd MMM')} · {formatTime(start)} – {formatTime(end)}
              {upcoming && ` · ${relativeDay(start)}`}
            </span>
            <span className="inline-flex items-center gap-1">
              <ModeIcon aria-hidden size={14} stroke={1.75} />
              {appointment.location}
            </span>
          </span>
        </span>
        <StatusDot tone={status.tone} className="shrink-0">
          {status.label}
        </StatusDot>
      </Link>
    </li>
  );
}

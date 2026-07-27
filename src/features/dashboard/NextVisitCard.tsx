import { Link } from 'react-router';
import { IconCalendarPlus, IconMapPin, IconVideo } from '@tabler/icons-react';
import { useAppointments, useClinicians } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { modeLabels, nextAppointment } from '@/domain/appointments';
import { specialtyLabels } from '@/domain/clinicians';
import { telehealthAction } from '@/domain/telehealth';
import { formatTimeRange, relativeDay } from '@/lib/dates';
import { ButtonLink, Card, Skeleton } from '@/ui';

/** The dark pine feature card at the top of the dashboard. */
export function NextVisitCard({ patientId }: { patientId: string }) {
  const appointments = useAppointments(patientId);
  const clinicians = useClinicians();

  return (
    <Card tone="pine" className="min-h-36" aria-label="Next visit" role="region">
      <QueryState
        query={appointments}
        label="your next visit"
        loading={
          <>
            <Skeleton className="h-3 w-40 bg-rail-active" />
            <Skeleton className="h-6 w-64 bg-rail-active" />
            <Skeleton className="h-3 w-48 bg-rail-active" />
          </>
        }
      >
        {(list) => {
          const visit = nextAppointment(list);
          if (!visit) {
            return (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs">Next visit</p>
                  <h2 className="text-lg text-white">No visits booked</h2>
                  <p className="mt-1 text-sm">When you book a visit it will show up here.</p>
                </div>
                <ButtonLink to="/appointments/book" variant="primary" icon={IconCalendarPlus}>
                  Book a visit
                </ButtonLink>
              </div>
            );
          }

          const clinician = clinicians.data?.find((c) => c.id === visit.clinicianId);
          const ModeIcon = visit.mode === 'video' ? IconVideo : IconMapPin;
          const action = telehealthAction(visit);
          return (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs">
                  Next visit · {modeLabels[visit.mode]} · {relativeDay(visit.start)}
                </p>
                <h2 className="mt-1 text-lg text-white sm:text-xl">
                  {clinician ? `${clinician.name}, ${specialtyLabels[clinician.specialty]}` : 'Your clinician'}
                </h2>
                <p className="mt-1 text-sm text-white/90 tabular">{formatTimeRange(visit.start, visit.durationMinutes)}</p>
                <p className="mt-2 flex items-center gap-1.5 text-sm">
                  <ModeIcon aria-hidden size={16} stroke={1.75} />
                  {visit.reason} · {visit.location}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {action && (
                  <Link to={`/appointments/${visit.id}`} className="text-sm font-medium text-white hover:underline">
                    View visit
                  </Link>
                )}
                <ButtonLink to={action?.href ?? `/appointments/${visit.id}`} variant="primary">
                  {action?.label ?? 'View visit'}
                </ButtonLink>
              </div>
            </div>
          );
        }}
      </QueryState>
    </Card>
  );
}

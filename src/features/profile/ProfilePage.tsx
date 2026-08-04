import { usePatient } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { Skeleton } from '@/ui';
import { CaregiversCard } from './CaregiversCard';
import { ContactCard } from './ContactCard';
import { AccessLogCard, ConsentsCard } from './PrivacyCards';

export function ProfilePage() {
  const patientId = usePatientId();
  const patient = usePatient(patientId);

  return (
    <div className="grid max-w-6xl items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <QueryState query={patient} label="your profile" loading={<Skeleton className="h-96 rounded-card" />}>
        {(data) => (
          <div className="flex flex-col gap-5">
            <ContactCard patient={data} />
            <CaregiversCard patient={data} />
          </div>
        )}
      </QueryState>
      <div className="flex flex-col gap-5">
        <ConsentsCard patientId={patientId} />
        <AccessLogCard patientId={patientId} />
      </div>
    </div>
  );
}

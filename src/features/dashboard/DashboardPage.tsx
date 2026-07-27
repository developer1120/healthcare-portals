import { usePatient, useTasks } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { TaskList } from '@/features/tasks/TaskList';
import { greetingFor } from '@/lib/greeting';
import { WIDE_QUERY, useMediaQuery } from '@/lib/useMediaQuery';
import { useLayoutStore } from '@/shell/layoutStore';
import { usePageHeading } from '@/shell/pageHeading';
import { Card } from '@/ui';
import { BloodPressureTrend } from './BloodPressureTrend';
import { LatestResults } from './LatestResults';
import { NextVisitCard } from './NextVisitCard';
import { VitalsTiles } from './VitalsTiles';

function TasksCard({ patientId }: { patientId: string }) {
  const query = useTasks(patientId);
  const open = query.data?.filter((task) => !task.completedAt).length;
  return (
    <Card
      title="To do"
      description={open === undefined ? undefined : open === 0 ? 'You’re all caught up.' : `${open} things need you`}
    >
      <QueryState query={query} label="your to-do list">
        {(tasks) => <TaskList tasks={tasks} patientId={patientId} showDue />}
      </QueryState>
    </Card>
  );
}

/** Patient home: next visit, latest vitals, blood pressure trend, results and to-dos. */
export function DashboardPage() {
  const patientId = usePatientId();
  const patient = usePatient(patientId);
  const carePanelOpen = useLayoutStore((state) => state.carePanelOpen);
  const wide = useMediaQuery(WIDE_QUERY);
  const name = patient.data ? (patient.data.preferredName ?? patient.data.firstName) : null;

  usePageHeading(name ? `${greetingFor()}, ${name}` : null);

  return (
    <div className="flex flex-col gap-5">
      <NextVisitCard patientId={patientId} />
      <VitalsTiles patientId={patientId} />
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <BloodPressureTrend patientId={patientId} />
        <LatestResults patientId={patientId} />
      </div>
      {/* The care panel lists to-dos when it sits beside the page; otherwise show them here. */}
      {!(wide && carePanelOpen) && <TasksCard patientId={patientId} />}
    </div>
  );
}

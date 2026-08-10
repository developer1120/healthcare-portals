import type { ReactNode } from 'react';

import { Link } from 'react-router';
import { IconX } from '@tabler/icons-react';
import { useCareTeam, useTasks, useThreads } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { clinicianSubtitle } from '@/domain/clinicians';
import { isUnread } from '@/domain/messages';
import { TaskList } from '@/features/tasks/TaskList';
import { relativeTime } from '@/lib/dates';
import { Avatar, Dialog, IconButton, cx } from '@/ui';
import { useLayoutStore } from './layoutStore';

/** How many tasks the panel lists before pointing to the dashboard. */
const TASK_LIMIT = 4;

/**
 * A headed group inside the panel. Not a landmark of its own: the panel is one,
 * and the page often has its own "To do" region that would clash.
 */
function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="font-sans text-xs font-semibold tracking-normal text-ink-muted">{title}</h2>
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="rounded-control bg-surface-sunken px-3 py-2.5 text-sm text-ink-muted">{children}</p>;
}

function CareTeam({ patientId }: { patientId: string }) {
  const query = useCareTeam(patientId);
  return (
    <QueryState query={query} label="your care team">
      {(team) =>
        team.length === 0 ? (
          <EmptyNote>Clinicians looking after you will appear here.</EmptyNote>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {team.map((clinician) => (
              <li key={clinician.id} className="flex items-center gap-2.5">
                <Avatar name={clinician.name} size="sm" decorative />
                <div className="min-w-0 text-sm leading-tight">
                  <p className="truncate font-medium">{clinician.name}</p>
                  <p className="truncate text-xs text-ink-muted">{clinicianSubtitle(clinician)}</p>
                </div>
              </li>
            ))}
          </ul>
        )
      }
    </QueryState>
  );
}

function Tasks({ patientId }: { patientId: string }) {
  const query = useTasks(patientId);
  return (
    <QueryState query={query} label="your to-do list">
      {(tasks) => {
        const open = tasks.filter((task) => !task.completedAt);
        if (tasks.length === 0) return <EmptyNote>Nothing needs you right now.</EmptyNote>;
        return (
          <>
            <TaskList tasks={tasks.slice(0, TASK_LIMIT)} patientId={patientId} />
            <p className="text-xs text-ink-muted">
              {open.length === 0 ? 'All done.' : `${open.length} open`}
              {tasks.length > TASK_LIMIT && ` · ${tasks.length - TASK_LIMIT} more on Home`}
            </p>
          </>
        );
      }}
    </QueryState>
  );
}

function LatestMessage({ patientId }: { patientId: string }) {
  const threadsQuery = useThreads(patientId);
  const teamQuery = useCareTeam(patientId);
  return (
    <QueryState query={threadsQuery} label="your messages">
      {(threads) => {
        const thread = threads.find((t) => !t.archived);
        const message = thread?.messages.at(-1);

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
        if (!thread || !message) return <EmptyNote>The latest note from your care team will appear here.</EmptyNote>;
        const author =
          message.authorId === patientId ? 'You' : teamQuery.data?.find((c) => c.id === message.authorId)?.name;
        return (
          <Link to={`/messages/${thread.id}`} className="block rounded-control bg-surface-sunken px-3 py-2.5 hover:bg-line/60">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              {isUnread(thread) && (
                <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" role="img" />
              )}
              <span className="truncate">{thread.subject}</span>
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm text-ink-muted">{message.body}</p>
            <p className="mt-1 text-xs text-ink-muted">
              {author ? `${author} · ` : ''}
              {relativeTime(message.sentAt)}
            </p>
          </Link>
        );
      }}
    </QueryState>
  );
}

/** The panel's contents, shared by the column and the drawer. */
function CarePanelSections() {
  const patientId = usePatientId();
  return (
    <>
      <PanelSection title="Care team">
        <CareTeam patientId={patientId} />
      </PanelSection>
      <PanelSection title="To do">
        <Tasks patientId={patientId} />
      </PanelSection>
      <PanelSection title="Messages">
        <LatestMessage patientId={patientId} />
      </PanelSection>
    </>
  );
}

/**
 * The same panel as a drawer from the right, for screens too narrow for a third
 * column.
 */
export function CareDrawer() {
  const open = useLayoutStore((state) => state.careDrawerOpen);
  const setOpen = useLayoutStore((state) => state.setCareDrawerOpen);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Your care" variant="drawer">
      <div id="care-panel" className="mt-2 flex flex-col gap-6">
        <CarePanelSections />
      </div>
    </Dialog>
  );
}

/**
 * Right-hand column with context that follows the patient across pages:
 * care team, to-dos and the latest message. Shown beside the page on wide
 * screens.
 */
export function CarePanel({ className }: { className?: string }) {
  const setCarePanelOpen = useLayoutStore((state) => state.setCarePanelOpen);

  return (
    <aside
      id="care-panel"
      aria-label="Care panel"
      className={cx(
        'sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto border-l border-line bg-surface px-5 py-6',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <p className="font-display text-base font-semibold">Your care</p>
        <IconButton
          icon={IconX}
          label="Close care panel"
          variant="ghost"
          size="sm"
          onClick={() => setCarePanelOpen(false)}
        />
      </div>
      <CarePanelSections />
    </aside>
  );
}

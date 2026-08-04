import { useId } from 'react';
import { Link } from 'react-router';
import { useSetTaskCompleted } from '@/api/queries';
import type { PatientTask } from '@/domain/types';
import { relativeDay } from '@/lib/dates';
import { cx } from '@/ui';

function TaskItem({ task, patientId, showDue }: { task: PatientTask; patientId: string; showDue: boolean }) {
  const setCompleted = useSetTaskCompleted(patientId);
  const done = Boolean(task.completedAt);
  const checkboxId = useId();

  return (
    <li className="flex items-start gap-2.5">
      <input
        id={checkboxId}
        type="checkbox"
        checked={done}
        onChange={(event) => setCompleted.mutate({ taskId: task.id, completed: event.target.checked })}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-[4px] accent-[var(--mw-ok)]"
      />
      <div className="min-w-0 flex-1">
        <Link
          to={task.href}
          className={cx('text-sm leading-snug hover:underline', done ? 'text-ink-muted line-through' : 'text-ink')}
        >
          {task.title}
        </Link>
        {showDue && task.dueAt && !done && (
          <p className="text-xs text-ink-muted">Due {relativeDay(task.dueAt).toLowerCase()}</p>
        )}
      </div>
    </li>
  );
}

interface TaskListProps {
  tasks: PatientTask[];
  patientId: string;
  /** Show "Due tomorrow" under open tasks. */
  showDue?: boolean;
}

/** Checkable tasks that link to where they get done. Ticking saves optimistically. */
export function TaskList({ tasks, patientId, showDue = false }: TaskListProps) {
  return (
    <ul className="flex flex-col gap-2.5">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} patientId={patientId} showDue={showDue} />
      ))}
    </ul>
  );
}

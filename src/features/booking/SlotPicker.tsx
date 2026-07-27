import { format, getDay } from 'date-fns';
import type { DayAvailability } from '@/domain/availability';
import type { Clinician } from '@/domain/types';
import { formatTime, toDate } from '@/lib/dates';
import { cx } from '@/ui';

interface SlotPickerProps {
  clinician: Clinician;
  days: DayAvailability[];
  date: string | undefined;
  slot: string | undefined;
  onDateChange: (date: string) => void;
  onSlotChange: (slot: string) => void;
}

const optionClasses =
  'cursor-pointer rounded-control border border-line bg-surface text-center transition-colors hover:border-line-strong ' +
  'has-checked:border-ink has-checked:bg-ink has-checked:text-canvas has-focus-visible:outline-2 has-focus-visible:outline-focus ' +
  'has-disabled:cursor-not-allowed has-disabled:border-transparent has-disabled:bg-surface-sunken has-disabled:text-ink-subtle';

/** Day strip for the clinician's working days, then the free times on the chosen day. */
export function SlotPicker({ clinician, days, date, slot, onDateChange, onSlotChange }: SlotPickerProps) {
  const workingDays = new Set<number>(clinician.workingHours.map((h) => h.weekday));
  const shownDays = days.filter((d) => workingDays.has(getDay(toDate(`${d.date}T12:00:00`))));
  const selected = days.find((d) => d.date === date);

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Day</legend>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shownDays.map((day) => {
            const parsed = toDate(`${day.date}T12:00:00`);
            const full = day.slots.length === 0;
            return (
              <label key={day.date} className={cx(optionClasses, 'flex w-16 shrink-0 flex-col py-2')}>
                <input
                  type="radio"
                  name="day"
                  value={day.date}
                  checked={date === day.date}
                  disabled={full}
                  onChange={() => onDateChange(day.date)}
                  className="sr-only"
                />
                <span className="text-2xs uppercase">{format(parsed, 'EEE')}</span>
                <span className="font-display text-lg font-semibold">{format(parsed, 'd')}</span>
                <span className="text-2xs">{full ? 'Full' : format(parsed, 'MMM')}</span>
                <span className="sr-only">{full ? ', no times left' : `, ${day.slots.length} times free`}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {selected && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Time on {format(toDate(`${selected.date}T12:00:00`), 'EEEE d MMMM')}</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
            {selected.slots.map((start) => (
              <label key={start} className={cx(optionClasses, 'py-2 text-sm tabular')}>
                <input
                  type="radio"
                  name="slot"
                  value={start}
                  checked={slot === start}
                  onChange={() => onSlotChange(start)}
                  className="sr-only"
                />
                {formatTime(start)}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-muted">Each visit is {clinician.slotMinutes} minutes.</p>
        </fieldset>
      )}
    </div>
  );
}

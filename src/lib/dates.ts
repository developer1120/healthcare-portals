import {
  addDays,
  addMinutes,
  differenceInCalendarDays,
  differenceInMinutes,
  differenceInYears,
  format,
  isSameDay,
  parseISO,
  set,
  startOfDay,
} from 'date-fns';
import type { IsoDate, IsoDateTime } from '@/domain/types';

type DateInput = Date | IsoDateTime;

export function toDate(value: DateInput): Date {
  return typeof value === 'string' ? parseISO(value) : value;
}

/** Parses "HH:mm" into hours and minutes, throwing on anything else. */
export function parseTime(hhmm: string): { hours: number; minutes: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) throw new Error(`Expected a time as HH:mm, got "${hhmm}".`);
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/** Local date `dayOffset` days from `base`, at the given "HH:mm". Used to build seed data around "now". */
export function atTime(base: Date, dayOffset: number, hhmm: string): Date {
  const { hours, minutes } = parseTime(hhmm);
  return set(addDays(startOfDay(base), dayOffset), { hours, minutes, seconds: 0, milliseconds: 0 });
}

/** Local calendar date as "yyyy-MM-dd". */
export function toIsoDate(date: Date): IsoDate {
  return format(date, 'yyyy-MM-dd');
}

/** "10:30" (24-hour). */
export function formatTime(value: DateInput): string {
  return format(toDate(value), 'HH:mm');
}

/** "Tuesday 13 October" — the date line under page headings. */
export function formatLongDate(value: DateInput): string {
  return format(toDate(value), 'EEEE d MMMM');
}

/** "Thu 15 Oct". Adds the year when it differs from `now`'s. */
export function formatDay(value: DateInput, now: Date = new Date()): string {
  const date = toDate(value);
  return format(date, date.getFullYear() === now.getFullYear() ? 'EEE d MMM' : 'EEE d MMM yyyy');
}

/** "15 Oct 2026" — for record dates where the weekday adds nothing. */
export function formatShortDate(value: DateInput | IsoDate): string {
  return format(toDate(value), 'd MMM yyyy');
}

/** "2 h 14 min", "14 min", "1 day 3 h", or "less than a minute". Negative values count as zero. */
export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.floor(totalMinutes));
  if (minutes < 1) return 'less than a minute';
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} day${days > 1 ? 's' : ''} ${hours} h` : `${days} day${days > 1 ? 's' : ''}`;
  if (hours > 0) return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
  return `${mins} min`;
}

/** "Thu 15 Oct · 10:30 – 10:50". */
export function formatTimeRange(start: DateInput, durationMinutes: number, now: Date = new Date()): string {
  const from = toDate(start);
  const to = addMinutes(from, durationMinutes);
  return `${formatDay(from, now)} · ${formatTime(from)} – ${formatTime(to)}`;
}

/** "Today", "Tomorrow", "Yesterday", "in 3 days", "5 days ago" — by calendar day, not 24-hour blocks. */
export function relativeDay(value: DateInput, now: Date = new Date()): string {
  const days = differenceInCalendarDays(toDate(value), now);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** "just now", "12 min ago", "3 h ago", then the day for anything older than a day. */
export function relativeTime(value: DateInput, now: Date = new Date()): string {
  const date = toDate(value);
  const minutes = differenceInMinutes(now, date);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  if (isSameDay(date, addDays(now, -1))) return 'Yesterday';
  return formatDay(date, now);
}

/** Whole minutes from `now` until `value`; negative once it has passed. */
export function minutesUntil(value: DateInput, now: Date = new Date()): number {
  return differenceInMinutes(toDate(value), now);
}

/** Age in completed years. */
export function ageOn(dateOfBirth: IsoDate, now: Date = new Date()): number {
  return differenceInYears(now, parseISO(dateOfBirth));
}

export function compareAsc(a: DateInput, b: DateInput): number {
  return toDate(a).getTime() - toDate(b).getTime();
}

export function compareDesc(a: DateInput, b: DateInput): number {
  return compareAsc(b, a);
}

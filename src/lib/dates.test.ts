import { TEST_NOW } from '@/test/clock';
import {
  ageOn,
  atTime,
  compareAsc,
  compareDesc,
  formatDay,
  formatLongDate,
  formatShortDate,
  formatTime,
  formatTimeRange,
  minutesUntil,
  parseTime,
  relativeDay,
  relativeTime,
  toIsoDate,
} from './dates';

// TEST_NOW is Tuesday 13 October 2026, midday UTC. Dates below are built in
// local time with atTime so the assertions hold in any time zone.
const now = TEST_NOW;

describe('parseTime', () => {
  it('reads 24-hour HH:mm', () => {
    expect(parseTime('08:05')).toEqual({ hours: 8, minutes: 5 });
    expect(parseTime('23:59')).toEqual({ hours: 23, minutes: 59 });
  });

  it.each(['8:05', '24:00', '12:60', 'noon', ''])('rejects %j', (value) => {
    expect(() => parseTime(value)).toThrow(/HH:mm/);
  });
});

describe('atTime', () => {
  it('lands on the given local time, offset by whole days', () => {
    const date = atTime(now, 2, '10:30');
    expect(toIsoDate(date)).toBe('2026-10-15');
    expect(formatTime(date)).toBe('10:30');
    expect(date.getSeconds()).toBe(0);
  });

  it('goes backwards for negative offsets', () => {
    expect(toIsoDate(atTime(now, -13, '09:00'))).toBe('2026-09-30');
  });
});

describe('formatting', () => {
  it('formats the long heading date', () => {
    expect(formatLongDate(now)).toBe('Tuesday 13 October');
  });

  it('formats a short day, adding the year only when it differs', () => {
    expect(formatDay(atTime(now, 2, '10:30'), now)).toBe('Thu 15 Oct');
    expect(formatDay(atTime(now, 90, '10:30'), now)).toBe('Mon 11 Jan 2027');
  });

  it('formats record dates from ISO date strings', () => {
    expect(formatShortDate('1984-04-17')).toBe('17 Apr 1984');
  });

  it('formats a visit time range', () => {
    expect(formatTimeRange(atTime(now, 2, '10:30'), 20, now)).toBe('Thu 15 Oct · 10:30 – 10:50');
  });

  it('accepts ISO strings as well as dates', () => {
    expect(formatTime(atTime(now, 0, '07:45').toISOString())).toBe('07:45');
  });
});

describe('relativeDay', () => {
  it.each([
    [0, 'Today'],
    [1, 'Tomorrow'],
    [-1, 'Yesterday'],
    [2, 'in 2 days'],
    [-9, '9 days ago'],
  ])('offset %i → %s', (offset, expected) => {
    expect(relativeDay(atTime(now, offset, '23:30'), now)).toBe(expected);
  });

  it('counts calendar days, not 24-hour blocks', () => {
    const lateTonight = atTime(now, 0, '23:00');
    expect(relativeDay(atTime(now, 1, '01:00'), lateTonight)).toBe('Tomorrow');
  });
});

describe('relativeTime', () => {
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

  it.each([
    [0, 'just now'],
    [12, '12 min ago'],
    [59, '59 min ago'],
    [60, '1 h ago'],
    [170, '2 h ago'],
  ])('%i minutes ago → %s', (minutes, expected) => {
    expect(relativeTime(minutesAgo(minutes), now)).toBe(expected);
  });

  it('says Yesterday, then falls back to the day', () => {
    expect(relativeTime(atTime(now, -1, '08:00'), atTime(now, 0, '09:00'))).toBe('Yesterday');
    expect(relativeTime(atTime(now, -5, '08:00'), now)).toBe('Thu 8 Oct');
  });
});

describe('minutesUntil and ageOn', () => {
  it('counts minutes to a future time and below zero after it', () => {
    expect(minutesUntil(new Date(now.getTime() + 90 * 60_000), now)).toBe(90);
    expect(minutesUntil(new Date(now.getTime() - 30 * 60_000), now)).toBe(-30);
  });

  it('gives age in completed years', () => {
    expect(ageOn('1984-04-17', now)).toBe(42);
    expect(ageOn('1984-10-20', now)).toBe(41);
  });
});

describe('compare helpers', () => {
  it('sort ISO strings chronologically either way', () => {
    const values = ['2026-10-15T10:30:00Z', '2026-10-01T08:00:00Z', '2026-10-13T12:00:00Z'];
    expect([...values].sort(compareAsc)[0]).toBe('2026-10-01T08:00:00Z');
    expect([...values].sort(compareDesc)[0]).toBe('2026-10-15T10:30:00Z');
  });
});

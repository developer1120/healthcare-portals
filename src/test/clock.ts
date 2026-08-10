/**
 * Every test runs at this instant (only Date is faked; timers stay real).
 * Midday UTC keeps the calendar date the same in any test machine's time zone.
 */
export const TEST_NOW = new Date('2026-10-13T12:00:00Z');

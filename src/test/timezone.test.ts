import { TEST_NOW } from './clock';

describe('test time zone', () => {
  it('runs in the clinic’s zone unless TEST_TZ says otherwise', () => {
    const expected = process.env.TEST_TZ || 'America/Los_Angeles';
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(expected);
    if (expected === 'America/Los_Angeles') expect(TEST_NOW.getHours()).toBe(5);
  });
});

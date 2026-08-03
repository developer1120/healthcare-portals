import { screen, waitFor, within } from '@testing-library/react';
import { addDays, addHours, addMinutes } from 'date-fns';
import { api } from '@/api/endpoints';
import { getDb } from '@/api/mockDb';
import { buildNotifications, defaultReminderPrefs, notificationGroup, withState } from '@/domain/notifications';
import type { NotificationSources } from '@/domain/notifications';
import { atTime } from '@/lib/dates';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const AVA = 'pat-ava';
const prefs = defaultReminderPrefs(AVA);

function sources(): NotificationSources {
  const db = getDb();
  const own = <T extends { patientId: string }>(records: T[]) => records.filter((r) => r.patientId === AVA);
  return {
    patientId: AVA,
    threads: own(db.threads),
    labs: own(db.labPanels),
    refills: own(db.refillRequests),
    medications: own(db.medications),
    doseLogs: db.doseLogs,
    appointments: own(db.appointments),
    statements: own(db.statements),
    plans: own(db.paymentPlans),
    immunizations: own(db.immunizations),
    clinicians: db.clinicians,
  };
}

const ids = (now: Date, overrides = {}) => buildNotifications(sources(), { ...prefs, ...overrides }, now).map((n) => n.id);
const nextVideo = () =>
  getDb().appointments.filter((a) => a.patientId === AVA && a.mode === 'video' && a.status === 'booked').sort((a, b) => a.start.localeCompare(b.start))[0]!;

describe('building notifications', () => {
  it('covers care-team messages, results and vaccines from the last 30 days, newest first', () => {
    const list = buildNotifications(sources(), prefs, TEST_NOW);
    expect(list.map((n) => n.id)).toEqual(expect.arrayContaining(['msg:msg-202', 'msg:msg-402', 'imm:imm-1']));
    expect(list.some((n) => n.kind === 'result')).toBe(true);
    // Ava's own messages and anything over 30 days old don't notify.
    expect(list.map((n) => n.id)).not.toContain('msg:msg-201');
    expect(list.every((n) => n.at <= TEST_NOW.toISOString())).toBe(true);
    expect(list.map((n) => n.at)).toEqual([...list.map((n) => n.at)].sort().reverse());
    expect(list.find((n) => n.id === 'imm:imm-1')).toMatchObject({ title: 'Influenza (seasonal) is overdue', href: '/records' });
  });

  it('reminds about a visit at the chosen lead time, and opens the video waiting room', () => {
    const visit = nextVideo();
    const start = new Date(visit.start);
    expect(ids(addHours(start, -25))).not.toContain(`appt:${visit.id}:24`);
    expect(ids(addHours(start, -23))).toContain(`appt:${visit.id}:24`);
    expect(ids(addHours(start, -47), { appointmentLeadHours: 48 })).toContain(`appt:${visit.id}:48`);
    expect(ids(addHours(start, -3), { appointmentLeadHours: 2 })).not.toContain(`appt:${visit.id}:2`);

    const waiting = buildNotifications(sources(), prefs, addMinutes(start, -10)).find((n) => n.id === `checkin:${visit.id}`);
    expect(waiting).toMatchObject({ priority: 'high', href: `/appointments/${visit.id}/check-in` });
    expect(ids(addMinutes(start, -20))).not.toContain(`checkin:${visit.id}`);
  });

  it('nudges for a due dose unless medicine reminders are off', () => {
    // Seed before the morning doses, whatever the test timezone.
    vi.setSystemTime(atTime(TEST_NOW, 0, '05:00'));
    const at = atTime(TEST_NOW, 0, '08:30');
    const dose = buildNotifications(sources(), prefs, at).filter((n) => n.kind === 'dose');
    expect(dose.length).toBeGreaterThan(0);
    expect(dose[0]!.title).toMatch(/^Time for /);
    expect(buildNotifications(sources(), { ...prefs, medicationReminders: false }, at).some((n) => n.kind === 'dose')).toBe(false);
  });

  it('reminds about a statement a week before it is due', () => {
    const due = new Date(`${getDb().statements.find((s) => s.id === 'stm-2026-10')!.dueOn}T12:00:00`);
    expect(ids(addDays(due, -8))).not.toContain('bill:stm-2026-10:due');
    expect(ids(addDays(due, -6))).toContain('bill:stm-2026-10:due');
    expect(ids(addDays(due, -6), { billingReminders: false })).not.toContain('bill:stm-2026-10:due');
    expect(ids(addDays(due, 2))).toContain('bill:stm-2026-10:overdue');
  });

  it('applies read, read-all and dismissed state', () => {
    const list = buildNotifications(sources(), prefs, TEST_NOW);
    const [first, second] = list;
    const state = { patientId: AVA, readIds: [first!.id], dismissedIds: [second!.id] };
    const applied = withState(list, state);
    expect(applied.find((n) => n.id === first!.id)!.read).toBe(true);
    expect(applied.find((n) => n.id === second!.id)).toBeUndefined();
    expect(withState(list, { ...state, readAllBefore: TEST_NOW.toISOString() }).every((n) => n.read)).toBe(true);
  });

  it('groups by day', () => {
    expect(notificationGroup(TEST_NOW.toISOString(), TEST_NOW)).toBe('Today');
    expect(notificationGroup(addDays(TEST_NOW, -1).toISOString(), TEST_NOW)).toBe('Yesterday');
    expect(notificationGroup(addDays(TEST_NOW, -4).toISOString(), TEST_NOW)).toBe('Earlier');

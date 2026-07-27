import { screen, waitFor, within } from '@testing-library/react';
import { api } from '@/api/endpoints';
import { getDb } from '@/api/mockDb';
import { emergencyConcern } from '@/domain/messages';
import { filterInbox, sortInbox, triageThread, unanswered, unreadForClinician } from '@/domain/triage';
import type { InboxItem } from '@/domain/triage';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const now = TEST_NOW;
const ME = 'cln-lindqvist';
const inbox = () => api.clinic.inbox(ME);
const itemFor = async (threadId: string): Promise<InboxItem> => (await inbox()).find((i) => i.thread.id === threadId)!;
const patientName = (item: InboxItem) => item.snapshot.patient.firstName;

describe('triage', () => {
  it('sorts by level, then overdue, then longest waiting', async () => {
    const mine = filterInbox(sortInbox(await inbox(), now), { scope: 'mine', status: 'needs-reply' }, ME);
    expect(mine.map(patientName)).toEqual(['Ethan', 'Ruth', 'Mei', 'Marcus', 'Kai', 'Lucía']);
    expect(mine.map((i) => i.triage.level)).toEqual(['emergency', 'urgent', 'soon', 'soon', 'routine', 'routine']);

    const team = filterInbox(sortInbox(await inbox(), now), { scope: 'team', status: 'needs-reply' }, ME);
    expect(team.map(patientName)).toEqual(['Ethan', 'Ruth', 'Ava', 'Mei', 'Marcus', 'Dev', 'Kai', 'Lucía']);

    const all = filterInbox(sortInbox(await inbox(), now), { scope: 'mine', status: 'all' }, ME);
    expect(all.at(-1)!.thread.id).toBe('thr-grace-furosemide');
  });

  it('explains each level', async () => {
    expect(triageThread(await itemFor('thr-ethan-headache'), now).reasons).toEqual(['Possible emergency']);
    expect(triageThread(await itemFor('thr-ruth-fall'), now).reasons).toEqual(['Mentions a fall, dizziness']);
    expect(triageThread(await itemFor('thr-mei-tired'), now)).toMatchObject({ level: 'soon', overdue: true, reasons: ['Overdue'] });
    expect(triageThread(await itemFor('thr-grace-furosemide'), now)).toMatchObject({ needsReply: false });
  });

  it('bumps medical questions from high-risk patients to urgent', async () => {
    const grace = await itemFor('thr-grace-furosemide');
    grace.thread.messages.push({ ...grace.thread.messages[0]!, id: 'm-new', body: 'Is it OK to take it with food?', sentAt: now.toISOString() });
    expect(triageThread(grace, now)).toMatchObject({ level: 'urgent', reasons: ['High-risk patient'] });
    // A prescription question from the same patient stays routine.
    expect(triageThread({ ...grace, thread: { ...grace.thread, category: 'refill' } }, now).level).toBe('routine');
  });

  it('counts only messages since the last reply, and respects "no reply needed"', async () => {
    const mei = await itemFor('thr-mei-tired');
    expect(unanswered(mei.thread).map((m) => m.id)).toEqual(['msg-mei-tired-3']);
    expect(triageThread({ ...mei, thread: { ...mei.thread, closedAt: now.toISOString() } }, now).needsReply).toBe(false);
  });

  it('treats a sudden severe headache as an emergency everywhere', () => {
    expect(emergencyConcern('This is the worst headache of my life')).toBe('emergency');
  });

  it('counts unopened patient messages assigned to me', async () => {
    expect(unreadForClinician(await inbox(), ME)).toBe(4);
  });
});

describe('inbox endpoints', () => {
  it('only covers the clinician’s care-team patients', async () => {
    const lindqvist = await inbox();
    expect(lindqvist.every((i) => i.snapshot.patient.careTeamIds.includes(ME))).toBe(true);
    expect((await api.clinic.inbox('cln-okafor')).map((i) => i.thread.id)).toContain('thr-dizzy');
    await expect(api.clinic.reply({ clinicianId: 'cln-okafor', threadId: 'thr-lucia-inhaler', body: 'Hi' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('replies, unarchives for the patient, and validates', async () => {
    getDb().threads.find((t) => t.id === 'thr-kai-melatonin')!.archived = true;
    const thread = await api.clinic.reply({ clinicianId: ME, threadId: 'thr-kai-melatonin', body: '  Yes, 1–3 mg an hour before bed is fine. ' });
    expect(thread.messages.at(-1)).toMatchObject({ authorId: ME, body: 'Yes, 1–3 mg an hour before bed is fine.' });
    expect(thread.archived).toBe(false);
    expect(thread.clinicianReadAt).toBe(now.toISOString());
    await expect(api.clinic.reply({ clinicianId: ME, threadId: 'thr-kai-melatonin', body: '   ' })).rejects.toMatchObject({ status: 400 });
  });

  it('reassigns only to someone who handles the topic', async () => {
    await expect(
      api.clinic.reassign({ clinicianId: ME, threadId: 'thr-ruth-fall', assigneeId: 'cln-delgado' }),
    ).resolves.toMatchObject({ assigneeId: 'cln-delgado' });
    // Patient services only handles billing.
    await expect(api.clinic.reassign({ clinicianId: ME, threadId: 'thr-ruth-fall', assigneeId: 'cln-brooks' })).rejects.toMatchObject({
      status: 400,
    });
    // Not on Ruth's care team.
    await expect(api.clinic.reassign({ clinicianId: ME, threadId: 'thr-ruth-fall', assigneeId: 'cln-sato' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('closes a thread until the patient writes again', async () => {
    await api.clinic.closeThread({ clinicianId: ME, threadId: 'thr-dizzy' });

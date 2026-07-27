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
    expect(triageThread(await itemFor('thr-dizzy'), now).needsReply).toBe(false);

    vi.setSystemTime(new Date(now.getTime() + 60_000));
    await api.threads.reply({ patientId: 'pat-ava', threadId: 'thr-dizzy', body: 'One more question, sorry.' });
    expect(triageThread(await itemFor('thr-dizzy'), new Date()).needsReply).toBe(true);
  });
});

describe('inbox page', () => {
  const rows = () => within(screen.getByRole('list', { name: 'Messages by priority' })).getAllByRole('listitem');

  it('lists what needs a reply, most urgent first, with an unread badge on the rail', async () => {
    renderRoute('/clinic/inbox', { as: 'clinician' });
    await screen.findByRole('list', { name: 'Messages by priority' });
    expect(rows().map((r) => r.querySelector('a')!.textContent)).toEqual([
      expect.stringMatching(/^Unread: Ethan Cole.*Worst headache of my life.*Emergency.*Possible emergency/),
      expect.stringMatching(/^Unread: Ruth Gallagher.*Urgent.*Mentions a fall, dizziness/),
      expect.stringMatching(/^Mei Chen.*Today.*Overdue/),
      expect.stringMatching(/^Marcus Bell/),
      expect.stringMatching(/^Unread: Kai Nakamura.*Routine/),
      expect.stringMatching(/^Unread: Lucía Navarro/),
    ]);
    expect(screen.getByRole('link', { name: 'Inbox, 4 unread' })).toBeInTheDocument();
    expect(screen.getByText(/The most urgent are at the top/)).toBeInTheDocument();
  });

  it('shows the care team’s messages and replied ones on request', async () => {
    const { user } = renderRoute('/clinic/inbox', { as: 'clinician' });
    await screen.findByRole('list', { name: 'Messages by priority' });
    await user.click(screen.getByRole('radio', { name: 'Care team' }));
    expect(rows()).toHaveLength(8);
    expect(within(rows()[5]!).getByText('→ Rosa Delgado')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'All' }));
    expect(screen.getByRole('link', { name: /Grace Whitfield.*Replied/ })).toBeInTheDocument();
  });

  it('opens an emergency with a call-now prompt and marks it read', async () => {
    const { user } = renderRoute('/clinic/inbox', { as: 'clinician' });
    await user.click(await screen.findByRole('link', { name: /Ethan Cole/ }));
    expect(await screen.findByRole('heading', { name: 'Worst headache of my life' })).toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Call the patient now');
    const phone = getDb().patients.find((p) => p.id === 'pat-ethan')!.phone;
    expect(within(alert).getByRole('link', { name: phone })).toHaveAttribute('href', `tel:${phone.replace(/\D/g, '')}`);
    expect(screen.queryByRole('button', { name: 'No reply needed' })).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('link', { name: 'Inbox, 3 unread' })).toBeInTheDocument());
    expect(getDb().threads.find((t) => t.id === 'thr-ethan-headache')!.clinicianReadAt).toBeDefined();
  });

  it('replies with a quick reply, which clears it from needs reply', async () => {
    const { user } = renderRoute('/clinic/inbox/thr-lucia-inhaler', { as: 'clinician' });
    const box = await screen.findByRole('textbox', { name: 'Reply to Lucía' });
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    expect(screen.getByText('Write a reply before sending.')).toBeInTheDocument();

    await user.click(within(screen.getByRole('group', { name: 'Quick replies' })).getByRole('button', { name: 'Refill sent' }));
    expect(box).toHaveValue('I’ve sent the refill to your pharmacy. It’s usually ready within a day.');
    expect(box).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Send reply' }));

    const messages = screen.getByRole('list', { name: 'Messages' });
    expect(await within(messages).findByText('I’ve sent the refill to your pharmacy. It’s usually ready within a day.')).toBeInTheDocument();
    expect(within(messages).getAllByText(/^You · /)).toHaveLength(1);
    expect(box).toHaveValue('');
    await waitFor(() => expect(rows()).toHaveLength(5));
  });

  it('clears a thank-you without replying', async () => {
    const { user } = renderRoute('/clinic/inbox/thr-dizzy?scope=team', { as: 'clinician' });
    await user.click(await screen.findByRole('button', { name: 'No reply needed' }));
    await waitFor(() => expect(rows()).toHaveLength(7));
    expect(screen.queryByRole('button', { name: 'No reply needed' })).not.toBeInTheDocument();
  });

  it('reassigns a conversation', async () => {
    const { user } = renderRoute('/clinic/inbox/thr-ruth-fall', { as: 'clinician' });
    const select = await screen.findByRole('combobox', { name: 'Assigned to' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Jonas Lindqvist (you)',
      'Dr. Maya Okafor',
      'Rosa Delgado',
    ]);
    await user.selectOptions(select, 'Rosa Delgado');
    await waitFor(() => expect(rows()).toHaveLength(5));
    expect(getDb().threads.find((t) => t.id === 'thr-ruth-fall')!.assigneeId).toBe('cln-delgado');
  });

  it('does not open conversations outside the care team', async () => {
    renderRoute('/clinic/inbox/thr-nope', { as: 'clinician' });
    expect(await screen.findByRole('heading', { name: 'Conversation not found' })).toBeInTheDocument();
  });
});

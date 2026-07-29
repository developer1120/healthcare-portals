import { screen, waitFor, within } from '@testing-library/react';
import { api } from '@/api/endpoints';
import { getDb } from '@/api/mockDb';
import { filterThreads, isUnread, unreadCount } from '@/domain/messages';
import type { MessageThread } from '@/domain/types';
import { TEST_NOW } from '@/test/clock';
import { renderRoute } from '@/test/renderRoute';

const AVA = 'pat-ava';

function thread(fields: Partial<MessageThread> = {}): MessageThread {
  return {
    id: 't',
    patientId: AVA,
    subject: 'Question',
    category: 'clinical',
    assigneeId: 'cln-okafor',
    archived: false,
    messages: [
      { id: 'm1', threadId: 't', authorId: 'cln-okafor', body: 'Your echo looks normal.', sentAt: '2026-10-12T10:00:00Z', attachments: [] },
    ],
    ...fields,
  };
}

describe('message helpers', () => {
  it('counts a thread unread only when the care team wrote last, after it was opened', () => {
    expect(isUnread(thread())).toBe(true);
    expect(isUnread(thread({ patientReadAt: '2026-10-12T11:00:00Z' }))).toBe(false);
    expect(isUnread(thread({ patientReadAt: '2026-10-12T09:00:00Z' }))).toBe(true);
    const mine = thread();
    mine.messages[0]!.authorId = AVA;
    expect(isUnread(mine)).toBe(false);
  });

  it('ignores archived threads in the unread count', () => {
    expect(unreadCount([thread(), thread({ id: 'x', archived: true })])).toBe(1);
  });

  it('filters by view and searches subject, text and clinician', () => {
    const threads = [
      thread({ id: 'a', subject: 'Echo results' }),
      thread({ id: 'b', subject: 'Billing', archived: true, assigneeId: 'cln-brooks' }),
      thread({ id: 'c', subject: 'Refill', patientReadAt: '2026-10-13T00:00:00Z' }),
    ];
    expect(filterThreads(threads, 'inbox', '').map((t) => t.id)).toEqual(['a', 'c']);
    expect(filterThreads(threads, 'unread', '').map((t) => t.id)).toEqual(['a']);
    expect(filterThreads(threads, 'archived', '').map((t) => t.id)).toEqual(['b']);
    expect(filterThreads(threads, 'inbox', 'NORMAL').map((t) => t.id)).toEqual(['a', 'c']);
    const okafor = [{ id: 'cln-okafor', name: 'Dr. Maya Okafor' }] as never;
    expect(filterThreads(threads, 'inbox', 'okafor', okafor)).toHaveLength(2);
    expect(filterThreads(threads, 'inbox', 'refill').map((t) => t.id)).toEqual(['c']);
  });
});

describe('message endpoints', () => {
  it('marks a thread read', async () => {
    const read = await api.threads.markRead(AVA, 'thr-results');
    expect(read.patientReadAt).toBe(TEST_NOW.toISOString());
  });

  it('adds a trimmed reply from the patient and brings an archived thread back', async () => {
    const replied = await api.threads.reply({ patientId: AVA, threadId: 'thr-metformin', body: '  Thanks again!  ' });
    expect(replied.messages.at(-1)).toMatchObject({ authorId: AVA, body: 'Thanks again!' });
    expect(replied.archived).toBe(false);
  });

  it('refuses empty or overlong replies', async () => {
    await expect(api.threads.reply({ patientId: AVA, threadId: 'thr-dizzy', body: '   ' })).rejects.toMatchObject({
      message: 'Write a message before sending.',
    });
    await expect(
      api.threads.reply({ patientId: AVA, threadId: 'thr-dizzy', body: 'x'.repeat(2001) }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('keeps other patients out of a thread', async () => {
    await expect(api.threads.markRead('pat-marcus', 'thr-results')).rejects.toMatchObject({ status: 404 });
    await expect(api.threads.setArchived('pat-marcus', 'thr-results', true)).rejects.toMatchObject({ status: 404 });
  });
});

function conversations() {
  return within(screen.getByRole('region', { name: 'Conversations' }));
}

/** Links to conversations (the list also has a "New message" link). */
async function threadLinks() {
  const links = await conversations().findAllByRole('link');
  return links.filter((link) => link.getAttribute('href')?.startsWith('/messages/thr-'));
}

describe('Messages page', () => {
  it('lists conversations newest first, with unread marked', async () => {
    renderRoute('/messages');
    const links = await threadLinks();

    expect(links.map((l) => l.querySelector('.truncate')?.textContent)).toEqual([
      'Your lab results are ready',
      'Question about my statement',
      'Lightheaded in the mornings',
    ]);
    expect(within(links[0]!).getByText('Unread')).toBeInTheDocument();
    // Ava wrote last in the dizziness thread; the care team did in the others.
    expect(links[2]).toHaveTextContent('You:');
    expect(links[1]).not.toHaveTextContent('You:');

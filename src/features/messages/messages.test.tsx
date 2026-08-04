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
    expect(screen.getByText('Choose a conversation to read it.')).toBeInTheDocument();
  });

  it('shows the unread count on the Messages link in the rail', async () => {
    renderRoute('/messages');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(await within(nav).findByRole('link', { name: 'Messages, 1 unread' })).toBeInTheDocument();
  });

  it('opens a conversation, marks it read and clears the badge', async () => {
    const { user, router } = renderRoute('/messages');
    await user.click(await conversations().findByRole('link', { name: /Your lab results are ready/ }));

    expect(router.state.location.pathname).toBe('/messages/thr-results');
    expect(screen.getByRole('heading', { level: 2, name: 'Your lab results are ready' })).toBeInTheDocument();
    expect(screen.getByText('Test results · With Rosa Delgado')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Messages' })).getByText(/HbA1c, lipid panel/)).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    await waitFor(() => expect(within(nav).getByRole('link', { name: 'Messages' })).toBeInTheDocument());
    await waitFor(() => expect(getDb().threads.find((t) => t.id === 'thr-results')!.patientReadAt).toBeDefined());
    expect(conversations().getByRole('link', { name: /Your lab results are ready/ })).toHaveAttribute('aria-current', 'page');
  });

  it('shows the conversation with dates, authors and attachments', async () => {
    renderRoute('/messages/thr-dizzy');
    const messages = await screen.findByRole('list', { name: 'Messages' });

    expect(within(messages).getAllByText(/^You · /)).toHaveLength(2);
    expect(within(messages).getByText(/^Dr. Maya Okafor · Cardiology · /)).toBeInTheDocument();
    expect(within(messages).getByText('bp-log-week-6.pdf')).toBeInTheDocument();
    expect(within(messages).getByText('178 KB')).toBeInTheDocument();
  });

  it('sends a reply and shows it at the end of the conversation', async () => {
    const { user } = renderRoute('/messages/thr-dizzy');
    const box = await screen.findByRole('textbox', { name: 'Reply to Dr. Maya Okafor' });

    await user.type(box, 'The dizziness has stopped this week.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    const messages = screen.getByRole('list', { name: 'Messages' });
    await waitFor(() => expect(within(messages).getAllByRole('listitem').at(-1)).toHaveTextContent('The dizziness has stopped'));
    expect(box).toHaveValue('');
    // The replied thread moves to the top of the list.
    const first = (await threadLinks())[0]!;
    await waitFor(() => expect(first).toHaveTextContent('Lightheaded in the mornings'));
  });

  it('sends with Ctrl+Enter and refuses an empty message', async () => {
    const { user } = renderRoute('/messages/thr-dizzy');
    const box = await screen.findByRole('textbox', { name: /Reply to/ });

    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(screen.getByText('Write a message before sending.')).toBeInTheDocument();
    expect(box).toBeInvalid();

    await user.type(box, 'Quick update{Control>}{Enter}{/Control}');
    await waitFor(() => expect(getDb().threads.find((t) => t.id === 'thr-dizzy')!.messages.at(-1)!.body).toBe('Quick update'));
  });

  it('keeps the draft when sending fails', async () => {
    const { configureApi } = await import('@/api/config');
    const { user } = renderRoute('/messages/thr-dizzy');
    const box = await screen.findByRole('textbox', { name: /Reply to/ });
    await user.type(box, 'Please call me');

    configureApi({ failureRate: 1 });
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText(/Your message is still here/)).toBeInTheDocument();
    expect(box).toHaveValue('Please call me');
  });

  it('archives a conversation and finds it again under Archived', async () => {
    const { user } = renderRoute('/messages/thr-billing');
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() =>
      expect(conversations().queryByRole('link', { name: /Question about my statement/ })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('radio', { name: 'Archived' }));
    expect(await conversations().findByRole('link', { name: /Question about my statement/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to inbox' })).toBeInTheDocument();
  });

  it('filters to unread and searches', async () => {
    const { user, router } = renderRoute('/messages');
    await user.click(await screen.findByRole('radio', { name: 'Unread (1)' }));
    expect(await threadLinks()).toHaveLength(1);
    expect(router.state.location.search).toBe('?view=unread');

    await user.click(screen.getByRole('radio', { name: 'Inbox' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search messages' }), 'lisinopril');
    const links = await threadLinks();
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('Lightheaded in the mornings');
    // Opening a result keeps the search.
    expect(links[0]).toHaveAttribute('href', '/messages/thr-dizzy?q=lisinopril');
  });

  it('says when a conversation cannot be found', async () => {
    renderRoute('/messages/thr-nope');
    expect(await screen.findByText(/couldn't find that conversation/)).toBeInTheDocument();
  });
});

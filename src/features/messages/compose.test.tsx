import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api } from '@/api/endpoints';
import { getDb } from '@/api/mockDb';
import { MAX_ATTACHMENT_BYTES, addAttachments } from '@/domain/attachments';
import { canRouteTo, routeMessage } from '@/domain/messageRouting';
import { emergencyConcern } from '@/domain/messages';
import { renderRoute } from '@/test/renderRoute';

const AVA = 'pat-ava';
const ava = () => getDb().patients.find((p) => p.id === AVA)!;
const clinicians = () => getDb().clinicians;

function file(name: string, size = 120_000, type = 'application/pdf') {
  return new File([new Uint8Array(size)], name, { type });
}

describe('message routing', () => {
  it('sends billing to Patient services with no choice', () => {
    const routing = routeMessage('billing', ava(), clinicians());
    expect(routing).toMatchObject({ fixed: true, defaultId: 'cln-brooks' });
    expect(routing.options.map((c) => c.name)).toEqual(['Leah Brooks']);
  });

  it('sends results to the care team nurse first', () => {
    const routing = routeMessage('results', ava(), clinicians());
    expect(routing.defaultId).toBe('cln-delgado');
    expect(routing.note).toMatch(/Rosa Delgado reviews results questions first/);
  });

  it('defaults other topics to the primary clinician, choosing from the care team', () => {
    const routing = routeMessage('clinical', ava(), clinicians());
    expect(routing.defaultId).toBe('cln-lindqvist');
    expect(routing.options.map((c) => c.id)).toEqual(['cln-lindqvist', 'cln-okafor', 'cln-ferreira', 'cln-delgado']);
    expect(canRouteTo('clinical', 'cln-sato', ava(), clinicians())).toBe(false);
    expect(canRouteTo('billing', 'cln-okafor', ava(), clinicians())).toBe(false);
  });
});

describe('attachment rules', () => {
  const pdf = { name: 'log.pdf', sizeBytes: 1000, mimeType: 'application/pdf' };

  it('accepts PDFs and photos, skipping duplicates', () => {
    const photo = { name: 'rash.heic', sizeBytes: 2000, mimeType: 'image/heic' };
    expect(addAttachments([pdf], [pdf, photo])).toEqual({ files: [pdf, photo], problems: [] });
  });

  it('explains files it refuses', () => {
    const { files, problems } = addAttachments(
      [],
      [
        { name: 'setup.exe', sizeBytes: 10, mimeType: 'application/x-msdownload' },
        { name: 'scan.pdf', sizeBytes: MAX_ATTACHMENT_BYTES + 1, mimeType: 'application/pdf' },
        { name: 'blank.png', sizeBytes: 0, mimeType: 'image/png' },
      ],
    );
    expect(files).toEqual([]);
    expect(problems).toEqual([
      'setup.exe isn’t a PDF or photo, so it can’t be attached.',
      'scan.pdf is 10 MB. Files can be up to 10 MB.',
      'blank.png is empty.',
    ]);
  });

  it('stops at five files', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...pdf, name: `page-${i}.pdf` }));
    const { files, problems } = addAttachments([], many);
    expect(files).toHaveLength(5);
    expect(problems).toEqual(['You can attach up to 5 files.']);
  });
});

describe('emergency wording', () => {
  it.each([
    ['I have chest pain since this morning', 'emergency'],
    ['My face is drooping on one side', 'emergency'],
    ["I've been thinking I want to end my life", 'crisis'],
    ['Chest pain and I want to hurt myself', 'crisis'],
    ['Can I take ibuprofen with lisinopril?', null],
  ])('%s → %s', (text, concern) => {
    expect(emergencyConcern(text)).toBe(concern);
  });
});

describe('create endpoint', () => {
  const request = {
    patientId: AVA,
    category: 'clinical' as const,
    assigneeId: 'cln-okafor',
    subject: '  Ankle swelling  ',
    body: 'Both ankles swell by evening.',
    attachments: [{ name: 'ankle.jpg', sizeBytes: 900_000, mimeType: 'image/jpeg' }],
  };

  it('starts a read thread with the first message and file details', async () => {
    const thread = await api.threads.create(request);
    expect(thread).toMatchObject({ subject: 'Ankle swelling', assigneeId: 'cln-okafor', archived: false });
    expect(thread.patientReadAt).toBeDefined();
    expect(thread.messages[0]).toMatchObject({ authorId: AVA, body: 'Both ankles swell by evening.' });
    expect(thread.messages[0]!.attachments[0]).toMatchObject({ name: 'ankle.jpg', sizeBytes: 900_000 });
  });

  it('enforces routing, a subject and the attachment rules on the server', async () => {
    await expect(api.threads.create({ ...request, category: 'billing' })).rejects.toMatchObject({
      message: 'Choose someone from your care team to send this to.',
    });
    await expect(api.threads.create({ ...request, subject: ' ' })).rejects.toMatchObject({ message: 'Add a subject.' });
    await expect(
      api.threads.create({ ...request, attachments: [{ name: 'x.zip', sizeBytes: 5, mimeType: 'application/zip' }] }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('ComposePage', () => {
  it('opens from the inbox with the primary clinician pre-selected', async () => {
    const { user, router } = renderRoute('/messages');
    await user.click(await screen.findByRole('link', { name: 'New message' }));

    expect(router.state.location.pathname).toBe('/messages/new');
    expect(await screen.findByRole('heading', { level: 1, name: 'New message' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Medical question/ })).toBeChecked();
    expect(screen.getByRole('combobox', { name: /^To/ })).toHaveValue('cln-lindqvist');
  });

  it('routes by topic', async () => {
    const { user } = renderRoute('/messages/new');
    await user.click(await screen.findByRole('radio', { name: /Test results/ }));
    const to = screen.getByRole('combobox', { name: /^To/ });
    expect(to).toHaveValue('cln-delgado');
    expect(to).toHaveAccessibleDescription(/Rosa Delgado reviews results questions first/);

    await user.click(screen.getByRole('radio', { name: /Billing/ }));
    expect(screen.queryByRole('combobox', { name: /^To/ })).not.toBeInTheDocument();
    expect(screen.getByText('Leah Brooks · Patient services')).toBeInTheDocument();
    expect(screen.getByText('Billing and insurance questions go to Patient services.')).toBeInTheDocument();
  });

  it('asks for a subject and a message', async () => {
    const { user } = renderRoute('/messages/new');
    await user.click(await screen.findByRole('button', { name: 'Send message' }));
    expect(screen.getByRole('textbox', { name: /Subject/ })).toHaveAccessibleDescription('Add a subject');
    expect(screen.getByRole('textbox', { name: /Message/ })).toHaveAccessibleDescription(/Write your message/);
  });

  it('sends a message with an attachment and opens the new conversation', async () => {
    const { user, router } = renderRoute('/messages/new');
    await user.selectOptions(await screen.findByRole('combobox', { name: /^To/ }), 'cln-okafor');
    await user.type(screen.getByRole('textbox', { name: /Subject/ }), 'Ankle swelling');
    await user.type(screen.getByRole('textbox', { name: /Message/ }), 'Both ankles swell by evening.');
    await user.upload(screen.getByLabelText('Choose files to attach'), file('ankle.jpg', 900_000, 'image/jpeg'));

    const attached = screen.getByRole('list', { name: 'Attached files' });
    expect(attached).toHaveTextContent('ankle.jpg879 KB');

    await user.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/messages\/thr-/));
    expect(await screen.findByText(/Message sent to Dr. Maya Okafor/)).toBeInTheDocument();
    const messages = screen.getByRole('list', { name: 'Messages' });
    expect(within(messages).getByText('ankle.jpg')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Ankle swelling' })).toBeInTheDocument();
  });

  it('refuses unsupported files and lets you remove attached ones', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderRoute('/messages/new');
    const input = await screen.findByLabelText('Choose files to attach');

    await user.upload(input, [file('setup.exe', 100, 'application/x-msdownload'), file('bp-log.pdf')]);
    expect(screen.getByRole('alert')).toHaveTextContent('setup.exe isn’t a PDF or photo');
    expect(screen.getByRole('list', { name: 'Attached files' })).toHaveTextContent('bp-log.pdf');

    await user.click(screen.getByRole('button', { name: 'Remove bp-log.pdf' }));
    expect(screen.queryByRole('list', { name: 'Attached files' })).not.toBeInTheDocument();
  });

  it('points to 911 or 988 when the message sounds urgent', async () => {
    const { user } = renderRoute('/messages/new');
    const body = await screen.findByRole('textbox', { name: /Message/ });

    await user.type(body, 'I have had chest pain since this morning');
    expect(screen.getByRole('alert')).toHaveTextContent('If this is an emergency, call 911 now.');

    await user.clear(body);
    await user.type(body, 'I keep thinking about how to end my life');
    expect(screen.getByRole('alert')).toHaveTextContent('call or text 988');
  });

  it('can be prefilled from a link', async () => {
    renderRoute('/messages/new?topic=refill&to=cln-okafor&subject=Lisinopril%20refill');
    expect(await screen.findByRole('radio', { name: /Prescription/ })).toBeChecked();
    expect(screen.getByRole('combobox', { name: /^To/ })).toHaveValue('cln-okafor');
    expect(screen.getByRole('textbox', { name: /Subject/ })).toHaveValue('Lisinopril refill');
  });

  it('ignores a prefilled recipient the topic does not allow', async () => {
    renderRoute('/messages/new?to=cln-sato');
    expect(await screen.findByRole('combobox', { name: /^To/ })).toHaveValue('cln-lindqvist');
  });
});

describe('replying with attachments', () => {
  it('sends files with a reply', async () => {
    const { user } = renderRoute('/messages/thr-dizzy');
    await user.type(await screen.findByRole('textbox', { name: /Reply to/ }), 'This week’s log attached.');
    await user.upload(screen.getByLabelText('Choose files to attach'), file('bp-log-week-7.pdf'));
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(getDb().threads.find((t) => t.id === 'thr-dizzy')!.messages.at(-1)!.attachments[0]?.name).toBe(
        'bp-log-week-7.pdf',
      ),
    );
    expect(screen.queryByRole('list', { name: 'Attached files' })).not.toBeInTheDocument();
  });
});

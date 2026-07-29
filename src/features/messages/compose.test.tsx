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

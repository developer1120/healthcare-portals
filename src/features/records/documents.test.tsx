import { screen, within } from '@testing-library/react';
import { getDb, writeDb } from '@/api/mockDb';
import { documentFileName, documentToText, slugify } from '@/domain/documents';
import { renderRoute } from '@/test/renderRoute';

const doc = (id: string) => getDb().documents.find((d) => d.id === id)!;

/** jsdom's Blob has no text(), but FileReader works. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

describe('document helpers', () => {
  it('makes safe file names', () => {
    expect(slugify('Transthoracic echocardiogram')).toBe('transthoracic-echocardiogram');
    expect(slugify('  Résumé / notes!! ')).toBe('resume-notes');
    expect(slugify('???')).toBe('document');
    expect(documentFileName(doc('doc-4'))).toMatch(/^\d{4}-\d{2}-\d{2}-referral-to-endocrinology\.txt$/);
  });

  it('exports the document as readable text with a privacy note', () => {
    const db = getDb();
    const text = documentToText(
      doc('doc-1'),
      db.patients.find((p) => p.id === 'pat-ava'),
      db.clinicians.find((c) => c.id === 'cln-lindqvist'),
    );
    expect(text).toContain('ANNUAL PHYSICAL');
    expect(text).toContain('Patient: Ava Thompson (MRN MW-104582)');
    expect(text).toContain('Author: Jonas Lindqvist, Primary care');
    expect(text).toContain('What we found\nBlood pressure 131/84 in clinic');
    expect(text.trim().endsWith('store it securely.')).toBe(true);
  });
});

describe('Documents on the health record', () => {
  it('lists documents newest first and filters by type', async () => {
    const { user } = renderRoute('/records');
    const card = await screen.findByRole('region', { name: 'Documents' });
    const links = await within(card).findAllByRole('link');
    expect(links.map((l) => l.querySelector('.truncate')?.textContent)).toEqual([
      'Annual physical',
      'Transthoracic echocardiogram',
      'Blood pressure review',
      'Referral to endocrinology',
    ]);
    expect(links[0]).toHaveTextContent('Visit summary · Jonas Lindqvist');

    await user.click(within(card).getByRole('radio', { name: 'Imaging' }));
    expect(within(card).getAllByRole('link')).toHaveLength(1);
    expect(within(card).getByRole('link')).toHaveTextContent('Imaging report · Dr. Maya Okafor');
  });
});

describe('DocumentPage', () => {
  it('opens a document with its author, sections and the visit it came from', async () => {
    const { user, router } = renderRoute('/records');
    const card = await screen.findByRole('region', { name: 'Documents' });
    await user.click(await within(card).findByRole('link', { name: /Annual physical/ }));

    expect(router.state.location.pathname).toBe('/records/documents/doc-1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Annual physical' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Plan' })).toHaveTextContent('Repeat A1c and lipids in three weeks.');
    expect(screen.getByRole('link', { name: 'view the appointment' })).toHaveAttribute('href', '/appointments/apt-003');
    expect(screen.getByRole('link', { name: 'Ask about this' })).toHaveAttribute(
      'href',
      '/messages/new?topic=clinical&to=cln-lindqvist&subject=Question+about%3A+Annual+physical',
    );
  });

  it('prints and downloads', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return 'blob:document';
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { user } = renderRoute('/records/documents/doc-3');
    await user.click(await screen.findByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toMatch(/-transthoracic-echocardiogram\.txt$/);
    expect(await readBlob(created[0]!)).toContain('Ejection fraction 62%');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:document');
  });

  it('links from a visit summary on the appointment page', async () => {
    renderRoute('/appointments/apt-003');
    expect(await screen.findByRole('link', { name: 'Open, print or download the summary' })).toHaveAttribute(
      'href',
      '/records/documents/doc-1',
    );
  });

  it('does not open another patient’s document', async () => {
    writeDb((db) => {
      db.documents.push({ ...db.documents[0]!, id: 'doc-other', patientId: 'pat-marcus' });
    });
    renderRoute('/records/documents/doc-other');
    expect(await screen.findByText(/couldn't find that document/)).toBeInTheDocument();
  });
});

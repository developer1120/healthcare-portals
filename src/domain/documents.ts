import { format } from 'date-fns';
import { toDate } from '@/lib/dates';
import { clinicianSubtitle } from './clinicians';
import type { Clinician, ClinicalDocument, DocumentKind, Patient } from './types';

export const documentKindLabels: Record<DocumentKind, string> = {
  'visit-summary': 'Visit summary',
  imaging: 'Imaging report',
  referral: 'Referral',
  letter: 'Letter',
};

/** File-name friendly version of a title: "Annual physical" → "annual-physical". */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'document'
  );
}

export function documentFileName(document: ClinicalDocument): string {
  return `${format(toDate(document.createdAt), 'yyyy-MM-dd')}-${slugify(document.title)}.txt`;
}

/** The document as plain text, with who it's about and who wrote it, for saving or sharing. */
export function documentToText(document: ClinicalDocument, patient?: Patient, author?: Clinician): string {
  const lines = [
    document.title.toUpperCase(),
    documentKindLabels[document.kind],
    '',
    patient ? `Patient: ${patient.firstName} ${patient.lastName} (MRN ${patient.mrn})` : null,
    author ? `Author: ${author.name}, ${clinicianSubtitle(author)}` : null,
    `Date: ${format(toDate(document.createdAt), 'd MMMM yyyy')}`,
    '',
    ...document.sections.flatMap((section) => [section.heading, section.body, '']),
    'Exported from Mendwell. Contains personal health information: store it securely.',
  ];
  return lines.filter((line): line is string => line !== null).join('\n');
}

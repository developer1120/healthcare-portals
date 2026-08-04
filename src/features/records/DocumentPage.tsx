import { Link, useParams } from 'react-router';
import { IconDownload, IconMessageQuestion, IconPrinter } from '@tabler/icons-react';
import { useClinicians, useDocuments, usePatient } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { clinicianSubtitle } from '@/domain/clinicians';
import { documentFileName, documentKindLabels, documentToText } from '@/domain/documents';
import type { Clinician, ClinicalDocument, Patient } from '@/domain/types';
import { formatShortDate } from '@/lib/dates';
import { usePageHeading } from '@/shell/pageHeading';
import { Avatar, BackLink, Button, ButtonLink, Card, Skeleton } from '@/ui';

/** Saves the document as a text file using a temporary object URL. */
function download(document_: ClinicalDocument, patient?: Patient, author?: Clinician) {
  const blob = new Blob([documentToText(document_, patient, author)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = documentFileName(document_);
  anchor.click();
  URL.revokeObjectURL(url);
}

function DocumentView({ document_, patient, author }: { document_: ClinicalDocument; patient?: Patient; author?: Clinician }) {
  usePageHeading(document_.title);
  const ask = `/messages/new?${new URLSearchParams({
    topic: 'clinical',
    ...(author && patient?.careTeamIds.includes(author.id) ? { to: author.id } : {}),
    subject: `Question about: ${document_.title}`,
  })}`;

  return (
    <article className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button size="sm" icon={IconPrinter} onClick={() => window.print()}>
          Print
        </Button>
        <Button size="sm" icon={IconDownload} onClick={() => download(document_, patient, author)}>
          Download
        </Button>
        <ButtonLink size="sm" to={ask} icon={IconMessageQuestion}>
          Ask about this
        </ButtonLink>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            {author && <Avatar name={author.name} decorative />}
            <div className="text-sm leading-tight">
              <p className="font-medium">{author?.name ?? 'Your care team'}</p>
              {author && <p className="text-ink-muted">{clinicianSubtitle(author)}</p>}
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{documentKindLabels[document_.kind]}</p>
            <p className="text-ink-muted">{formatShortDate(document_.createdAt)}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-5">
          {document_.sections.map((section) => (
            <section key={section.heading} aria-label={section.heading}>
              <h2 className="font-sans text-sm font-semibold tracking-normal">{section.heading}</h2>
              <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">{section.body}</p>
            </section>
          ))}
        </div>

        {document_.appointmentId && (
          <p className="mt-5 border-t border-line pt-3 text-sm print:hidden">
            From your visit:{' '}
            <Link to={`/appointments/${document_.appointmentId}`} className="font-medium underline">
              view the appointment
            </Link>
          </p>
        )}
      </Card>
    </article>
  );
}

export function DocumentPage() {
  const { documentId } = useParams();
  const patientId = usePatientId();
  const documents = useDocuments(patientId);
  const clinicians = useClinicians();
  const patient = usePatient(patientId);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <span className="print:hidden">
        <BackLink to="/records">Health record</BackLink>
      </span>
      <QueryState query={documents} label="this document" loading={<Skeleton className="h-80 rounded-card" />}>
        {(list) => {
          const document_ = list.find((d) => d.id === documentId);
          if (!document_) {
            return (
              <Card tone="sunken" className="text-sm text-ink-muted">
                We couldn't find that document. It may have been removed, or the link may be wrong.
              </Card>
            );
          }
          return (
            <DocumentView
              document_={document_}
              patient={patient.data}
              author={clinicians.data?.find((c) => c.id === document_.authorId)}
            />
          );
        }}
      </QueryState>
    </div>
  );
}

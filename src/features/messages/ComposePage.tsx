import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { IconSend } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { useClinicians, useCreateThread, usePatient } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { usePatientId } from '@/auth/session';
import { clinicianSubtitle } from '@/domain/clinicians';
import { routeMessage } from '@/domain/messageRouting';
import { MESSAGE_MAX, REPLY_WITHIN_BUSINESS_DAYS, SUBJECT_MAX, categoryLabels } from '@/domain/messages';
import type { Clinician, Patient, ThreadCategory } from '@/domain/types';
import { Button, Card, Field, Input, Select, Skeleton, Textarea } from '@/ui';
import { AttachmentPicker } from './AttachmentPicker';
import { toAttachmentInputs } from './pickedFile';
import type { PickedFile } from './pickedFile';
import { EmergencyNotice } from './EmergencyNotice';

const topics: { value: ThreadCategory; hint: string }[] = [
  { value: 'clinical', hint: 'Symptoms, treatment or follow-up' },
  { value: 'results', hint: 'Questions about a test' },
  { value: 'refill', hint: 'Prescriptions and pharmacies' },
  { value: 'billing', hint: 'Statements and insurance' },
  { value: 'general', hint: 'Anything else' },
];
const categories = topics.map((t) => t.value) as [ThreadCategory, ...ThreadCategory[]];

const composeSchema = z.object({
  category: z.enum(categories, { error: 'Choose a topic' }),
  assigneeId: z.string().min(1, 'Choose who to send this to'),
  subject: z.string().trim().min(1, 'Add a subject').max(SUBJECT_MAX, `Keep it under ${SUBJECT_MAX} characters`),
  body: z.string().trim().min(1, 'Write your message').max(MESSAGE_MAX, `Keep it under ${MESSAGE_MAX} characters`),
});

type ComposeValues = z.infer<typeof composeSchema>;

function ComposeForm({ patient, clinicians }: { patient: Patient; clinicians: Clinician[] }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const create = useCreateThread(patient.id);
  const [files, setFiles] = useState<PickedFile[]>([]);

  const initialTopic = categories.includes(params.get('topic') as ThreadCategory)
    ? (params.get('topic') as ThreadCategory)
    : 'clinical';
  const initialRouting = routeMessage(initialTopic, patient, clinicians);
  const requestedTo = params.get('to');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ComposeValues>({
    resolver: zodResolver(composeSchema),
    defaultValues: {
      category: initialTopic,
      assigneeId: initialRouting.options.some((c) => c.id === requestedTo) ? requestedTo! : (initialRouting.defaultId ?? ''),
      subject: params.get('subject') ?? '',
      body: '',
    },
  });

  const category = watch('category');
  const body = watch('body');
  const routing = routeMessage(category, patient, clinicians);
  const fixedRecipient = routing.fixed ? routing.options[0] : undefined;

  // Choosing a topic picks that topic's usual recipient; the patient can still change it.
  const categoryField = register('category', {
    onChange: (event: { target: { value: ThreadCategory } }) =>
      setValue('assigneeId', routeMessage(event.target.value, patient, clinicians).defaultId ?? ''),
  });

  const onSubmit = handleSubmit((values) =>
    create.mutate(
      { ...values, attachments: toAttachmentInputs(files) },
      { onSuccess: (thread) => navigate(`/messages/${thread.id}`, { state: { notice: 'sent' } }) },
    ),
  );

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Topic</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {topics.map((topic) => (
              <label
                key={topic.value}
                className="cursor-pointer rounded-card border border-line bg-surface p-3 text-sm transition-colors hover:border-line-strong has-checked:border-ink has-checked:ring-1 has-checked:ring-ink has-focus-visible:outline-2 has-focus-visible:outline-focus"
              >
                <input type="radio" value={topic.value} className="sr-only" {...categoryField} />
                <span className="block font-medium">{categoryLabels[topic.value]}</span>
                <span className="block text-xs text-ink-muted">{topic.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {fixedRecipient ? (
          <div className="text-sm">
            <p className="font-medium">To</p>
            <p>
              {fixedRecipient.name} · {clinicianSubtitle(fixedRecipient)}
            </p>
            {routing.note && <p className="mt-0.5 text-xs text-ink-muted">{routing.note}</p>}
          </div>
        ) : (
          <Field label="To" hint={routing.note} error={errors.assigneeId?.message} required>
            <Select
              options={routing.options.map((c) => ({ value: c.id, label: `${c.name} · ${clinicianSubtitle(c)}` }))}
              {...register('assigneeId')}
            />
          </Field>
        )}

        <Field label="Subject" error={errors.subject?.message} required>
          <Input maxLength={SUBJECT_MAX} {...register('subject')} />
        </Field>

        <Field
          label="Message"
          hint={`${body.length}/${MESSAGE_MAX} · Replies usually come within ${REPLY_WITHIN_BUSINESS_DAYS} business days.`}
          error={errors.body?.message}
          required
        >
          <Textarea rows={7} maxLength={MESSAGE_MAX} {...register('body')} />
        </Field>
        <EmergencyNotice text={body} />

        <AttachmentPicker files={files} onChange={setFiles} />

        {create.isError && (
          <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
            {errorMessage(create.error)}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
          <Link to="/messages" className="text-sm font-medium text-ink-muted hover:text-ink">
            Discard
          </Link>
          <Button type="submit" variant="primary" icon={IconSend} loading={create.isPending}>
            Send message
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function ComposePage() {
  const patientId = usePatientId();
  const patient = usePatient(patientId);
  const clinicians = useClinicians();

  return (
    <QueryState query={patient} label="your details" loading={<Skeleton className="h-96 flex-1 rounded-card" />}>
      {(me) => (
        <QueryState query={clinicians} label="your care team" loading={<Skeleton className="h-96 flex-1 rounded-card" />}>
          {(list) => <ComposeForm patient={me} clinicians={list} />}
        </QueryState>
      )}
    </QueryState>
  );
}

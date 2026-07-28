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


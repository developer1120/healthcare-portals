import { useState } from 'react';
import { IconUserPlus } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { useCaregivers, useInviteCaregiver, useRevokeCaregiver, useUpdateCaregiverScopes } from '@/api/queries';
import { QueryState } from '@/api/QueryState';
import { MAX_CAREGIVERS, caregiverStatus, currentCaregivers, inviteProblems, scopeLabels } from '@/domain/profile';
import type { CaregiverInvite, CaregiverStatus } from '@/domain/profile';
import type { CaregiverGrant, CaregiverScope, Patient } from '@/domain/types';
import { formatShortDate, toIsoDate } from '@/lib/dates';
import { useNow } from '@/lib/useNow';
import { Avatar, Button, Card, Dialog, Field, Input, Skeleton, StatusDot } from '@/ui';
import type { StatusTone } from '@/ui';
import { ScopeChecklist } from './ScopeChecklist';

const statusDisplay: Record<CaregiverStatus, { tone: StatusTone; label: string }> = {
  invited: { tone: 'warn', label: 'Invitation sent' },
  active: { tone: 'ok', label: 'Active' },
  expired: { tone: 'neutral', label: 'Expired' },
  revoked: { tone: 'neutral', label: 'Removed' },
};

function InviteDialog({ patient, existing, onClose, onInvited }: { patient: Patient; existing: CaregiverGrant[]; onClose: () => void; onInvited: (name: string) => void }) {
  const invite = useInviteCaregiver(patient.id);
  const [values, setValues] = useState<CaregiverInvite>({ name: '', email: '', relationship: '', scopes: ['appointments'], expiresOn: '' });
  const [problems, setProblems] = useState<ReturnType<typeof inviteProblems>>({});
  const set = <K extends keyof CaregiverInvite>(key: K, value: CaregiverInvite[K]) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <Dialog
      open
      onClose={onClose}
      title="Invite a caregiver"
      description="They’ll get an email to set up their own sign-in. You choose what they can see, and can change or remove it any time."
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const found = inviteProblems(values, { existing, patientEmail: patient.email });
          setProblems(found);
          if (Object.keys(found).length > 0) return;
          invite.mutate(values, { onSuccess: (grant) => onInvited(grant.name) });
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Their name" required error={problems.name}>
            <Input value={values.name} onChange={(event) => set('name', event.target.value)} />
          </Field>
          <Field label="Relationship to you" required hint="For example Parent, Partner, Son" error={problems.relationship}>
            <Input value={values.relationship} onChange={(event) => set('relationship', event.target.value)} />
          </Field>
        </div>
        <Field label="Their email" required error={problems.email}>
          <Input type="email" value={values.email} onChange={(event) => set('email', event.target.value)} />
        </Field>
        <ScopeChecklist legend="What they can see and do" value={values.scopes} onChange={(scopes) => set('scopes', scopes)} error={problems.scopes} />
        <Field label="Access ends (optional)" hint="Leave empty to keep access until you remove it." error={problems.expiresOn}>
          <Input type="date" min={toIsoDate(new Date())} value={values.expiresOn ?? ''} onChange={(event) => set('expiresOn', event.target.value)} />
        </Field>
        {(problems.form || invite.isError) && (
          <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
            {problems.form ?? errorMessage(invite.error)}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={invite.isPending}>
            Send invitation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CaregiverRow({ grant, patientId, now, onRemove }: { grant: CaregiverGrant; patientId: string; now: Date; onRemove: () => void }) {
  const updateScopes = useUpdateCaregiverScopes(patientId);
  const [editing, setEditing] = useState(false);
  const [scopes, setScopes] = useState<CaregiverScope[]>(grant.scopes);
  const [error, setError] = useState<string>();
  const status = statusDisplay[caregiverStatus(grant, now)];

  return (
    <li aria-label={grant.name} className="flex flex-col gap-3 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <Avatar name={grant.name} decorative />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {grant.name} <span className="font-normal text-ink-muted">· {grant.relationship}</span>
          </p>
          <p className="truncate text-sm text-ink-muted">{grant.email}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Can see: {grant.scopes.map((s) => scopeLabels[s].label).join(', ')}
            {grant.expiresOn && ` · until ${formatShortDate(grant.expiresOn)}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusDot tone={status.tone}>{status.label}</StatusDot>
          <div className="flex gap-1.5">
            <Button size="sm" onClick={() => setEditing((value) => !value)} aria-expanded={editing}>
              Edit access
            </Button>
            <Button size="sm" variant="danger" onClick={onRemove}>
              {grant.status === 'invited' ? 'Cancel invitation' : 'Remove'}
            </Button>
          </div>
        </div>
      </div>
      {editing && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (scopes.length === 0) {
              setError('Choose at least one, or remove their access instead.');
              return;
            }
            setError(undefined);
            updateScopes.mutate({ grantId: grant.id, scopes }, { onSuccess: () => setEditing(false) });
          }}
          className="ml-12 flex flex-col gap-3 rounded-control bg-surface-sunken p-3"

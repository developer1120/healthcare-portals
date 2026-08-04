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
        >
          <ScopeChecklist legend={`What ${grant.name.split(' ')[0]} can see and do`} value={scopes} onChange={setScopes} error={error} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="primary" loading={updateScopes.isPending}>
              Save access
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

export function CaregiversCard({ patient }: { patient: Patient }) {
  const caregivers = useCaregivers(patient.id);
  const revoke = useRevokeCaregiver(patient.id);
  const now = useNow(60_000);
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<CaregiverGrant | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <Card
      title="Caregiver access"
      description="Let someone you trust help manage your care. They sign in as themselves; you can see who has access here."
    >
      <QueryState query={caregivers} label="your caregivers" loading={<Skeleton className="h-24" />}>
        {(grants) => {
          const current = currentCaregivers(grants, now);
          const past = grants.filter((g) => !current.includes(g));
          return (
            <div className="flex flex-col gap-3">
              {notice && (
                <p role="status" className="rounded-control bg-ok-soft px-3 py-2 text-sm text-ok-ink">
                  {notice}
                </p>
              )}
              {current.length === 0 ? (
                <p className="text-sm text-ink-muted">No one else has access to your portal.</p>
              ) : (
                <ul aria-label="Caregivers with access" className="divide-y divide-line">
                  {current.map((grant) => (
                    <CaregiverRow key={grant.id} grant={grant} patientId={patient.id} now={now} onRemove={() => setRemoving(grant)} />
                  ))}
                </ul>
              )}
              <Button
                icon={IconUserPlus}
                className="self-start"
                disabled={current.length >= MAX_CAREGIVERS}
                onClick={() => {
                  setNotice(null);
                  setInviting(true);
                }}
              >
                Invite a caregiver
              </Button>
              {past.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-ink-muted">Past caregivers ({past.length})</summary>
                  <ul className="mt-2 flex flex-col gap-1 text-ink-muted">
                    {past.map((grant) => (
                      <li key={grant.id}>
                        {grant.name} · {statusDisplay[caregiverStatus(grant, now)].label}
                        {grant.revokedAt && ` ${formatShortDate(grant.revokedAt)}`}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {inviting && (
                <InviteDialog
                  patient={patient}
                  existing={grants}
                  onClose={() => setInviting(false)}
                  onInvited={(name) => {
                    setInviting(false);
                    setNotice(`Invitation sent to ${name}.`);
                  }}
                />
              )}
            </div>
          );
        }}
      </QueryState>
      {removing && (
        <Dialog
          open
          onClose={() => setRemoving(null)}
          title={removing.status === 'invited' ? `Cancel ${removing.name}’s invitation?` : `Remove ${removing.name}’s access?`}
          description="They’ll lose access straight away. You can invite them again later."
        >
          {revoke.isError && (
            <p role="alert" className="mb-3 rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink">
              {errorMessage(revoke.error)}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setRemoving(null)}>Keep access</Button>
            <Button
              variant="danger"
              loading={revoke.isPending}
              onClick={() =>
                revoke.mutate(removing.id, {
                  onSuccess: () => {
                    setNotice(`${removing.name} no longer has access.`);
                    setRemoving(null);
                  },
                })
              }
            >
              Remove access
            </Button>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

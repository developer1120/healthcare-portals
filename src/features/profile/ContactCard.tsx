import { useState } from 'react';
import { IconCircleCheck } from '@tabler/icons-react';
import { errorMessage } from '@/api/errors';
import { useUpdateContact } from '@/api/queries';
import { contactProblems, languages, normaliseContact } from '@/domain/profile';
import type { ContactField, ContactUpdate } from '@/domain/profile';
import type { Patient } from '@/domain/types';
import { formatShortDate } from '@/lib/dates';
import { Button, Card, Field, Input, Select } from '@/ui';

function fromPatient(patient: Patient): ContactUpdate {
  return {
    preferredName: patient.preferredName ?? '',
    pronouns: patient.pronouns ?? '',
    email: patient.email,
    phone: patient.phone,
    address: { ...patient.address, line2: patient.address.line2 ?? '' },
    preferredLanguage: patient.preferredLanguage,
  };
}

export function ContactCard({ patient }: { patient: Patient }) {
  const update = useUpdateContact(patient.id);
  const [values, setValues] = useState<ContactUpdate>(() => fromPatient(patient));
  const [problems, setProblems] = useState<Partial<Record<ContactField, string>>>({});
  const [saved, setSaved] = useState(false);

  function set<K extends keyof ContactUpdate>(key: K, value: ContactUpdate[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }
  function setAddress(key: keyof ContactUpdate['address'], value: string) {
    setValues((current) => ({ ...current, address: { ...current.address, [key]: value } }));
    setSaved(false);
  }

  return (
    <Card title="Your details" description="Keep these up to date so we can reach you.">
      <div className="mb-5 flex flex-col gap-2 rounded-control bg-surface-sunken px-4 py-3">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-muted">Legal name</dt>
            <dd className="font-medium">
              {patient.firstName} {patient.lastName}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Date of birth</dt>
            <dd className="tabular">{formatShortDate(patient.dateOfBirth)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">MRN</dt>
            <dd className="font-mono">{patient.mrn}</dd>
          </div>
        </dl>
        <p className="text-xs text-ink-muted">To change these, bring ID to the front desk.</p>
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const found = contactProblems(values);
          setProblems(found);
          if (Object.keys(found).length > 0) return;
          update.mutate(normaliseContact(values), {
            onSuccess: (next) => {
              setValues(fromPatient(next));
              setSaved(true);
            },
          });
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Preferred name (optional)" hint="What you like to be called" error={problems.preferredName}>
          <Input value={values.preferredName ?? ''} onChange={(event) => set('preferredName', event.target.value)} />
        </Field>
        <Field label="Pronouns (optional)" hint="For example she/her, they/them" error={problems.pronouns}>
          <Input value={values.pronouns ?? ''} onChange={(event) => set('pronouns', event.target.value)} />
        </Field>
        <Field label="Email" required error={problems.email}>
          <Input type="email" autoComplete="email" value={values.email} onChange={(event) => set('email', event.target.value)} />
        </Field>
        <Field label="Mobile phone" required error={problems.phone}>
          <Input type="tel" autoComplete="tel" value={values.phone} onChange={(event) => set('phone', event.target.value)} />
        </Field>
        <Field label="Street address" required error={problems.line1} className="sm:col-span-2">
          <Input
            autoComplete="address-line1"
            value={values.address.line1}
            onChange={(event) => setAddress('line1', event.target.value)}
          />
        </Field>
        <Field label="Apartment, suite (optional)" className="sm:col-span-2">
          <Input
            autoComplete="address-line2"
            value={values.address.line2 ?? ''}
            onChange={(event) => setAddress('line2', event.target.value)}
          />
        </Field>
        <Field label="City" required error={problems.city}>
          <Input autoComplete="address-level2" value={values.address.city} onChange={(event) => setAddress('city', event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="State" required error={problems.region}>
            <Input
              autoComplete="address-level1"
              maxLength={2}
              value={values.address.region}
              onChange={(event) => setAddress('region', event.target.value)}
            />
          </Field>
          <Field label="ZIP code" required error={problems.postcode}>
            <Input
              autoComplete="postal-code"
              inputMode="numeric"
              value={values.address.postcode}
              onChange={(event) => setAddress('postcode', event.target.value)}
            />
          </Field>
        </div>
        <Field label="Preferred language" hint="We’ll arrange an interpreter if you need one." error={problems.preferredLanguage}>
          <Select
            value={values.preferredLanguage}
            onChange={(event) => set('preferredLanguage', event.target.value)}
            options={languages.map((language) => ({ value: language, label: language }))}
          />
        </Field>
        {update.isError && (
          <p role="alert" className="rounded-control bg-critical-soft px-3 py-2.5 text-sm text-critical-ink sm:col-span-2">
            {errorMessage(update.error)}
          </p>
        )}
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" loading={update.isPending}>
            Save details
          </Button>
          {saved && (
            <p role="status" className="flex items-center gap-1.5 text-sm text-ok-ink">
              <IconCircleCheck aria-hidden size={16} />
              Saved
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}

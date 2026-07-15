import type { Role } from '@/auth/types';
import type { Id } from '@/domain/types';

export interface DemoAccount {
  id: Id;
  email: string;
  /** Demo-only password for the mock server. Real credentials never live in the client. */
  password: string;
  role: Role;
  subjectId: Id;
  displayName: string;
}

export const DEMO_PASSWORD = 'mendwell-demo';

/** Sign-in accounts for the demo. The sign-in page offers one-click buttons for these. */
export const demoAccounts: DemoAccount[] = [
  {
    id: 'acc-ava',
    email: 'ava.thompson@example.com',
    password: DEMO_PASSWORD,
    role: 'patient',
    subjectId: 'pat-ava',
    displayName: 'Ava Thompson',
  },
  {
    id: 'acc-lindqvist',
    email: 'j.lindqvist@mendwell.example',
    password: DEMO_PASSWORD,
    role: 'clinician',
    subjectId: 'cln-lindqvist',
    displayName: 'Jonas Lindqvist',
  },
  {
    id: 'acc-okafor',
    email: 'm.okafor@mendwell.example',
    password: DEMO_PASSWORD,
    role: 'clinician',
    subjectId: 'cln-okafor',
    displayName: 'Dr. Maya Okafor',
  },
];

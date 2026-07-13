import type { Id, IsoDateTime } from '@/domain/types';

export type Role = 'patient' | 'clinician';

/** A signed-in user. `subjectId` is the patient or clinician record the account belongs to. */
export interface Session {
  token: string;
  accountId: Id;
  role: Role;
  subjectId: Id;
  displayName: string;
  issuedAt: IsoDateTime;
  expiresAt: IsoDateTime;
}

export interface Credentials {
  email: string;
  password: string;
}

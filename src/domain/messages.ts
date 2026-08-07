import { toDate } from '@/lib/dates';
import type { Clinician, Message, MessageThread, ThreadCategory } from './types';

/** Care teams aim to reply within this many business days. */
export const REPLY_WITHIN_BUSINESS_DAYS = 2;
export const MESSAGE_MAX = 2000;

export const categoryLabels: Record<ThreadCategory, string> = {
  clinical: 'Medical question',
  results: 'Test results',
  refill: 'Prescription',
  billing: 'Billing',
  general: 'General',
};

export function lastMessage(thread: MessageThread): Message | undefined {
  return thread.messages.at(-1);
}

/** Unread when the latest message came from the care team after the patient last opened the thread. */
export function isUnread(thread: MessageThread): boolean {
  const latest = lastMessage(thread);
  if (!latest || latest.authorId === thread.patientId) return false;
  return !thread.patientReadAt || toDate(latest.sentAt) > toDate(thread.patientReadAt);
}

export function unreadCount(threads: MessageThread[]): number {
  return threads.filter((t) => !t.archived && isUnread(t)).length;
}

export const SUBJECT_MAX = 120;

/**
 * Words that suggest an emergency or crisis. Messages aren't watched in real
 * time, so the compose and reply boxes point to 911 or 988 when they appear.
 */
const EMERGENCY_PATTERNS: { pattern: RegExp; kind: 'emergency' | 'crisis' }[] = [
  { pattern: /chest pain|can'?t breathe|cannot breathe|trouble breathing|short(ness)? of breath/i, kind: 'emergency' },
  { pattern: /stroke|face (is )?droop|slurred speech|unconscious|passed out|severe bleeding/i, kind: 'emergency' },
  { pattern: /worst headache|thunderclap headache/i, kind: 'emergency' },
  { pattern: /suicid|kill myself|end my life|self[- ]harm|hurt myself/i, kind: 'crisis' },
];

export function emergencyConcern(text: string): 'emergency' | 'crisis' | null {
  // Crisis wording takes priority so the right number is shown.
  if (EMERGENCY_PATTERNS.some((p) => p.kind === 'crisis' && p.pattern.test(text))) return 'crisis';
  if (EMERGENCY_PATTERNS.some((p) => p.kind === 'emergency' && p.pattern.test(text))) return 'emergency';
  return null;
}

export type InboxView = 'inbox' | 'unread' | 'archived';

/** Narrows threads to a view and a free-text search over subject, message text and clinician names. */
export function filterThreads(
  threads: MessageThread[],
  view: InboxView,
  query: string,
  clinicians: Clinician[] = [],
): MessageThread[] {
  const needle = query.trim().toLowerCase();
  return threads.filter((thread) => {
    if (view === 'archived' ? !thread.archived : thread.archived) return false;
    if (view === 'unread' && !isUnread(thread)) return false;
    if (!needle) return true;
    const names = clinicians.filter((c) => c.id === thread.assigneeId).map((c) => c.name);
    return [thread.subject, ...thread.messages.map((m) => m.body), ...names].join(' ').toLowerCase().includes(needle);
  });
}

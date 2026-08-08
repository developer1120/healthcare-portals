import { differenceInBusinessDays } from 'date-fns';
import { compareAsc, toDate } from '@/lib/dates';
import type { StatusTone } from '@/ui';
import { REPLY_WITHIN_BUSINESS_DAYS, emergencyConcern, lastMessage } from './messages';
import { assessRisk } from './risk';
import type { PatientSnapshot } from './risk';
import type { Message, MessageThread } from './types';

/** A thread in the clinician inbox, with the patient summary triage needs. */
export interface InboxItem {
  thread: MessageThread;
  snapshot: PatientSnapshot;
}

export type TriageLevel = 'emergency' | 'urgent' | 'soon' | 'routine';

export interface Triage {
  level: TriageLevel;
  /** Why it landed at this level, shown on the row. */
  reasons: string[];
  /** The patient is waiting for a reply. */
  needsReply: boolean;
  /** When the patient's unanswered messages started. */
  waitingSince?: Date;
  /** Waiting longer than the reply promise. */
  overdue: boolean;
}

const levelOrder: TriageLevel[] = ['emergency', 'urgent', 'soon', 'routine'];

export const triageDisplay: Record<TriageLevel, { label: string; tone: StatusTone }> = {
  emergency: { label: 'Emergency', tone: 'critical' },
  urgent: { label: 'Urgent', tone: 'critical' },
  soon: { label: 'Today', tone: 'warn' },
  routine: { label: 'Routine', tone: 'neutral' },
};

/** Symptom words that need a same-day call rather than a message. */
const URGENT_SYMPTOMS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(fell|fall(en)?|slipped|tripped)\b/i, label: 'a fall' },
  { pattern: /dizz|light-?headed|faint/i, label: 'dizziness' },
  { pattern: /\bfever\b|temperature of 10[2-5]/i, label: 'fever' },
  { pattern: /vomit|throwing up/i, label: 'vomiting' },
  { pattern: /\bbleed/i, label: 'bleeding' },
  { pattern: /blurr(y|ed) vision|vision (is|has gone) blurr/i, label: 'vision change' },
];

/** The patient's messages since the care team last replied. */
export function unanswered(thread: MessageThread): Message[] {
  let start = thread.messages.length;
  while (start > 0 && thread.messages[start - 1]!.authorId === thread.patientId) start--;
  return thread.messages.slice(start);
}

/** Unread for the clinician when the patient wrote after the clinician last opened the thread. */
export function isUnreadForClinician(thread: MessageThread): boolean {
  const latest = lastMessage(thread);
  if (!latest || latest.authorId !== thread.patientId) return false;
  return !thread.clinicianReadAt || toDate(latest.sentAt) > toDate(thread.clinicianReadAt);
}

/**
 * Sorts a message into emergency, urgent, today or routine. Emergency and
 * crisis wording comes first; then acute symptoms; then medical questions and
 * results (bumped to urgent for high-risk patients); prescriptions, billing
 * and general questions are routine. Only unanswered messages count.
 */
export function triageThread(item: InboxItem, now: Date = new Date()): Triage {
  const { thread, snapshot } = item;
  const waiting = unanswered(thread);
  const closed = thread.closedAt !== undefined && waiting.every((m) => toDate(m.sentAt) <= toDate(thread.closedAt!));
  if (waiting.length === 0 || closed) return { level: 'routine', reasons: [], needsReply: false, overdue: false };

  const text = waiting.map((m) => m.body).join('\n');
  const waitingSince = toDate(waiting[0]!.sentAt);
  const overdue = differenceInBusinessDays(now, waitingSince) >= REPLY_WITHIN_BUSINESS_DAYS;
  const reasons: string[] = [];
  let level: TriageLevel;

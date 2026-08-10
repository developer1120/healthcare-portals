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

  const concern = emergencyConcern(text);
  const symptoms = URGENT_SYMPTOMS.filter((s) => s.pattern.test(text)).map((s) => s.label);
  if (concern) {
    level = 'emergency';
    reasons.push(concern === 'crisis' ? 'Crisis language' : 'Possible emergency');
  } else if (symptoms.length > 0) {
    level = 'urgent';
    reasons.push(`Mentions ${symptoms.join(', ')}`);
  } else if (thread.category === 'clinical' || thread.category === 'results') {
    level = 'soon';
    if (assessRisk(snapshot, now).level === 'high') {
      level = 'urgent';
      reasons.push('High-risk patient');
    }
  } else {
    level = 'routine';
  }
  if (overdue) reasons.push('Overdue');

  return { level, reasons, needsReply: true, waitingSince, overdue };
}

export interface TriagedItem extends InboxItem {
  triage: Triage;
}

/** Needing a reply first, then by level, overdue first, then whoever has waited longest. */
export function sortInbox(items: InboxItem[], now: Date = new Date()): TriagedItem[] {
  return items
    .map((item) => ({ ...item, triage: triageThread(item, now) }))
    .sort((a, b) => {
      if (a.triage.needsReply !== b.triage.needsReply) return a.triage.needsReply ? -1 : 1;
      if (!a.triage.needsReply) return compareAsc(lastMessage(b.thread)!.sentAt, lastMessage(a.thread)!.sentAt);
      const level = levelOrder.indexOf(a.triage.level) - levelOrder.indexOf(b.triage.level);
      if (level !== 0) return level;
      if (a.triage.overdue !== b.triage.overdue) return a.triage.overdue ? -1 : 1;
      return a.triage.waitingSince!.getTime() - b.triage.waitingSince!.getTime();
    });
}

export type InboxScope = 'mine' | 'team';
export type InboxStatus = 'needs-reply' | 'all';

export function filterInbox(
  items: TriagedItem[],
  { scope, status }: { scope: InboxScope; status: InboxStatus },
  clinicianId: string,
): TriagedItem[] {
  return items.filter(
    (item) =>
      (scope === 'team' || item.thread.assigneeId === clinicianId) && (status === 'all' || item.triage.needsReply),
  );
}

/** Replies the clinician can drop in and edit. */
export const quickReplies: { label: string; body: string }[] = [
  {
    label: 'Call 911',
    body: 'What you describe needs to be seen right away. Please call 911 or go to the nearest emergency department now. If you can’t, reply here and we’ll call you.',
  },
  {
    label: 'Book a visit',
    body: 'Thanks for letting me know. I’d like to see you about this. Please book a visit in the next few days, or reply here if none of the times work.',
  },
  {
    label: 'Calling you today',
    body: 'Thanks for your message. I’ll call you today to talk this through. If anything gets worse before then, call 911.',
  },
  {
    label: 'Refill sent',
    body: 'I’ve sent the refill to your pharmacy. It’s usually ready within a day.',
  },
];

/** The rail badge: conversations assigned to this clinician with patient messages they haven't opened. */
export function unreadForClinician(items: InboxItem[], clinicianId: string): number {
  return items.filter((item) => item.thread.assigneeId === clinicianId && isUnreadForClinician(item.thread)).length;
}

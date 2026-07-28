import { IconAlertTriangle } from '@tabler/icons-react';
import { emergencyConcern } from '@/domain/messages';

/**
 * Shown while someone types words that suggest an emergency or crisis.
 * Messages aren't read in real time, so this points to 911 or 988 instead.
 */
export function EmergencyNotice({ text }: { text: string }) {
  const concern = emergencyConcern(text);
  if (!concern) return null;

  return (
    <div role="alert" className="flex gap-3 rounded-control border border-critical/40 bg-critical-soft p-3 text-sm text-critical-ink">
      <IconAlertTriangle aria-hidden size={20} stroke={1.75} className="shrink-0" />
      {concern === 'crisis' ? (
        <p>
          If you’re thinking about harming yourself, call or text <strong>988</strong> (Suicide &amp; Crisis Lifeline)
          now. If you’re in immediate danger, call <strong>911</strong>. Messages here aren’t read straight away.
        </p>
      ) : (
        <p>
          If this is an emergency, call <strong>911</strong> now. Messages here aren’t read straight away, so they
          aren’t the right place for urgent symptoms.
        </p>
      )}
    </div>
  );
}

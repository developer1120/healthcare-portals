import { useMutation } from '@tanstack/react-query';
import { IconWifi } from '@tabler/icons-react';
import { api } from '@/api/endpoints';
import { classifyConnection } from '@/domain/telehealth';
import type { ConnectionQuality } from '@/domain/telehealth';
import { Button, StatusDot } from '@/ui';
import type { StatusTone } from '@/ui';

const ratings: Record<ConnectionQuality, { tone: StatusTone; label: string }> = {
  good: { tone: 'ok', label: 'Good connection' },
  fair: { tone: 'warn', label: 'Fair connection: video may be choppy. Move closer to your router if you can.' },
  poor: { tone: 'critical', label: 'Weak connection: your clinician may switch to a phone call.' },
};

export function ConnectionCheck() {
  const check = useMutation({ mutationFn: () => api.telehealth.connectionCheck() });
  const rating = check.data ? ratings[classifyConnection(check.data.roundTripMs)] : null;

  return (
    <div className="flex flex-col gap-3">
      <div role="status" className="text-sm">
        {rating ? (
          <StatusDot tone={rating.tone}>
            {rating.label} ({check.data!.roundTripMs} ms)
          </StatusDot>
        ) : check.isError ? (
          <span className="text-critical-ink">We couldn’t reach the video service. Check your internet connection.</span>
        ) : (
          <span className="text-ink-muted">A quick test of how well video will work from here.</span>
        )}
      </div>
      <Button icon={IconWifi} loading={check.isPending} onClick={() => check.mutate()} className="self-start">
        {check.isSuccess || check.isError ? 'Test again' : 'Test connection'}
      </Button>
    </div>
  );
}

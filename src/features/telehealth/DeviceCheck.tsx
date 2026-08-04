import { useEffect, useRef, useState } from 'react';
import { IconCamera, IconRefresh } from '@tabler/icons-react';
import { Button, StatusDot } from '@/ui';
import { checkDevices, stopStream } from './media';
import type { DeviceCheckResult } from './media';

const problems: Record<Exclude<DeviceCheckResult['status'], 'ok'>, string> = {
  denied:
    'Mendwell isn’t allowed to use your camera or microphone. Allow access in your browser’s site settings, then test again.',
  'not-found': 'We couldn’t find a camera or microphone. Plug one in, or join from your phone instead.',
  unsupported: 'This browser can’t run a video visit. Try a recent version of Chrome, Edge, Firefox or Safari.',
  error: 'Something went wrong while testing your devices. Try again.',
};

/** Camera and microphone test with a live self-view. The camera turns off when this unmounts. */
export function DeviceCheck({ onResult }: { onResult: (ok: boolean) => void }) {
  const [result, setResult] = useState<DeviceCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = result?.status === 'ok' ? result.stream : null;

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
    return () => stopStream(stream);
  }, [stream]);

  async function run() {
    setChecking(true);
    stopStream(stream);
    const next = await checkDevices();
    setResult(next);
    setChecking(false);
    onResult(next.status === 'ok' && next.hasCamera && next.hasMicrophone);
  }

  return (
    <div className="flex flex-col gap-3">
      {stream && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          aria-label="Your camera preview"
          className="aspect-video w-full max-w-sm rounded-card bg-rail object-cover"
        />
      )}
      <div role="status" className="text-sm">
        {result === null ? (
          <span className="text-ink-muted">Check that your camera and microphone work before the visit.</span>
        ) : result.status === 'ok' ? (
          result.hasCamera && result.hasMicrophone ? (
            <StatusDot tone="ok">Camera and microphone are working</StatusDot>
          ) : (
            <StatusDot tone="warn">
              {result.hasCamera ? 'No microphone found' : 'No camera found'}. Your clinician may need to call you.
            </StatusDot>
          )
        ) : (
          <span className="text-critical-ink">{problems[result.status]}</span>
        )}
      </div>
      <Button
        icon={result ? IconRefresh : IconCamera}
        loading={checking}
        onClick={() => void run()}
        className="self-start"
      >
        {result ? 'Test again' : 'Test camera and microphone'}
      </Button>
    </div>
  );
}

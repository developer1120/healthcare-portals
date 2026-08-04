export type DeviceCheckResult =
  | { status: 'ok'; stream: MediaStream; hasCamera: boolean; hasMicrophone: boolean }
  | { status: 'denied' | 'not-found' | 'unsupported' | 'error' };

/** Asks for the camera and microphone the way the video visit will, and reports what happened. */
export async function checkDevices(): Promise<DeviceCheckResult> {
  if (!navigator.mediaDevices?.getUserMedia) return { status: 'unsupported' };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    return {
      status: 'ok',
      stream,
      hasCamera: stream.getVideoTracks().length > 0,
      hasMicrophone: stream.getAudioTracks().length > 0,
    };
  } catch (error) {
    const name = error instanceof DOMException || error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return { status: 'denied' };
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return { status: 'not-found' };
    return { status: 'error' };
  }
}

/** Turns the camera light off. */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

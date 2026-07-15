import { getApiConfig } from './config';
import { ApiError } from './errors';

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    if (ms <= 0) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export interface RespondOptions {
  signal?: AbortSignal;
  /** A ping uses the faster ping latency instead of the data-request latency. */
  kind?: 'request' | 'ping';
}

/**
 * Runs a mock handler the way a real request would behave: after some latency,
 * sometimes failing, and returning a copy so callers can never mutate the
 * server's data by accident. A simulated failure happens before the handler
 * runs, so a failed write has no side effects.
 */
export async function respond<T>(handler: () => T, { signal, kind = 'request' }: RespondOptions = {}): Promise<T> {
  const config = getApiConfig();
  const latency = kind === 'ping' ? config.pingLatency : config.latency;
  const { failureRate } = config;
  const delay = latency.min + Math.random() * Math.max(0, latency.max - latency.min);
  await wait(delay, signal);

  if (failureRate > 0 && Math.random() < failureRate) {
    throw new ApiError('The connection dropped. Check your network and try again.', {
      status: 503,
      code: 'network',
      retryable: true,
    });
  }

  return structuredClone(handler());
}

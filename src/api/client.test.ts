import { respond } from './client';
import { configureApi, getApiConfig, resetApiConfig } from './config';
import { ApiError, errorMessage, isApiError, notFound } from './errors';
import { shouldRetry } from './queryClient';

describe('respond', () => {
  it('waits for the configured latency before answering', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    configureApi({ latency: { min: 300, max: 300 } });
    const handler = vi.fn(() => 'pong');

    let settled = false;
    const promise = respond(handler).then((value) => {
      settled = true;
      return value;
    });

    await vi.advanceTimersByTimeAsync(299);
    expect(settled).toBe(false);
    expect(handler).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toBe('pong');
  });

  it('returns a copy, so callers cannot change server data', async () => {
    const source = { name: 'Ava', tags: ['vip'] };
    const result = await respond(() => source);
    result.tags.push('changed');
    expect(source.tags).toEqual(['vip']);
  });

  it('fails with a retryable network error at the configured rate, without running the handler', async () => {
    configureApi({ failureRate: 1 });
    const handler = vi.fn(() => 'never');

    const error = await respond(handler).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: 'network', retryable: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes handler errors through', async () => {
    await expect(
      respond(() => {
        throw notFound('That task');
      }),
    ).rejects.toMatchObject({ status: 404, code: 'not-found', message: 'That task was not found.' });
  });

  it('can be cancelled while waiting', async () => {
    configureApi({ latency: { min: 5_000, max: 5_000 } });
    const controller = new AbortController();
    const promise = respond(() => 'late', { signal: controller.signal });
    controller.abort(new DOMException('Aborted', 'AbortError'));
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('api config', () => {
  it('merges overrides and resets to defaults', () => {
    resetApiConfig();
    const defaults = structuredClone(getApiConfig());
    configureApi({ latency: { min: 0, max: 10 } });
    expect(getApiConfig()).toEqual({ ...defaults, latency: { min: 0, max: 10 } });
    resetApiConfig();
    expect(getApiConfig()).toEqual(defaults);
    expect(defaults.failureRate).toBeGreaterThan(0);
  });
});

describe('errors', () => {
  it('recognises API errors and words unknown ones generically', () => {
    const error = notFound('That patient');
    expect(isApiError(error)).toBe(true);
    expect(isApiError(new Error('boom'))).toBe(false);
    expect(errorMessage(error)).toBe('That patient was not found.');
    expect(errorMessage(new Error('internal detail'))).toBe('Something went wrong. Try again in a moment.');
  });

  it('retries only retryable errors, at most twice', () => {
    const dropped = new ApiError('dropped', { status: 503, code: 'network', retryable: true });
    expect(shouldRetry(0, dropped)).toBe(true);
    expect(shouldRetry(1, dropped)).toBe(true);
    expect(shouldRetry(2, dropped)).toBe(false);
    expect(shouldRetry(0, notFound('That patient'))).toBe(false);
    expect(shouldRetry(0, new Error('bug'))).toBe(false);
  });
});

describe('ping latency', () => {
  it('times pings with their own, faster range', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    configureApi({ latency: { min: 500, max: 500 }, pingLatency: { min: 40, max: 40 } });

    let settled = false;
    const ping = respond(() => 'pong', { kind: 'ping' }).then((value) => {
      settled = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(40);
    expect(settled).toBe(true);
    await expect(ping).resolves.toBe('pong');
  });

  it('keeps the defaults realistic: pings well under the "good" threshold', () => {
    resetApiConfig();
    expect(getApiConfig().pingLatency.max).toBeLessThan(150);
  });
});

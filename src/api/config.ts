/** How the pretend network behaves. Tests switch latency and failures off. */
export interface ApiConfig {
  /** Each response waits a random time in this range, in milliseconds. */
  latency: { min: number; max: number };
  /** Lightweight pings (the video connection test) answer much faster than data requests. */
  pingLatency: { min: number; max: number };
  /** Chance (0–1) that a request fails with a retryable 503 before doing anything. */
  failureRate: number;
}

function defaults(): ApiConfig {
  return {
    latency: { min: 250, max: 700 },
    pingLatency: { min: 30, max: 120 },
    failureRate: 0.03,
  };
}

let current: ApiConfig = defaults();

export function getApiConfig(): ApiConfig {
  return current;
}

export function configureApi(overrides: Partial<ApiConfig>): void {
  current = {
    ...current,
    ...overrides,
    latency: { ...current.latency, ...overrides.latency },
    pingLatency: { ...current.pingLatency, ...overrides.pingLatency },
  };
}

export function resetApiConfig(): void {
  current = defaults();
}

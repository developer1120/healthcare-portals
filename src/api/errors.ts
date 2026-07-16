export type ApiErrorCode =
  | 'network'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'forbidden'
  | 'unauthorized'
  | 'rate-limited';

/** Error shape every mock endpoint rejects with. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  /** Whether trying the same request again might work. */
  readonly retryable: boolean;

  constructor(message: string, { status, code, retryable = false }: { status: number; code: ApiErrorCode; retryable?: boolean }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function notFound(what: string): ApiError {
  return new ApiError(`${what} was not found.`, { status: 404, code: 'not-found' });
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** A sentence for the UI, whatever was thrown. */
export function errorMessage(error: unknown): string {
  if (isApiError(error)) return error.message;
  return 'Something went wrong. Try again in a moment.';
}

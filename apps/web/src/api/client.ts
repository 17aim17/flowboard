import type { ErrorBody, ValidationIssue } from '@flowboard/contracts';
import { getCurrentUser } from '../auth/current-user.tsx';

/** An error response from the API, in its { error: { code, message, details } } shape. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>[];
  readonly requestId: string | null;

  constructor(status: number, body: ErrorBody | undefined, requestId: string | null) {
    super(body?.error.message ?? `Request failed (${status})`);
    this.status = status;
    this.code = body?.error.code ?? 'UNKNOWN';
    this.details = body?.error.details ?? [];
    this.requestId = requestId;
  }

  /** Validation problems that point at an input, e.g. { path: "customFields.estimate", ... }. */
  get issues(): ValidationIssue[] {
    return this.details.filter((d): d is ValidationIssue => typeof d.path === 'string');
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Calls the API as the user picked in the header. The server resolves who that is. */
export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/v1${path}`, {
    method,
    headers: {
      'X-User-Id': getCurrentUser(),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;
  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok)
    throw new ApiError(response.status, json as ErrorBody, response.headers.get('x-request-id'));
  return json as T;
}

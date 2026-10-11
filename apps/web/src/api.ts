import type { ErrorBody } from '@ots/shared';

/** A failed api call. `field` names the input the server rejected, when it said. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Calls the api under /api and returns the parsed JSON body (null for 204). */
export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (res.status === 204) return null as T;
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON; fall through with null.
  }
  if (!res.ok) {
    const error = parsed as Partial<ErrorBody> | null;
    throw new ApiError(
      res.status,
      error?.message ?? `request failed (${res.status})`,
      error?.field,
    );
  }
  return parsed as T;
}

export const errorText = (err: unknown): string =>
  err instanceof Error ? err.message : 'Something went wrong';

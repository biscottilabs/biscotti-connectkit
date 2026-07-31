/**
 * Server-side Circle client.
 *
 * Imported only by route handlers under `app/api/circle`, which never run in
 * the browser. If you start importing this from a component, add the
 * `server-only` package and import it here so the boundary is enforced by the
 * build rather than by convention.
 *
 * Everything in this file runs only on the server. The Circle API key grants
 * full control of your Circle account, so it must never be sent to the browser
 * — that is the entire reason these proxy routes exist. Note the absence of a
 * `NEXT_PUBLIC_` prefix on CIRCLE_API_KEY: adding one would ship the key in the
 * client bundle.
 */

export const CIRCLE_API_BASE =
  process.env.CIRCLE_API_BASE ?? 'https://api.circle.com/v1/w3s';

type MissingVar = {
  id: string;
  envVar?: string;
  scope: 'client' | 'server' | 'console';
};

/**
 * Reports which required values the server cannot see. Only *presence* is ever
 * reported, never a value, so the health route is safe to expose publicly.
 */
export const getMissingServerConfig = (): MissingVar[] => {
  const missing: MissingVar[] = [];

  if (!process.env.CIRCLE_API_KEY) {
    missing.push({
      id: 'apiKey',
      envVar: 'CIRCLE_API_KEY',
      scope: 'server',
    });
  }

  return missing;
};

export class CircleApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'CircleApiError';
    this.status = status;
  }
}

type CircleFetchInit = {
  method?: 'GET' | 'POST';
  /** The end user's 14-day session token, minted by the Web SDK login. */
  userToken?: string;
  body?: Record<string, unknown>;
  searchParams?: Record<string, string | undefined>;
};

export const circleFetch = async <T>(
  path: string,
  init: CircleFetchInit = {}
): Promise<T> => {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new CircleApiError(
      500,
      'CIRCLE_API_KEY is not set on the server. Add it to .env.local (without a NEXT_PUBLIC_ prefix).'
    );
  }

  const url = new URL(`${CIRCLE_API_BASE}${path}`);
  for (const [key, value] of Object.entries(init.searchParams ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Request-Id': crypto.randomUUID(),
      ...(init.userToken ? { 'X-User-Token': init.userToken } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    // Circle responses are per-user and must never be cached by Next.
    cache: 'no-store',
  });

  const text = await response.text();

  if (!response.ok) {
    // Surface Circle's own message where possible — its error codes are far
    // more actionable than a bare status — but never echo request headers.
    let message = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text);
      message = parsed?.message ?? message;
    } catch {
      /* keep the raw text */
    }
    throw new CircleApiError(response.status, message || response.statusText);
  }

  return text ? (JSON.parse(text) as T) : ({} as T);
};

/** Circle wraps every successful payload in a `data` envelope. */
export type CircleEnvelope<T> = { data: T };

export const idempotencyKey = () => crypto.randomUUID();

/**
 * Reads the user token a browser route handler forwarded to us.
 *
 * NOTE for production: this token comes from the client, so these routes are
 * only as trustworthy as the token itself. In a real application you should
 * additionally tie the request to your own session (a cookie, an Authorization
 * header) and verify the caller is entitled to act as this Circle user, rather
 * than proxying any token that arrives.
 */
export const requireUserToken = (body: { userToken?: string }): string => {
  if (!body?.userToken) {
    throw new CircleApiError(400, 'Missing `userToken` in request body.');
  }
  return body.userToken;
};

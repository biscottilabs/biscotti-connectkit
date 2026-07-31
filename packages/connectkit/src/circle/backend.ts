import type {
  CircleBackendAdapter,
  CircleChallengeResponse,
  CircleDeviceTokenResult,
  CircleEmailOtpResult,
  CircleEndpointConfig,
  CircleHealthReport,
  CircleOptions,
  CircleWallet,
} from './types';

export const CIRCLE_DEFAULT_BASE_PATH = '/api/circle';

export class CircleBackendError extends Error {
  readonly status: number;
  readonly route: string;
  readonly code?: string | number;
  readonly requestId?: string;

  constructor(
    route: string,
    status: number,
    message: string,
    details?: { code?: string | number; requestId?: string }
  ) {
    super(message);
    this.name = 'CircleBackendError';
    this.route = route;
    this.status = status;
    this.code = details?.code;
    this.requestId = details?.requestId;
  }
}

/**
 * Default HTTP client for the app-hosted Circle proxy.
 *
 * Every method here maps 1:1 to a route the consuming app must expose. We never
 * call `api.circle.com` from the browser: doing so would require shipping the
 * Circle API key to the client, which would let anyone drain the account.
 */
export const createHttpBackendAdapter = (
  config: CircleEndpointConfig = {}
): CircleBackendAdapter => {
  const basePath = (config.basePath ?? CIRCLE_DEFAULT_BASE_PATH).replace(
    /\/$/,
    ''
  );

  const request = async <T>(route: string, body?: unknown): Promise<T> => {
    const extraHeaders =
      typeof config.headers === 'function' ? config.headers() : config.headers;

    let response: Response;
    try {
      response = await fetch(`${basePath}${route}`, {
        ...config.fetchOptions,
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (_error) {
      // A network-level failure usually means the route simply does not exist
      // yet, which is the single most common setup mistake — say so plainly.
      throw new CircleBackendError(
        route,
        0,
        `Could not reach ${basePath}${route}. Is the Circle backend route implemented and running?`
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let detail = text.slice(0, 300);
      let code: string | number | undefined;
      let requestId: string | undefined;
      try {
        const parsed = JSON.parse(text) as {
          message?: unknown;
          code?: unknown;
          requestId?: unknown;
        };
        if (typeof parsed.message === 'string') detail = parsed.message;
        if (typeof parsed.code === 'string' || typeof parsed.code === 'number') {
          code = parsed.code;
        }
        if (typeof parsed.requestId === 'string') requestId = parsed.requestId;
      } catch {
        // Preserve a short plain-text response when the backend did not return
        // JSON. Never echo an unlimited upstream body into the modal.
      }

      throw new CircleBackendError(
        route,
        response.status,
        `${basePath}${route} responded ${response.status}${
          code !== undefined ? ` (${code})` : ''
        }${detail ? `: ${detail}` : ''}${
          requestId ? ` [request ${requestId}]` : ''
        }`,
        { code, requestId }
      );
    }

    return (await response.json()) as T;
  };

  return {
    createDeviceToken: (input) =>
      request<CircleDeviceTokenResult>('/device-token', input),

    requestEmailOtp: (input) =>
      request<CircleEmailOtpResult>('/email-otp', input),

    initializeUser: (input) =>
      request<CircleChallengeResponse>('/initialize-user', input),

    listWallets: async (input) => {
      const result = await request<{ wallets: CircleWallet[] }>(
        '/wallets',
        input
      );
      return result.wallets ?? [];
    },

    signMessage: (input) =>
      request<CircleChallengeResponse>('/sign-message', input),

    signTypedData: (input) =>
      request<CircleChallengeResponse>('/sign-typed-data', input),

    createTransaction: (input) =>
      request<CircleChallengeResponse>('/transaction', input),

    health: async () => {
      try {
        return await request<CircleHealthReport>('/health');
      } catch (error) {
        // A missing health route must not present as a configuration failure;
        // it is optional. Report "reachable but unknown" instead.
        if (error instanceof CircleBackendError && error.status === 404) {
          return { ok: true };
        }
        throw error;
      }
    },
  };
};

/** Resolves the adapter for a given config, preferring an explicit override. */
export const resolveBackendAdapter = (
  circle: CircleOptions | undefined
): CircleBackendAdapter =>
  circle?.adapter ?? createHttpBackendAdapter(circle?.endpoints);

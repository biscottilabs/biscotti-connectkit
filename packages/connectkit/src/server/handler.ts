/**
 * Server half of Sign in with Circle.
 *
 * Circle's REST API needs a secret API key, so the browser never calls it
 * directly. ConnectKit calls these routes on the app's own server instead, and
 * this handler forwards them to Circle with the key for the environment the
 * request asks for.
 *
 * It is built on the web-standard `Request` / `Response`, so the same handler
 * runs in Next.js route handlers, Bun, Deno, Cloudflare Workers and Hono as is,
 * and in Node servers (Express, Vite, plain `http`) via
 * `createCircleNodeMiddleware`.
 *
 * Nothing here may import React or browser code: this file is bundled into the
 * separate `@biscottidex/connectkit/server` entry point.
 */
import {
  CIRCLE_ENVIRONMENTS,
  environmentOfBlockchain,
  isCircleEnvironment,
  type CircleEnvironment,
} from '../circle/chains';
import type {
  CircleConfigIssue,
  CircleEnvironmentHealth,
  CircleHealthReport,
} from '../circle/types';

export const CIRCLE_API_BASE_URL = 'https://api.circle.com/v1/w3s';

const DOCS_KEYS = 'https://developers.circle.com/api-reference/keys';

export type CircleServerEnvironment = {
  /** `TEST_API_KEY:…` for testnet, `LIVE_API_KEY:…` for mainnet. */
  apiKey?: string;
  /** Env var the key is read from, named in diagnostics. */
  envVar?: string;
};

export type CircleRoute =
  | 'device-token'
  | 'email-otp'
  | 'initialize-user'
  | 'wallets'
  | 'sign-message'
  | 'sign-typed-data'
  | 'transaction'
  | 'health';

export type CircleAuthorizeContext = {
  request: Request;
  route: CircleRoute;
  environment: CircleEnvironment;
  /** Parsed JSON body; empty for `GET /health`. */
  body: Record<string, unknown>;
  /** The Circle user token the browser sent, for routes that act as a user. */
  userToken?: string;
};

export type CircleHandlerOptions = {
  /**
   * The environments this server can serve. The server is the authority here:
   * a browser can only choose among environments that have a key, so a preview
   * deployment without a live key can never be pointed at mainnet.
   */
  environments: Partial<Record<CircleEnvironment, CircleServerEnvironment>>;

  /**
   * Used when a request carries no `X-Circle-Environment` header (clients that
   * predate environments). Defaults to the only configured environment, if
   * exactly one has a key.
   */
  defaultEnvironment?: CircleEnvironment;

  /**
   * Runs before every route except `health`. Throw a `CircleHttpError` (for
   * example 401) to reject the request.
   *
   * Use this to tie Circle calls to your own session: the user token comes from
   * the browser, so on its own it proves only that the caller holds a token,
   * not that your app authorised them to use it.
   */
  authorize?: (context: CircleAuthorizeContext) => void | Promise<void>;

  /** Called with unexpected errors. Defaults to `console.error`. */
  onError?: (error: unknown) => void;

  /** Defaults to Circle's production API. Both environments share it. */
  apiBaseUrl?: string;

  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
};

export class CircleHttpError extends Error {
  readonly status: number;
  readonly code?: string | number;
  readonly requestId?: string;

  constructor(
    status: number,
    message: string,
    details?: { code?: string | number; requestId?: string }
  ) {
    super(message);
    this.name = 'CircleHttpError';
    this.status = status;
    this.code = details?.code;
    this.requestId = details?.requestId;
  }
}

/** The environment a Circle API key belongs to, read from its prefix. */
export const apiKeyEnvironment = (
  apiKey: string | undefined
): CircleEnvironment | undefined =>
  apiKey?.startsWith('LIVE_API_KEY:')
    ? 'mainnet'
    : apiKey?.startsWith('TEST_API_KEY:')
    ? 'testnet'
    : undefined;

const defaultEnvVar = (environment: CircleEnvironment) =>
  `CIRCLE_${environment.toUpperCase()}_API_KEY`;

/**
 * Checks one environment's key without ever including the key in the result,
 * so the output is safe to return from the public health route.
 */
const checkEnvironment = (
  environment: CircleEnvironment,
  config: CircleServerEnvironment
): CircleEnvironmentHealth => {
  const envVar = config.envVar ?? defaultEnvVar(environment);

  if (!config.apiKey) {
    return {
      ok: false,
      missing: [{ id: 'apiKey', envVar, scope: 'server' }],
    };
  }

  const detected = apiKeyEnvironment(config.apiKey);
  const issues: CircleConfigIssue[] = [];

  if (!detected) {
    issues.push({
      id: 'unrecognizedApiKey',
      envVar,
      scope: 'server',
      severity: 'error',
      message: `${envVar} is not a recognised Circle API key. Copy a Wallets API key from Circle Console without quotes or whitespace; it starts with TEST_API_KEY: or LIVE_API_KEY:.`,
      docsUrl: DOCS_KEYS,
    });
  } else if (detected !== environment) {
    issues.push({
      id: 'apiKeyEnvironmentMismatch',
      envVar,
      scope: 'server',
      severity: 'error',
      message: `${envVar} is a ${detected} key, but it is configured for ${environment}. Testnet needs a TEST_API_KEY and mainnet needs a LIVE_API_KEY.`,
      docsUrl: DOCS_KEYS,
    });
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true };
};

const randomId = (): string => {
  const webCrypto = globalThis.crypto;
  if (webCrypto?.randomUUID) return webCrypto.randomUUID();

  // Idempotency keys and request ids need uniqueness, not secrecy.
  const bytes = new Uint8Array(16);
  if (webCrypto?.getRandomValues) webCrypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
};

const json = (status: number, value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Every response is per-user or per-deployment; never cache it.
      'Cache-Control': 'no-store',
    },
  });

type Body = Record<string, unknown>;

const requireString = (body: Body, key: string): string => {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new CircleHttpError(400, `Missing \`${key}\` in request body.`);
  }
  return value;
};

const optionalString = (body: Body, key: string): string | undefined => {
  const value = body[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new CircleHttpError(400, `\`${key}\` must be a string.`);
  }
  return value;
};

const optionalEnum = <T extends string>(
  body: Body,
  key: string,
  allowed: readonly T[]
): T | undefined => {
  const value = optionalString(body, key);
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) {
    throw new CircleHttpError(
      400,
      `\`${key}\` must be one of ${allowed.join(', ')}.`
    );
  }
  return value as T;
};

/** Rejects a blockchain from the other environment before Circle does. */
const requireBlockchainIn = (
  blockchain: string,
  environment: CircleEnvironment
) => {
  if (environmentOfBlockchain(blockchain) !== environment) {
    throw new CircleHttpError(
      400,
      `${blockchain} is a ${environmentOfBlockchain(
        blockchain
      )} blockchain, but this request is for ${environment}.`,
      { code: 'CIRCLE_ENVIRONMENT_MISMATCH' }
    );
  }
};

const ROUTES: readonly CircleRoute[] = [
  'device-token',
  'email-otp',
  'initialize-user',
  'wallets',
  'sign-message',
  'sign-typed-data',
  'transaction',
  'health',
];

/** Routes that authenticate the end user rather than start a login. */
const USER_ROUTES: readonly CircleRoute[] = [
  'initialize-user',
  'wallets',
  'sign-message',
  'sign-typed-data',
  'transaction',
];

export const CIRCLE_ENVIRONMENT_REQUEST_HEADER = 'x-circle-environment';

/**
 * Creates the request handler for every Circle route.
 *
 * Routing uses the last path segment (`…/device-token`, `…/health`), so the
 * handler works wherever it is mounted — `/api/circle/[...route]` in Next.js,
 * or any prefix passed to `endpoints.basePath` on the client.
 */
export const createCircleHandler = (options: CircleHandlerOptions) => {
  const apiBaseUrl = (options.apiBaseUrl ?? CIRCLE_API_BASE_URL).replace(
    /\/$/,
    ''
  );
  const doFetch = options.fetch ?? ((...args) => fetch(...args));
  const onError =
    options.onError ??
    ((error: unknown) =>
      console.error('[circle] unexpected route failure', error));

  // Checked once: keys do not change while the process runs.
  const health: Partial<Record<CircleEnvironment, CircleEnvironmentHealth>> =
    {};
  for (const environment of CIRCLE_ENVIRONMENTS) {
    const config = options.environments[environment];
    if (config) health[environment] = checkEnvironment(environment, config);
  }

  const withKey = CIRCLE_ENVIRONMENTS.filter(
    (environment) => options.environments[environment]?.apiKey
  );
  const fallbackEnvironment =
    options.defaultEnvironment ?? (withKey.length === 1 ? withKey[0] : undefined);

  const healthReport = (): CircleHealthReport => {
    const primary = fallbackEnvironment
      ? health[fallbackEnvironment]
      : undefined;
    return {
      // Top-level fields keep clients that predate environments working.
      ...(primary ?? {
        ok: Object.values(health).some((entry) => entry?.ok),
      }),
      environments: health,
    };
  };

  const resolveEnvironment = (request: Request): CircleEnvironment => {
    const header = request.headers.get(CIRCLE_ENVIRONMENT_REQUEST_HEADER);

    if (header !== null && !isCircleEnvironment(header)) {
      throw new CircleHttpError(
        400,
        `X-Circle-Environment must be "testnet" or "mainnet".`
      );
    }

    const environment = header ?? fallbackEnvironment;
    if (!environment) {
      throw new CircleHttpError(
        400,
        'Missing X-Circle-Environment header, and this server configures more than one Circle environment.'
      );
    }

    const status = health[environment];
    if (!status || status.missing?.length) {
      throw new CircleHttpError(
        503,
        `This server is not configured for Circle ${environment}. Set ${
          options.environments[environment]?.envVar ??
          defaultEnvVar(environment)
        } on the server.`,
        { code: 'CIRCLE_ENVIRONMENT_NOT_CONFIGURED' }
      );
    }
    if (!status.ok) {
      throw new CircleHttpError(
        500,
        status.issues?.[0]?.message ??
          `Circle ${environment} is misconfigured on this server.`,
        { code: 'CIRCLE_CONFIGURATION_ERROR' }
      );
    }

    return environment;
  };

  const callCircle = async <T>(
    environment: CircleEnvironment,
    path: string,
    init: {
      method?: 'GET' | 'POST';
      userToken?: string;
      body?: Body;
      searchParams?: Record<string, string | undefined>;
    } = {}
  ): Promise<T> => {
    const url = new URL(`${apiBaseUrl}${path}`);
    for (const [key, value] of Object.entries(init.searchParams ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value);
    }

    const requestId = randomId();
    const response = await doFetch(url, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${options.environments[environment]!.apiKey}`,
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        ...(init.userToken ? { 'X-User-Token': init.userToken } : {}),
      },
      // No `cache` option: older Node fetch implementations reject it, and
      // these calls only ever run inside POST handlers, which frameworks such
      // as Next.js never cache.
      body: init.body ? JSON.stringify(init.body) : undefined,
    });

    const text = await response.text();
    let parsed: { data?: T; message?: unknown; code?: unknown } = {};
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new CircleHttpError(
          response.ok ? 502 : response.status,
          'Circle returned a non-JSON response.',
          { code: 'CIRCLE_INVALID_RESPONSE', requestId }
        );
      }
    }

    if (!response.ok) {
      // Circle's own message and code are far more actionable than a status,
      // and never contain request headers, so they are safe to pass on.
      throw new CircleHttpError(
        response.status,
        typeof parsed.message === 'string'
          ? parsed.message
          : response.statusText || 'Circle request failed.',
        {
          code:
            typeof parsed.code === 'string' || typeof parsed.code === 'number'
              ? parsed.code
              : undefined,
          requestId,
        }
      );
    }

    // Circle wraps every successful payload in a `data` envelope.
    return parsed.data as T;
  };

  const routes: Record<
    Exclude<CircleRoute, 'health'>,
    (environment: CircleEnvironment, body: Body) => Promise<unknown>
  > = {
    'device-token': async (environment, body) => {
      const data = await callCircle<{
        deviceToken: string;
        deviceEncryptionKey: string;
      }>(environment, '/users/social/token', {
        method: 'POST',
        body: {
          idempotencyKey: randomId(),
          deviceId: requireString(body, 'deviceId'),
        },
      });
      return {
        deviceToken: data.deviceToken,
        deviceEncryptionKey: data.deviceEncryptionKey,
      };
    },

    'email-otp': async (environment, body) => {
      const data = await callCircle<{
        deviceToken: string;
        deviceEncryptionKey: string;
        otpToken: string;
      }>(environment, '/users/email/token', {
        method: 'POST',
        body: {
          idempotencyKey: randomId(),
          deviceId: requireString(body, 'deviceId'),
          email: requireString(body, 'email'),
        },
      });
      return {
        deviceToken: data.deviceToken,
        deviceEncryptionKey: data.deviceEncryptionKey,
        otpToken: data.otpToken,
      };
    },

    // Returns a challenge, not a wallet: the wallet exists only once the user
    // approves the challenge in Circle's hosted UI.
    'initialize-user': async (environment, body) => {
      const blockchain = requireString(body, 'blockchain');
      requireBlockchainIn(blockchain, environment);

      const data = await callCircle<{ challengeId: string }>(
        environment,
        '/user/initialize',
        {
          method: 'POST',
          userToken: requireString(body, 'userToken'),
          body: {
            idempotencyKey: randomId(),
            blockchains: [blockchain],
            accountType:
              optionalEnum(body, 'accountType', ['EOA', 'SCA'] as const) ??
              'EOA',
          },
        }
      );
      return { challengeId: data.challengeId };
    },

    // POST, not GET: the user token must not appear in a query string, where
    // it would leak into logs, history and referrer headers.
    wallets: async (environment, body) => {
      const blockchain = optionalString(body, 'blockchain');
      if (blockchain) requireBlockchainIn(blockchain, environment);

      const data = await callCircle<{ wallets?: unknown[] }>(
        environment,
        '/wallets',
        {
          userToken: requireString(body, 'userToken'),
          searchParams: { blockchain },
        }
      );
      return { wallets: data.wallets ?? [] };
    },

    'sign-message': async (environment, body) => {
      if (typeof body.message !== 'string') {
        throw new CircleHttpError(400, 'Missing `message` in request body.');
      }
      const data = await callCircle<{ challengeId: string }>(
        environment,
        '/user/sign/message',
        {
          method: 'POST',
          userToken: requireString(body, 'userToken'),
          body: {
            walletId: requireString(body, 'walletId'),
            message: body.message,
            encodedByHex: body.encodedByHex === true,
            memo: optionalString(body, 'memo'),
          },
        }
      );
      return { challengeId: data.challengeId };
    },

    'sign-typed-data': async (environment, body) => {
      const data = await callCircle<{ challengeId: string }>(
        environment,
        '/user/sign/typedData',
        {
          method: 'POST',
          userToken: requireString(body, 'userToken'),
          body: {
            walletId: requireString(body, 'walletId'),
            data: requireString(body, 'data'),
            memo: optionalString(body, 'memo'),
          },
        }
      );
      return { challengeId: data.challengeId };
    },

    // Circle models any EVM call as a contract execution with gas chosen by fee
    // level, which is why the connector translates wagmi's transaction first.
    transaction: async (environment, body) => {
      const data = await callCircle<{ challengeId: string }>(
        environment,
        '/user/transactions/contractExecution',
        {
          method: 'POST',
          userToken: requireString(body, 'userToken'),
          body: {
            idempotencyKey: randomId(),
            walletId: requireString(body, 'walletId'),
            contractAddress: requireString(body, 'destinationAddress'),
            callData: optionalString(body, 'callData'),
            amount: optionalString(body, 'amount'),
            feeLevel:
              optionalEnum(body, 'feeLevel', [
                'LOW',
                'MEDIUM',
                'HIGH',
              ] as const) ?? 'MEDIUM',
            refId: optionalString(body, 'refId'),
          },
        }
      );
      return { challengeId: data.challengeId };
    },
  };

  return async (request: Request): Promise<Response> => {
    try {
      const segment = new URL(request.url).pathname
        .split('/')
        .filter(Boolean)
        .pop();
      const route = ROUTES.find((candidate) => candidate === segment);
      if (!route) throw new CircleHttpError(404, 'Unknown Circle route.');

      // Reports presence only, never values, so it is safe to leave public.
      if (route === 'health') {
        if (request.method !== 'GET') {
          throw new CircleHttpError(405, 'Method not allowed.');
        }
        return json(200, healthReport());
      }

      if (request.method !== 'POST') {
        throw new CircleHttpError(405, 'Method not allowed.');
      }

      let body: Body;
      try {
        body = (await request.json()) as Body;
      } catch {
        throw new CircleHttpError(400, 'Request body must be valid JSON.');
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new CircleHttpError(400, 'Request body must be a JSON object.');
      }

      const environment = resolveEnvironment(request);

      if (options.authorize) {
        await options.authorize({
          request,
          route,
          environment,
          body,
          userToken: USER_ROUTES.includes(route)
            ? optionalString(body, 'userToken')
            : undefined,
        });
      }

      return json(200, await routes[route](environment, body));
    } catch (error) {
      if (error instanceof CircleHttpError) {
        return json(error.status, {
          message: error.message,
          ...(error.code !== undefined ? { code: error.code } : {}),
          ...(error.requestId ? { requestId: error.requestId } : {}),
        });
      }

      // Never forward an unknown error's detail: it may contain server
      // internals. Log it instead.
      onError(error);
      return json(500, {
        message: 'Unexpected Circle proxy error. Check the server logs.',
      });
    }
  };
};

export type CircleHandler = ReturnType<typeof createCircleHandler>;

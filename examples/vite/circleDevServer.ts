import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const CIRCLE_API_BASE = 'https://api.circle.com/v1/w3s';
const ROUTE_PREFIX = '/api/circle';

type CircleDevServerOptions = {
  apiKey?: string;
  environment: 'sandbox' | 'live';
  configuredEnvironment?: string;
};

type JsonObject = Record<string, unknown>;
type CircleConfigurationIssue = {
  id: string;
  envVar?: string;
  scope: 'client' | 'server';
  severity: 'error';
  message: string;
  docsUrl: string;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string | number,
    readonly requestId?: string
  ) {
    super(message);
  }
}

const apiKeyEnvironment = (
  apiKey: string | undefined
): 'sandbox' | 'live' | undefined =>
  apiKey?.startsWith('LIVE_API_KEY:')
    ? 'live'
    : apiKey?.startsWith('TEST_API_KEY:')
    ? 'sandbox'
    : undefined;

const configurationIssues = ({
  apiKey,
  environment,
  configuredEnvironment,
}: CircleDevServerOptions): CircleConfigurationIssue[] => {
  const docsUrl =
    'https://developers.circle.com/wallets/supported-blockchains';
  const issues: CircleConfigurationIssue[] = [];

  if (
    configuredEnvironment &&
    configuredEnvironment !== 'sandbox' &&
    configuredEnvironment !== 'live'
  ) {
    issues.push({
      id: 'invalidCircleEnvironment',
      envVar: 'VITE_CIRCLE_ENVIRONMENT',
      scope: 'client',
      severity: 'error',
      message:
        'VITE_CIRCLE_ENVIRONMENT must be exactly "sandbox" or "live". Sandbox uses Arc Testnet; live uses Base mainnet.',
      docsUrl,
    });
  }

  const detected = apiKeyEnvironment(apiKey);
  if (apiKey && !detected) {
    issues.push({
      id: 'unrecognizedCircleApiKey',
      envVar: 'CIRCLE_API_KEY',
      scope: 'server',
      severity: 'error',
      message:
        'CIRCLE_API_KEY is not a recognized TEST_API_KEY or LIVE_API_KEY. Copy a Wallets API key from Circle Console without quotes or whitespace.',
      docsUrl,
    });
  } else if (detected && detected !== environment) {
    issues.push({
      id: 'circleEnvironmentMismatch',
      scope: 'server',
      severity: 'error',
      message: `Circle is configured for ${environment}, but CIRCLE_API_KEY is a ${detected} key. Use TEST_API_KEY with Arc Testnet or LIVE_API_KEY with Base mainnet.`,
      docsUrl,
    });
  }

  return issues;
};

const readJson = async (request: IncomingMessage): Promise<JsonObject> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as JsonObject;
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
};

const requireString = (body: JsonObject, key: string): string => {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError(400, `Missing \`${key}\` in request body.`);
  }
  return value;
};

const sendJson = (
  response: ServerResponse,
  status: number,
  value: unknown
) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(value));
};

const unwrap = <T>(value: { data: T }): T => value.data;

/**
 * Development-only Circle backend for the Vite example.
 *
 * VITE_* values are intentionally used only for public browser configuration.
 * CIRCLE_API_KEY has no VITE_ prefix and is read by this Node process only.
 */
export const circleDevServer = ({
  apiKey,
  environment,
  configuredEnvironment,
}: CircleDevServerOptions): Plugin => ({
  name: 'circle-dev-server',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (!url.pathname.startsWith(ROUTE_PREFIX)) {
        next();
        return;
      }

      const route = url.pathname.slice(ROUTE_PREFIX.length);

      if (route === '/health' && request.method === 'GET') {
        const missing = [
          !apiKey && {
            id: 'apiKey',
            envVar: 'CIRCLE_API_KEY',
            scope: 'server',
          },
        ].filter(Boolean);

        const issues = configurationIssues({
          apiKey,
          environment,
          configuredEnvironment,
        });

        sendJson(response, 200, {
          ok: missing.length === 0 && issues.length === 0,
          missing,
          issues,
        });
        return;
      }

      if (!apiKey) {
        sendJson(response, 500, {
          message:
            'CIRCLE_API_KEY is not set. Add it to examples/vite/.env.local without a VITE_ prefix.',
        });
        return;
      }

      const environmentIssues = configurationIssues({
        apiKey,
        environment,
        configuredEnvironment,
      });
      if (environmentIssues.length > 0) {
        sendJson(response, 500, {
          code: 'CIRCLE_CONFIGURATION_ERROR',
          message: environmentIssues[0].message,
        });
        return;
      }

      if (request.method !== 'POST') {
        sendJson(response, 405, { message: 'Method not allowed.' });
        return;
      }

      try {
        const body = await readJson(request);
        const userToken =
          typeof body.userToken === 'string' ? body.userToken : undefined;

        let circlePath: string;
        let method: 'GET' | 'POST' = 'POST';
        let circleBody: JsonObject | undefined;

        switch (route) {
          case '/device-token':
            circlePath = '/users/social/token';
            circleBody = {
              idempotencyKey: crypto.randomUUID(),
              deviceId: requireString(body, 'deviceId'),
            };
            break;
          case '/email-otp':
            circlePath = '/users/email/token';
            circleBody = {
              idempotencyKey: crypto.randomUUID(),
              deviceId: requireString(body, 'deviceId'),
              email: requireString(body, 'email'),
            };
            break;
          case '/initialize-user':
            circlePath = '/user/initialize';
            circleBody = {
              idempotencyKey: crypto.randomUUID(),
              blockchains: [requireString(body, 'blockchain')],
              accountType: 'EOA',
            };
            break;
          case '/wallets':
            circlePath = '/wallets';
            method = 'GET';
            break;
          case '/sign-message':
            circlePath = '/user/sign/message';
            circleBody = {
              walletId: requireString(body, 'walletId'),
              message: requireString(body, 'message'),
              encodedByHex: body.encodedByHex ?? false,
            };
            break;
          case '/sign-typed-data':
            circlePath = '/user/sign/typedData';
            circleBody = {
              walletId: requireString(body, 'walletId'),
              data: requireString(body, 'data'),
            };
            break;
          case '/transaction':
            circlePath = '/user/transactions/contractExecution';
            circleBody = {
              idempotencyKey: crypto.randomUUID(),
              walletId: requireString(body, 'walletId'),
              contractAddress: requireString(body, 'destinationAddress'),
              callData: body.callData,
              amount: body.amount,
              feeLevel: body.feeLevel ?? 'MEDIUM',
            };
            break;
          default:
            throw new HttpError(404, 'Unknown Circle route.');
        }

        if (
          route !== '/device-token' &&
          route !== '/email-otp' &&
          !userToken
        ) {
          throw new HttpError(400, 'Missing `userToken` in request body.');
        }

        const requestId = crypto.randomUUID();
        const circleResponse = await fetch(`${CIRCLE_API_BASE}${circlePath}`, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-Request-Id': requestId,
            ...(userToken ? { 'X-User-Token': userToken } : {}),
          },
          body: circleBody ? JSON.stringify(circleBody) : undefined,
        });
        const text = await circleResponse.text();
        let result: JsonObject = {};
        if (text) {
          try {
            result = JSON.parse(text) as JsonObject;
          } catch {
            throw new HttpError(
              circleResponse.ok ? 502 : circleResponse.status,
              'Circle returned a non-JSON response.',
              'CIRCLE_INVALID_RESPONSE',
              requestId
            );
          }
        }

        if (!circleResponse.ok) {
          throw new HttpError(
            circleResponse.status,
            typeof result.message === 'string'
              ? result.message
              : circleResponse.statusText,
            typeof result.code === 'string' || typeof result.code === 'number'
              ? result.code
              : undefined,
            requestId
          );
        }

        const data = unwrap(result as { data: unknown });
        if (route === '/device-token' || route === '/email-otp') {
          sendJson(response, 200, data);
        } else if (route === '/wallets') {
          sendJson(response, 200, {
            wallets: (data as { wallets?: unknown[] }).wallets ?? [],
          });
        } else {
          sendJson(response, 200, {
            challengeId: (data as { challengeId: string }).challengeId,
          });
        }
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(response, error.status, {
            message: error.message,
            ...(error.code !== undefined ? { code: error.code } : {}),
            ...(error.requestId ? { requestId: error.requestId } : {}),
          });
          return;
        }

        console.error('[circle] unexpected dev-server error', error);
        sendJson(response, 500, {
          message: 'Unexpected Circle proxy error. Check the Vite server logs.',
        });
      }
    });
  },
});

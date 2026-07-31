import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const CIRCLE_API_BASE = 'https://api.circle.com/v1/w3s';
const ROUTE_PREFIX = '/api/circle';

type CircleDevServerOptions = {
  apiKey?: string;
};

type JsonObject = Record<string, unknown>;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

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
export const circleDevServer = ({ apiKey }: CircleDevServerOptions): Plugin => ({
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

        sendJson(response, 200, { ok: missing.length === 0, missing });
        return;
      }

      if (!apiKey) {
        sendJson(response, 500, {
          message:
            'CIRCLE_API_KEY is not set. Add it to examples/vite/.env.local without a VITE_ prefix.',
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

        const circleResponse = await fetch(`${CIRCLE_API_BASE}${circlePath}`, {
          method,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-Request-Id': crypto.randomUUID(),
            ...(userToken ? { 'X-User-Token': userToken } : {}),
          },
          body: circleBody ? JSON.stringify(circleBody) : undefined,
        });
        const text = await circleResponse.text();
        const result = text ? JSON.parse(text) : {};

        if (!circleResponse.ok) {
          throw new HttpError(
            circleResponse.status,
            result?.message ?? circleResponse.statusText
          );
        }

        const data = unwrap(result);
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
          sendJson(response, error.status, { message: error.message });
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

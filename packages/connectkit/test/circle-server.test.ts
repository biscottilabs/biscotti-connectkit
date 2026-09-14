import { describe, expect, test } from 'bun:test';
import { createServer } from 'node:http';

import {
  CircleHttpError,
  createCircleHandler,
  createCircleNodeMiddleware,
  readCircleServerEnv,
} from '../src/server';

type Call = { path: string; url: string; init: RequestInit };

const TEST_KEY = 'TEST_API_KEY:abc:def';
const LIVE_KEY = 'LIVE_API_KEY:abc:def';

const circleApi = (calls: Call[]) =>
  (async (url: URL | string, init: RequestInit) => {
    const parsed = new URL(String(url));
    calls.push({ path: parsed.pathname, url: String(url), init });

    const reply = (status: number, value: unknown) =>
      new Response(JSON.stringify(value), { status });

    switch (parsed.pathname) {
      case '/v1/w3s/users/social/token':
        return reply(200, {
          data: { deviceToken: 'dt', deviceEncryptionKey: 'dek' },
        });
      case '/v1/w3s/wallets':
        return reply(200, { data: { wallets: [{ id: 'w' }] } });
      case '/v1/w3s/user/initialize':
        return reply(409, { code: 155106, message: 'user already initialized' });
      case '/v1/w3s/users/token/refresh':
        return reply(200, {
          data: { userToken: 'nu', encryptionKey: 'ne', refreshToken: 'nr' },
        });
      default:
        return reply(200, { data: { challengeId: 'c1' } });
    }
  }) as unknown as typeof fetch;

const headersOf = (call: Call) => call.init.headers as Record<string, string>;
const bodyOf = (call: Call) => JSON.parse(call.init.body as string);

const setup = (options: Partial<Parameters<typeof createCircleHandler>[0]> = {}) => {
  const calls: Call[] = [];
  const handler = createCircleHandler({
    environments: {
      testnet: { apiKey: TEST_KEY },
      mainnet: { apiKey: LIVE_KEY },
    },
    fetch: circleApi(calls),
    ...options,
  });
  const post = (route: string, body: unknown, environment?: string) =>
    handler(
      new Request(`http://app/api/circle/${route}`, {
        method: 'POST',
        headers: environment ? { 'X-Circle-Environment': environment } : {},
        body: JSON.stringify(body),
      })
    );
  return { calls, handler, post };
};

describe('environment routing', () => {
  test('uses the key for the requested environment', async () => {
    const { calls, post } = setup();

    const res = await post('device-token', { deviceId: 'd' }, 'testnet');
    expect(await res.json()).toEqual({ deviceToken: 'dt', deviceEncryptionKey: 'dek' });
    await post('device-token', { deviceId: 'd' }, 'mainnet');

    expect(headersOf(calls[0]).Authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(headersOf(calls[1]).Authorization).toBe(`Bearer ${LIVE_KEY}`);
  });

  test('requires the header when two environments have keys', async () => {
    const { post } = setup();
    expect((await post('device-token', { deviceId: 'd' })).status).toBe(400);
  });

  test('uses the only configured environment without a header', async () => {
    const { post } = setup({ environments: { testnet: { apiKey: TEST_KEY } } });
    expect((await post('device-token', { deviceId: 'd' })).status).toBe(200);
  });

  test('rejects an unknown environment value', async () => {
    const { post } = setup();
    expect((await post('device-token', { deviceId: 'd' }, 'live')).status).toBe(400);
  });

  test('refuses an environment without a key', async () => {
    const { post } = setup({ environments: { testnet: { apiKey: TEST_KEY } } });
    const res = await post('device-token', { deviceId: 'd' }, 'mainnet');
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('CIRCLE_ENVIRONMENT_NOT_CONFIGURED');
  });

  test('rejects a blockchain from the other environment before calling Circle', async () => {
    const { calls, post } = setup();
    const res = await post(
      'initialize-user',
      { userToken: 'u', blockchain: 'BASE' },
      'testnet'
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('CIRCLE_ENVIRONMENT_MISMATCH');
    expect(calls).toHaveLength(0);
  });
});

describe('routes', () => {
  test('passes through Circle error codes with a request id', async () => {
    const { calls, post } = setup();
    const res = await post(
      'initialize-user',
      { userToken: 'u', blockchain: 'ARC-TESTNET', accountType: 'SCA' },
      'testnet'
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe(155106);
    expect(body.requestId).toBeString();
    expect(bodyOf(calls[0]).accountType).toBe('SCA');
  });

  test('wallets sends the user token as a header, never in the URL', async () => {
    const { calls, post } = setup();
    const res = await post(
      'wallets',
      { userToken: 'secret-token', blockchain: 'ARC-TESTNET' },
      'testnet'
    );
    expect(await res.json()).toEqual({ wallets: [{ id: 'w' }] });
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].url).toContain('blockchain=ARC-TESTNET');
    expect(calls[0].url).not.toContain('secret-token');
    expect(headersOf(calls[0])['X-User-Token']).toBe('secret-token');
  });

  test('create-wallet', async () => {
    const { calls, post } = setup();
    const res = await post(
      'create-wallet',
      { userToken: 'u', blockchain: 'BASE-SEPOLIA', accountType: 'SCA' },
      'testnet'
    );
    expect(await res.json()).toEqual({ challengeId: 'c1' });
    expect(calls[0].path).toBe('/v1/w3s/user/wallets');
    expect(bodyOf(calls[0])).toMatchObject({
      blockchains: ['BASE-SEPOLIA'],
      accountType: 'SCA',
    });
    expect(bodyOf(calls[0]).idempotencyKey).toBeString();
  });

  test('refresh-token', async () => {
    const { calls, post } = setup();
    const res = await post(
      'refresh-token',
      { userToken: 'u', refreshToken: 'r', deviceId: 'd' },
      'testnet'
    );
    expect(await res.json()).toEqual({
      userToken: 'nu',
      encryptionKey: 'ne',
      refreshToken: 'nr',
    });
    expect(calls[0].path).toBe('/v1/w3s/users/token/refresh');
    expect(headersOf(calls[0])['X-User-Token']).toBe('u');
    expect(bodyOf(calls[0])).toMatchObject({ refreshToken: 'r', deviceId: 'd' });
  });

  test('validates input', async () => {
    const { post } = setup();
    expect(
      (await post('transaction', { userToken: 'u', walletId: 'w' }, 'testnet')).status
    ).toBe(400);
    expect(
      (
        await post(
          'transaction',
          { userToken: 'u', walletId: 'w', destinationAddress: '0x1', feeLevel: 'FAST' },
          'testnet'
        )
      ).status
    ).toBe(400);
    expect((await post('wallets', {}, 'testnet')).status).toBe(400);
    expect((await post('refresh-token', { userToken: 'u' }, 'testnet')).status).toBe(400);
    expect((await post('unknown', {}, 'testnet')).status).toBe(404);
  });

  test('authorize can reject a request', async () => {
    const { post } = setup({
      environments: { testnet: { apiKey: TEST_KEY } },
      authorize: ({ route, userToken }) => {
        if (route === 'sign-message' && userToken !== 'mine') {
          throw new CircleHttpError(403, 'Not your wallet.');
        }
      },
    });
    const sign = (userToken: string) =>
      post('sign-message', { userToken, walletId: 'w', message: '' });

    expect((await sign('someone-else')).status).toBe(403);
    expect((await sign('mine')).status).toBe(200);
  });

  test('unexpected errors are not forwarded', async () => {
    const logged: unknown[] = [];
    const handler = createCircleHandler({
      environments: { testnet: { apiKey: TEST_KEY } },
      fetch: (async () => {
        throw new Error('internal detail');
      }) as unknown as typeof fetch,
      onError: (error) => logged.push(error),
    });
    const res = await handler(
      new Request('http://app/api/circle/device-token', {
        method: 'POST',
        body: JSON.stringify({ deviceId: 'd' }),
      })
    );
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('internal detail');
    expect(logged).toHaveLength(1);
  });
});

describe('health', () => {
  test('reports each environment without exposing keys', async () => {
    const { handler, post } = setup({
      environments: {
        testnet: { apiKey: 'LIVE_API_KEY:wrong-env', envVar: 'CIRCLE_TESTNET_API_KEY' },
        mainnet: { envVar: 'CIRCLE_MAINNET_API_KEY' },
      },
    });

    const res = await handler(new Request('http://app/api/circle/health'));
    const text = await res.text();
    expect(text).not.toContain('wrong-env');

    const report = JSON.parse(text);
    expect(report.environments.testnet.issues[0].id).toBe('apiKeyEnvironmentMismatch');
    expect(report.environments.mainnet.missing[0].envVar).toBe('CIRCLE_MAINNET_API_KEY');

    expect((await post('device-token', { deviceId: 'd' }, 'testnet')).status).toBe(500);
  });
});

describe('readCircleServerEnv', () => {
  test('reads per-environment keys', () => {
    const env = readCircleServerEnv({
      CIRCLE_TESTNET_API_KEY: TEST_KEY,
      CIRCLE_ENVIRONMENT: 'testnet',
    });
    expect(env.environments.testnet).toEqual({
      apiKey: TEST_KEY,
      envVar: 'CIRCLE_TESTNET_API_KEY',
    });
    expect(env.environments.mainnet).toEqual({ envVar: 'CIRCLE_MAINNET_API_KEY' });
    expect(env.defaultEnvironment).toBe('testnet');
  });

  test('assigns a legacy CIRCLE_API_KEY by prefix', () => {
    const env = readCircleServerEnv({
      CIRCLE_API_KEY: LIVE_KEY,
      NEXT_PUBLIC_CIRCLE_ENVIRONMENT: 'mainnet',
    });
    expect(env.environments.mainnet).toEqual({
      apiKey: LIVE_KEY,
      envVar: 'CIRCLE_API_KEY',
    });
    expect(env.defaultEnvironment).toBe('mainnet');
  });
});

describe('createCircleNodeMiddleware', () => {
  test('serves routes under the base path and passes others on', async () => {
    const { handler } = setup();
    const middleware = createCircleNodeMiddleware(handler);
    const server = createServer((req, res) => void middleware(req, res));
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as { port: number };

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/circle/device-token`, {
        method: 'POST',
        headers: { 'X-Circle-Environment': 'testnet' },
        body: JSON.stringify({ deviceId: 'd' }),
      });
      expect(res.status).toBe(200);
      expect((await fetch(`http://127.0.0.1:${port}/other`)).status).toBe(404);
    } finally {
      server.close();
    }
  });
});

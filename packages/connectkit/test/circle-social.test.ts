import { beforeEach, describe, expect, test } from 'bun:test';

import { memoryStorage, sdkCalls, sdkState } from './mockCircleSdk';

const { resolveCircleConfig } = await import('../src/circle/config');
const {
  beginAppleLogin,
  beginRedirectLogin,
  prepareAppleLogin,
  resumeSocialLogin,
  shouldResumeSocialLogin,
} = await import('../src/circle/login');
const { readPendingLogin, readSession } = await import('../src/circle/session');
const { preflightCircleConfig } = await import('../src/circle/preflight');

const ARC_TESTNET = 5042002;

const browser = globalThis as unknown as {
  location: { origin: string; pathname: string; search: string; hash: string };
  history: { state: unknown; replaceState: (...args: unknown[]) => void };
  document: { title: string };
};
browser.document ??= { title: '' };
browser.history ??= { state: null, replaceState: () => undefined };

let storage: ReturnType<typeof memoryStorage>;
let logins: unknown[];
let deviceTokenRequests: number;

const circle = () =>
  resolveCircleConfig(
    {
      environment: 'testnet',
      appId: 'app',
      storage,
      google: { clientId: 'google-client' },
      facebook: { appId: 'fb-app' },
      apple: { apiKey: 'firebase-key', authDomain: 'app.firebaseapp.com' },
      onLogin: (event) => logins.push(event),
    },
    [ARC_TESTNET]
  );

const adapter = () =>
  ({
    createDeviceToken: async () => {
      deviceTokenRequests++;
      return { deviceToken: `dt-${deviceTokenRequests}`, deviceEncryptionKey: 'dek' };
    },
  }) as never;

const scope = () => ({ environment: 'testnet' as const, appId: 'app', storage });

const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 50 && !condition(); i++) await Bun.sleep(1);
  expect(condition()).toBe(true);
};

const loginResult = {
  userToken: 'user-token',
  encryptionKey: 'enc',
  refreshToken: 'refresh',
  oAuthInfo: { socialUserInfo: { email: 'user@example.com' } },
};

beforeEach(() => {
  storage = memoryStorage();
  logins = [];
  deviceTokenRequests = 0;
  sdkCalls.length = 0;
  sdkState.onLoginComplete = undefined;
  browser.location = {
    origin: 'http://app.test',
    pathname: '/',
    search: '',
    hash: '',
  };
});

describe('Facebook redirect login', () => {
  test('saves the provider before redirecting', async () => {
    await beginRedirectLogin({
      circle: circle(),
      adapter: adapter(),
      chainId: ARC_TESTNET,
      provider: 'facebook',
    });

    expect(readPendingLogin(scope())).toMatchObject({
      provider: 'facebook',
      deviceToken: 'dt-1',
      chainId: ARC_TESTNET,
    });
    expect(sdkCalls).toContain('performLogin:Facebook');
  });

  test('resumes after the redirect and reports the provider', async () => {
    await beginRedirectLogin({
      circle: circle(),
      adapter: adapter(),
      chainId: ARC_TESTNET,
      provider: 'facebook',
    });
    browser.location.hash = '#access_token=abc&state=xyz';
    expect(shouldResumeSocialLogin(circle())).toBe(true);

    const resumed = resumeSocialLogin(circle());
    await waitFor(() => sdkState.onLoginComplete !== undefined);
    sdkState.onLoginComplete!(undefined, loginResult);

    const session = await resumed;
    expect(session?.userToken).toBe('user-token');
    expect(readSession(scope())?.userToken).toBe('user-token');
    expect(readPendingLogin(scope())).toBeNull();
    expect(logins).toEqual([
      { environment: 'testnet', method: 'facebook', email: 'user@example.com' },
    ]);
  });

  test('reports provider errors by name', async () => {
    await beginRedirectLogin({
      circle: circle(),
      adapter: adapter(),
      chainId: ARC_TESTNET,
      provider: 'facebook',
    });
    browser.location.hash = '#state=xyz&error=denied';

    const resumed = resumeSocialLogin(circle());
    await waitFor(() => sdkState.onLoginComplete !== undefined);
    sdkState.onLoginComplete!({ code: 155140, message: 'denied' }, undefined);

    await expect(resumed).rejects.toThrow('Facebook sign-in failed (code 155140)');
  });

  test('nothing to resume without a pending login', async () => {
    browser.location.hash = '#access_token=abc&state=xyz';
    expect(await resumeSocialLogin(circle())).toBeNull();
  });
});

describe('Apple popup login', () => {
  test('uses the prepared device token and resolves in place', async () => {
    const backend = adapter();
    prepareAppleLogin({ circle: circle(), adapter: backend });
    prepareAppleLogin({ circle: circle(), adapter: backend });

    const login = beginAppleLogin({
      circle: circle(),
      adapter: backend,
      chainId: ARC_TESTNET,
    });
    await waitFor(() => sdkCalls.includes('performLogin:Apple'));
    sdkState.onLoginComplete!(undefined, loginResult);

    const session = await login;
    expect(deviceTokenRequests).toBe(1);
    expect(session.email).toBe('user@example.com');
    expect(readSession(scope())?.userToken).toBe('user-token');
    expect(logins).toEqual([
      { environment: 'testnet', method: 'apple', email: 'user@example.com' },
    ]);
  });

  test('fetches a token when none was prepared', async () => {
    const login = beginAppleLogin({
      circle: circle(),
      adapter: adapter(),
      chainId: ARC_TESTNET,
    });
    await waitFor(() => sdkCalls.includes('performLogin:Apple'));
    sdkState.onLoginComplete!(undefined, loginResult);

    await login;
    expect(deviceTokenRequests).toBe(1);
  });

  test('requires the Firebase config', async () => {
    const withoutApple = resolveCircleConfig(
      { environment: 'testnet', appId: 'app', storage },
      [ARC_TESTNET]
    );
    await expect(
      beginAppleLogin({ circle: withoutApple, adapter: adapter(), chainId: ARC_TESTNET })
    ).rejects.toThrow('circle.apple');
  });
});

describe('preflight for social providers', () => {
  const errors = (options: Parameters<typeof preflightCircleConfig>[0]) =>
    preflightCircleConfig(options, [ARC_TESTNET])
      .filter((issue) => issue.severity === 'error')
      .map((issue) => issue.id);

  test('missing Facebook app ID and Apple config', () => {
    expect(
      errors({ environment: 'testnet', appId: 'app', methods: ['facebook', 'apple'] })
    ).toEqual(['facebookAppId', 'appleFirebaseConfig']);
  });

  test('configured providers only produce console reminders', () => {
    const issues = preflightCircleConfig(
      {
        environment: 'testnet',
        appId: 'app',
        methods: ['facebook', 'apple'],
        facebook: { appId: 'fb' },
        apple: { apiKey: 'k', authDomain: 'd' },
      },
      [ARC_TESTNET]
    );
    expect(issues.map((issue) => issue.id)).toEqual([
      'facebookConsoleConfig',
      'appleConsoleConfig',
    ]);
  });
});

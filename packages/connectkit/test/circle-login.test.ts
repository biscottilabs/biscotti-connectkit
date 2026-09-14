import { beforeEach, describe, expect, test } from 'bun:test';

import { memoryStorage, sdkCalls } from './mockCircleSdk';

const { resolveCircleConfig } = await import('../src/circle/config');
const { ensureWallet, refreshSessionIfStale } = await import(
  '../src/circle/login'
);
const { clearSession, readSession, saveSession } = await import(
  '../src/circle/session'
);
const { CircleBackendError } = await import('../src/circle/backend');

const ARC_TESTNET = 5042002;
const BASE_SEPOLIA = 84532;
const DAY = 24 * 60 * 60 * 1000;

let storage: ReturnType<typeof memoryStorage>;
let events: unknown[];

const makeCircle = (extra: Record<string, unknown> = {}) =>
  resolveCircleConfig(
    {
      environment: 'testnet',
      appId: 'app',
      storage,
      appearance: { themeColor: { backdrop: '#000' } as never },
      onWallet: (event) => events.push(event),
      ...extra,
    },
    [ARC_TESTNET, BASE_SEPOLIA]
  );

const scope = () => ({ environment: 'testnet' as const, appId: 'app', storage });

type Wallet = { id: string; address: string; blockchain: string };

const makeAdapter = () => {
  const calls: string[] = [];
  let wallets: Wallet[] = [];
  return {
    calls,
    setWallets: (next: Wallet[]) => {
      wallets = next;
    },
    createDeviceToken: async () => ({ deviceToken: '', deviceEncryptionKey: '' }),
    listWallets: async () => {
      calls.push('listWallets');
      return wallets;
    },
    initializeUser: async (): Promise<{ challengeId: string }> => {
      calls.push('initializeUser');
      return { challengeId: 'init' };
    },
    createWallet: async (): Promise<{ challengeId: string }> => {
      calls.push('createWallet');
      return { challengeId: 'create' };
    },
    refreshUserToken: undefined as
      | undefined
      | ((input: {
          userToken: string;
          refreshToken: string;
          deviceId: string;
        }) => Promise<{ userToken: string; refreshToken?: string }>),
    signMessage: async () => ({ challengeId: '' }),
    signTypedData: async () => ({ challengeId: '' }),
    createTransaction: async () => ({ challengeId: '' }),
  };
};

const arcWallet = { id: 'w1', address: '0x1', blockchain: 'ARC-TESTNET' };
const session = { userToken: 'u', encryptionKey: 'e', createdAt: Date.now() };

beforeEach(() => {
  storage = memoryStorage();
  events = [];
  sdkCalls.length = 0;
});

describe('ensureWallet', () => {
  test('new user: initializeUser, then a created event', async () => {
    const adapter = makeAdapter();
    adapter.initializeUser = async () => {
      adapter.calls.push('initializeUser');
      adapter.setWallets([arcWallet]);
      return { challengeId: 'init' };
    };
    saveSession(scope(), session);

    const wallet = await ensureWallet({
      circle: makeCircle(),
      adapter,
      chainId: ARC_TESTNET,
      session,
    });

    expect(wallet.id).toBe('w1');
    expect(adapter.calls).toEqual(['listWallets', 'initializeUser', 'listWallets']);
    expect(events).toEqual([{ environment: 'testnet', wallet, created: true }]);
    expect(sdkCalls).toContain('execute');
    expect(sdkCalls).toContain('setThemeColor');
    expect(readSession(scope())?.walletId).toBe('w1');
  });

  test('user with a wallet elsewhere gets createWallet', async () => {
    const adapter = makeAdapter();
    adapter.setWallets([arcWallet]);
    adapter.createWallet = async () => {
      adapter.calls.push('createWallet');
      adapter.setWallets([
        arcWallet,
        { id: 'w2', address: '0x2', blockchain: 'BASE-SEPOLIA' },
      ]);
      return { challengeId: 'create' };
    };

    const wallet = await ensureWallet({
      circle: makeCircle(),
      adapter,
      chainId: BASE_SEPOLIA,
      session,
    });

    expect(wallet.id).toBe('w2');
    expect(adapter.calls).toEqual(['listWallets', 'createWallet', 'listWallets']);
  });

  test('155106 from initializeUser falls back to createWallet', async () => {
    const adapter = makeAdapter();
    adapter.initializeUser = async () => {
      adapter.calls.push('initializeUser');
      throw new CircleBackendError('/initialize-user', 409, 'already', {
        code: 155106,
      });
    };
    adapter.createWallet = async () => {
      adapter.calls.push('createWallet');
      adapter.setWallets([arcWallet]);
      return { challengeId: 'create' };
    };

    const wallet = await ensureWallet({
      circle: makeCircle(),
      adapter,
      chainId: ARC_TESTNET,
      session,
    });

    expect(wallet.id).toBe('w1');
    expect(adapter.calls).toEqual([
      'listWallets',
      'initializeUser',
      'createWallet',
      'listWallets',
    ]);
  });

  test('existing wallet needs no challenge', async () => {
    const adapter = makeAdapter();
    adapter.setWallets([arcWallet]);

    await ensureWallet({ circle: makeCircle(), adapter, chainId: ARC_TESTNET, session });

    expect(sdkCalls).not.toContain('execute');
    expect(events).toEqual([
      { environment: 'testnet', wallet: arcWallet, created: false },
    ]);
  });

  test('an adapter without createWallet explains what is missing', async () => {
    const adapter = { ...makeAdapter(), createWallet: undefined };
    adapter.setWallets([arcWallet]);

    await expect(
      ensureWallet({ circle: makeCircle(), adapter, chainId: BASE_SEPOLIA, session })
    ).rejects.toThrow('createWallet');
  });

  test('a chain from the other environment is rejected', async () => {
    await expect(
      ensureWallet({
        circle: makeCircle(),
        adapter: makeAdapter(),
        chainId: 8453,
        session,
      })
    ).rejects.toThrow('mainnet');
  });

  test('a throwing event handler does not break the flow', async () => {
    const adapter = makeAdapter();
    adapter.setWallets([arcWallet]);
    const originalError = console.error;
    console.error = () => undefined;

    const wallet = await ensureWallet({
      circle: makeCircle({
        onWallet: () => {
          throw new Error('app bug');
        },
      }),
      adapter,
      chainId: ARC_TESTNET,
      session,
    });

    console.error = originalError;
    expect(wallet.id).toBe('w1');
  });
});

describe('refreshSessionIfStale', () => {
  const stale = () => ({
    userToken: 'old',
    encryptionKey: 'e',
    refreshToken: 'r',
    walletId: 'w',
    createdAt: Date.now() - 2 * DAY,
  });

  test('a fresh session is returned untouched', async () => {
    const adapter = makeAdapter();
    adapter.refreshUserToken = async () => {
      throw new Error('should not refresh');
    };
    const fresh = { ...stale(), createdAt: Date.now() };

    expect(
      await refreshSessionIfStale({ circle: makeCircle(), adapter, session: fresh })
    ).toBe(fresh);
  });

  test('a stale session is renewed once, even when called concurrently', async () => {
    const adapter = makeAdapter();
    let requests = 0;
    adapter.refreshUserToken = async (input) => {
      requests++;
      expect(input).toEqual({
        userToken: 'old',
        refreshToken: 'r',
        deviceId: 'device-1',
      });
      return { userToken: 'new', refreshToken: 'r2' };
    };
    const circle = makeCircle();
    const current = stale();

    const [first, second] = await Promise.all([
      refreshSessionIfStale({ circle, adapter, session: current }),
      refreshSessionIfStale({ circle, adapter, session: current }),
    ]);

    expect(requests).toBe(1);
    expect(first).toBe(second);
    expect(first?.userToken).toBe('new');
    expect(first?.encryptionKey).toBe('e');

    const saved = readSession(scope());
    expect(saved?.userToken).toBe('new');
    expect(saved?.refreshToken).toBe('r2');
    expect(saved?.walletId).toBe('w');
    expect(Date.now() - (saved?.createdAt ?? 0)).toBeLessThan(1000);
  });

  test('a rejected token clears the session', async () => {
    const adapter = makeAdapter();
    adapter.refreshUserToken = async () => {
      throw new CircleBackendError('/refresh-token', 401, 'invalid');
    };
    const current = stale();
    saveSession(scope(), current);

    expect(
      await refreshSessionIfStale({ circle: makeCircle(), adapter, session: current })
    ).toBeNull();
    expect(readSession(scope())).toBeNull();
  });

  test('a network failure keeps the session', async () => {
    const adapter = makeAdapter();
    adapter.refreshUserToken = async () => {
      throw new CircleBackendError('/refresh-token', 0, 'offline');
    };
    const current = stale();

    expect(
      await refreshSessionIfStale({ circle: makeCircle(), adapter, session: current })
    ).toBe(current);
  });
});

describe('session storage', () => {
  test('records are scoped by environment and App ID', () => {
    saveSession(scope(), session);

    expect(readSession({ ...scope(), environment: 'mainnet' })).toBeNull();
    expect(readSession({ ...scope(), appId: 'other-app' })).toBeNull();
    expect([...storage.map.keys()]).toEqual([]);
  });

  test('clearSession without an environment clears both', () => {
    saveSession({ environment: 'testnet', storage }, session);
    saveSession({ environment: 'mainnet', storage }, session);

    clearSession({ storage });

    expect(storage.map.size).toBe(0);
  });
});

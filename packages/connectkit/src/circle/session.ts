import { CIRCLE_ENVIRONMENTS, type CircleEnvironment } from './chains';

/**
 * Records are keyed by environment: a testnet token is useless to a mainnet
 * key, but switching back should not lose it. Each also stores its App ID and
 * is dropped if that changes.
 *
 * `sessionStorage` because the user token is a bearer credential.
 */

const SESSION_KEY = 'ck-circle-session';
const PENDING_KEY = 'ck-circle-pending';

// Circle user tokens last 14 days; expire five minutes early.
const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000;

const PENDING_TTL_MS = 10 * 60 * 1000;

export type CircleSessionScope = {
  environment: CircleEnvironment;
  appId?: string;
};

/** Saved before the Google redirect, which discards all in-memory state. */
export type CirclePendingLogin = {
  deviceToken: string;
  deviceEncryptionKey: string;
  chainId: number;
  appId?: string;
  createdAt: number;
};

export type CircleSession = {
  userToken: string;
  encryptionKey: string;
  refreshToken?: string;
  email?: string;
  walletId?: string;
  address?: string;
  chainId?: number;
  environment?: CircleEnvironment;
  appId?: string;
  createdAt: number;
};

const storage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const read = <T>(key: string): T | null => {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const write = (key: string, value: unknown) => {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or disabled */
  }
};

const remove = (key: string) => {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* storage disabled */
  }
};

const keyFor = (base: string, environment: CircleEnvironment) =>
  `${base}:${environment}`;

const belongsToApp = (record: { appId?: string }, appId?: string) =>
  !appId || !record.appId || record.appId === appId;

export const savePendingLogin = (
  scope: CircleSessionScope,
  pending: Omit<CirclePendingLogin, 'createdAt' | 'appId'>
) =>
  write(keyFor(PENDING_KEY, scope.environment), {
    ...pending,
    appId: scope.appId,
    createdAt: Date.now(),
  });

export const readPendingLogin = (
  scope: CircleSessionScope
): CirclePendingLogin | null => {
  const key = keyFor(PENDING_KEY, scope.environment);
  const pending = read<CirclePendingLogin>(key);
  if (!pending) return null;

  if (
    Date.now() - pending.createdAt > PENDING_TTL_MS ||
    !belongsToApp(pending, scope.appId)
  ) {
    remove(key);
    return null;
  }

  return pending;
};

export const clearPendingLogin = (scope: CircleSessionScope) =>
  remove(keyFor(PENDING_KEY, scope.environment));

export const saveSession = (
  scope: CircleSessionScope,
  session: Omit<CircleSession, 'createdAt' | 'environment' | 'appId'>
) =>
  write(keyFor(SESSION_KEY, scope.environment), {
    ...session,
    environment: scope.environment,
    appId: scope.appId,
    createdAt: Date.now(),
  });

export const updateSession = (
  scope: CircleSessionScope,
  patch: Partial<Omit<CircleSession, 'environment' | 'appId'>>
) => {
  const key = keyFor(SESSION_KEY, scope.environment);
  const current = read<CircleSession>(key);
  if (!current) return;
  write(key, { ...current, ...patch });
};

export const readSession = (
  scope: CircleSessionScope
): CircleSession | null => {
  const key = keyFor(SESSION_KEY, scope.environment);
  const session = read<CircleSession>(key);
  if (!session) return null;

  if (isSessionExpired(session) || !belongsToApp(session, scope.appId)) {
    remove(key);
    return null;
  }

  return session;
};

export const isSessionExpired = (session: CircleSession): boolean =>
  Date.now() - session.createdAt > TOKEN_TTL_MS;

/** Without an environment, clears both plus the unscoped legacy keys. */
export const clearSession = (environment?: CircleEnvironment) => {
  const environments = environment ? [environment] : CIRCLE_ENVIRONMENTS;
  for (const env of environments) {
    remove(keyFor(SESSION_KEY, env));
    remove(keyFor(PENDING_KEY, env));
  }
  if (!environment) {
    remove(SESSION_KEY);
    remove(PENDING_KEY);
  }
};

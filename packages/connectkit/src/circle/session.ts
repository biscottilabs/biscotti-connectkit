import { CIRCLE_ENVIRONMENTS, type CircleEnvironment } from './chains';
import type { CircleStorage, CircleStorageOption } from './types';

/**
 * Records are keyed by environment: a testnet token is useless to a mainnet
 * key, but switching back should not lose it. Each also stores its App ID and
 * is dropped if that changes.
 */

const SESSION_KEY = 'ck-circle-session';
const PENDING_KEY = 'ck-circle-pending';

// Circle user tokens last 14 days; expire five minutes early.
const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000;

const PENDING_TTL_MS = 10 * 60 * 1000;

export type CircleSessionScope = {
  environment: CircleEnvironment;
  appId?: string;
  storage?: CircleStorageOption;
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

const resolveStorage = (option?: CircleStorageOption): CircleStorage | null => {
  if (option && typeof option === 'object') return option;
  if (typeof window === 'undefined') return null;
  try {
    return option === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

const read = <T>(option: CircleStorageOption | undefined, key: string): T | null => {
  const store = resolveStorage(option);
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const write = (
  option: CircleStorageOption | undefined,
  key: string,
  value: unknown
) => {
  const store = resolveStorage(option);
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or disabled */
  }
};

const remove = (option: CircleStorageOption | undefined, key: string) => {
  const store = resolveStorage(option);
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
  write(scope.storage, keyFor(PENDING_KEY, scope.environment), {
    ...pending,
    appId: scope.appId,
    createdAt: Date.now(),
  });

export const readPendingLogin = (
  scope: CircleSessionScope
): CirclePendingLogin | null => {
  const key = keyFor(PENDING_KEY, scope.environment);
  const pending = read<CirclePendingLogin>(scope.storage, key);
  if (!pending) return null;

  if (
    Date.now() - pending.createdAt > PENDING_TTL_MS ||
    !belongsToApp(pending, scope.appId)
  ) {
    remove(scope.storage, key);
    return null;
  }

  return pending;
};

export const clearPendingLogin = (scope: CircleSessionScope) =>
  remove(scope.storage, keyFor(PENDING_KEY, scope.environment));

export const saveSession = (
  scope: CircleSessionScope,
  session: Omit<CircleSession, 'createdAt' | 'environment' | 'appId'>
) =>
  write(scope.storage, keyFor(SESSION_KEY, scope.environment), {
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
  const current = read<CircleSession>(scope.storage, key);
  if (!current) return;
  write(scope.storage, key, { ...current, ...patch });
};

export const readSession = (
  scope: CircleSessionScope
): CircleSession | null => {
  const key = keyFor(SESSION_KEY, scope.environment);
  const session = read<CircleSession>(scope.storage, key);
  if (!session) return null;

  if (isSessionExpired(session) || !belongsToApp(session, scope.appId)) {
    remove(scope.storage, key);
    return null;
  }

  return session;
};

export const isSessionExpired = (session: CircleSession): boolean =>
  Date.now() - session.createdAt > TOKEN_TTL_MS;

/** Without an environment, clears both plus the unscoped legacy keys. */
export const clearSession = ({
  environment,
  storage,
}: Partial<CircleSessionScope> = {}) => {
  const environments = environment ? [environment] : CIRCLE_ENVIRONMENTS;
  for (const env of environments) {
    remove(storage, keyFor(SESSION_KEY, env));
    remove(storage, keyFor(PENDING_KEY, env));
  }
  if (!environment) {
    remove(storage, SESSION_KEY);
    remove(storage, PENDING_KEY);
  }
};

import { CIRCLE_ENVIRONMENTS, type CircleEnvironment } from './chains';

/**
 * Session persistence for the Circle integration.
 *
 * Two distinct records live here:
 *
 *  - `pending`: written immediately *before* the Google OAuth redirect. Google
 *    navigates the whole page away, so every scrap of in-memory state is lost.
 *    Without this the SDK cannot process the OAuth response when the user
 *    returns, because the device token it was configured with is gone.
 *  - `session`: the authenticated result, kept so a page refresh does not force
 *    the user back through Google while their token is still valid.
 *
 * Both are keyed by Circle environment. A testnet user token is meaningless to
 * a mainnet API key (and vice versa), so an app that changes environment must
 * not pick up the other environment's session — but it should not destroy it
 * either, since switching back is common during development. Each record also
 * remembers the App ID it was created under and is discarded if that changes.
 *
 * Storage is `sessionStorage`, not `localStorage`: the user token is a bearer
 * credential and should not outlive the browser tab. Note that any storage
 * readable by JavaScript is readable by injected script, so a site with an XSS
 * hole leaks this token — Circle's token expiry is what bounds the damage.
 */

const SESSION_KEY = 'ck-circle-session';
const PENDING_KEY = 'ck-circle-pending';

/**
 * Circle social/email user tokens expire after 14 days. Expire five minutes
 * early to avoid handing a token to a challenge at the end of its lifetime.
 * The refresh token is retained in the session so applications can add Circle's
 * refresh endpoint without changing the stored shape.
 */
const TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000;

/** OAuth round trips are fast; anything older is a stale tab, not a redirect. */
const PENDING_TTL_MS = 10 * 60 * 1000;

/** Identifies which Circle app and environment a record belongs to. */
export type CircleSessionScope = {
  environment: CircleEnvironment;
  appId?: string;
};

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
    // Private browsing modes and sandboxed iframes can throw on access.
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
    /* quota or disabled storage — the flow still works, just without resume */
  }
};

const remove = (key: string) => {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* nothing useful to do */
  }
};

const keyFor = (base: string, environment: CircleEnvironment) =>
  `${base}:${environment}`;

/** A record made under a different App ID belongs to a different Circle app. */
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

/** Merges into the existing session, e.g. to attach a wallet after login. */
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

/**
 * Clears one environment's session and pending login. With no environment,
 * clears both — plus the unscoped keys written by earlier versions.
 */
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

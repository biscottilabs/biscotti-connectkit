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

export type CirclePendingLogin = {
  deviceToken: string;
  deviceEncryptionKey: string;
  chainId: number;
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

export const savePendingLogin = (
  pending: Omit<CirclePendingLogin, 'createdAt'>
) => write(PENDING_KEY, { ...pending, createdAt: Date.now() });

export const readPendingLogin = (): CirclePendingLogin | null => {
  const pending = read<CirclePendingLogin>(PENDING_KEY);
  if (!pending) return null;

  if (Date.now() - pending.createdAt > PENDING_TTL_MS) {
    remove(PENDING_KEY);
    return null;
  }

  return pending;
};

export const clearPendingLogin = () => remove(PENDING_KEY);

export const saveSession = (session: Omit<CircleSession, 'createdAt'>) =>
  write(SESSION_KEY, { ...session, createdAt: Date.now() });

/** Merges into the existing session, e.g. to attach a wallet after login. */
export const updateSession = (patch: Partial<CircleSession>) => {
  const current = read<CircleSession>(SESSION_KEY);
  if (!current) return;
  write(SESSION_KEY, { ...current, ...patch });
};

export const readSession = (): CircleSession | null => {
  const session = read<CircleSession>(SESSION_KEY);
  if (!session) return null;

  if (isSessionExpired(session)) {
    remove(SESSION_KEY);
    return null;
  }

  return session;
};

export const isSessionExpired = (session: CircleSession): boolean =>
  Date.now() - session.createdAt > TOKEN_TTL_MS;

export const clearSession = () => {
  remove(SESSION_KEY);
  remove(PENDING_KEY);
};

import type { CircleChainMap } from './chains';

/**
 * Login methods Circle exposes for user-controlled wallets. Only `google` is
 * implemented today; the rest are declared so the option type is stable and
 * enabling one later is not a breaking change.
 */
export type CircleLoginMethod = 'google' | 'email' | 'pin' | 'facebook' | 'apple';

export const CIRCLE_IMPLEMENTED_METHODS: CircleLoginMethod[] = ['google'];

/**
 * Where a piece of configuration belongs. Reported alongside preflight issues so
 * a developer is told *where* to put a missing value, not merely that it is
 * absent — putting a server secret in a `NEXT_PUBLIC_` variable is a far worse
 * failure than forgetting it entirely.
 */
export type CircleConfigScope =
  /** Safe to ship in the browser bundle (app id, OAuth client id). */
  | 'client'
  /** Server-side only. Never reaches the browser; probed via the health route. */
  | 'server'
  /** Configured in the Circle or Google console, not in your app at all. */
  | 'console';

export type CircleConfigIssue = {
  /** Stable machine-readable key, e.g. `googleClientId`. */
  id: string;
  /** Conventional env var name, where one applies. */
  envVar?: string;
  scope: CircleConfigScope;
  severity: 'error' | 'warning';
  /** Developer-facing explanation. Never shown to end users in production. */
  message: string;
  docsUrl?: string;
};

/**
 * The server half of the integration. Circle's REST API requires a secret API
 * key, so these calls MUST run on a server the app controls — ConnectKit only
 * ever speaks to these endpoints, never to `api.circle.com` directly.
 *
 * Supply either `basePath` (and get the default fetch client) or a fully custom
 * `adapter` for apps whose transport is not plain HTTP JSON.
 */
export type CircleEndpointConfig = {
  /** Defaults to `/api/circle`. */
  basePath?: string;
  /** Extra headers on every backend call, e.g. app session auth. */
  headers?: Record<string, string> | (() => Record<string, string>);
  /** Forwarded to `fetch`; use for `credentials: 'include'`. */
  fetchOptions?: Omit<RequestInit, 'body' | 'method' | 'headers'>;
};

export type CircleWallet = {
  id: string;
  address: string;
  blockchain: string;
  state?: string;
  accountType?: string;
};

export type CircleDeviceTokenResult = {
  deviceToken: string;
  deviceEncryptionKey: string;
};

export type CircleChallengeResponse = {
  challengeId: string;
};

/**
 * Reported by the optional `/health` route. Values are never returned — only
 * whether the server can see them — so the probe is safe to call from the
 * browser and safe to leave enabled in production.
 */
export type CircleHealthReport = {
  ok: boolean;
  missing?: Array<{ id: string; envVar?: string; scope: CircleConfigScope }>;
};

export interface CircleBackendAdapter {
  createDeviceToken(input: {
    deviceId: string;
  }): Promise<CircleDeviceTokenResult>;

  initializeUser(input: {
    userToken: string;
    blockchain: string;
  }): Promise<CircleChallengeResponse>;

  listWallets(input: { userToken: string }): Promise<CircleWallet[]>;

  signMessage(input: {
    userToken: string;
    walletId: string;
    message: string;
    encodedByHex?: boolean;
  }): Promise<CircleChallengeResponse>;

  signTypedData(input: {
    userToken: string;
    walletId: string;
    data: string;
  }): Promise<CircleChallengeResponse>;

  createTransaction(input: {
    userToken: string;
    walletId: string;
    destinationAddress: string;
    callData?: string;
    amount?: string;
    feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  }): Promise<CircleChallengeResponse>;

  health?(): Promise<CircleHealthReport>;
}

export type CircleOptions = {
  /**
   * Explicit kill switch. Omitting the whole `circle` object disables the
   * integration entirely; `enabled: false` lets an app keep its configuration
   * in place while turning the feature off (per-environment rollout).
   */
  enabled?: boolean;

  /** Circle Developer Console App ID. Public — safe in the browser. */
  appId?: string;

  /**
   * Google OAuth client id. Public by design. The matching client *secret*
   * belongs in the Circle Developer Console and must never appear here.
   */
  google?: {
    clientId?: string;
    /** Defaults to `window.location.origin`. Must be registered in Google Cloud. */
    redirectUri?: string;
    /** Force the Google account chooser instead of silent re-auth. */
    selectAccountPrompt?: boolean;
  };

  /** Defaults to `['google']`. Unimplemented methods render as "coming soon". */
  methods?: CircleLoginMethod[];

  endpoints?: CircleEndpointConfig;

  /** Escape hatch for non-HTTP backends. Takes precedence over `endpoints`. */
  adapter?: CircleBackendAdapter;

  /** Chain to provision the wallet on. Defaults to the app's first chain. */
  defaultChainId?: number;

  /** Add or override Circle chain identifiers. See `circle/chains.ts`. */
  chains?: CircleChainMap;

  /** Label in the wallet list. Defaults to "Sign in with Circle". */
  name?: string;

  /**
   * Gas strategy for transactions. Circle prices its own transactions by fee
   * level and rejects explicit gas fields, so any gas the caller sets is
   * ignored in favour of this. Defaults to `MEDIUM`.
   */
  feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
};

/**
 * Circle is opt-in: an app that never sets `circle` pays nothing for it. An
 * explicit `enabled: false` keeps configuration in place while disabling the
 * feature, which is what per-environment rollout needs.
 *
 * Defined here rather than in the barrel so feature modules can import it
 * without creating a cycle through `circle/index.ts`.
 */
export const isCircleEnabled = (circle: CircleOptions | undefined): boolean =>
  !!circle && circle.enabled !== false;

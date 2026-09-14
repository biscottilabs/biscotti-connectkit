import type { CircleChainMap, CircleEnvironment } from './chains';

/** Login methods Circle exposes for user-controlled wallets. */
export type CircleLoginMethod = 'google' | 'email' | 'pin' | 'facebook' | 'apple';

export const CIRCLE_IMPLEMENTED_METHODS: CircleLoginMethod[] = [
  'google',
  'email',
];

/**
 * `EOA` is a plain key-pair wallet. `SCA` is an ERC-4337 smart account, which
 * is what Circle Gas Station sponsorship requires. SCA wallets are deployed
 * lazily on their first outbound transaction, so avoid them on Ethereum mainnet
 * where that deployment is expensive.
 */
export type CircleAccountType = 'EOA' | 'SCA';

export type CircleFeeLevel = 'LOW' | 'MEDIUM' | 'HIGH';

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

export type CircleEmailOtpResult = CircleDeviceTokenResult & {
  otpToken: string;
};

export type CircleChallengeResponse = {
  challengeId: string;
};

export type CircleEnvironmentHealth = {
  ok: boolean;
  missing?: Array<{ id: string; envVar?: string; scope: CircleConfigScope }>;
  /** Detailed safe-to-display configuration failures reported by the server. */
  issues?: CircleConfigIssue[];
};

/**
 * Reported by the optional `/health` route. Values are never returned — only
 * whether the server can see them — so the probe is safe to call from the
 * browser and safe to leave enabled in production.
 *
 * Servers that support both Circle environments report each one under
 * `environments`; the top-level fields describe the server as a whole.
 */
export type CircleHealthReport = CircleEnvironmentHealth & {
  environments?: Partial<Record<CircleEnvironment, CircleEnvironmentHealth>>;
};

export interface CircleBackendAdapter {
  createDeviceToken(input: {
    deviceId: string;
  }): Promise<CircleDeviceTokenResult>;

  requestEmailOtp?(input: {
    deviceId: string;
    email: string;
  }): Promise<CircleEmailOtpResult>;

  initializeUser(input: {
    userToken: string;
    blockchain: string;
    accountType?: CircleAccountType;
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
    feeLevel?: CircleFeeLevel;
  }): Promise<CircleChallengeResponse>;

  health?(): Promise<CircleHealthReport>;
}

export type CircleGoogleOptions = {
  clientId?: string;
  /** Defaults to `window.location.origin`. Must be registered in Google Cloud. */
  redirectUri?: string;
  /** Force the Google account chooser instead of silent re-auth. */
  selectAccountPrompt?: boolean;
};

/**
 * Settings that can differ between testnet and mainnet. Each may be given at
 * the top level of `CircleOptions` (shared by both environments) and/or inside
 * `environments.testnet` / `environments.mainnet`, which take precedence.
 */
export type CircleEnvironmentOptions = {
  /** Circle Developer Console App ID. Public — safe in the browser. */
  appId?: string;

  /**
   * Google OAuth Web client id. Public by design. Enable the same client ID in
   * Circle Console; no Google credential secret belongs in browser config.
   * Merged field by field with the top-level `google` object.
   */
  google?: CircleGoogleOptions;

  /**
   * Chain to provision the wallet on. Must belong to the environment. Defaults
   * to the first app chain in that environment.
   */
  defaultChainId?: number;

  /** Wallet type to create on first sign-in. Defaults to `EOA`. */
  accountType?: CircleAccountType;

  endpoints?: CircleEndpointConfig;

  /** Escape hatch for non-HTTP backends. Takes precedence over `endpoints`. */
  adapter?: CircleBackendAdapter;
};

export type CircleOptions = CircleEnvironmentOptions & {
  /**
   * Explicit kill switch. Omitting the whole `circle` object disables the
   * integration entirely; `enabled: false` lets an app keep its configuration
   * in place while turning the feature off (per-environment rollout).
   */
  enabled?: boolean;

  /**
   * The active Circle environment. It must match the server's API key:
   * `testnet` pairs with a `TEST_API_KEY:` key, `mainnet` with `LIVE_API_KEY:`.
   *
   * Required when `environments` configures both. Otherwise it is inferred
   * from `environments`, then from the chains, and finally defaults to
   * `testnet`.
   */
  environment?: CircleEnvironment;

  /**
   * Per-environment settings. Declare both so a deployment switches between
   * them by changing `environment` alone.
   */
  environments?: Partial<Record<CircleEnvironment, CircleEnvironmentOptions>>;

  /**
   * Authentication choices shown by ConnectKit. Defaults to
   * `['google', 'email']`. Unimplemented methods render as "coming soon".
   */
  methods?: CircleLoginMethod[];

  /** Add or override Circle chain identifiers. See `circle/chains.ts`. */
  chains?: CircleChainMap;

  /** Label in the wallet list. Defaults to "Sign in with Circle". */
  name?: string;

  /**
   * Gas strategy for transactions. Circle prices its own transactions by fee
   * level and rejects explicit gas fields, so any gas the caller sets is
   * ignored in favour of this. Defaults to `MEDIUM`.
   */
  feeLevel?: CircleFeeLevel;
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

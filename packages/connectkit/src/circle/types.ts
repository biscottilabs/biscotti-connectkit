import type { CircleChainMap, CircleEnvironment } from './chains';

export type CircleLoginMethod = 'google' | 'email' | 'pin' | 'facebook' | 'apple';

export const CIRCLE_IMPLEMENTED_METHODS: CircleLoginMethod[] = [
  'google',
  'email',
];

/**
 * `SCA` is an ERC-4337 smart account, required for Gas Station sponsorship. It
 * deploys on first use, so avoid it on Ethereum mainnet.
 */
export type CircleAccountType = 'EOA' | 'SCA';

export type CircleFeeLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/** Where a missing value belongs: browser env, server env, or a console. */
export type CircleConfigScope = 'client' | 'server' | 'console';

export type CircleConfigIssue = {
  id: string;
  envVar?: string;
  scope: CircleConfigScope;
  severity: 'error' | 'warning';
  /** Developer-facing. Never shown to end users in production. */
  message: string;
  docsUrl?: string;
};

/**
 * The app's own backend routes. The Circle API key must stay on the server, so
 * ConnectKit never calls `api.circle.com` directly.
 */
export type CircleEndpointConfig = {
  /** Defaults to `/api/circle`. */
  basePath?: string;
  headers?: Record<string, string> | (() => Record<string, string>);
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
  issues?: CircleConfigIssue[];
};

/**
 * Returned by the optional `/health` route. Reports presence only, never
 * values. Servers supporting both environments report each under
 * `environments`.
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
  /** Google OAuth Web client id. Public; the secret goes in Circle Console. */
  clientId?: string;
  /** Defaults to `window.location.origin`. Must be registered in Google Cloud. */
  redirectUri?: string;
  selectAccountPrompt?: boolean;
};

/**
 * Settings that may differ per environment. Set them at the top level of
 * `CircleOptions` to share them, or under `environments` to override.
 */
export type CircleEnvironmentOptions = {
  /** Circle Console App ID. Public. */
  appId?: string;
  google?: CircleGoogleOptions;
  /** Must belong to the environment. Defaults to the first app chain in it. */
  defaultChainId?: number;
  /** Defaults to `EOA`. */
  accountType?: CircleAccountType;
  endpoints?: CircleEndpointConfig;
  /** Replaces the HTTP client. Takes precedence over `endpoints`. */
  adapter?: CircleBackendAdapter;
};

export type CircleOptions = CircleEnvironmentOptions & {
  /** `false` disables Circle while keeping the configuration in place. */
  enabled?: boolean;

  /**
   * Must match the server's API key. Required when `environments` declares
   * both; otherwise inferred from `environments`, then the chains, then
   * defaults to `testnet`.
   */
  environment?: CircleEnvironment;

  environments?: Partial<Record<CircleEnvironment, CircleEnvironmentOptions>>;

  /** Defaults to `['google', 'email']`. */
  methods?: CircleLoginMethod[];

  /** Add or override Circle chain identifiers. */
  chains?: CircleChainMap;

  /** Defaults to "Sign in with Circle". */
  name?: string;

  /** Circle ignores explicit gas and prices by fee level. Defaults to `MEDIUM`. */
  feeLevel?: CircleFeeLevel;
};

export const isCircleEnabled = (circle: CircleOptions | undefined): boolean =>
  !!circle && circle.enabled !== false;

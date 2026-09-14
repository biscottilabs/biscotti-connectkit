import type {
  CustomLinks,
  Localizations,
  Resources,
  ThemeColor,
} from '@circle-fin/w3s-pw-web-sdk/dist/src/types';

import type { CircleChainMap, CircleEnvironment } from './chains';

export type CircleLoginMethod = 'google' | 'email' | 'pin' | 'facebook' | 'apple';

export const CIRCLE_IMPLEMENTED_METHODS: CircleLoginMethod[] = [
  'google',
  'email',
  'facebook',
  'apple',
];

export type CircleSocialProvider = 'google' | 'facebook' | 'apple';

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

export type CircleRefreshTokenResult = {
  userToken: string;
  encryptionKey?: string;
  refreshToken?: string;
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

  /** Adds a wallet on another chain for a user who already has one. */
  createWallet?(input: {
    userToken: string;
    blockchain: string;
    accountType?: CircleAccountType;
  }): Promise<CircleChallengeResponse>;

  refreshUserToken?(input: {
    userToken: string;
    refreshToken: string;
    deviceId: string;
  }): Promise<CircleRefreshTokenResult>;

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

/** Passed to the Circle Web SDK's hosted screens. */
export type CircleAppearance = {
  themeColor?: ThemeColor;
  localizations?: Localizations;
  resources?: Resources;
  customLinks?: CustomLinks;
};

export type CircleStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * `session` (default) ends with the tab. `local` survives restarts but keeps
 * the bearer token around longer.
 */
export type CircleStorageOption = 'session' | 'local' | CircleStorage;

export type CircleLoginEvent = {
  environment: CircleEnvironment;
  method: Exclude<CircleLoginMethod, 'pin'>;
  email?: string;
};

export type CircleWalletEvent = {
  environment: CircleEnvironment;
  wallet: CircleWallet;
  created: boolean;
};

export type CircleEvents = {
  onLogin?: (event: CircleLoginEvent) => void;
  onWallet?: (event: CircleWalletEvent) => void;
  onSignOut?: (event: { environment: CircleEnvironment }) => void;
  onError?: (error: Error, event: { environment: CircleEnvironment }) => void;
};

export type CircleGoogleOptions = {
  /** Google OAuth Web client id. Public; the secret goes in Circle Console. */
  clientId?: string;
  /** Defaults to `window.location.origin`. Must be registered in Google Cloud. */
  redirectUri?: string;
  selectAccountPrompt?: boolean;
};

export type CircleFacebookOptions = {
  /** Meta app ID. Public; the app secret goes in Circle Console. */
  appId?: string;
  /** Defaults to `window.location.origin`. Must be a valid OAuth redirect URI in Meta. */
  redirectUri?: string;
};

/**
 * Firebase web app config. Circle signs in with Apple through Firebase, so
 * enable the Apple provider in that Firebase project.
 */
export type CircleAppleOptions = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  appId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
};

/**
 * Settings that may differ per environment. Set them at the top level of
 * `CircleOptions` to share them, or under `environments` to override.
 */
export type CircleEnvironmentOptions = {
  /** Circle Console App ID. Public. */
  appId?: string;
  google?: CircleGoogleOptions;
  facebook?: CircleFacebookOptions;
  apple?: CircleAppleOptions;
  /** Must belong to the environment. Defaults to the first app chain in it. */
  defaultChainId?: number;
  /** Defaults to `EOA`. */
  accountType?: CircleAccountType;
  endpoints?: CircleEndpointConfig;
  /** Replaces the HTTP client. Takes precedence over `endpoints`. */
  adapter?: CircleBackendAdapter;
};

export type CircleOptions = CircleEnvironmentOptions &
  CircleEvents & {
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

  /** Where the Circle session is kept. Defaults to `session`. */
  storage?: CircleStorageOption;

  appearance?: CircleAppearance;
};

export const isCircleEnabled = (circle: CircleOptions | undefined): boolean =>
  !!circle && circle.enabled !== false;

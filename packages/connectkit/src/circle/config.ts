import {
  environmentOfChain,
  isCircleEnvironment,
  type CircleChainMap,
  type CircleEnvironment,
} from './chains';
import type {
  CircleAccountType,
  CircleAppearance,
  CircleBackendAdapter,
  CircleEndpointConfig,
  CircleAppleOptions,
  CircleEvents,
  CircleFacebookOptions,
  CircleFeeLevel,
  CircleGoogleOptions,
  CircleLoginMethod,
  CircleOptions,
  CircleStorageOption,
} from './types';

export type CircleEnvironmentSource =
  | 'explicit'
  | 'environments'
  | 'chain'
  | 'default';

/** One environment's settings, with per-environment values applied. */
export type ResolvedCircleConfig = {
  environment: CircleEnvironment;
  environmentSource: CircleEnvironmentSource;
  usesEnvironments: boolean;
  appId?: string;
  google: CircleGoogleOptions;
  facebook: CircleFacebookOptions;
  apple?: CircleAppleOptions;
  methods: CircleLoginMethod[];
  endpoints?: CircleEndpointConfig;
  adapter?: CircleBackendAdapter;
  defaultChainId: number;
  chains?: CircleChainMap;
  name: string;
  feeLevel: CircleFeeLevel;
  accountType: CircleAccountType;
  storage?: CircleStorageOption;
  appearance?: CircleAppearance;
  events: CircleEvents;
};

export const CIRCLE_DEFAULT_METHODS: CircleLoginMethod[] = ['google', 'email'];

const resolveEnvironment = (
  circle: CircleOptions,
  appChainIds: readonly number[]
): { environment: CircleEnvironment; source: CircleEnvironmentSource } => {
  if (isCircleEnvironment(circle.environment)) {
    return { environment: circle.environment, source: 'explicit' };
  }

  const declared = Object.keys(circle.environments ?? {}).filter(
    isCircleEnvironment
  );
  if (declared.length === 1) {
    return { environment: declared[0], source: 'environments' };
  }

  const fromDefault =
    circle.defaultChainId !== undefined
      ? environmentOfChain(circle.defaultChainId, circle.chains)
      : undefined;
  if (fromDefault) return { environment: fromDefault, source: 'chain' };

  for (const chainId of appChainIds) {
    const fromChain = environmentOfChain(chainId, circle.chains);
    if (fromChain) return { environment: fromChain, source: 'chain' };
  }

  // Circle recommends starting on testnet.
  return { environment: 'testnet', source: 'default' };
};

/**
 * `appChainIds` are the wagmi chains in order. The default chain is the first
 * one in the active environment, so an app listing Base and Base Sepolia
 * provisions on Base Sepolia when running on testnet.
 */
export const resolveCircleConfig = (
  circle: CircleOptions,
  appChainIds: readonly number[]
): ResolvedCircleConfig => {
  const { environment, source } = resolveEnvironment(circle, appChainIds);
  const scoped = circle.environments?.[environment] ?? {};

  const firstChainInEnvironment = appChainIds.find(
    (chainId) => environmentOfChain(chainId, circle.chains) === environment
  );

  return {
    environment,
    environmentSource: source,
    usesEnvironments: circle.environments !== undefined,
    appId: scoped.appId ?? circle.appId,
    google: { ...circle.google, ...scoped.google },
    facebook: { ...circle.facebook, ...scoped.facebook },
    apple: scoped.apple ?? circle.apple,
    methods: circle.methods ?? CIRCLE_DEFAULT_METHODS,
    endpoints: scoped.endpoints ?? circle.endpoints,
    adapter: scoped.adapter ?? circle.adapter,
    defaultChainId:
      scoped.defaultChainId ??
      circle.defaultChainId ??
      firstChainInEnvironment ??
      appChainIds[0],
    chains: circle.chains,
    name: circle.name ?? 'Sign in with Circle',
    feeLevel: circle.feeLevel ?? 'MEDIUM',
    accountType: scoped.accountType ?? circle.accountType ?? 'EOA',
    storage: circle.storage,
    appearance: circle.appearance,
    events: {
      onLogin: circle.onLogin,
      onWallet: circle.onWallet,
      onSignOut: circle.onSignOut,
      onError: circle.onError,
    },
  };
};

/** App callbacks must not break the Circle flow. */
export const emitCircleEvent = (handler: (() => void) | undefined) => {
  if (!handler) return;
  try {
    handler();
  } catch (error) {
    console.error('[circle] event handler threw', error);
  }
};

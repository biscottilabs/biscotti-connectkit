import {
  environmentOfChain,
  isCircleEnvironment,
  type CircleChainMap,
  type CircleEnvironment,
} from './chains';
import type {
  CircleAccountType,
  CircleBackendAdapter,
  CircleEndpointConfig,
  CircleFeeLevel,
  CircleGoogleOptions,
  CircleLoginMethod,
  CircleOptions,
} from './types';

/** How the active environment was decided. Reported in diagnostics. */
export type CircleEnvironmentSource =
  /** `circle.environment` was set. */
  | 'explicit'
  /** `circle.environments` declares exactly one environment. */
  | 'environments'
  /** Derived from `defaultChainId` or the app's chains. */
  | 'chain'
  /** Nothing to go on; Circle's own guidance is to start on testnet. */
  | 'default';

/**
 * The settings for exactly one environment, with per-environment values
 * already layered over the shared ones. Everything below `CircleOptions` reads
 * this instead of the raw options, so precedence is decided in one place.
 */
export type ResolvedCircleConfig = {
  environment: CircleEnvironment;
  environmentSource: CircleEnvironmentSource;
  /** True when `circle.environments` is used; diagnostics name per-env vars. */
  usesEnvironments: boolean;
  appId?: string;
  google: CircleGoogleOptions;
  methods: CircleLoginMethod[];
  endpoints?: CircleEndpointConfig;
  adapter?: CircleBackendAdapter;
  defaultChainId: number;
  chains?: CircleChainMap;
  name: string;
  feeLevel: CircleFeeLevel;
  accountType: CircleAccountType;
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

  return { environment: 'testnet', source: 'default' };
};

/**
 * Picks the active environment and flattens its settings.
 *
 * `appChainIds` are the wagmi config's chains, in order. They are used to infer
 * the environment when nothing else decides it, and to choose a default chain
 * that actually belongs to that environment — so an app listing both Base and
 * Base Sepolia provisions on Base Sepolia when running against testnet.
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
  };
};

import { isCircleEnvironment } from '../circle/chains';
import { apiKeyEnvironment, type CircleHandlerOptions } from './handler';

type EnvSource = Record<string, string | undefined>;

/**
 * Reads `CIRCLE_TESTNET_API_KEY`, `CIRCLE_MAINNET_API_KEY` and an optional
 * `CIRCLE_ENVIRONMENT`. A legacy `CIRCLE_API_KEY` is assigned by its prefix.
 */
export const readCircleServerEnv = (
  env: EnvSource = typeof process !== 'undefined' ? process.env : {}
): Pick<CircleHandlerOptions, 'environments' | 'defaultEnvironment'> => {
  const legacyKey = env.CIRCLE_API_KEY?.trim() || undefined;
  // Unrecognised keys go to testnet so health reports them.
  const legacyEnvironment = legacyKey
    ? apiKeyEnvironment(legacyKey) ?? 'testnet'
    : undefined;

  const entry = (environment: 'testnet' | 'mainnet') => {
    const envVar = `CIRCLE_${environment.toUpperCase()}_API_KEY`;
    const explicit = env[envVar]?.trim() || undefined;
    if (explicit) return { apiKey: explicit, envVar };
    if (legacyEnvironment === environment) {
      return { apiKey: legacyKey, envVar: 'CIRCLE_API_KEY' };
    }
    return { envVar };
  };

  const configured =
    env.CIRCLE_ENVIRONMENT ??
    env.NEXT_PUBLIC_CIRCLE_ENVIRONMENT ??
    env.VITE_CIRCLE_ENVIRONMENT;

  return {
    environments: { testnet: entry('testnet'), mainnet: entry('mainnet') },
    defaultEnvironment: isCircleEnvironment(configured) ? configured : undefined,
  };
};

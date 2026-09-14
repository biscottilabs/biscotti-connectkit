import { isCircleEnvironment } from '../circle/chains';
import { apiKeyEnvironment, type CircleHandlerOptions } from './handler';

type EnvSource = Record<string, string | undefined>;

/**
 * Reads the conventional Circle env vars into handler options:
 *
 *   CIRCLE_TESTNET_API_KEY=TEST_API_KEY:...
 *   CIRCLE_MAINNET_API_KEY=LIVE_API_KEY:...
 *   CIRCLE_ENVIRONMENT=testnet            # optional default
 *
 * A single legacy `CIRCLE_API_KEY` is still honoured and assigned to whichever
 * environment its prefix names, so existing deployments keep working.
 *
 * Both environments are always declared, even without a key, so the health
 * route can name the missing variable instead of reporting nothing.
 */
export const readCircleServerEnv = (
  env: EnvSource = typeof process !== 'undefined' ? process.env : {}
): Pick<CircleHandlerOptions, 'environments' | 'defaultEnvironment'> => {
  const legacyKey = env.CIRCLE_API_KEY?.trim() || undefined;
  // An unrecognised legacy key is placed on testnet so the health route
  // reports it as unrecognised rather than silently ignoring it.
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

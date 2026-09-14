import type {
  CircleConfigIssue,
  CircleHealthReport,
  CircleOptions,
} from './types';
import { CIRCLE_IMPLEMENTED_METHODS } from './types';
import {
  CIRCLE_ENVIRONMENTS,
  environmentOfBlockchain,
  isCircleEnvironment,
  toCircleBlockchain,
  type CircleEnvironment,
} from './chains';
import { resolveCircleConfig, type ResolvedCircleConfig } from './config';

const DOCS = {
  appId: 'https://console.circle.com/',
  google: 'https://developers.circle.com/wallets/user-controlled/social-logins',
  apiKey: 'https://developers.circle.com/wallets/user-controlled/build-a-wallet-app',
  keys: 'https://developers.circle.com/api-reference/keys',
  chains: 'https://developers.circle.com/wallets/supported-blockchains',
};

/**
 * Conventional env var names. Apps using `circle.environments` keep one set of
 * values per environment, so the name says which one is missing.
 */
const clientEnvVar = (circle: ResolvedCircleConfig, name: string) =>
  circle.usesEnvironments
    ? `NEXT_PUBLIC_CIRCLE_${circle.environment.toUpperCase()}_${name}`
    : `NEXT_PUBLIC_CIRCLE_${name}`;

const serverKeyEnvVar = (environment?: CircleEnvironment) =>
  environment
    ? `CIRCLE_${environment.toUpperCase()}_API_KEY`
    : 'CIRCLE_API_KEY';

/**
 * Synchronous, client-side configuration check.
 *
 * Deliberately returns *every* problem rather than throwing on the first one:
 * a developer setting this up for the first time is usually missing several
 * values at once, and discovering them one redeploy at a time is miserable.
 *
 * `appChainIds` are the wagmi config's chains. Server-side values (the Circle
 * API keys) cannot be seen from here — those come from {@link issuesFromHealth}
 * via the backend's health route.
 */
export const preflightCircleConfig = (
  options: CircleOptions | undefined,
  appChainIds: readonly number[] = []
): CircleConfigIssue[] => {
  const issues: CircleConfigIssue[] = [];

  if (!options) return issues;

  const circle = resolveCircleConfig(options, appChainIds);
  const label = circle.environment;

  if (
    options.environment !== undefined &&
    !isCircleEnvironment(options.environment)
  ) {
    issues.push({
      id: 'invalidEnvironment',
      envVar: 'NEXT_PUBLIC_CIRCLE_ENVIRONMENT',
      scope: 'client',
      severity: 'error',
      message: `\`circle.environment\` must be "testnet" or "mainnet", not "${String(
        options.environment
      )}".`,
      docsUrl: DOCS.keys,
    });
  }

  const declared = Object.keys(options.environments ?? {});
  const unknown = declared.filter((key) => !isCircleEnvironment(key));
  if (unknown.length > 0) {
    issues.push({
      id: 'unknownEnvironments',
      scope: 'client',
      severity: 'warning',
      message: `Ignoring unknown \`circle.environments\` entries: ${unknown.join(
        ', '
      )}. Use "testnet" and "mainnet".`,
    });
  }

  if (
    circle.environmentSource !== 'explicit' &&
    CIRCLE_ENVIRONMENTS.every((env) => declared.includes(env))
  ) {
    issues.push({
      id: 'ambiguousEnvironment',
      envVar: 'NEXT_PUBLIC_CIRCLE_ENVIRONMENT',
      scope: 'client',
      severity: 'error',
      message:
        'Both testnet and mainnet are configured, so `circle.environment` must say which one this deployment uses.',
      docsUrl: DOCS.keys,
    });
  }

  if (!circle.appId) {
    issues.push({
      id: 'appId',
      envVar: clientEnvVar(circle, 'APP_ID'),
      scope: 'client',
      severity: 'error',
      message: `Circle App ID for ${label} is missing. Copy it from Circle Console (${label}) → Wallets → User Controlled → Configurator.`,
      docsUrl: DOCS.appId,
    });
  }

  const { methods } = circle;

  if (methods.includes('google') && !circle.google.clientId) {
    issues.push({
      id: 'googleClientId',
      envVar: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
      scope: 'client',
      severity: 'error',
      message:
        'Google OAuth client ID is missing. Create an OAuth 2.0 Web Client in Google Cloud and pass it as `circle.google.clientId`.',
      docsUrl: DOCS.google,
    });
  }

  if (methods.includes('google') && circle.google.clientId) {
    issues.push({
      id: 'googleConsoleConfig',
      scope: 'console',
      severity: 'warning',
      message: `Confirm this Google Web client ID is enabled under Authentication Methods → Social Logins in Circle Console (${label}), and register the redirect URI in Google Cloud.`,
      docsUrl: DOCS.google,
    });
  }

  if (methods.includes('email')) {
    issues.push({
      id: 'emailConsoleConfig',
      scope: 'console',
      severity: 'warning',
      message: `Confirm Email authentication and SMTP delivery are configured under Authentication Methods → Email in Circle Console (${label}).`,
      docsUrl: DOCS.apiKey,
    });
  }

  const unimplemented = methods.filter(
    (m) => !CIRCLE_IMPLEMENTED_METHODS.includes(m)
  );
  if (unimplemented.length > 0) {
    issues.push({
      id: 'unimplementedMethods',
      scope: 'client',
      severity: 'warning',
      message: `Login method(s) not yet implemented and will render as unavailable: ${unimplemented.join(
        ', '
      )}.`,
    });
  }

  const chainId = circle.defaultChainId;
  if (chainId !== undefined) {
    const blockchain = toCircleBlockchain(chainId, circle.chains);

    if (!blockchain) {
      issues.push({
        id: 'unsupportedChain',
        scope: 'client',
        severity: 'error',
        message: `Chain ${chainId} has no Circle blockchain mapping. Add one via \`circle.chains\` or switch to a supported chain.`,
        docsUrl: DOCS.chains,
      });
    } else if (environmentOfBlockchain(blockchain) !== circle.environment) {
      issues.push({
        id: 'environmentChainMismatch',
        scope: 'client',
        severity: 'error',
        message: `Chain ${chainId} (${blockchain}) is a ${environmentOfBlockchain(
          blockchain
        )} chain, but Circle is configured for ${label}. Add a ${label} chain to your wagmi config and set it as \`defaultChainId\`.`,
        docsUrl: DOCS.chains,
      });
    }

    if (appChainIds.length > 0 && !appChainIds.includes(chainId)) {
      issues.push({
        id: 'defaultChainNotConfigured',
        scope: 'client',
        severity: 'error',
        message: `Circle's default chain ${chainId} is not in your wagmi config's \`chains\`, so wagmi cannot represent the wallet. Add it to \`chains\`.`,
      });
    }
  }

  return issues;
};

/**
 * Translates a backend health report into the same issue shape.
 *
 * Servers that support both environments report each one separately; only the
 * active environment's entry matters to this app. Older servers report a single
 * top-level status, which is used as is.
 */
export const issuesFromHealth = (
  report: CircleHealthReport | undefined,
  environment?: CircleEnvironment
): CircleConfigIssue[] => {
  if (!report) return [];

  let health: CircleHealthReport = report;

  if (report.environments && environment) {
    const scoped = report.environments[environment];
    if (!scoped) {
      return [
        {
          id: 'serverEnvironmentMissing',
          envVar: serverKeyEnvVar(environment),
          scope: 'server',
          severity: 'error',
          message: `The Circle backend is not configured for ${environment}. Set ${serverKeyEnvVar(
            environment
          )} on the server.`,
          docsUrl: DOCS.keys,
        },
      ];
    }
    health = scoped;
  }

  if (health.ok) return [];

  const reported = health.issues ?? [];
  const missing = (health.missing ?? []).map((item) => ({
    id: item.id,
    envVar: item.envVar,
    scope: item.scope,
    severity: 'error' as const,
    message: `${
      item.envVar ?? item.id
    } is not set on the server. Add it to your server environment — never to a client-visible variable.`,
    docsUrl: DOCS.apiKey,
  }));

  if (reported.length === 0 && missing.length === 0) {
    return [
      {
        id: 'serverUnhealthy',
        scope: 'server',
        severity: 'error',
        message:
          'The Circle backend reported it is not configured, but did not say which values are missing.',
        docsUrl: DOCS.apiKey,
      },
    ];
  }

  return [...reported, ...missing];
};

export const hasBlockingIssues = (issues: CircleConfigIssue[]): boolean =>
  issues.some((issue) => issue.severity === 'error');

/**
 * Whether to show developers the itemised diagnostic or end users the generic
 * message. Errs toward the generic message: a bundler that strips `NODE_ENV`
 * should not accidentally leak configuration detail to real users.
 */
export const shouldShowDiagnostics = (debugMode?: boolean): boolean => {
  if (debugMode) return true;
  try {
    return (
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV !== undefined &&
      process.env.NODE_ENV !== 'production'
    );
  } catch {
    return false;
  }
};

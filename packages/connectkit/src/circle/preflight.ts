import type { CircleConfigIssue, CircleOptions, CircleHealthReport } from './types';
import { CIRCLE_IMPLEMENTED_METHODS } from './types';
import { toCircleBlockchain } from './chains';

const DOCS = {
  appId: 'https://console.circle.com/',
  google: 'https://developers.circle.com/wallets/user-controlled/social-logins',
  apiKey: 'https://developers.circle.com/wallets/user-controlled/build-a-wallet-app',
};

/**
 * Synchronous, client-side configuration check.
 *
 * Deliberately returns *every* problem rather than throwing on the first one:
 * a developer setting this up for the first time is usually missing several
 * values at once, and discovering them one redeploy at a time is miserable.
 *
 * Server-side values (the Circle API key) cannot be seen from here — those come
 * from {@link issuesFromHealth} via the backend's health route.
 */
export const preflightCircleConfig = (
  circle: CircleOptions | undefined,
  chainId?: number
): CircleConfigIssue[] => {
  const issues: CircleConfigIssue[] = [];

  if (!circle) return issues;

  if (!circle.appId) {
    issues.push({
      id: 'appId',
      envVar: 'NEXT_PUBLIC_CIRCLE_APP_ID',
      scope: 'client',
      severity: 'error',
      message:
        'Circle App ID is missing. Create an app in the Circle Developer Console and pass it as `circle.appId`.',
      docsUrl: DOCS.appId,
    });
  }

  const methods = circle.methods ?? ['google', 'email'];

  if (methods.includes('google') && !circle.google?.clientId) {
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

  if (methods.includes('google') && circle.google?.clientId) {
    issues.push({
      id: 'googleConsoleConfig',
      scope: 'console',
      severity: 'warning',
      message:
        'Confirm this Google Web client ID is enabled under Authentication Methods → Social Logins in Circle Console, and register the redirect URI in Google Cloud.',
      docsUrl: DOCS.google,
    });
  }

  if (methods.includes('email')) {
    issues.push({
      id: 'emailConsoleConfig',
      scope: 'console',
      severity: 'warning',
      message:
        'Confirm Email authentication and SMTP delivery are configured under Authentication Methods → Email in Circle Console.',
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

  if (chainId !== undefined && !toCircleBlockchain(chainId, circle.chains)) {
    issues.push({
      id: 'unsupportedChain',
      scope: 'client',
      severity: 'error',
      message: `Chain ${chainId} has no Circle blockchain mapping. Add one via \`circle.chains\` or switch to a supported chain.`,
      docsUrl: 'https://developers.circle.com/wallets/supported-blockchains',
    });
  }

  return issues;
};

/** Translates a backend health report into the same issue shape. */
export const issuesFromHealth = (
  report: CircleHealthReport | undefined
): CircleConfigIssue[] => {
  if (!report || report.ok) return [];

  if (!report.missing?.length) {
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

  return report.missing.map((item) => ({
    id: item.id,
    envVar: item.envVar,
    scope: item.scope,
    severity: 'error' as const,
    message: `${
      item.envVar ?? item.id
    } is not set on the server. Add it to your server environment — never to a client-visible variable.`,
    docsUrl: DOCS.apiKey,
  }));
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

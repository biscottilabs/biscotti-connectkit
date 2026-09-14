import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConfig } from 'wagmi';

import { useContext } from '../components/ConnectKit';
import { resolveBackendAdapter } from './backend';
import type { CircleEnvironment } from './chains';
import { emitCircleEvent } from './config';
import {
  beginEmailLogin,
  beginGoogleLogin,
  ensureWallet,
  refreshSessionIfStale,
  resumeGoogleLogin,
  sessionScope,
} from './login';
import {
  hasBlockingIssues,
  issuesFromHealth,
  preflightCircleConfig,
  shouldShowDiagnostics,
} from './preflight';
import { clearSession, readSession, type CircleSession } from './session';
import { resetCircleSdk } from './sdk';
import { isCircleEnabled, type CircleConfigIssue, type CircleWallet } from './types';
import { useCircleConfig, useCircleOptions } from './useCircleOptions';

const CIRCLE_HEALTH_TIMEOUT_MS = 2_500;

const withTimeout = <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });

export type CircleLoginStatus =
  | 'disabled'
  /** Running preflight + probing the backend. */
  | 'checking'
  /** Configuration is incomplete; `issues` says what is missing. */
  | 'unconfigured'
  | 'ready'
  /** Redirecting to Google or waiting for Circle's hosted email OTP UI. */
  | 'authenticating'
  /**
   * Circle's hosted wallet-setup challenge is open.
   * The value is retained for backwards compatibility with the initial API.
   */
  | 'awaitingPin'
  | 'connected'
  | 'error';

export type UseCircleLoginResult = {
  status: CircleLoginStatus;
  enabled: boolean;
  /** The active Circle environment, or `undefined` when Circle is disabled. */
  environment?: CircleEnvironment;
  issues: CircleConfigIssue[];
  /** Whether `issues` may be shown in the UI, or only logged. */
  canShowDiagnostics: boolean;
  session: CircleSession | null;
  wallet: CircleWallet | null;
  address?: string;
  error: Error | null;
  activeMethod: 'google' | 'email' | null;
  /** Backwards-compatible shorthand for Google authentication. */
  signIn: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  cancelSignIn: () => void;
  signOut: () => void;
};

/**
 * Drives the Sign in with Circle flow.
 *
 * Safe to call unconditionally: when Circle is not configured it settles on
 * `disabled` and does no work.
 */
export const useCircleLogin = (): UseCircleLoginResult => {
  const context = useContext();
  const { chains } = useConfig();
  const options = useCircleOptions();
  const circle = useCircleConfig();
  const enabled = isCircleEnabled(options);
  const chainId = circle?.defaultChainId ?? chains[0].id;

  const [status, setStatus] = useState<CircleLoginStatus>(
    enabled ? 'checking' : 'disabled'
  );
  const [issues, setIssues] = useState<CircleConfigIssue[]>([]);
  const [session, setSession] = useState<CircleSession | null>(null);
  const [wallet, setWallet] = useState<CircleWallet | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [activeMethod, setActiveMethod] = useState<
    'google' | 'email' | null
  >(null);

  const authAttemptRef = useRef(0);

  const adapter = useMemo(
    () => (circle ? resolveBackendAdapter(circle) : undefined),
    [circle]
  );
  const canShowDiagnostics = shouldShowDiagnostics(context.debugMode);

  const fail = useCallback(
    (cause: unknown) => {
      const asError =
        cause instanceof Error ? cause : new Error(String(cause));
      context.log?.('[circle] ', asError);
      setError(asError);
      setStatus('error');
      if (circle) {
        emitCircleEvent(() =>
          circle.events.onError?.(asError, { environment: circle.environment })
        );
      }
    },
    [circle, context]
  );

  /** Preflight + backend health, merged into one issue list. */
  const check = useCallback(async (): Promise<CircleConfigIssue[]> => {
    const clientIssues = preflightCircleConfig(
      options,
      chains.map((chain) => chain.id)
    );

    let serverIssues: CircleConfigIssue[] = [];
    try {
      const report = adapter?.health
        ? await withTimeout(
            adapter.health(),
            CIRCLE_HEALTH_TIMEOUT_MS,
            `The Circle backend health check timed out after ${CIRCLE_HEALTH_TIMEOUT_MS}ms.`
          )
        : undefined;
      serverIssues = issuesFromHealth(report, circle?.environment);
    } catch (healthError) {
      // An unreachable health route is itself a useful diagnostic, but it must
      // not mask the client-side issues we already found.
      context.log?.('[circle] health probe failed', healthError);
      serverIssues = [
        {
          id: 'healthUnreachable',
          scope: 'server',
          severity: 'error',
          message:
            healthError instanceof Error
              ? healthError.message
              : 'The Circle backend could not be reached.',
        },
      ];
    }

    const all = [...clientIssues, ...serverIssues];
    setIssues(all);
    return all;
  }, [adapter, chains, circle, context, options]);

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      return;
    }

    let cancelled = false;

    setSession(null);
    setWallet(null);
    setError(null);
    setStatus('checking');

    (async () => {
      const found = await check();
      if (cancelled) return;

      if (hasBlockingIssues(found)) {
        setStatus('unconfigured');
        return;
      }

      // Restore an in-flight OAuth round trip before falling back to a stored
      // session, so a fresh login always wins over a stale one.
      try {
        const resumed = await resumeGoogleLogin(circle!);
        if (cancelled) return;

        if (resumed) {
          setSession(resumed);
          setStatus('awaitingPin');
          const provisioned = await ensureWallet({
            circle: circle!,
            adapter: adapter!,
            chainId,
            session: resumed,
          });
          if (cancelled) return;
          setWallet(provisioned);
          setStatus('connected');
          return;
        }
      } catch (resumeError) {
        if (!cancelled) fail(resumeError);
        return;
      }

      const saved = readSession(sessionScope(circle!));
      const stored = saved
        ? await refreshSessionIfStale({
            circle: circle!,
            adapter: adapter!,
            session: saved,
          })
        : null;
      if (cancelled) return;
      if (stored) {
        // The stored wallet's chain was removed from the app.
        if (
          stored.chainId !== undefined &&
          !chains.some((chain) => chain.id === stored.chainId)
        ) {
          clearSession(sessionScope(circle!));
          resetCircleSdk();
          setSession(null);
          setWallet(null);
          setStatus('ready');
          return;
        }

        setSession(stored);
        setWallet(
          stored.walletId && stored.address
            ? {
                id: stored.walletId,
                address: stored.address,
                blockchain: '',
              }
            : null
        );
        setStatus(stored.address ? 'connected' : 'ready');
        return;
      }

      setStatus('ready');
    })();

    return () => {
      cancelled = true;
    };
    // Keyed narrowly: Strict Mode's cancelled first pass must not consume the
    // one-shot OAuth record. Environment or App ID changes mean a different app.
  }, [enabled, circle?.environment, circle?.appId]);

  const signInWithGoogle = useCallback(async () => {
    if (!enabled || !circle || !adapter) return;

    setError(null);
    setActiveMethod('google');
    authAttemptRef.current += 1;

    const found = await check();
    if (hasBlockingIssues(found)) {
      setStatus('unconfigured');
      return;
    }

    setStatus('authenticating');
    try {
      // Navigates away; execution continues after the redirect in the effect.
      await beginGoogleLogin({ circle, adapter, chainId });
    } catch (signInError) {
      fail(signInError);
    }
  }, [adapter, chainId, check, circle, enabled, fail]);

  const signInWithEmail = useCallback(
    async (email: string) => {
      if (!enabled || !circle || !adapter) return;

      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        fail(new Error('Enter a valid email address.'));
        return;
      }

      setError(null);
      setActiveMethod('email');
      const attempt = ++authAttemptRef.current;

      const found = await check();
      if (hasBlockingIssues(found)) {
        setStatus('unconfigured');
        return;
      }

      setStatus('authenticating');
      try {
        const authenticated = await beginEmailLogin({
          circle,
          adapter,
          chainId,
          email: normalizedEmail,
        });
        if (attempt !== authAttemptRef.current) return;
        setSession(authenticated);
        setStatus('awaitingPin');

        const provisioned = await ensureWallet({
          circle,
          adapter,
          chainId,
          session: authenticated,
        });
        if (attempt !== authAttemptRef.current) return;
        setWallet(provisioned);
        setStatus('connected');
      } catch (signInError) {
        if (attempt !== authAttemptRef.current) return;
        fail(signInError);
      }
    },
    [adapter, chainId, check, circle, enabled, fail]
  );

  const cancelSignIn = useCallback(() => {
    authAttemptRef.current += 1;
    setError(null);
    setActiveMethod(null);
    setStatus(enabled ? 'ready' : 'disabled');
  }, [enabled]);

  const signOut = useCallback(() => {
    authAttemptRef.current += 1;
    if (circle) {
      const hadSession = readSession(sessionScope(circle)) !== null;
      clearSession(sessionScope(circle));
      if (hadSession) {
        emitCircleEvent(() =>
          circle.events.onSignOut?.({ environment: circle.environment })
        );
      }
    }
    resetCircleSdk();
    setSession(null);
    setWallet(null);
    setError(null);
    setActiveMethod(null);
    setStatus(enabled ? 'ready' : 'disabled');
  }, [circle, enabled]);

  return {
    status,
    enabled,
    environment: enabled ? circle?.environment : undefined,
    issues,
    canShowDiagnostics,
    session,
    wallet,
    address: wallet?.address ?? session?.address,
    error,
    activeMethod,
    signIn: signInWithGoogle,
    signInWithGoogle,
    signInWithEmail,
    cancelSignIn,
    signOut,
  };
};

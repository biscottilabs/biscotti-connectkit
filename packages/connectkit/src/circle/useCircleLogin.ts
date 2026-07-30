import { useCallback, useEffect, useRef, useState } from 'react';
import { useChainId } from 'wagmi';

import { useContext } from '../components/ConnectKit';
import { resolveBackendAdapter } from './backend';
import { beginGoogleLogin, ensureWallet, resumeGoogleLogin } from './login';
import {
  hasBlockingIssues,
  issuesFromHealth,
  preflightCircleConfig,
  shouldShowDiagnostics,
} from './preflight';
import { clearSession, readSession, type CircleSession } from './session';
import { resetCircleSdk } from './sdk';
import { isCircleEnabled, type CircleConfigIssue, type CircleWallet } from './types';

export type CircleLoginStatus =
  | 'disabled'
  /** Running preflight + probing the backend. */
  | 'checking'
  /** Configuration is incomplete; `issues` says what is missing. */
  | 'unconfigured'
  | 'ready'
  /** Redirecting to Google, or completing the round trip. */
  | 'authenticating'
  /** Circle's hosted PIN UI is open. */
  | 'awaitingPin'
  | 'connected'
  | 'error';

export type UseCircleLoginResult = {
  status: CircleLoginStatus;
  enabled: boolean;
  issues: CircleConfigIssue[];
  /** Whether `issues` may be shown in the UI, or only logged. */
  canShowDiagnostics: boolean;
  session: CircleSession | null;
  wallet: CircleWallet | null;
  address?: string;
  error: Error | null;
  signIn: () => Promise<void>;
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
  const chainIdFromWagmi = useChainId();
  const circle = context.options?.circle;
  const enabled = isCircleEnabled(circle);
  const chainId = circle?.defaultChainId ?? chainIdFromWagmi;

  const [status, setStatus] = useState<CircleLoginStatus>(
    enabled ? 'checking' : 'disabled'
  );
  const [issues, setIssues] = useState<CircleConfigIssue[]>([]);
  const [session, setSession] = useState<CircleSession | null>(null);
  const [wallet, setWallet] = useState<CircleWallet | null>(null);
  const [error, setError] = useState<Error | null>(null);

  // Guards React 18 StrictMode's double effect: resuming a login twice would
  // consume the pending record and fail the second time.
  const resumedRef = useRef(false);

  const adapter = resolveBackendAdapter(circle);
  const canShowDiagnostics = shouldShowDiagnostics(context.debugMode);

  const fail = useCallback(
    (cause: unknown) => {
      const asError =
        cause instanceof Error ? cause : new Error(String(cause));
      context.log?.('[circle] ', asError);
      setError(asError);
      setStatus('error');
    },
    [context]
  );

  /** Preflight + backend health, merged into one issue list. */
  const check = useCallback(async (): Promise<CircleConfigIssue[]> => {
    const clientIssues = preflightCircleConfig(circle, chainId);

    let serverIssues: CircleConfigIssue[] = [];
    try {
      serverIssues = issuesFromHealth(await adapter.health?.());
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
  }, [adapter, chainId, circle, context]);

  useEffect(() => {
    if (!enabled) {
      setStatus('disabled');
      return;
    }
    if (resumedRef.current) return;
    resumedRef.current = true;

    let cancelled = false;

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
            adapter,
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

      const stored = readSession();
      if (stored) {
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
    // Intentionally keyed on `enabled` alone. This effect consumes the one-shot
    // pending-login record, so re-running it when a callback identity changes
    // would attempt to resume a login that has already been consumed.
  }, [enabled]);

  const signIn = useCallback(async () => {
    if (!enabled || !circle) return;

    setError(null);

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

  const signOut = useCallback(() => {
    clearSession();
    resetCircleSdk();
    setSession(null);
    setWallet(null);
    setError(null);
    setStatus(enabled ? 'ready' : 'disabled');
  }, [enabled]);

  return {
    status,
    enabled,
    issues,
    canShowDiagnostics,
    session,
    wallet,
    address: wallet?.address ?? session?.address,
    error,
    signIn,
    signOut,
  };
};

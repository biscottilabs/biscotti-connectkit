'use client';

import { useCircleLogin } from 'biscotti-finance-connectkit';

/**
 * Phase 2 test surface for Sign in with Circle.
 *
 * This exercises the login flow directly, before the wagmi connector exists, so
 * the OAuth redirect and PIN challenge can be verified in isolation. The real
 * entry point lands in the ConnectKit modal later.
 */
export function CirclePanel() {
  const {
    status,
    enabled,
    issues,
    canShowDiagnostics,
    address,
    session,
    error,
    signIn,
    signOut,
  } = useCircleLogin();

  if (!enabled) return null;

  return (
    <div style={{ marginTop: 24, padding: 16, border: '1px solid #ccc' }}>
      <h2>Sign in with Circle</h2>
      <div>status: {status}</div>

      {status === 'unconfigured' &&
        (canShowDiagnostics ? (
          <div style={{ marginTop: 12 }}>
            <strong>Configuration incomplete:</strong>
            <ul>
              {issues.map((issue) => (
                <li key={`${issue.id}-${issue.scope}`}>
                  <code>{issue.envVar ?? issue.id}</code> ({issue.scope}) —{' '}
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p>Sign in with Circle is temporarily unavailable.</p>
        ))}

      {address && (
        <div style={{ marginTop: 12 }}>
          <div>
            wallet: <code>{address}</code>
          </div>
          {session?.email && <div>email: {session.email}</div>}
        </div>
      )}

      {error && <div style={{ color: 'crimson' }}>{error.message}</div>}

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => signIn()}
          disabled={
            status === 'authenticating' ||
            status === 'awaitingPin' ||
            status === 'checking'
          }
        >
          Continue with Google
        </button>
        {status === 'connected' && (
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}

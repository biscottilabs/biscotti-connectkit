'use client';

import { useState } from 'react';
import { useCircleLogin } from '@biscottidex/connectkit';

/**
 * Headless example for developers building their own Circle authentication UI.
 */
export function CirclePanel() {
  const [email, setEmail] = useState('');
  const {
    status,
    enabled,
    issues,
    canShowDiagnostics,
    address,
    session,
    error,
    activeMethod,
    signInWithGoogle,
    signInWithEmail,
    cancelSignIn,
    signOut,
  } = useCircleLogin();

  if (!enabled) return null;

  return (
    <div style={{ marginTop: 24, padding: 16, border: '1px solid #ccc' }}>
      <h2>Sign in with Circle</h2>
      <div>status: {status}</div>
      {activeMethod && <div>method: {activeMethod}</div>}

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
          onClick={() => signInWithGoogle()}
          disabled={
            status === 'authenticating' ||
            status === 'awaitingPin' ||
            status === 'checking'
          }
        >
          Continue with Google
        </button>
        <form
          style={{ display: 'flex', gap: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            void signInWithEmail(email);
          }}
        >
          <input
            type="email"
            value={email}
            required
            placeholder="you@example.com"
            aria-label="Email address"
            onChange={(event) => setEmail(event.target.value)}
          />
          <button
            type="submit"
            disabled={
              !email ||
              status === 'authenticating' ||
              status === 'awaitingPin' ||
              status === 'checking'
            }
          >
            Continue with email
          </button>
        </form>
        {status === 'authenticating' && activeMethod === 'email' && (
          <button type="button" onClick={cancelSignIn}>
            Cancel
          </button>
        )}
        {status === 'connected' && (
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}

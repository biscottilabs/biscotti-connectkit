import { createConnector } from '@wagmi/core';
import { getAddress, type Address, type Chain } from 'viem';

import { resolveBackendAdapter } from './backend';
import { toCircleBlockchain } from './chains';
import { beginGoogleLogin } from './login';
import { createCircleProvider, type CircleProvider } from './provider';
import { resetCircleSdk } from './sdk';
import {
  clearSession,
  readSession,
  updateSession,
  type CircleSession,
} from './session';
import type { CircleOptions } from './types';

export const CIRCLE_CONNECTOR_ID = 'circle';

export type CircleConnectorParameters = {
  circle: CircleOptions;
};

/**
 * wagmi connector backed by a Circle user-controlled wallet.
 *
 * The connector is a thin adapter over the session that the login flow writes:
 * it does not own authentication. That split matters because Google sign-in
 * navigates the entire page away, which no `connect()` promise can survive — so
 * `connect()` either finds an existing session and returns immediately, or
 * kicks off the redirect and lets the app reconnect on the way back.
 */
/** Exposed on the connector so the UI can read config without it being declared twice. */
export type CircleConnectorProperties = {
  circleOptions: CircleOptions;
};

export const circleConnector = ({ circle }: CircleConnectorParameters) =>
  createConnector<CircleProvider, CircleConnectorProperties>((config) => {
    const adapter = resolveBackendAdapter(circle);

    const fallbackChainId = (): number =>
      circle.defaultChainId ?? config.chains[0].id;

    const currentChainId = (): number =>
      readSession()?.chainId ?? fallbackChainId();

    const provider = createCircleProvider({
      chains: config.chains,
      transports: config.transports,
      getSession: readSession,
      getChainId: currentChainId,
      // Signing and transactions are installed in the phases that follow.
    });

    const accountsFrom = (session: CircleSession | null): readonly Address[] =>
      session?.address ? [getAddress(session.address)] : [];

    return {
      id: CIRCLE_CONNECTOR_ID,
      name: circle.name ?? 'Sign in with Circle',
      type: CIRCLE_CONNECTOR_ID,
      circleOptions: circle,

      async connect({ chainId } = {}) {
        const session = readSession();

        if (session?.address && session.walletId) {
          return {
            accounts: accountsFrom(session),
            chainId: session.chainId ?? fallbackChainId(),
          };
        }

        // No usable session: start Google sign-in. This navigates away, so the
        // promise below is not expected to settle — the app reconnects after
        // the redirect, once the login flow has written a session.
        await beginGoogleLogin({
          circle,
          adapter,
          chainId: chainId ?? fallbackChainId(),
        });

        throw new Error(
          'Redirecting to Google to complete Circle sign-in. This connection will resume when you return.'
        );
      },

      async disconnect() {
        clearSession();
        resetCircleSdk();
      },

      async getAccounts() {
        return accountsFrom(readSession());
      },

      async getChainId() {
        return currentChainId();
      },

      async getProvider() {
        return provider;
      },

      async isAuthorized() {
        // `readSession` drops expired tokens, so a truthy result here means the
        // session is genuinely still usable.
        const session = readSession();
        return !!session?.address && !!session.walletId;
      },

      async switchChain({ chainId }) {
        const chain = config.chains.find((c) => c.id === chainId);
        if (!chain) {
          throw new Error(`Chain ${chainId} is not configured in this app.`);
        }

        const session = readSession();
        if (!session) {
          throw new Error('Sign in with Circle before switching chains.');
        }

        const blockchain = toCircleBlockchain(chainId, circle.chains);
        if (!blockchain) {
          throw new Error(
            `${chain.name} has no Circle blockchain mapping. Add one via \`circle.chains\`.`
          );
        }

        // A Circle wallet belongs to exactly one blockchain, so switching chains
        // means switching wallets — not re-pointing the existing one.
        const target = (
          await adapter.listWallets({ userToken: session.userToken })
        ).find((wallet) => wallet.blockchain === blockchain);

        if (!target) {
          throw new Error(
            `You do not have a Circle wallet on ${chain.name} yet.`
          );
        }

        updateSession({
          walletId: target.id,
          address: target.address,
          chainId,
        });

        config.emitter.emit('change', {
          accounts: [getAddress(target.address)],
          chainId,
        });

        return chain as Chain;
      },

      onAccountsChanged(accounts) {
        if (accounts.length === 0) {
          config.emitter.emit('disconnect');
          return;
        }
        config.emitter.emit('change', {
          accounts: accounts.map((account) => getAddress(account)),
        });
      },

      onChainChanged(chainId) {
        config.emitter.emit('change', { chainId: Number(chainId) });
      },

      onDisconnect() {
        clearSession();
        config.emitter.emit('disconnect');
      },
    };
  });

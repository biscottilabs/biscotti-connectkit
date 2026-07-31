import { createConnector } from '@wagmi/core';
import { formatEther, getAddress, isHex, type Address, type Chain } from 'viem';

import { resolveBackendAdapter } from './backend';
import { toCircleBlockchain } from './chains';
import { beginGoogleLogin } from './login';
import {
  createCircleProvider,
  CircleNotConnectedError,
  type CircleProvider,
} from './provider';
import {
  executeChallenge,
  extractSignature,
  extractTxHash,
  getCircleSdk,
  resetCircleSdk,
} from './sdk';
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

    /**
     * Every signing operation follows the same shape: ask the backend for a
     * challenge, then hand it to the SDK, which opens Circle's hosted
     * confirmation UI and returns the result once the user authorises.
     */
    const runChallenge = async (
      request: (session: CircleSession) => Promise<{ challengeId: string }>
    ) => {
      const session = readSession();
      if (!session?.walletId) throw new CircleNotConnectedError();

      const { challengeId } = await request(session);

      const sdk = await getCircleSdk();
      sdk.setAuthentication({
        userToken: session.userToken,
        encryptionKey: session.encryptionKey,
      });

      return executeChallenge(sdk, challengeId);
    };

    const provider = createCircleProvider({
      chains: config.chains,
      transports: config.transports,
      getSession: readSession,
      getChainId: currentChainId,

      signMessage: async (message) => {
        const result = await runChallenge((session) =>
          adapter.signMessage({
            userToken: session.userToken,
            walletId: session.walletId!,
            message,
            // viem hex-encodes the message before calling personal_sign. Passing
            // it through as hex preserves the exact bytes; decoding to a string
            // first would corrupt any message that is not valid UTF-8.
            encodedByHex: isHex(message),
          })
        );
        return extractSignature(result);
      },

      signTypedData: async (data) => {
        const result = await runChallenge((session) =>
          adapter.signTypedData({
            userToken: session.userToken,
            walletId: session.walletId!,
            data,
          })
        );
        return extractSignature(result);
      },

      sendTransaction: async (tx) => {
        const to = tx.to as string | undefined;
        if (!to) {
          // Circle's contract-execution endpoint requires a destination, so a
          // bare contract deployment has nowhere to go.
          throw new Error(
            'Circle wallets cannot deploy contracts: a transaction must have a `to` address.'
          );
        }

        const result = await runChallenge((session) =>
          adapter.createTransaction({
            userToken: session.userToken,
            walletId: session.walletId!,
            destinationAddress: to,
            callData: (tx.data as string | undefined) || undefined,
            // viem sends `value` as wei; Circle expects the native amount in
            // whole units. Skipping this conversion would overpay by 10^18.
            amount: tx.value
              ? formatEther(BigInt(tx.value as string | number | bigint))
              : undefined,
            feeLevel: circle.feeLevel ?? 'MEDIUM',
          })
        );

        // Note: any explicit gas/maxFeePerGas the caller set is dropped. Circle
        // prices its own transactions via fee level and rejects raw gas fields.
        return extractTxHash(result);
      },
    });

    const accountsFrom = (session: CircleSession | null): readonly Address[] =>
      session?.address ? [getAddress(session.address)] : [];

    return {
      id: CIRCLE_CONNECTOR_ID,
      name: circle.name ?? 'Sign in with Circle',
      type: CIRCLE_CONNECTOR_ID,
      circleOptions: circle,

      async connect<withCapabilities extends boolean = false>({
        chainId,
        withCapabilities,
      }: {
        chainId?: number;
        isReconnecting?: boolean;
        withCapabilities?: withCapabilities | boolean;
      } = {}) {
        const session = readSession();

        if (session?.address && session.walletId) {
          const accounts = accountsFrom(session);
          return {
            // wagmi 2.19 added an optional EIP-5792 capability-shaped account
            // result. Circle does not currently advertise wallet capabilities,
            // so return an empty capability record when the caller requests it.
            accounts: (withCapabilities
              ? accounts.map((address) => ({ address, capabilities: {} }))
              : accounts) as never,
            chainId: session.chainId ?? fallbackChainId(),
          };
        }

        if (!(circle.methods ?? ['google', 'email']).includes('google')) {
          throw new Error(
            'This Circle connector does not enable Google. Start email authentication with `useCircleLogin().signInWithEmail(email)` before connecting.'
          );
        }

        // No usable session: preserve wagmi's legacy direct-connect behaviour
        // by starting Google. Apps that offer multiple methods should use the
        // ConnectKit method picker or the explicit useCircleLogin functions.
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

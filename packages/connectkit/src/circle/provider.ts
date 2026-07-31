import {
  createClient,
  getAddress,
  http,
  numberToHex,
  type Address,
  type Chain,
  type Transport,
} from 'viem';

import type { CircleSession } from './session';

/**
 * Circle exposes no EIP-1193 provider — it has a REST API and hosted
 * authentication/confirmation UI.
 * This shim supplies one, which is what lets a Circle wallet behave like any
 * other wagmi connector.
 *
 * Requests split three ways:
 *
 *  - account/chain queries answered from the session we already hold
 *  - signing and transactions translated into Circle challenges (Phases 4-5)
 *  - everything else — the entire read surface — forwarded to the chain's RPC,
 *    reusing the transport the app already configured so Alchemy/Infura keys
 *    and rate limits are honoured rather than bypassed
 */

export class CircleMethodNotSupportedError extends Error {
  readonly method: string;

  constructor(method: string) {
    super(
      `The Circle connector does not support "${method}". Circle wallets sign through a hosted challenge flow, which cannot satisfy this method.`
    );
    this.name = 'CircleMethodNotSupportedError';
    this.method = method;
  }
}

export class CircleNotConnectedError extends Error {
  constructor() {
    super('No Circle wallet is connected. Sign in with Circle first.');
    this.name = 'CircleNotConnectedError';
  }
}

type RequestArgs = { method: string; params?: unknown };

export type CircleProvider = {
  request: <T = unknown>(args: RequestArgs) => Promise<T>;
  /**
   * wagmi probes for these on every provider. Circle emits no provider-level
   * events — account and chain changes originate from our own connector — so
   * they are inert rather than absent, which keeps callers from crashing.
   */
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener: (
    event: string,
    listener: (...args: unknown[]) => void
  ) => void;
};

export type CircleProviderDeps = {
  chains: readonly [Chain, ...Chain[]];
  transports?: Record<number, Transport>;
  getSession: () => CircleSession | null;
  getChainId: () => number;
  /** Installed in Phase 4/5. Absent means "not supported yet". */
  signMessage?: (message: string) => Promise<string>;
  signTypedData?: (data: string) => Promise<string>;
  sendTransaction?: (tx: Record<string, unknown>) => Promise<string>;
};

/** Methods the shim answers or translates rather than forwarding to the RPC. */
const LOCAL_METHODS = new Set([
  'eth_accounts',
  'eth_requestAccounts',
  'eth_chainId',
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
  'eth_signTransaction',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
]);

export const createCircleProvider = (
  deps: CircleProviderDeps
): CircleProvider => {
  const readClient = (chainId: number) => {
    const chain = deps.chains.find((c) => c.id === chainId) ?? deps.chains[0];
    return createClient({
      chain,
      // Falls back to the chain's public RPC when the app configured none.
      transport: deps.transports?.[chain.id] ?? http(),
    });
  };

  const requireAddress = (): Address => {
    const session = deps.getSession();
    if (!session?.address) throw new CircleNotConnectedError();
    return getAddress(session.address);
  };

  const request = async <T>({ method, params }: RequestArgs): Promise<T> => {
    if (!LOCAL_METHODS.has(method)) {
      // Read-only traffic: eth_call, eth_getBalance, eth_estimateGas,
      // eth_getTransactionReceipt, eth_blockNumber, and everything else.
      return readClient(deps.getChainId()).request({
        method,
        params,
      } as never) as Promise<T>;
    }

    switch (method) {
      case 'eth_accounts':
      case 'eth_requestAccounts':
        return [requireAddress()] as T;

      case 'eth_chainId':
        return numberToHex(deps.getChainId()) as T;

      case 'personal_sign': {
        if (!deps.signMessage) throw new CircleMethodNotSupportedError(method);
        // personal_sign params are [message, address] — the reverse of eth_sign.
        const [message] = params as [string, string];
        return (await deps.signMessage(message)) as T;
      }

      case 'eth_sign': {
        // Legacy blind signing: unsafe, and Circle offers no equivalent.
        throw new CircleMethodNotSupportedError(method);
      }

      case 'eth_signTypedData':
      case 'eth_signTypedData_v3':
      case 'eth_signTypedData_v4': {
        if (!deps.signTypedData) throw new CircleMethodNotSupportedError(method);
        const [, data] = params as [string, string | object];
        return (await deps.signTypedData(
          typeof data === 'string' ? data : JSON.stringify(data)
        )) as T;
      }

      case 'eth_sendTransaction': {
        if (!deps.sendTransaction)
          throw new CircleMethodNotSupportedError(method);
        const [tx] = params as [Record<string, unknown>];
        return (await deps.sendTransaction(tx)) as T;
      }

      case 'eth_signTransaction':
        // Circle broadcasts as part of the challenge; it never hands back a
        // signed-but-unsent transaction.
        throw new CircleMethodNotSupportedError(method);

      case 'wallet_switchEthereumChain':
      case 'wallet_addEthereumChain':
        // Handled by the connector's switchChain, which must also move the
        // session to the matching Circle wallet.
        throw new CircleMethodNotSupportedError(method);

      default:
        throw new CircleMethodNotSupportedError(method);
    }
  };

  return {
    request,
    on: () => undefined,
    removeListener: () => undefined,
  };
};

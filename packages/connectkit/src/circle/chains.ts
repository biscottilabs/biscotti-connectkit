/**
 * Circle identifies chains by its own string enum rather than by EIP-155 chain
 * id, so every call that crosses the Circle API boundary needs a translation in
 * one direction or the other:
 *
 *  - outbound: wagmi gives us a numeric `chainId`, Circle wants `"BASE-SEPOLIA"`
 *  - inbound:  `listWallets` returns `"BASE-SEPOLIA"`, wagmi wants `84532`
 *
 * Only EVM chains are mapped. Circle also supports Solana, NEAR and Aptos, but
 * those cannot back an EIP-1193 provider and are therefore out of scope for the
 * connector.
 */
export type CircleBlockchain =
  | 'ETH'
  | 'ETH-SEPOLIA'
  | 'MATIC'
  | 'MATIC-AMOY'
  | 'AVAX'
  | 'AVAX-FUJI'
  | 'ARB'
  | 'ARB-SEPOLIA'
  | 'BASE'
  | 'BASE-SEPOLIA'
  | 'OP'
  | 'OP-SEPOLIA'
  | 'UNI'
  | 'UNI-SEPOLIA';

/**
 * Chains whose Circle identifier and EIP-155 id we have both verified. Circle
 * additionally exposes `MONAD`, `ARC-TESTNET` and the generic `EVM` /
 * `EVM-TESTNET` buckets; those are deliberately absent rather than guessed at,
 * because a wrong chain id here routes a signature request at the wrong network.
 * Use `circle.chains` in ConnectKitOptions to add them once confirmed.
 */
export const circleChainsByChainId: Record<number, CircleBlockchain> = {
  1: 'ETH',
  11155111: 'ETH-SEPOLIA',
  137: 'MATIC',
  80002: 'MATIC-AMOY',
  43114: 'AVAX',
  43113: 'AVAX-FUJI',
  42161: 'ARB',
  421614: 'ARB-SEPOLIA',
  8453: 'BASE',
  84532: 'BASE-SEPOLIA',
  10: 'OP',
  11155420: 'OP-SEPOLIA',
  130: 'UNI',
  1301: 'UNI-SEPOLIA',
};

export type CircleChainMap = Record<number, CircleBlockchain>;

/**
 * Resolves the Circle identifier for a chain id, honouring any app-supplied
 * overrides/additions first so a consumer can support a chain we do not ship.
 */
export const toCircleBlockchain = (
  chainId: number,
  overrides?: CircleChainMap
): CircleBlockchain | undefined =>
  overrides?.[chainId] ?? circleChainsByChainId[chainId];

/**
 * Inverse of {@link toCircleBlockchain}. Returns `undefined` for chains we do
 * not map — including the non-EVM ones — so callers can skip wallets the
 * connector cannot represent instead of surfacing a bogus chain id.
 */
export const toChainId = (
  blockchain: string,
  overrides?: CircleChainMap
): number | undefined => {
  const merged = { ...circleChainsByChainId, ...overrides };
  const match = Object.entries(merged).find(
    ([, value]) => value === blockchain
  );
  return match ? Number(match[0]) : undefined;
};

export const isCircleSupportedChain = (
  chainId: number,
  overrides?: CircleChainMap
): boolean => toCircleBlockchain(chainId, overrides) !== undefined;

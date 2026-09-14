/**
 * Circle identifies chains by its own string enum rather than by EIP-155 chain
 * id, so every call that crosses the Circle API boundary needs a translation in
 * one direction or the other:
 *
 *  - outbound: wagmi gives us a numeric `chainId`, Circle wants `"ARC-TESTNET"`
 *  - inbound:  `listWallets` returns `"ARC-TESTNET"`, wagmi wants `5042002`
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
  | 'UNI-SEPOLIA'
  | 'MONAD'
  | 'MONAD-TESTNET'
  | 'ARC-TESTNET'
  /**
   * Circle's generic buckets for other EVM chains. Circle only creates wallets
   * and signs on these — it does not broadcast — so `sendTransaction` will not
   * work. Map them via `circle.chains` only if signing is all you need.
   */
  | 'EVM'
  | 'EVM-TESTNET';

/**
 * Circle runs two fully separate environments. The API key decides which one a
 * request reaches: `TEST_API_KEY:` keys only work against testnets and
 * `LIVE_API_KEY:` keys only against mainnets. Users, tokens and wallets never
 * cross between them.
 */
export type CircleEnvironment = 'testnet' | 'mainnet';

export const CIRCLE_ENVIRONMENTS: readonly CircleEnvironment[] = [
  'testnet',
  'mainnet',
];

export const isCircleEnvironment = (
  value: unknown
): value is CircleEnvironment => value === 'testnet' || value === 'mainnet';

/**
 * Chains whose Circle identifier and EIP-155 id we have both verified. The
 * generic `EVM` / `EVM-TESTNET` buckets are deliberately absent rather than
 * guessed at, because a wrong chain id here routes a signature request at the
 * wrong network. Use `circle.chains` in ConnectKitOptions to add them.
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
  143: 'MONAD',
  10143: 'MONAD-TESTNET',
  5042002: 'ARC-TESTNET',
};

export type CircleChainMap = Record<number, CircleBlockchain>;

/**
 * Every Circle testnet identifier carries a network suffix, and no mainnet
 * identifier does, so the environment can be derived from the name alone. That
 * keeps app-supplied `circle.chains` entries environment-aware without asking
 * developers to label them.
 */
const TESTNET_SUFFIX = /-(TESTNET|SEPOLIA|AMOY|FUJI|DEVNET)$/;

export const environmentOfBlockchain = (
  blockchain: string
): CircleEnvironment =>
  TESTNET_SUFFIX.test(blockchain) ? 'testnet' : 'mainnet';

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

/** `undefined` when Circle has no mapping for the chain at all. */
export const environmentOfChain = (
  chainId: number,
  overrides?: CircleChainMap
): CircleEnvironment | undefined => {
  const blockchain = toCircleBlockchain(chainId, overrides);
  return blockchain ? environmentOfBlockchain(blockchain) : undefined;
};

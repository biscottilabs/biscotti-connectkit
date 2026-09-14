/**
 * Circle names chains with its own identifiers (`BASE`, `ARC-TESTNET`), not
 * EIP-155 ids. Only EVM chains are mapped, since the connector is EIP-1193.
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
  /** Other EVM chains. Circle signs but does not broadcast, so no transactions. */
  | 'EVM'
  | 'EVM-TESTNET';

/**
 * Circle's two separate environments. The API key selects one: `TEST_API_KEY:`
 * works only on testnets, `LIVE_API_KEY:` only on mainnets.
 */
export type CircleEnvironment = 'testnet' | 'mainnet';

export const CIRCLE_ENVIRONMENTS: readonly CircleEnvironment[] = [
  'testnet',
  'mainnet',
];

export const isCircleEnvironment = (
  value: unknown
): value is CircleEnvironment => value === 'testnet' || value === 'mainnet';

/** Verified pairs only. A wrong id would send signatures to the wrong network. */
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

// Every Circle testnet identifier has one of these suffixes; no mainnet one does.
const TESTNET_SUFFIX = /-(TESTNET|SEPOLIA|AMOY|FUJI|DEVNET)$/;

export const environmentOfBlockchain = (
  blockchain: string
): CircleEnvironment =>
  TESTNET_SUFFIX.test(blockchain) ? 'testnet' : 'mainnet';

export const toCircleBlockchain = (
  chainId: number,
  overrides?: CircleChainMap
): CircleBlockchain | undefined =>
  overrides?.[chainId] ?? circleChainsByChainId[chainId];

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

export const environmentOfChain = (
  chainId: number,
  overrides?: CircleChainMap
): CircleEnvironment | undefined => {
  const blockchain = toCircleBlockchain(chainId, overrides);
  return blockchain ? environmentOfBlockchain(blockchain) : undefined;
};

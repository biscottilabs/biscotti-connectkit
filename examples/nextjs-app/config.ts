import { getDefaultConfig } from 'biscotti-finance-connectkit';
import { createConfig } from 'wagmi';
import { mainnet, polygon, optimism, arbitrum, baseSepolia } from 'wagmi/chains';

export const config = createConfig(
  getDefaultConfig({
    // Base Sepolia is listed because Circle sandbox API keys only work against
    // testnets — a sandbox key on mainnet fails with an opaque auth error.
    appName: 'ConnectKit Next.js demo',
    chains: [mainnet, polygon, optimism, arbitrum, baseSepolia],
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    // Declared once. The connector carries these options, so ConnectKitProvider
    // reads them back without needing a second copy.
    circle: {
      appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID,
      google: { clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID },
      defaultChainId: baseSepolia.id,
    },
  })
);

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}

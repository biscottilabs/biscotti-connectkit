import { getDefaultConfig, type CircleEnvironment } from '@biscottidex/connectkit';
import { createConfig } from 'wagmi';
import {
  arbitrum,
  arcTestnet,
  base,
  baseSepolia,
  mainnet,
  optimism,
  polygon,
} from 'wagmi/chains';

export const config = createConfig(
  getDefaultConfig({
    appName: 'ConnectKit Next.js demo',
    chains: [mainnet, polygon, optimism, arbitrum, base, baseSepolia, arcTestnet],
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    circle: {
      environment: process.env.NEXT_PUBLIC_CIRCLE_ENVIRONMENT as
        | CircleEnvironment
        | undefined,
      google: { clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID },
      methods: ['google', 'email'],
      environments: {
        testnet: {
          appId: process.env.NEXT_PUBLIC_CIRCLE_TESTNET_APP_ID,
          defaultChainId: arcTestnet.id,
        },
        mainnet: {
          appId: process.env.NEXT_PUBLIC_CIRCLE_MAINNET_APP_ID,
          defaultChainId: base.id,
        },
      },
    },
  })
);

declare module 'wagmi' {
  interface Register {
    config: typeof config;
  }
}

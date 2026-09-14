import React from 'react';

import { WagmiProvider, createConfig } from 'wagmi';
import { arcTestnet, base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ConnectKitProvider,
  getDefaultConfig,
  type CircleEnvironment,
} from '@biscottidex/connectkit';

const circleEnvironment = import.meta.env.VITE_CIRCLE_ENVIRONMENT as
  | CircleEnvironment
  | undefined;
const chain = circleEnvironment === 'mainnet' ? base : arcTestnet;

const config = createConfig(
  getDefaultConfig({
    appName: 'Biscotti ConnectKit Vite demo',
    chains: [chain],
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID!,
    circle: {
      environment: circleEnvironment,
      google: {
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        // Must be registered in Google Cloud (http://localhost:5173).
        redirectUri: window.location.origin,
      },
      environments: {
        testnet: {
          appId: import.meta.env.VITE_CIRCLE_TESTNET_APP_ID,
          defaultChainId: arcTestnet.id,
        },
        mainnet: {
          appId: import.meta.env.VITE_CIRCLE_MAINNET_APP_ID,
          defaultChainId: base.id,
        },
      },
    },
  })
);

const queryClient = new QueryClient();

export const Web3Provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider debugMode={import.meta.env.DEV}>
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

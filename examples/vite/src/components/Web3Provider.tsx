import React from 'react';

import { WagmiProvider, createConfig } from 'wagmi';
import { arcTestnet, base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, getDefaultConfig } from '@biscottidex/connectkit';

const circleEnvironment =
  import.meta.env.VITE_CIRCLE_ENVIRONMENT === 'live' ? 'live' : 'sandbox';
const circleChain = circleEnvironment === 'live' ? base : arcTestnet;

const config = createConfig(
  getDefaultConfig({
    appName: 'Biscotti ConnectKit Vite demo',
    // Circle enforces live keys → mainnets and sandbox keys → testnets.
    chains: [circleChain],
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID!,
    circle: {
      appId: import.meta.env.VITE_CIRCLE_APP_ID,
      google: {
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        // Register this exact origin in Google Cloud. For the default Vite
        // server this resolves to http://localhost:5173.
        redirectUri: window.location.origin,
      },
      defaultChainId: circleChain.id,
      // The Vite dev server implements this path locally. In production,
      // deploy equivalent server routes that keep CIRCLE_API_KEY private.
      endpoints: { basePath: '/api/circle' },
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

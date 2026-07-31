import React from 'react';

import { WagmiProvider, createConfig } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, getDefaultConfig } from 'biscotti-finance-connectkit';

const config = createConfig(
  getDefaultConfig({
    appName: 'Biscotti ConnectKit Vite demo',
    // Circle sandbox credentials only work on testnets.
    chains: [baseSepolia],
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID!,
    circle: {
      appId: import.meta.env.VITE_CIRCLE_APP_ID,
      google: {
        clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        // Register this exact origin in Google Cloud. For the default Vite
        // server this resolves to http://localhost:5173.
        redirectUri: window.location.origin,
      },
      defaultChainId: baseSepolia.id,
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
        <ConnectKitProvider debugMode>{children}</ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

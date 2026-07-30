'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';

import { config } from '../config';
import { ConnectKitProvider } from 'biscotti-finance-connectkit';

const queryClient = new QueryClient();
export function Providers(props: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          debugMode
          options={{
            // Sign in with Circle. Leaving the env vars unset does not break
            // anything — the preflight check reports exactly what is missing.
            circle: {
              appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID,
              google: {
                clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
              },
              defaultChainId: 84532, // Base Sepolia
            },
          }}
        >
          {props.children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

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
        {/* Circle is configured in config.ts; debugMode surfaces the itemised
            configuration diagnostics instead of the generic user message. */}
        <ConnectKitProvider debugMode>{props.children}</ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

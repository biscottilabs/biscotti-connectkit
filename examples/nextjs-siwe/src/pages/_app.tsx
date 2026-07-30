import '@/styles/globals.css';
import { siweClient } from '@/utils/siweClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, getDefaultConfig } from 'biscotti-finance-connectkit';
import type { AppProps } from 'next/app';
import { useState } from 'react';
import { WagmiProvider, createConfig } from 'wagmi';

const config = createConfig(
  getDefaultConfig({
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    appName: 'My ConnectKit App',
  })
);

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <siweClient.Provider>
          <ConnectKitProvider>
            <Component {...pageProps} />
          </ConnectKitProvider>
        </siweClient.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

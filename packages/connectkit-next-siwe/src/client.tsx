import type { ComponentProps, FunctionComponent } from 'react';
import { SIWEProvider } from '@biscottidex/connectkit';
import { createSiweMessage } from 'viem/siwe';

export type NextClientSIWEConfig = {
  apiRoutePrefix: string;
  statement?: string;
};

export type NextSIWEProviderProps = Omit<
  ComponentProps<typeof SIWEProvider>,
  | 'getNonce'
  | 'createMessage'
  | 'verifyMessage'
  | 'getSession'
  | 'signOut'
  | 'data'
  | 'signIn'
  | 'status'
  | 'resetStatus'
>;

export type ConfigureClientSIWEResult = {
  Provider: FunctionComponent<NextSIWEProviderProps>;
};

export const configureClientSIWE = ({
  apiRoutePrefix,
  statement = 'Sign In With Ethereum.',
}: NextClientSIWEConfig): ConfigureClientSIWEResult => {
  const NextSIWEProvider = (props: NextSIWEProviderProps) => {
    return (
      <SIWEProvider
        getNonce={async () => {
          const res = await fetch(`${apiRoutePrefix}/nonce`);
          if (!res.ok) {
            throw new Error('Failed to fetch SIWE nonce');
          }
          return await res.text();
        }}
        createMessage={({ nonce, address, chainId }) =>
          createSiweMessage({
            version: '1',
            domain: window.location.host,
            uri: window.location.origin,
            address,
            chainId,
            nonce,
            statement,
          })
        }
        verifyMessage={({ message, signature }) =>
          fetch(`${apiRoutePrefix}/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message, signature }),
          }).then((res) => res.ok)
        }
        getSession={async () => {
          const res = await fetch(`${apiRoutePrefix}/session`);
          if (!res.ok) {
            throw new Error('Failed to fetch SIWE session');
          }
          const { address, chainId } = await res.json();
          return address && chainId ? { address, chainId } : null;
        }}
        signOut={() => fetch(`${apiRoutePrefix}/logout`).then((res) => res.ok)}
        {...props}
      />
    );
  };

  return {
    Provider: NextSIWEProvider,
  };
};

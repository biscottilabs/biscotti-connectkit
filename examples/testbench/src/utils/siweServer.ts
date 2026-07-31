import { configureServerSideSIWE } from '@biscottidex/connectkit-next-siwe/server';
import { ckConfig } from '../components/Web3Provider';

export const siweServer = configureServerSideSIWE({
  config: {
    chains: ckConfig.chains,
    transports: ckConfig.transports,
  },
  options: {
    afterLogout: async () => console.log('afterLogout'),
    afterNonce: async () => console.log('afterNonce'),
    afterSession: async () => console.log('afterSession'),
    afterVerify: async () => console.log('afterVerify'),
  },
});

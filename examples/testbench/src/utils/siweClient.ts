import { configureClientSIWE } from 'connectkit-next-siwe/client';

export const siweClient = configureClientSIWE({
  apiRoutePrefix: '/api/siwe',
  statement: 'fam token wen',
});

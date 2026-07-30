import {
  circleFetch,
  requireUserToken,
  type CircleEnvelope,
} from '../../../../lib/circle';
import { circleRoute } from '../../../../lib/circle-route';

type Body = { userToken?: string; blockchain?: string };

type Wallet = {
  id: string;
  address: string;
  blockchain: string;
  state?: string;
  accountType?: string;
};

/**
 * Lists the wallets belonging to the authenticated user.
 *
 * POST rather than GET because the user token travels in the body: putting a
 * session token in a query string would leak it into browser history, proxy
 * logs and referrer headers.
 */
export const POST = circleRoute<Body>(async (body) => {
  const userToken = requireUserToken(body);

  const result = await circleFetch<CircleEnvelope<{ wallets: Wallet[] }>>(
    '/wallets',
    {
      method: 'GET',
      userToken,
      searchParams: { blockchain: body.blockchain },
    }
  );

  return { wallets: result.data.wallets ?? [] };
});

import {
  circleFetch,
  idempotencyKey,
  requireUserToken,
  CircleApiError,
  type CircleEnvelope,
} from '../../../../lib/circle';
import { circleRoute } from '../../../../lib/circle-route';

type Body = {
  userToken?: string;
  blockchain?: string;
  accountType?: 'EOA' | 'SCA';
};

/**
 * Step 2: provision the user and their first wallet.
 *
 * Returns a `challengeId` rather than a wallet — the user still has to set a
 * PIN, which happens in Circle's hosted UI when the Web SDK executes this
 * challenge. The wallet only exists once that completes.
 */
export const POST = circleRoute<Body>(async (body) => {
  const userToken = requireUserToken(body);

  if (!body.blockchain) {
    throw new CircleApiError(400, 'Missing `blockchain` in request body.');
  }

  const result = await circleFetch<CircleEnvelope<{ challengeId: string }>>(
    '/user/initialize',
    {
      method: 'POST',
      userToken,
      body: {
        idempotencyKey: idempotencyKey(),
        blockchains: [body.blockchain],
        accountType: body.accountType ?? 'EOA',
      },
    }
  );

  return { challengeId: result.data.challengeId };
});

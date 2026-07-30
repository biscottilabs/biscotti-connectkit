import {
  circleFetch,
  requireUserToken,
  CircleApiError,
  type CircleEnvelope,
} from '../../../../lib/circle';
import { circleRoute } from '../../../../lib/circle-route';

type Body = {
  userToken?: string;
  walletId?: string;
  /** EIP-712 payload, JSON-stringified. */
  data?: string;
  memo?: string;
};

/**
 * Backs `eth_signTypedData_v4`, which is what Sign-In With Ethereum and most
 * permit/gasless flows depend on. EVM chains only.
 */
export const POST = circleRoute<Body>(async (body) => {
  const userToken = requireUserToken(body);

  if (!body.walletId || !body.data) {
    throw new CircleApiError(400, 'Both `walletId` and `data` are required.');
  }

  const result = await circleFetch<CircleEnvelope<{ challengeId: string }>>(
    '/user/sign/typedData',
    {
      method: 'POST',
      userToken,
      body: {
        walletId: body.walletId,
        data: body.data,
        memo: body.memo,
      },
    }
  );

  return { challengeId: result.data.challengeId };
});

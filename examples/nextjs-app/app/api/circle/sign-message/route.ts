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
  message?: string;
  encodedByHex?: boolean;
  memo?: string;
};

/**
 * Backs `personal_sign`. Returns a challenge; the signature itself comes back
 * to the browser from the Web SDK's `execute()` callback once the user has
 * entered their PIN — it never passes through this server.
 */
export const POST = circleRoute<Body>(async (body) => {
  const userToken = requireUserToken(body);

  if (!body.walletId || body.message === undefined) {
    throw new CircleApiError(
      400,
      'Both `walletId` and `message` are required.'
    );
  }

  const result = await circleFetch<CircleEnvelope<{ challengeId: string }>>(
    '/user/sign/message',
    {
      method: 'POST',
      userToken,
      body: {
        walletId: body.walletId,
        message: body.message,
        encodedByHex: body.encodedByHex ?? false,
        memo: body.memo,
      },
    }
  );

  return { challengeId: result.data.challengeId };
});

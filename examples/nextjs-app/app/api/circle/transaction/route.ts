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
  walletId?: string;
  destinationAddress?: string;
  /** Hex calldata. Omitted for a plain value transfer. */
  callData?: string;
  /** Native-currency amount, in whole units (not wei). */
  amount?: string;
  feeLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  refId?: string;
};

/**
 * Backs `eth_sendTransaction`.
 *
 * Circle models an arbitrary EVM call as a "contract execution": a destination
 * plus calldata, with gas chosen by fee level rather than by explicit
 * gasPrice/maxFeePerGas. That mismatch is why the connector cannot forward a
 * wagmi transaction request verbatim — see the translation in the provider.
 */
export const POST = circleRoute<Body>(async (body) => {
  const userToken = requireUserToken(body);

  if (!body.walletId || !body.destinationAddress) {
    throw new CircleApiError(
      400,
      'Both `walletId` and `destinationAddress` are required.'
    );
  }

  const result = await circleFetch<CircleEnvelope<{ challengeId: string }>>(
    '/user/transactions/contractExecution',
    {
      method: 'POST',
      userToken,
      body: {
        idempotencyKey: idempotencyKey(),
        walletId: body.walletId,
        contractAddress: body.destinationAddress,
        callData: body.callData,
        amount: body.amount,
        feeLevel: body.feeLevel ?? 'MEDIUM',
        refId: body.refId,
      },
    }
  );

  return { challengeId: result.data.challengeId };
});

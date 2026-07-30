import {
  circleFetch,
  idempotencyKey,
  CircleApiError,
  type CircleEnvelope,
} from '../../../../lib/circle';
import { circleRoute } from '../../../../lib/circle-route';

type Body = { deviceId?: string };

type DeviceTokenData = {
  deviceToken: string;
  deviceEncryptionKey: string;
};

/**
 * Step 1 of social login: exchange the SDK's device id for a short-lived device
 * token. The token is bound to that specific device id, which is what stops a
 * stolen token being replayed from another browser.
 */
export const POST = circleRoute<Body>(async (body) => {
  if (!body.deviceId) {
    throw new CircleApiError(400, 'Missing `deviceId` in request body.');
  }

  const result = await circleFetch<CircleEnvelope<DeviceTokenData>>(
    '/users/social/token',
    {
      method: 'POST',
      body: {
        idempotencyKey: idempotencyKey(),
        deviceId: body.deviceId,
      },
    }
  );

  return {
    deviceToken: result.data.deviceToken,
    deviceEncryptionKey: result.data.deviceEncryptionKey,
  };
});

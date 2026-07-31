import {
  circleFetch,
  idempotencyKey,
  CircleApiError,
  type CircleEnvelope,
} from '../../../../lib/circle';
import { circleRoute } from '../../../../lib/circle-route';

type Body = {
  deviceId?: string;
  email?: string;
};

type EmailOtpData = {
  deviceToken: string;
  deviceEncryptionKey: string;
  otpToken: string;
};

/**
 * Starts Circle email authentication and sends the one-time code.
 *
 * SMTP delivery is configured in Circle Console. The returned temporary tokens
 * are passed to the browser SDK, which opens Circle's hosted OTP verification
 * UI and exchanges a valid code for the authenticated user session.
 */
export const POST = circleRoute<Body>(async (body) => {
  if (!body.deviceId || !body.email) {
    throw new CircleApiError(
      400,
      'Both `deviceId` and `email` are required.'
    );
  }

  const result = await circleFetch<CircleEnvelope<EmailOtpData>>(
    '/users/email/token',
    {
      method: 'POST',
      body: {
        idempotencyKey: idempotencyKey(),
        deviceId: body.deviceId,
        email: body.email,
      },
    }
  );

  return result.data;
});

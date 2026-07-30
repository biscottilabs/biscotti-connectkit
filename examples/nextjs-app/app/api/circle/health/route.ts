import { NextResponse } from 'next/server';
import { getMissingServerConfig } from '../../../../lib/circle';

/**
 * Configuration probe for the Circle integration.
 *
 * Reports only *which* values are absent, never their contents, so it is safe
 * to leave enabled in production. ConnectKit calls this before starting a login
 * so a developer sees "CIRCLE_API_KEY is not set on the server" instead of an
 * opaque failure halfway through an OAuth redirect.
 */
export const GET = async () => {
  const missing = getMissingServerConfig();

  return NextResponse.json({
    ok: missing.length === 0,
    missing,
  });
};

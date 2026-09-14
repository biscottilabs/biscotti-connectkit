import {
  createCircleHandler,
  readCircleServerEnv,
} from '@biscottidex/connectkit/server';

// Reads CIRCLE_TESTNET_API_KEY and CIRCLE_MAINNET_API_KEY.
const handler = createCircleHandler(readCircleServerEnv());

export const dynamic = 'force-dynamic';

export { handler as GET, handler as POST };

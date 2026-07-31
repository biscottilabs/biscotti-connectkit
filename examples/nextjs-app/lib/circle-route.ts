import { NextResponse } from 'next/server';
import { CircleApiError } from './circle';

/**
 * Wraps a route handler so every Circle failure becomes a predictable JSON
 * response instead of an unhandled 500. ConnectKit's client reads the body text
 * into its error message, so keeping the message useful here is what makes a
 * misconfiguration legible in the browser.
 */
export const circleRoute = <TBody>(
  handler: (body: TBody) => Promise<unknown>
) => {
  return async (request: Request) => {
    let body = {} as TBody;

    if (request.method !== 'GET') {
      try {
        body = (await request.json()) as TBody;
      } catch {
        return NextResponse.json(
          { message: 'Request body must be valid JSON.' },
          { status: 400 }
        );
      }
    }

    try {
      return NextResponse.json(await handler(body));
    } catch (error) {
      if (error instanceof CircleApiError) {
        return NextResponse.json(
          { message: error.message },
          { status: error.status }
        );
      }
      // Never forward an unknown error's detail: it may contain the API key or
      // other server internals. Log it server-side instead.
      console.error('[circle] unexpected route failure', error);
      return NextResponse.json(
        { message: 'Unexpected server error. Check the server logs.' },
        { status: 500 }
      );
    }
  };
};

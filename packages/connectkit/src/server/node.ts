import type { CircleHandler } from './handler';

// Structural types so consumers do not need `@types/node`.
type NodeRequest = AsyncIterable<Uint8Array | string> & {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
};

type NodeResponse = {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
};

export type CircleNodeMiddlewareOptions = {
  /** Defaults to `/api/circle`. */
  basePath?: string;
};

/** Connect-style middleware for Express, Vite or `http.createServer`. */
export const createCircleNodeMiddleware = (
  handler: CircleHandler,
  { basePath = '/api/circle' }: CircleNodeMiddlewareOptions = {}
) => {
  const prefix = basePath.replace(/\/$/, '');

  return async (
    request: NodeRequest,
    response: NodeResponse,
    next?: (error?: unknown) => void
  ) => {
    const pathname = (request.url ?? '/').split('?')[0];
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) {
      if (next) return next();
      response.statusCode = 404;
      response.end();
      return;
    }

    try {
      const chunks: Uint8Array[] = [];
      for await (const chunk of request) {
        chunks.push(
          typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
        );
      }

      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value === undefined) continue;
        headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }

      const method = request.method ?? 'GET';
      const host = headers.get('host') ?? 'localhost';
      const body =
        method === 'GET' || method === 'HEAD' || chunks.length === 0
          ? undefined
          : new Blob(chunks);

      const result = await handler(
        new Request(`http://${host}${request.url ?? '/'}`, {
          method,
          headers,
          body,
        })
      );

      response.statusCode = result.status;
      result.headers.forEach((value, name) => response.setHeader(name, value));
      response.end(await result.text());
    } catch (error) {
      if (next) return next(error);
      response.statusCode = 500;
      response.end();
    }
  };
};

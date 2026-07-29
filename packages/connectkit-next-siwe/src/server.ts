import type { IncomingMessage, ServerResponse } from 'http';
import { getIronSession } from 'iron-session';
import type { IronSession, IronSessionOptions } from 'iron-session';
import type { NextApiHandler, NextApiRequest, NextApiResponse } from 'next';
import { createPublicClient, http } from 'viem';
import type { Chain, PublicClient, Transport } from 'viem';
import * as allChains from 'viem/chains';
import { generateSiweNonce, parseSiweMessage } from 'viem/siwe';

export type NextSIWESession<TSessionData extends object = {}> = IronSession &
  TSessionData & {
    nonce?: string;
    address?: string;
    chainId?: number;
  };

export type RouteHandlerOptions = {
  afterNonce?: (
    req: NextApiRequest,
    res: NextApiResponse,
    session: NextSIWESession<{}>
  ) => Promise<void>;
  afterVerify?: (
    req: NextApiRequest,
    res: NextApiResponse,
    session: NextSIWESession<{}>
  ) => Promise<void>;
  afterSession?: (
    req: NextApiRequest,
    res: NextApiResponse,
    session: NextSIWESession<{}>
  ) => Promise<void>;
  afterLogout?: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;
};

export type NextServerSIWEConfig = {
  config?: {
    chains: readonly [Chain, ...Chain[]];
    transports?: Record<number, Transport>;
  };
  session?: Partial<IronSessionOptions>;
  options?: RouteHandlerOptions;
};

export type ConfigureServerSIWEResult<TSessionData extends object = {}> = {
  apiRouteHandler: NextApiHandler;
  getSession: (
    req: IncomingMessage,
    res: ServerResponse
  ) => Promise<NextSIWESession<TSessionData>>;
};

const getSession = async <TSessionData extends object = {}>(
  req: IncomingMessage,
  res: ServerResponse,
  sessionConfig: IronSessionOptions
) => {
  return (await getIronSession(
    req,
    res,
    sessionConfig
  )) as NextSIWESession<TSessionData>;
};

const logoutRoute = async (
  req: NextApiRequest,
  res: NextApiResponse<void>,
  sessionConfig: IronSessionOptions,
  afterCallback?: RouteHandlerOptions['afterLogout']
) => {
  switch (req.method) {
    case 'GET': {
      const session = await getSession(req, res, sessionConfig);
      session.destroy();
      if (afterCallback) {
        await afterCallback(req, res);
      }
      res.status(200).end();
      break;
    }
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};

const nonceRoute = async (
  req: NextApiRequest,
  res: NextApiResponse<string>,
  sessionConfig: IronSessionOptions,
  afterCallback?: RouteHandlerOptions['afterNonce']
) => {
  switch (req.method) {
    case 'GET': {
      const session = await getSession(req, res, sessionConfig);
      if (!session.nonce) {
        session.nonce = generateSiweNonce();
        await session.save();
      }
      if (afterCallback) {
        await afterCallback(req, res, session);
      }
      res.send(session.nonce);
      break;
    }
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};

const sessionRoute = async (
  req: NextApiRequest,
  res: NextApiResponse<{ address?: string; chainId?: number }>,
  sessionConfig: IronSessionOptions,
  afterCallback?: RouteHandlerOptions['afterSession']
) => {
  switch (req.method) {
    case 'GET': {
      const session = await getSession(req, res, sessionConfig);
      if (afterCallback) {
        await afterCallback(req, res, session);
      }
      const { address, chainId } = session;
      res.send({ address, chainId });
      break;
    }
    default:
      res.setHeader('Allow', ['GET']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};

const verifyRoute = async (
  req: NextApiRequest,
  res: NextApiResponse<void>,
  sessionConfig: IronSessionOptions,
  config?: NextServerSIWEConfig['config'],
  afterCallback?: RouteHandlerOptions['afterVerify']
) => {
  switch (req.method) {
    case 'POST':
      try {
        const session = await getSession(req, res, sessionConfig);
        const { message, signature } = req.body as {
          message: string;
          signature: `0x${string}`;
        };

        const parsed = parseSiweMessage(message);
        if (parsed.nonce !== session.nonce) {
          return res.status(422).end('Invalid nonce.');
        }

        let chain = config?.chains
          ? Object.values(config.chains).find((c) => c.id === parsed.chainId)
          : undefined;
        if (!chain) {
          chain = Object.values(allChains).find((c) => c.id === parsed.chainId);
        }
        if (!chain) {
          throw new Error('Chain not found.');
        }

        const publicClient: PublicClient = createPublicClient({
          chain,
          transport: http(),
        });

        const verified = await publicClient.verifySiweMessage({
          message,
          signature,
          nonce: session.nonce,
        });
        if (!verified) {
          return res.status(422).end('Unable to verify signature.');
        }

        session.address = parsed.address;
        session.chainId = parsed.chainId;
        await session.save();
        if (afterCallback) {
          await afterCallback(req, res, session);
        }
        res.status(200).end();
      } catch (error) {
        res.status(400).end(String(error));
      }
      break;
    default:
      res.setHeader('Allow', ['POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};

const envVar = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
};

export const configureServerSideSIWE = <TSessionData extends object = {}>({
  config,
  session: { cookieName, password, cookieOptions, ...otherSessionOptions } = {},
  options: { afterNonce, afterVerify, afterSession, afterLogout } = {},
}: NextServerSIWEConfig): ConfigureServerSIWEResult<TSessionData> => {
  const getSessionConfig = (): IronSessionOptions => ({
    cookieName: cookieName ?? 'connectkit-next-siwe',
    password: password ?? envVar('SESSION_SECRET'),
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      ...(cookieOptions ?? {}),
    },
    ...otherSessionOptions,
  });

  const apiRouteHandler: NextApiHandler = async (req, res) => {
    if (!(req.query.route instanceof Array)) {
      throw new Error(
        'Catch-all query param `route` not found. SIWE API page should be named `[...route].ts` and within your `pages/api` directory.'
      );
    }

    const route = req.query.route.join('/');
    const sessionConfig = getSessionConfig();
    switch (route) {
      case 'nonce':
        return await nonceRoute(req, res, sessionConfig, afterNonce);
      case 'verify':
        return await verifyRoute(req, res, sessionConfig, config, afterVerify);
      case 'session':
        return await sessionRoute(req, res, sessionConfig, afterSession);
      case 'logout':
        return await logoutRoute(req, res, sessionConfig, afterLogout);
      default:
        return res.status(404).end();
    }
  };

  return {
    apiRouteHandler,
    getSession: async (req: IncomingMessage, res: ServerResponse) =>
      await getSession<TSessionData>(req, res, getSessionConfig()),
  };
};

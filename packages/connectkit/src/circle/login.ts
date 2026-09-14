import type {
  Configs,
  EmailLoginResult,
  SocialLoginResult,
} from '@circle-fin/w3s-pw-web-sdk/dist/src/types';

import type {
  CircleBackendAdapter,
  CircleChallengeResponse,
  CircleDeviceTokenResult,
  CircleSocialProvider,
  CircleWallet,
} from './types';
import { CircleBackendError } from './backend';
import { environmentOfBlockchain, toCircleBlockchain } from './chains';
import { emitCircleEvent, type ResolvedCircleConfig } from './config';
import { getCircleSdkFor, loadCircleSdk, executeChallenge } from './sdk';
import {
  clearPendingLogin,
  clearSession,
  readPendingLogin,
  savePendingLogin,
  saveSession,
  updateSession,
  type CircleSession,
  type CircleSessionScope,
} from './session';

export type CircleLoginContext = {
  circle: ResolvedCircleConfig;
  adapter: CircleBackendAdapter;
  chainId: number;
};

export const sessionScope = (
  circle: ResolvedCircleConfig
): CircleSessionScope => ({
  environment: circle.environment,
  appId: circle.appId,
  storage: circle.storage,
});

const origin = () =>
  typeof window !== 'undefined' ? window.location.origin : '';

const PROVIDER_LABEL: Record<CircleSocialProvider, string> = {
  google: 'Google',
  facebook: 'Facebook',
  apple: 'Apple',
};

/**
 * The SDK must see the same device token on both sides of a redirect, so on
 * resume this is built from the stored values rather than a fresh token.
 */
const socialLoginConfigs = (
  circle: ResolvedCircleConfig,
  provider: CircleSocialProvider,
  { deviceToken, deviceEncryptionKey }: CircleDeviceTokenResult
): Configs => {
  const loginConfigs: NonNullable<Configs['loginConfigs']> = {
    deviceToken,
    deviceEncryptionKey,
  };

  if (provider === 'google') {
    loginConfigs.google = {
      clientId: circle.google.clientId ?? '',
      redirectUri: circle.google.redirectUri ?? origin(),
      selectAccountPrompt: circle.google.selectAccountPrompt ?? true,
    };
  } else if (provider === 'facebook') {
    loginConfigs.facebook = {
      appId: circle.facebook.appId ?? '',
      redirectUri: circle.facebook.redirectUri ?? origin(),
    };
  } else {
    loginConfigs.apple = circle.apple;
  }

  return { appSettings: { appId: circle.appId ?? '' }, loginConfigs };
};

type LoginError = { code?: number; message: string } | undefined;

/** Turns the SDK's login callback into a session, or a readable error. */
const settleLogin = (
  label: string,
  chainId: number,
  resolve: (session: CircleSession) => void,
  reject: (error: Error) => void
) => (error: LoginError, result: SocialLoginResult | EmailLoginResult | undefined) => {
  if (error) {
    reject(
      new Error(
        `${label} sign-in failed${
          error.code !== undefined ? ` (code ${error.code})` : ''
        }: ${error.message}`
      )
    );
    return;
  }

  if (!result?.userToken || !result.encryptionKey) {
    reject(new Error(`${label} sign-in returned an incomplete result.`));
    return;
  }

  resolve({
    userToken: result.userToken,
    encryptionKey: result.encryptionKey,
    refreshToken: result.refreshToken,
    email:
      'oAuthInfo' in result
        ? result.oAuthInfo?.socialUserInfo?.email
        : undefined,
    chainId,
    createdAt: Date.now(),
  });
};

const requestDeviceToken = async (
  circle: ResolvedCircleConfig,
  adapter: CircleBackendAdapter
): Promise<CircleDeviceTokenResult> => {
  const sdk = await getCircleSdkFor(circle);
  return adapter.createDeviceToken({ deviceId: await sdk.getDeviceId() });
};

/**
 * Starts Google or Facebook sign-in. The browser navigates away; control
 * resumes in {@link resumeSocialLogin} after the redirect.
 */
export const beginRedirectLogin = async ({
  circle,
  adapter,
  chainId,
  provider,
}: CircleLoginContext & { provider: 'google' | 'facebook' }): Promise<void> => {
  const { SocialLoginProvider } = await loadCircleSdk();
  const sdk = await getCircleSdkFor(circle);
  const tokens = await requestDeviceToken(circle, adapter);

  // Saved before navigating: once `performLogin` runs, this page is gone.
  savePendingLogin(sessionScope(circle), { ...tokens, chainId, provider });

  sdk.updateConfigs(socialLoginConfigs(circle, provider, tokens));

  await sdk.performLogin(
    (provider === 'google'
      ? SocialLoginProvider.GOOGLE
      : SocialLoginProvider.FACEBOOK) as never
  );
};

export const beginGoogleLogin = (context: CircleLoginContext) =>
  beginRedirectLogin({ ...context, provider: 'google' });

export const beginFacebookLogin = (context: CircleLoginContext) =>
  beginRedirectLogin({ ...context, provider: 'facebook' });

// Apple opens a popup, which browsers block if it follows a slow network call.
const APPLE_TOKEN_REUSE_MS = 5 * 60 * 1000;

const preparedAppleTokens = new Map<
  string,
  { promise: Promise<CircleDeviceTokenResult>; createdAt: number }
>();

const appleKey = (circle: ResolvedCircleConfig) =>
  `${circle.environment}:${circle.appId ?? ''}`;

/** Fetches the device token before the user clicks, so the popup opens at once. */
export const prepareAppleLogin = ({
  circle,
  adapter,
}: Pick<CircleLoginContext, 'circle' | 'adapter'>) => {
  const key = appleKey(circle);
  const existing = preparedAppleTokens.get(key);
  if (existing && Date.now() - existing.createdAt < APPLE_TOKEN_REUSE_MS) return;

  const promise = requestDeviceToken(circle, adapter);
  promise.catch(() => preparedAppleTokens.delete(key));
  preparedAppleTokens.set(key, { promise, createdAt: Date.now() });
};

/**
 * Signs in with Apple in a popup and returns the session. Resolves only when
 * Circle reports a result; if the user closes the popup nothing is reported,
 * so offer a way to cancel.
 */
export const beginAppleLogin = async ({
  circle,
  adapter,
  chainId,
}: CircleLoginContext): Promise<CircleSession> => {
  if (!circle.apple) {
    throw new Error(
      'Apple sign-in needs `circle.apple` set to your Firebase web app config.'
    );
  }

  const key = appleKey(circle);
  const prepared = preparedAppleTokens.get(key);
  preparedAppleTokens.delete(key);

  const tokens =
    (prepared && Date.now() - prepared.createdAt < APPLE_TOKEN_REUSE_MS
      ? await prepared.promise.catch(() => null)
      : null) ?? (await requestDeviceToken(circle, adapter));

  const { SocialLoginProvider } = await loadCircleSdk();

  const session = await new Promise<CircleSession>((resolve, reject) => {
    getCircleSdkFor(
      circle,
      socialLoginConfigs(circle, 'apple', tokens),
      settleLogin('Apple', chainId, resolve, reject)
    )
      .then((sdk) => sdk.performLogin(SocialLoginProvider.APPLE as never))
      .catch(reject);
  });

  saveSession(sessionScope(circle), session);
  emitCircleEvent(() =>
    circle.events.onLogin?.({
      environment: circle.environment,
      method: 'apple',
      email: session.email,
    })
  );
  return session;
};

const buildEmailConfigs = (
  circle: ResolvedCircleConfig,
  email: string,
  deviceToken: string,
  deviceEncryptionKey: string,
  otpToken: string
): Configs =>
  ({
    appSettings: { appId: circle.appId ?? '' },
    loginConfigs: {
      deviceToken,
      deviceEncryptionKey,
      otpToken,
      email: { email },
    },
  } as Configs);

/**
 * Sends an email OTP and opens Circle's hosted verification UI.
 *
 * Unlike social login this does not navigate away, so the complete authenticated
 * session can be returned directly to the caller.
 */
export const beginEmailLogin = async ({
  circle,
  adapter,
  chainId,
  email,
}: CircleLoginContext & { email: string }): Promise<CircleSession> => {
  if (!adapter.requestEmailOtp) {
    throw new Error(
      'This Circle backend adapter does not implement `requestEmailOtp`. Add it to enable email authentication.'
    );
  }

  const sdk = await getCircleSdkFor(circle);
  const deviceId = await sdk.getDeviceId();
  const { deviceToken, deviceEncryptionKey, otpToken } =
    await adapter.requestEmailOtp({ deviceId, email });

  const configs = buildEmailConfigs(
    circle,
    email,
    deviceToken,
    deviceEncryptionKey,
    otpToken
  );

  const session = await new Promise<CircleSession>((resolve, reject) => {
    const onLoginComplete = settleLogin('Email', chainId, (value) =>
      resolve({ ...value, email }), reject);

    getCircleSdkFor(circle, configs, onLoginComplete)
      .then((configuredSdk) => configuredSdk.verifyOtp())
      .catch(reject);
  });

  saveSession(sessionScope(circle), session);
  emitCircleEvent(() =>
    circle.events.onLogin?.({
      environment: circle.environment,
      method: 'email',
      email,
    })
  );
  return session;
};

/**
 * True when the current URL carries an OAuth response. Used to avoid waiting on
 * a login callback that is never going to fire, for instance when a stale
 * pending record survives an abandoned sign-in.
 */
export const looksLikeOAuthReturn = (): boolean => {
  if (typeof window === 'undefined') return false;
  const { search, hash } = window.location;
  const haystack = `${search}${hash}`;
  return /[?&#](code|state|id_token)=/.test(haystack);
};

/**
 * Lets the provider mount Circle immediately after a full-page redirect.
 * Requiring both the SDK callback values and our pending record prevents an
 * unrelated OAuth callback elsewhere in the host app from opening ConnectKit.
 */
export const shouldResumeSocialLogin = (circle: ResolvedCircleConfig): boolean =>
  readPendingLogin(sessionScope(circle)) !== null && looksLikeOAuthReturn();

const clearOAuthReturnFromAddressBar = () => {
  if (typeof window === 'undefined') return;

  const callbackValues = `${window.location.search}${window.location.hash}`;
  if (
    !/(?:^|[?#&])(access_token|code|id_token|state|error)=/i.test(
      callbackValues
    )
  ) {
    return;
  }

  // Circle has consumed the callback by this point. Do not leave bearer tokens
  // in copied URLs, screenshots, browser history, or subsequent navigation.
  window.history.replaceState(
    window.history.state,
    document.title,
    window.location.pathname
  );
};

const LOGIN_CALLBACK_TIMEOUT_MS = 45_000;

/**
 * Completes a Google or Facebook login started before the redirect. Returns
 * `null` when there is nothing to resume, so it is safe to call on every mount.
 */
export const resumeSocialLogin = async (
  circle: ResolvedCircleConfig
): Promise<CircleSession | null> => {
  const scope = sessionScope(circle);
  const pending = readPendingLogin(scope);
  if (!pending || !looksLikeOAuthReturn()) return null;

  const provider = pending.provider ?? 'google';
  const label = PROVIDER_LABEL[provider];

  const result = await new Promise<CircleSession>((resolve, reject) => {
    const timer = setTimeout(() => {
      clearPendingLogin(scope);
      reject(
        new Error(
          `Timed out waiting for ${label} to complete sign-in. Check that your redirect URI is registered with ${label} and in Circle Console.`
        )
      );
    }, LOGIN_CALLBACK_TIMEOUT_MS);

    const settle = settleLogin(label, pending.chainId, resolve, reject);

    getCircleSdkFor(
      circle,
      socialLoginConfigs(circle, provider, pending),
      (error, loginResult) => {
        clearTimeout(timer);
        clearPendingLogin(scope);
        clearOAuthReturnFromAddressBar();
        settle(error, loginResult);
      }
    ).catch((sdkError) => {
      clearTimeout(timer);
      reject(sdkError);
    });
  });

  saveSession(scope, result);
  emitCircleEvent(() =>
    circle.events.onLogin?.({
      environment: circle.environment,
      method: provider,
      email: result.email,
    })
  );
  return result;
};

// Refresh at most daily; tokens last 14 days.
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

const refreshing = new Map<string, Promise<CircleSession | null>>();

/**
 * Renews the user token once it is a day old, so an active user is never
 * logged out at the 14-day mark. Returns `null` when Circle rejects the token,
 * after clearing the session. Other failures keep the current session.
 */
export const refreshSessionIfStale = ({
  circle,
  adapter,
  session,
}: {
  circle: ResolvedCircleConfig;
  adapter: CircleBackendAdapter;
  session: CircleSession;
}): Promise<CircleSession | null> => {
  if (
    !session.refreshToken ||
    !adapter.refreshUserToken ||
    Date.now() - session.createdAt < REFRESH_AFTER_MS
  ) {
    return Promise.resolve(session);
  }

  const key = `${circle.environment}:${circle.appId ?? ''}`;
  const inFlight = refreshing.get(key);
  if (inFlight) return inFlight;

  const scope = sessionScope(circle);
  const run = (async () => {
    try {
      const sdk = await getCircleSdkFor(circle);
      const result = await adapter.refreshUserToken!({
        userToken: session.userToken,
        refreshToken: session.refreshToken!,
        deviceId: await sdk.getDeviceId(),
      });
      const next: CircleSession = {
        ...session,
        userToken: result.userToken,
        encryptionKey: result.encryptionKey ?? session.encryptionKey,
        refreshToken: result.refreshToken ?? session.refreshToken,
        createdAt: Date.now(),
      };
      saveSession(scope, next);
      return next;
    } catch (error) {
      if (
        error instanceof CircleBackendError &&
        (error.status === 401 || String(error.code) === '155104')
      ) {
        clearSession(scope);
        return null;
      }
      return session;
    } finally {
      refreshing.delete(key);
    }
  })();

  refreshing.set(key, run);
  return run;
};

// Circle: "User already initialized".
const isAlreadyInitialized = (error: unknown) =>
  error instanceof CircleBackendError && String(error.code) === '155106';

/**
 * Returns the user's wallet on the chain, creating one if needed. Creation is a
 * challenge the user approves in Circle's hosted UI.
 */
export const ensureWallet = async ({
  circle,
  adapter,
  chainId,
  session,
}: CircleLoginContext & { session: CircleSession }): Promise<CircleWallet> => {
  const blockchain = toCircleBlockchain(chainId, circle.chains);
  if (!blockchain) {
    throw new Error(
      `Chain ${chainId} is not mapped to a Circle blockchain. Add it via \`circle.chains\`.`
    );
  }
  if (environmentOfBlockchain(blockchain) !== circle.environment) {
    throw new Error(
      `${blockchain} is a ${environmentOfBlockchain(
        blockchain
      )} chain, but Circle is configured for ${
        circle.environment
      }. Choose a ${circle.environment} chain or change \`circle.environment\`.`
    );
  }

  const scope = sessionScope(circle);
  const { userToken, encryptionKey } = session;
  const sdk = await getCircleSdkFor(circle);
  sdk.setAuthentication({ userToken, encryptionKey });

  const wallets = await adapter.listWallets({ userToken });
  const existing = wallets.find((wallet) => wallet.blockchain === blockchain);
  if (existing) {
    updateSession(scope, {
      walletId: existing.id,
      address: existing.address,
      chainId,
    });
    emitCircleEvent(() =>
      circle.events.onWallet?.({
        environment: circle.environment,
        wallet: existing,
        created: false,
      })
    );
    return existing;
  }

  const input = { userToken, blockchain, accountType: circle.accountType };

  // `initializeUser` works only once per user; later wallets use `createWallet`.
  const createForExistingUser = (): Promise<CircleChallengeResponse> => {
    if (!adapter.createWallet) {
      throw new Error(
        `This user already has a Circle wallet. Add \`createWallet\` to your Circle backend adapter to create one on ${blockchain}.`
      );
    }
    return adapter.createWallet(input);
  };

  let challenge: CircleChallengeResponse;
  if (wallets.length > 0) {
    challenge = await createForExistingUser();
  } else {
    try {
      challenge = await adapter.initializeUser(input);
    } catch (error) {
      if (!isAlreadyInitialized(error)) throw error;
      challenge = await createForExistingUser();
    }
  }
  const { challengeId } = challenge;

  await executeChallenge(sdk, challengeId);

  const created = (await adapter.listWallets({ userToken })).find(
    (wallet) => wallet.blockchain === blockchain
  );

  if (!created) {
    throw new Error(
      `Circle reported the wallet challenge completed, but no ${blockchain} wallet was returned.`
    );
  }

  updateSession(scope, {
    walletId: created.id,
    address: created.address,
    chainId,
  });
  emitCircleEvent(() =>
    circle.events.onWallet?.({
      environment: circle.environment,
      wallet: created,
      created: true,
    })
  );
  return created;
};

import type {
  Configs,
  EmailLoginResult,
} from '@circle-fin/w3s-pw-web-sdk/dist/src/types';

import type { CircleBackendAdapter, CircleOptions, CircleWallet } from './types';
import { toCircleBlockchain } from './chains';
import { getCircleSdk, loadCircleSdk, executeChallenge } from './sdk';
import {
  clearPendingLogin,
  readPendingLogin,
  savePendingLogin,
  saveSession,
  updateSession,
  type CircleSession,
} from './session';

export type CircleLoginContext = {
  circle: CircleOptions;
  adapter: CircleBackendAdapter;
  chainId: number;
};

const resolveRedirectUri = (circle: CircleOptions): string =>
  circle.google?.redirectUri ??
  (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * The SDK must be configured with the *same* device token on both sides of the
 * OAuth redirect, so this is built from stored values on resume rather than
 * from a fresh token.
 */
const buildConfigs = (
  circle: CircleOptions,
  deviceToken: string,
  deviceEncryptionKey: string
): Configs => ({
  appSettings: { appId: circle.appId ?? '' },
  loginConfigs: {
    deviceToken,
    deviceEncryptionKey,
    google: {
      clientId: circle.google?.clientId ?? '',
      redirectUri: resolveRedirectUri(circle),
      selectAccountPrompt: circle.google?.selectAccountPrompt ?? true,
    },
  },
});

/**
 * Circle's current docs require an `email` object inside `loginConfigs`.
 * Version 1.1.11 accepts it at runtime, although its published LoginConfigs
 * declaration does not include the field yet.
 */
const buildEmailConfigs = (
  circle: CircleOptions,
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
 * Starts Google sign-in. This navigates the browser away and does not return —
 * control resumes in {@link resumeGoogleLogin} after Google redirects back.
 */
export const beginGoogleLogin = async ({
  circle,
  adapter,
  chainId,
}: CircleLoginContext): Promise<void> => {
  const { SocialLoginProvider } = await loadCircleSdk();
  const sdk = await getCircleSdk();

  const deviceId = await sdk.getDeviceId();
  const { deviceToken, deviceEncryptionKey } = await adapter.createDeviceToken({
    deviceId,
  });

  // Persist before navigating: once `performLogin` fires, this page is gone.
  savePendingLogin({ deviceToken, deviceEncryptionKey, chainId });

  sdk.updateConfigs(buildConfigs(circle, deviceToken, deviceEncryptionKey));

  await sdk.performLogin(SocialLoginProvider.GOOGLE as never);
};

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

  const sdk = await getCircleSdk();
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
    const onLoginComplete = (
      error: { code?: number; message: string } | undefined,
      result: EmailLoginResult | undefined
    ) => {
      if (error) {
        reject(
          new Error(
            `Email verification failed${
              error.code !== undefined ? ` (code ${error.code})` : ''
            }: ${error.message}`
          )
        );
        return;
      }

      if (!result?.userToken || !result.encryptionKey) {
        reject(new Error('Email verification returned an incomplete result.'));
        return;
      }

      resolve({
        userToken: result.userToken,
        encryptionKey: result.encryptionKey,
        refreshToken: result.refreshToken,
        email,
        chainId,
        createdAt: Date.now(),
      });
    };

    getCircleSdk(configs, onLoginComplete)
      .then((configuredSdk) => configuredSdk.verifyOtp())
      .catch(reject);
  });

  saveSession(session);
  return session;
};

/**
 * True when the current URL carries an OAuth response. Used to avoid waiting on
 * a login callback that is never going to fire — for instance when a stale
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
export const shouldResumeGoogleLogin = (): boolean =>
  readPendingLogin() !== null && looksLikeOAuthReturn();

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
 * Completes a login that was started before an OAuth redirect.
 *
 * Returns `null` when there is nothing to resume, so it is safe to call on
 * every mount.
 */
export const resumeGoogleLogin = async (
  circle: CircleOptions
): Promise<CircleSession | null> => {
  const pending = readPendingLogin();
  if (!pending || !looksLikeOAuthReturn()) return null;

  const configs = buildConfigs(
    circle,
    pending.deviceToken,
    pending.deviceEncryptionKey
  );

  const result = await new Promise<CircleSession>((resolve, reject) => {
    const timer = setTimeout(() => {
      clearPendingLogin();
      reject(
        new Error(
          'Timed out waiting for Google to complete sign-in. Check that your redirect URI is registered in both Google Cloud and the Circle console.'
        )
      );
    }, LOGIN_CALLBACK_TIMEOUT_MS);

    getCircleSdk(configs, (error, loginResult) => {
      clearTimeout(timer);
      clearPendingLogin();
      clearOAuthReturnFromAddressBar();

      if (error) {
        reject(
          new Error(
            `Google sign-in failed${
              error.code !== undefined ? ` (code ${error.code})` : ''
            }: ${error.message}`
          )
        );
        return;
      }

      if (!loginResult?.userToken || !loginResult?.encryptionKey) {
        reject(new Error('Google sign-in returned an incomplete result.'));
        return;
      }

      resolve({
        userToken: loginResult.userToken,
        encryptionKey: loginResult.encryptionKey,
        refreshToken: loginResult.refreshToken,
        email:
          'oAuthInfo' in loginResult
            ? loginResult.oAuthInfo?.socialUserInfo?.email
            : undefined,
        chainId: pending.chainId,
        createdAt: Date.now(),
      });
    }).catch((sdkError) => {
      clearTimeout(timer);
      reject(sdkError);
    });
  });

  saveSession(result);
  return result;
};

/**
 * Returns the user's wallet on the requested chain, provisioning one if this is
 * their first visit.
 *
 * `initializeUser` only hands back a challenge, and the wallet does not exist
 * until the authenticated user approves it in Circle's hosted UI.
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

  const { userToken, encryptionKey } = session;
  const sdk = await getCircleSdk();
  sdk.setAuthentication({ userToken, encryptionKey });

  const existing = (await adapter.listWallets({ userToken })).find(
    (wallet) => wallet.blockchain === blockchain
  );
  if (existing) {
    updateSession({ walletId: existing.id, address: existing.address, chainId });
    return existing;
  }

  const { challengeId } = await adapter.initializeUser({
    userToken,
    blockchain,
  });

  await executeChallenge(sdk, challengeId);

  const created = (await adapter.listWallets({ userToken })).find(
    (wallet) => wallet.blockchain === blockchain
  );

  if (!created) {
    throw new Error(
      `Circle reported the wallet challenge completed, but no ${blockchain} wallet was returned.`
    );
  }

  updateSession({ walletId: created.id, address: created.address, chainId });
  return created;
};

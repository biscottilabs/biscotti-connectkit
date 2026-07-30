import type { W3SSdk } from '@circle-fin/w3s-pw-web-sdk';
import type {
  ChallengeResult,
  Configs,
  LoginCompleteCallback,
  SignMessageResult,
  SignTransactionResult,
  SocialLoginResult,
  EmailLoginResult,
} from '@circle-fin/w3s-pw-web-sdk/dist/src/types';

export type CircleSdk = W3SSdk;
export type CircleChallengeResult =
  | ChallengeResult
  | SignMessageResult
  | SignTransactionResult;

/**
 * The Circle SDK is loaded on demand rather than imported at module scope.
 *
 * Two reasons. It is browser-only — it drives a hosted iframe and touches
 * `window` in its constructor, so importing it eagerly breaks SSR. And it pulls
 * in `firebase` transitively (Circle uses it for Apple login), which is far too
 * much weight to put in the bundle of every app that merely imports ConnectKit.
 * Apps that never enable Circle never download it.
 */
type CircleSdkModule = {
  W3SSdk: new (
    configs?: Configs,
    onLoginComplete?: LoginCompleteCallback
  ) => W3SSdk;
  SocialLoginProvider: Record<string, string>;
  ChallengeStatus: Record<string, string>;
  ChallengeType: Record<string, string>;
};

let modulePromise: Promise<CircleSdkModule> | null = null;

export const loadCircleSdk = (): Promise<CircleSdkModule> => {
  if (typeof window === 'undefined') {
    return Promise.reject(
      new Error(
        'The Circle SDK can only be loaded in the browser. Guard this call with a mounted check.'
      )
    );
  }

  if (!modulePromise) {
    modulePromise = Promise.all([
      import('@circle-fin/w3s-pw-web-sdk'),
      // Circle's entry point exports only the class; the enums live in this
      // subpath, which is the import path Circle's own documentation uses.
      import('@circle-fin/w3s-pw-web-sdk/dist/src/types'),
    ])
      .then(([main, types]) => ({
        W3SSdk: main.W3SSdk,
        SocialLoginProvider: types.SocialLoginProvider as unknown as Record<
          string,
          string
        >,
        ChallengeStatus: types.ChallengeStatus as unknown as Record<
          string,
          string
        >,
        ChallengeType: types.ChallengeType as unknown as Record<string, string>,
      }))
      .catch((error) => {
        // Reset so a later attempt can retry — a failed chunk fetch should not
        // permanently poison the integration.
        modulePromise = null;
        throw new Error(
          `Could not load "@circle-fin/w3s-pw-web-sdk". Install it to use Sign in with Circle:\n  npm install @circle-fin/w3s-pw-web-sdk\n\nOriginal error: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      });
  }

  return modulePromise;
};

let instance: W3SSdk | null = null;

/**
 * One SDK instance per page. The SDK owns a hosted iframe and internal
 * singleton state, so constructing it repeatedly leaves orphaned frames behind.
 */
export const getCircleSdk = async (
  configs?: Configs,
  onLoginComplete?: LoginCompleteCallback
): Promise<W3SSdk> => {
  const { W3SSdk: Sdk } = await loadCircleSdk();

  if (!instance) {
    instance = new Sdk(configs, onLoginComplete);
  } else if (configs) {
    instance.updateConfigs(configs, onLoginComplete);
  }

  return instance;
};

/** Test seam and hard-reset for logout. */
export const resetCircleSdk = () => {
  instance = null;
};

export type CircleLoginResult = SocialLoginResult | EmailLoginResult;

/**
 * Promise wrapper around `sdk.execute`.
 *
 * A challenge is how Circle gates every sensitive action behind the user's PIN:
 * the hosted UI opens, the user authenticates, and the result — a signature, a
 * transaction hash — arrives here. Anything other than COMPLETE is a failure,
 * including PENDING, which means the user dismissed the UI.
 */
export const executeChallenge = async (
  sdk: W3SSdk,
  challengeId: string
): Promise<CircleChallengeResult> => {
  const { ChallengeStatus } = await loadCircleSdk();

  return new Promise((resolve, reject) => {
    sdk.execute(challengeId, (error, result) => {
      if (error) {
        reject(
          new Error(
            `Circle challenge failed${
              error.code !== undefined ? ` (code ${error.code})` : ''
            }: ${error.message}`
          )
        );
        return;
      }

      if (!result) {
        reject(new Error('Circle challenge returned no result.'));
        return;
      }

      if (result.status !== ChallengeStatus.COMPLETE) {
        reject(
          new Error(
            `Circle challenge did not complete (status: ${result.status}).`
          )
        );
        return;
      }

      resolve(result);
    });
  });
};

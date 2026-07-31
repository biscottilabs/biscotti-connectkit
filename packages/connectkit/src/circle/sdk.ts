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
        const originalMessage =
          error instanceof Error ? error.message : String(error);
        const packageIsMissing =
          /cannot find (?:package|module)|failed to resolve import|module not found/i.test(
            originalMessage
          );
        throw new Error(
          packageIsMissing
            ? `Could not find "@circle-fin/w3s-pw-web-sdk". Install it to use Sign in with Circle:\n  npm install @circle-fin/w3s-pw-web-sdk\n\nOriginal error: ${originalMessage}`
            : `Circle's Web SDK is installed but failed to initialize. If this app uses Vite, enable Node browser polyfills as documented by Circle (for example, vite-plugin-node-polyfills).\n\nOriginal error: ${originalMessage}`
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
 * A challenge is how Circle gates sensitive actions behind its hosted
 * confirmation UI. The user authenticates or approves as required by their
 * configured method, and the result — a signature or transaction hash — arrives
 * here. Anything other than COMPLETE is a failure, including PENDING.
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

type MaybeSigned = {
  data?: { signature?: string; txHash?: string };
};

/**
 * Pulls the signature out of a completed challenge.
 *
 * Circle returns it inline on the challenge result, so a signature never needs
 * polling — but the field is optional on the shared result type, hence the
 * explicit check rather than a cast.
 */
export const extractSignature = (result: CircleChallengeResult): string => {
  const signature = (result as MaybeSigned).data?.signature;
  if (!signature) {
    throw new Error(
      'The Circle challenge completed but returned no signature.'
    );
  }
  return signature;
};

export const extractTxHash = (result: CircleChallengeResult): string => {
  const txHash = (result as MaybeSigned).data?.txHash;
  if (!txHash) {
    throw new Error(
      'The Circle challenge completed but returned no transaction hash.'
    );
  }
  return txHash;
};

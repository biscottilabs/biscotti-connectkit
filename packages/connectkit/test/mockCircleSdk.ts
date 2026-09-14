import { mock } from 'bun:test';

export const sdkCalls: string[] = [];

export type LoginCallback = (error: unknown, result: unknown) => void;

/** Last callback passed to the SDK, so tests can complete a login. */
export const sdkState: { onLoginComplete?: LoginCallback } = {};

mock.module('@circle-fin/w3s-pw-web-sdk', () => ({
  W3SSdk: class {
    constructor(_configs?: unknown, onLoginComplete?: LoginCallback) {
      sdkState.onLoginComplete = onLoginComplete;
    }
    setAppSettings() {
      sdkCalls.push('setAppSettings');
    }
    updateConfigs(_configs: unknown, onLoginComplete?: LoginCallback) {
      sdkCalls.push('updateConfigs');
      if (onLoginComplete) sdkState.onLoginComplete = onLoginComplete;
    }
    setAuthentication() {}
    setThemeColor() {
      sdkCalls.push('setThemeColor');
    }
    setLocalizations() {}
    setResources() {}
    setCustomLinks() {}
    getDeviceId() {
      return Promise.resolve('device-1');
    }
    async performLogin(provider: string) {
      sdkCalls.push(`performLogin:${provider}`);
    }
    verifyOtp() {
      sdkCalls.push('verifyOtp');
    }
    execute(_id: string, callback: LoginCallback) {
      sdkCalls.push('execute');
      callback(undefined, { status: 'COMPLETE', data: {} });
    }
  },
}));

mock.module('@circle-fin/w3s-pw-web-sdk/dist/src/types', () => ({
  SocialLoginProvider: { GOOGLE: 'Google', FACEBOOK: 'Facebook', APPLE: 'Apple' },
  ChallengeStatus: { COMPLETE: 'COMPLETE' },
  ChallengeType: {},
}));

(globalThis as { window?: unknown }).window ??= globalThis;

export const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
};

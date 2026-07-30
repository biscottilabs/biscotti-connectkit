import type { CircleOptions } from './types';

export type {
  CircleOptions,
  CircleLoginMethod,
  CircleConfigScope,
  CircleConfigIssue,
  CircleEndpointConfig,
  CircleBackendAdapter,
  CircleWallet,
  CircleDeviceTokenResult,
  CircleChallengeResponse,
  CircleHealthReport,
} from './types';
export { CIRCLE_IMPLEMENTED_METHODS } from './types';

export type { CircleBlockchain, CircleChainMap } from './chains';
export {
  circleChainsByChainId,
  toCircleBlockchain,
  toChainId,
  isCircleSupportedChain,
} from './chains';

export {
  preflightCircleConfig,
  issuesFromHealth,
  hasBlockingIssues,
  shouldShowDiagnostics,
} from './preflight';

export {
  createHttpBackendAdapter,
  resolveBackendAdapter,
  CircleBackendError,
  CIRCLE_DEFAULT_BASE_PATH,
} from './backend';

/**
 * Circle is opt-in: an app that never sets `circle` pays nothing for it. An
 * explicit `enabled: false` keeps configuration in place while disabling the
 * feature, which is what per-environment rollout needs.
 */
export const isCircleEnabled = (circle: CircleOptions | undefined): boolean =>
  !!circle && circle.enabled !== false;

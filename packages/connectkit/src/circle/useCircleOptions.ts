import { useMemo } from 'react';
import { useConfig } from 'wagmi';

import { useContext } from '../components/ConnectKit';
import { resolveCircleConfig, type ResolvedCircleConfig } from './config';
import { CIRCLE_CONNECTOR_ID } from './connector';
import type { CircleOptions } from './types';

/**
 * Provider `options.circle` wins; otherwise the options carried by the
 * connector from `getDefaultConfig({ circle })`.
 */
export const useCircleOptions = (): CircleOptions | undefined => {
  const context = useContext();
  const config = useConfig();

  if (context.options?.circle) return context.options.circle;

  const connector = config.connectors.find(
    (candidate) => candidate.id === CIRCLE_CONNECTOR_ID
  ) as { circleOptions?: CircleOptions } | undefined;

  return connector?.circleOptions;
};

/** Resolved exactly as the connector resolves it, so both always agree. */
export const useCircleConfig = (): ResolvedCircleConfig | undefined => {
  const circle = useCircleOptions();
  const { chains } = useConfig();

  return useMemo(
    () =>
      circle
        ? resolveCircleConfig(
            circle,
            chains.map((chain) => chain.id)
          )
        : undefined,
    [circle, chains]
  );
};

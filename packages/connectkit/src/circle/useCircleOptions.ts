import { useMemo } from 'react';
import { useConfig } from 'wagmi';

import { useContext } from '../components/ConnectKit';
import { resolveCircleConfig, type ResolvedCircleConfig } from './config';
import { CIRCLE_CONNECTOR_ID } from './connector';
import type { CircleOptions } from './types';

/**
 * Resolves the active Circle configuration.
 *
 * An app can declare Circle in either place, and most will use only one:
 *
 *  - `getDefaultConfig({ circle })` — needed anyway to create the connector,
 *    which then carries the options with it
 *  - `<ConnectKitProvider options={{ circle }}>` — takes precedence, so an app
 *    that builds its wagmi config by hand still has somewhere to put it
 *
 * Reading the connector back is what spares developers from declaring the same
 * credentials twice and letting the two copies drift.
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

/**
 * The active environment's settings, resolved against the app's chains exactly
 * as the connector resolves them, so the UI and the connector always agree on
 * which environment, App ID and default chain are in use.
 */
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

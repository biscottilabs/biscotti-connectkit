import { useConfig } from 'wagmi';

import { useContext } from '../components/ConnectKit';
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

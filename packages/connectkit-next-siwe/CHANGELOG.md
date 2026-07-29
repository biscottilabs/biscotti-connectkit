# 0.4.0

**Breaking.** This package is now split into separate client and server entry points. The
root import (`connectkit-next-siwe`) has been removed.

Previously both `configureClientSIWE` and `configureServerSideSIWE` were exported from a single
module. Because `iron-session`, `next`, and `node:http` were imported at the top level of that
module, importing *anything* from the package pulled server-only code into the browser bundle —
which broke client builds with `Module not found: node:process` via `@peculiar/webcrypto`.

## Breaking

- Removed the root export. Update your imports:

  ```diff
  - import { configureClientSIWE } from 'connectkit-next-siwe';
  + import { configureClientSIWE } from 'connectkit-next-siwe/client';

  - import { configureServerSideSIWE } from 'connectkit-next-siwe';
  + import { configureServerSideSIWE } from 'connectkit-next-siwe/server';
  ```

  There is no other change to either function's signature or behaviour.

## Fixed

- Server-only dependencies (`iron-session`, `next`, `node:http`) no longer reach the client
  bundle. `connectkit-next-siwe/client` now resolves to `react/jsx-runtime`, `connectkit`, and
  `viem/siwe` only.

## Updated

- `viem` is now a peer dependency only. It was previously declared as both a direct and a peer
  dependency, which could resolve two copies of viem in a consuming app.
- Added `"sideEffects": false` so bundlers can tree-shake the package.
- Build output directory is now cleaned before each build, so stale artifacts are never published.

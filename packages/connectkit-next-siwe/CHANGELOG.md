# 0.0.1

Initial release under the `@biscottidex` scope.

- Provides the browser-safe
  `@biscottidex/connectkit-next-siwe/client` entry point.
- Provides the server-only
  `@biscottidex/connectkit-next-siwe/server` entry point.
- Uses `viem/siwe` for message creation, parsing and verification.
- Keeps `iron-session`, Next.js and Node.js built-ins out of browser bundles.
- Declares viem and `@biscottidex/connectkit` as peer dependencies.
- Cleans build output before every release and supports tree-shaking.

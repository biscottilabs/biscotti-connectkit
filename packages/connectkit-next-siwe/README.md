# connectkit-next-siwe

[ConnectKit](https://docs.family.co/connectkit) provides a simple solution for integrating [Sign In With Ethereum](https://login.xyz), a secure [authentication standard](https://docs.login.xyz/general-information/siwe-overview/eip-4361), to your Next.js app.

## 1. Install

Once you've <a href={routes.ConnectKit.GettingStarted}>set up ConnectKit</a>, install the official [Sign In With Ethereum package](https://www.npmjs.com/package/siwe) and our SIWE helper package to your Next.js project.

```sh
bun add siwe connectkit-next-siwe
```

## 2. Configure

Import browser-safe configuration from the client entry point:

```ts
import { configureClientSIWE } from 'connectkit-next-siwe/client';
```

Import API-route and session configuration only from the server entry point:

```ts
import { configureServerSideSIWE } from 'connectkit-next-siwe/server';
```

Keeping these entry points separate prevents `iron-session` and Node.js built-ins from entering
the browser bundle.

You can find the full configuration documentation for this package in the docs [here](https://docs.family.co/connectkit/auth-with-nextjs).

## Contribute

Before starting on anything, please have a read through our [Contribution Guidelines](https://github.com/family/connectkit/blob/main/CONTRIBUTING.md).

## Twitter

Follow [@aave](https://twitter.com/aave) on Twitter for the latest updates on ConnectKit.

## License

See [LICENSE](https://github.com/family/connectkit/blob/main/LICENSE) for more information.

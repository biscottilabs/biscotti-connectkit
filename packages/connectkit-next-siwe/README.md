# biscotti-finance-connectkit-next-siwe

A simple solution for integrating [Sign In With Ethereum](https://login.xyz), a secure [authentication standard](https://docs.login.xyz/general-information/siwe-overview/eip-4361), into your Next.js app using [`biscotti-finance-connectkit`](https://github.com/biscottilabs/biscotti-connectkit).

## 1. Install

Once you've set up `biscotti-finance-connectkit`, install the official [Sign In With Ethereum package](https://www.npmjs.com/package/siwe) and this SIWE helper package:

```sh
bun add siwe biscotti-finance-connectkit-next-siwe
```

## 2. Configure

Import browser-safe configuration from the client entry point:

```ts
import { configureClientSIWE } from 'biscotti-finance-connectkit-next-siwe/client';
```

Import API-route and session configuration only from the server entry point:

```ts
import { configureServerSideSIWE } from 'biscotti-finance-connectkit-next-siwe/server';
```

Keeping these entry points separate prevents `iron-session` and Node.js built-ins from entering
the browser bundle. There is no root export — importing from
`biscotti-finance-connectkit-next-siwe` directly will fail. See
[CHANGELOG.md](CHANGELOG.md) for the migration note.

`configureServerSideSIWE` requires a session password of at least 32 characters,
typically supplied as `SESSION_SECRET`.

## Contribute

Before starting on anything, please have a read through the
[Contribution Guidelines](https://github.com/biscottilabs/biscotti-connectkit/blob/main/CONTRIBUTING.md).

## Acknowledgements

This package is a fork of `connectkit-next-siwe` from
[**ConnectKit**](https://github.com/family/connectkit) by **Family (LFE, Inc.)**,
used under the BSD 2-Clause License. Not affiliated with or endorsed by Family.

## License

BSD 2-Clause. Copyright (c) 2022, LFE, Inc. and copyright (c) 2026, Biscotti
Finance. See [LICENSE](LICENSE) for more information.

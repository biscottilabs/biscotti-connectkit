# Biscotti Finance ConnectKit

`biscotti-finance-connectkit` is a [React](https://reactjs.org/) component library for connecting a wallet to your dApp. It supports the most popular connectors and chains out of the box and provides a beautiful, seamless experience.

## Features

- 💡 TypeScript Ready — Get types straight out of the box.
- 🌱 Ecosystem Standards — Uses top libraries such as [wagmi](https://github.com/wagmi-dev/wagmi).
- 🖥️ Simple UX — Give users a simple, attractive experience.
- 🎨 Beautiful Themes — Predesigned themes or full customization.

and much more...

## Installation

```sh
bun add biscotti-finance-connectkit wagmi viem @tanstack/react-query
```

For Sign-In with Ethereum in a Next.js app, also install:

```sh
bun add biscotti-finance-connectkit-next-siwe
```

## Usage

```tsx
import { ConnectKitProvider, ConnectKitButton, getDefaultConfig } from 'biscotti-finance-connectkit';
```

Wallet connectors provided by default are MetaMask (and other injected
wallets), Coinbase Wallet, and WalletConnect. WalletConnect requires a project
ID — get one free from [Reown Cloud](https://cloud.reown.com) and pass it as
`walletConnectProjectId`. Safe is added automatically when the dApp runs inside
an iframe.

## Packages

| Package | Description |
| --- | --- |
| [`biscotti-finance-connectkit`](packages/connectkit) | The wallet connection component library |
| [`biscotti-finance-connectkit-next-siwe`](packages/connectkit-next-siwe) | Sign-In with Ethereum helpers for Next.js |

The SIWE package exposes separate client and server entry points:

```ts
import { configureClientSIWE } from 'biscotti-finance-connectkit-next-siwe/client';
import { configureServerSideSIWE } from 'biscotti-finance-connectkit-next-siwe/server';
```

## Examples

Runnable examples live in the [examples folder](examples):

- [Next.js (Pages Router)](examples/nextjs)
- [Next.js (App Router)](examples/nextjs-app)
- [Next.js with SIWE](examples/nextjs-siwe)
- [Vite](examples/vite)
- [Testbench](examples/testbench) — the widest coverage: chains, themes, iframe, token gating

### Running Examples Locally

Clone the project and install dependencies:

```sh
$ git clone git@github.com:biscottilabs/biscotti-connectkit.git
$ cd biscotti-connectkit
$ bun install
```

The examples consume the **built** library output, so start the bundler in
watch mode first — otherwise changes to library source will not appear:

```sh
$ bun run dev:connectkit
$ bun run dev:connectkit-next-siwe
```

Then select the example you'd like to run:

```sh
$ bun run dev:vite # Vite
$ bun run dev:nextjs # Next.js
$ bun run dev:nextjs-siwe # Next.js with SIWE
$ bun run dev:testbench # Testbench (also serves https on :3001)
```

Copy each example's `.env.example` to `.env.local` and fill it in. The
SIWE examples require a `SESSION_SECRET` of at least 32 characters.

All Next.js examples default to port 3000, so run one at a time.

## Contribute

Before starting on anything, please have a read through the
[Contribution Guidelines](CONTRIBUTING.md).

## Acknowledgements

`biscotti-finance-connectkit` is a fork of
[**ConnectKit**](https://github.com/family/connectkit), created by
**Family (LFE, Inc.)** and used under the BSD 2-Clause License. The original
project remains the source of the great majority of this codebase, and full
credit for its design and implementation belongs to Family and its
contributors.

The original documentation — much of which still applies — is at
[docs.family.co/connectkit](https://docs.family.co/connectkit).

This project is not affiliated with, endorsed by, or supported by Family or
LFE, Inc.

## License

BSD 2-Clause. Copyright (c) 2022, LFE, Inc. and copyright (c) 2026, Biscotti
Finance. See [LICENSE](LICENSE) for the full text and conditions.

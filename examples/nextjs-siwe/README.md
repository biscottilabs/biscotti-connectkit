# [Next.js](https://nextjs.org/) + [TypeScript](https://www.typescriptlang.org/) + [SIWE](https://login.xyz/) + Biscotti Finance ConnectKit Example

A simple example of implementing `@biscottidex/connectkit` with [Next.js](https://nextjs.org/) and [Sign-In with Ethereum](https://login.xyz/) in TypeScript.

See the [`@biscottidex/connectkit-next-siwe` README](../../packages/connectkit-next-siwe/README.md) for the client/server entry points this example uses. Upstream ConnectKit's [SIWE documentation](https://docs.family.co/connectkit/auth-with-nextjs) still describes the underlying API, which is unchanged apart from the split imports.

## Running the example

- Have a look at the [instructions in the main README](https://github.com/biscottilabs/biscotti-connectkit/blob/main/README.md#running-examples-locally)
- Please copy the `.env.example` file to `.env.local` and fill in the values
- You'll want to set up an environment variable called `SESSION_SECRET` — a randomly generated, strong password of at least 32 characters

# [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/) + ConnectKit Example

This is a simple example of how to implement ConnectKit with [Vite](https://vitejs.dev/) in TypeScript.

- If you'd like to look at an example online, try this [CodeSandbox](https://codesandbox.io/s/4jtssh?file=/README.md)
- Or you want to run the example locally have a look at the [instructions in the main README](https://github.com/biscottilabs/biscotti-connectkit/blob/main/README.md#running-examples-locally)

## Test Sign in with Circle

1. In Google Cloud, create a Web OAuth client and register
   `http://localhost:5173` as an authorized redirect URI. Add your account as a
   test user while the OAuth app is in testing.
2. In Circle Console, open **Wallets → User Controlled → Configurator**, enable
   Google social login, enter the Google Web client ID, and copy the Circle App
   ID. Under **Authentication Methods → Email**, enable email authentication
   and configure SMTP delivery (Mailtrap works for sandbox testing). Create a
   sandbox API key for testnet development, or a live API key if you intend to
   provision a real mainnet wallet.
3. Copy `.env.example` to `.env.local` and fill in:

   ```dotenv
   VITE_CIRCLE_ENVIRONMENT=testnet   # or mainnet
   VITE_WALLETCONNECT_PROJECT_ID=...
   VITE_CIRCLE_TESTNET_APP_ID=...
   VITE_CIRCLE_MAINNET_APP_ID=...
   VITE_GOOGLE_CLIENT_ID=...
   CIRCLE_TESTNET_API_KEY=TEST_API_KEY:...
   CIRCLE_MAINNET_API_KEY=LIVE_API_KEY:...
   ```

   You only need the values for the environment you run.

4. From the repository root, run:

   ```bash
   bun install
   bun run build:vite
   bun run dev:circle
   ```

5. Open `http://localhost:5173`, click **Connect Wallet**, and choose
   **Sign in with Circle**. Choose Google for the OAuth redirect, or Email to
   enter an address and complete Circle's hosted OTP verification.

| `VITE_CIRCLE_ENVIRONMENT` | API key | Chain |
| --- | --- | --- |
| `testnet` | `CIRCLE_TESTNET_API_KEY` (`TEST_API_KEY:…`) | Arc Testnet (`5042002`) |
| `mainnet` | `CIRCLE_MAINNET_API_KEY` (`LIVE_API_KEY:…`) | Base (`8453`) |

The dev server mounts `createCircleNodeMiddleware` from
`@biscottidex/connectkit/server` at `/api/circle`. The API keys have no `VITE_`
prefix and stay in Node. The handler rejects a key from the wrong environment
and any chain that does not belong to the requested environment. Check it with:

```bash
curl http://localhost:5173/api/circle/health
```

`bun run dev:circle` and `dev:vite` both use port 5173, so run only one. The
middleware is not part of a production build: deploy `createCircleHandler` on
your server and keep the same `endpoints.basePath`.

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
   # sandbox → Arc Testnet; live → Base mainnet
   VITE_CIRCLE_ENVIRONMENT=sandbox
   VITE_WALLETCONNECT_PROJECT_ID=...
   VITE_CIRCLE_APP_ID=...
   VITE_GOOGLE_CLIENT_ID=...
   CIRCLE_API_KEY=...
   ```

4. From the repository root, run:

   ```bash
   bun install
   bun run build:vite
   bun run dev:circle
   ```

5. Open `http://localhost:5173`, click **Connect Wallet**, and choose
   **Sign in with Circle**. Choose Google for the OAuth redirect, or Email to
   enter an address and complete Circle's hosted OTP verification.

The Vite development server implements `/api/circle/*` so the sandbox flow can
be tested locally. `CIRCLE_API_KEY` has no `VITE_` prefix and stays in Node.
Circle requires the environment and blockchain to agree: this example pairs a
sandbox key with Arc Testnet (`ARC-TESTNET`) and a live key with Base mainnet
(`BASE`).

| `VITE_CIRCLE_ENVIRONMENT` | Required API key | Default chain |
| --- | --- | --- |
| `sandbox` | `TEST_API_KEY:…` | Arc Testnet (`5042002`, `ARC-TESTNET`) |
| `live` | `LIVE_API_KEY:…` | Base (`8453`, `BASE`) |

The health route validates this pairing before authentication, and every
development API route rejects a mismatch before making a request to Circle.
Developer diagnostics are enabled only by `import.meta.env.DEV`; production
users receive a generic unavailable message rather than environment names,
upstream responses, or request details.

`bun run dev:circle` starts both the Vite frontend and this embedded Circle
development backend; do not run `dev:vite` at the same time because both use
port 5173. You can verify the backend separately with:

```bash
curl http://localhost:5173/api/circle/health
```

This development middleware is not part of a production Vite build: deploy
equivalent authenticated backend routes and keep the same `endpoints.basePath`
when shipping the app.

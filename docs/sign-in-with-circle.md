# Sign in with Circle

Let users create a wallet with Google or an email one-time code instead of a
browser extension, backed by
[Circle user-controlled wallets](https://developers.circle.com/wallets/user-controlled/build-a-wallet-app).

The result is a normal wagmi connector: `useAccount()`, `useSignMessage()`,
`useSendTransaction()` and SIWE all work without special-casing.

- **Opt-in.** Omit the `circle` option and nothing changes: no UI, no bundle cost.
- **Testnet and mainnet.** Configure both and switch with one value.
- **Two authentication methods.** Google and email OTP. PIN is shown as
  *coming soon* when included in `methods`.
- **A backend is required.** Circle's API key must never reach the browser.
  ConnectKit ships the handler.

---

## 1. Environments

Circle runs two separate environments. The API key decides which one a request
reaches, and users, tokens and wallets never cross between them.

| Environment | API key prefix | Chains |
| --- | --- | --- |
| `testnet` | `TEST_API_KEY:` | `ETH-SEPOLIA`, `BASE-SEPOLIA`, `ARB-SEPOLIA`, `OP-SEPOLIA`, `MATIC-AMOY`, `AVAX-FUJI`, `UNI-SEPOLIA`, `MONAD-TESTNET`, `ARC-TESTNET` |
| `mainnet` | `LIVE_API_KEY:` | `ETH`, `BASE`, `ARB`, `OP`, `MATIC`, `AVAX`, `UNI`, `MONAD` |

In Circle Console, switch to each environment to get its App ID and API key,
and to enable Google and Email authentication there.

## 2. Credentials

| Value | Where to get it | Where it goes |
| --- | --- | --- |
| Circle **App ID** (per environment) | Circle Console → Wallets → User Controlled → Configurator | client |
| Google **client ID** | Google Cloud → Credentials → OAuth 2.0 Client ID, type *Web application* | client |
| Circle **API key** (per environment) | Circle Console → API Keys | **server only** |

Google setup:

- Enable Google under Authentication Methods → Social Logins in Circle Console
  and enter the Web client ID.
- In Google Cloud, add your origin (e.g. `http://localhost:3000`) to the OAuth
  client's **Authorized redirect URIs**.

Email setup:

- Enable Email under Authentication Methods → Email and configure SMTP.
  Mailtrap works for testnet.

```bash
# .env.local
NEXT_PUBLIC_CIRCLE_ENVIRONMENT=testnet          # or mainnet
NEXT_PUBLIC_CIRCLE_TESTNET_APP_ID=...
NEXT_PUBLIC_CIRCLE_MAINNET_APP_ID=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
CIRCLE_TESTNET_API_KEY=TEST_API_KEY:...          # no NEXT_PUBLIC_ prefix
CIRCLE_MAINNET_API_KEY=LIVE_API_KEY:...
```

You only need the values for the environment a deployment runs.

## 3. Install

```bash
npm install @circle-fin/w3s-pw-web-sdk
```

It is an optional peer dependency, loaded on demand.

## 4. Configure

```ts
import { getDefaultConfig, type CircleEnvironment } from '@biscottidex/connectkit';
import { arcTestnet, base } from 'wagmi/chains';

export const config = createConfig(
  getDefaultConfig({
    appName: 'My App',
    chains: [base, arcTestnet],
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    circle: {
      environment: process.env.NEXT_PUBLIC_CIRCLE_ENVIRONMENT as CircleEnvironment,
      google: { clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID },
      environments: {
        testnet: {
          appId: process.env.NEXT_PUBLIC_CIRCLE_TESTNET_APP_ID,
          defaultChainId: arcTestnet.id,
        },
        mainnet: {
          appId: process.env.NEXT_PUBLIC_CIRCLE_MAINNET_APP_ID,
          defaultChainId: base.id,
          accountType: 'SCA',
        },
      },
    },
  })
);
```

The connector carries these options, so `<ConnectKitProvider>` picks them up. If
you build the wagmi config by hand, pass the same object as
`<ConnectKitProvider options={{ circle }}>` instead.

Top-level values are shared by both environments; values under `environments`
override them. A single-environment app can skip `environments` and set
`appId` directly.

### How the environment is chosen

1. `circle.environment`, if set.
2. The only entry in `circle.environments`, if there is exactly one.
3. The environment of `defaultChainId`, then of the first mapped app chain.
4. `testnet`.

If `environments` declares both, `environment` is required.

### Options

| Option | Per environment | Default | Notes |
| --- | --- | --- | --- |
| `enabled` | | `true` | `false` disables Circle but keeps the config. |
| `environment` | | inferred | `testnet` or `mainnet`. |
| `environments` | | | `{ testnet, mainnet }` overrides. |
| `appId` | yes | | Circle App ID. |
| `google` | yes | | `clientId`, `redirectUri` (defaults to `window.location.origin`), `selectAccountPrompt`. |
| `defaultChainId` | yes | first app chain in the environment | Must be in your wagmi `chains`. |
| `accountType` | yes | `EOA` | `SCA` for Gas Station sponsorship. Avoid on Ethereum mainnet. |
| `endpoints.basePath` | yes | `/api/circle` | Where the backend handler is mounted. |
| `adapter` | yes | | Replace the HTTP client. |
| `methods` | | `['google', 'email']` | |
| `feeLevel` | | `MEDIUM` | Circle ignores explicit gas. |
| `chains` | | | Add or override Circle chain identifiers. |
| `name` | | `Sign in with Circle` | Wallet list label. |
| `storage` | | `session` | `session`, `local`, or any object with `getItem`, `setItem`, `removeItem`. |
| `appearance` | | | `themeColor`, `localizations`, `resources`, `customLinks` for Circle's hosted screens. |
| `onLogin`, `onWallet`, `onSignOut`, `onError` | | | Event callbacks. See below. |

### Events

```ts
circle: {
  onLogin: ({ environment, method, email }) => analytics.track('circle_login', { method }),
  onWallet: ({ wallet, created }) => created && analytics.track('circle_wallet_created'),
  onSignOut: ({ environment }) => {},
  onError: (error, { environment }) => reportError(error),
}
```

A callback that throws is logged and does not interrupt sign-in.

## 5. Backend

Mount the handler from `@biscottidex/connectkit/server`. It reads the API keys,
picks the key from the `X-Circle-Environment` header ConnectKit sends, and
forwards to Circle.

**Next.js (App Router):** `app/api/circle/[...route]/route.ts`

```ts
import { createCircleHandler, readCircleServerEnv } from '@biscottidex/connectkit/server';

const handler = createCircleHandler(readCircleServerEnv());

export const dynamic = 'force-dynamic';
export { handler as GET, handler as POST };
```

**Bun, Deno, Workers, Hono:** the handler takes a `Request` and returns a
`Response`, so pass requests under `/api/circle/*` to it directly.

**Express or Vite dev server:**

```ts
import {
  createCircleHandler,
  createCircleNodeMiddleware,
  readCircleServerEnv,
} from '@biscottidex/connectkit/server';

app.use(createCircleNodeMiddleware(createCircleHandler(readCircleServerEnv())));
```

`readCircleServerEnv` reads `CIRCLE_TESTNET_API_KEY` and `CIRCLE_MAINNET_API_KEY`.
A single legacy `CIRCLE_API_KEY` is assigned to the environment its prefix names.
You can also pass keys yourself:

```ts
createCircleHandler({
  environments: {
    testnet: { apiKey: secrets.circleTestnet },
    mainnet: { apiKey: secrets.circleMainnet },
  },
  authorize: async ({ request, route, userToken }) => {
    // Throw new CircleHttpError(401, '...') to reject.
  },
});
```

The handler:

- serves only environments that have a key, so a deployment without a live key
  cannot be used against mainnet;
- refuses a key whose prefix does not match its environment;
- rejects a blockchain from the other environment before calling Circle;
- passes Circle's error `code` and a `requestId` back to the client.

| Route | Circle endpoint |
| --- | --- |
| `POST /device-token` | `POST /users/social/token` |
| `POST /email-otp` | `POST /users/email/token` |
| `POST /initialize-user` | `POST /user/initialize` |
| `POST /create-wallet` | `POST /user/wallets` |
| `POST /refresh-token` | `POST /users/token/refresh` |
| `POST /wallets` | `GET /wallets` |
| `POST /sign-message` | `POST /user/sign/message` |
| `POST /sign-typed-data` | `POST /user/sign/typedData` |
| `POST /transaction` | `POST /user/transactions/contractExecution` |
| `GET /health` | reports configuration per environment |

> **Production note.** The browser sends the `userToken`. Use `authorize` to tie
> each request to your own session.

If the backend is on another origin, allow the `X-Circle-Environment` header in
your CORS configuration.

## 6. Diagnosing setup problems

Clicking the Circle button runs a preflight check:

- **Development** (or `<ConnectKitProvider debugMode>`): every problem is listed
  with the variable name and whether it belongs in client env, server env, or a
  console.
- **Production:** a generic "temporarily unavailable" message.

Variable names are shown without a framework prefix (`CIRCLE_TESTNET_APP_ID`,
`GOOGLE_CLIENT_ID`); add `NEXT_PUBLIC_`, `VITE_` or your framework's equivalent.

Preflight catches a missing App ID or Google client ID, an invalid or ambiguous
environment, a default chain from the other environment, and a default chain
missing from your wagmi `chains`. `GET /api/circle/health` adds missing or
mismatched server keys for the active environment. It reports presence only,
never values.

## How it works

```
Choose Google -> /device-token -> performLogin(GOOGLE) -> OAuth redirect
                                                        |
Choose Email  -> /email-otp   -> verifyOtp() -> hosted OTP window
                                                        |
                              userToken + encryptionKey
                                                        |
                                  /initialize-user -> challengeId
                                                        |
                                      sdk.execute() -> hosted wallet setup
                                                        |
                                           /wallets -> address
```

Signing follows the same shape: the backend returns a `challengeId`, the SDK
opens Circle's confirmation UI, and the signature comes back on the challenge
result.

Sessions are stored per environment and App ID (in `sessionStorage` unless
`storage` says otherwise). Changing environment shows that environment's session
(or none) without deleting the other one.

A user's first wallet comes from `/initialize-user`. Wallets on further chains
come from `/create-wallet`, which ConnectKit uses automatically when the user
already has a wallet, including when they switch to a chain where they have
none. Either way the user approves the new wallet in Circle's hosted UI.

The user token lasts 14 days. Once it is a day old, ConnectKit renews it through
`/refresh-token` before the next sign-in check or signature, so active users stay
signed in. If Circle rejects the token, the session is cleared.

## Limitations

These come from Circle's model:

- **No `eth_sign`** and **no `eth_signTransaction`**.
- **No contract deployment**: transactions need a `to` address.
- **Explicit gas is ignored**: set `feeLevel`.
- **One wallet per chain**: switching chains selects another Circle wallet,
  creating it (with user approval) if needed. Switching to a chain in the other
  environment always fails; that is a different Circle user.
- **Inactive users re-authenticate**: a token not refreshed within 14 days
  expires.
- **Generic `EVM` / `EVM-TESTNET` chains** support signing only; Circle does not
  broadcast on them.

Chain mappings live in
[`src/circle/chains.ts`](../packages/connectkit/src/circle/chains.ts).

## Headless usage

```tsx
import { useCircleLogin } from '@biscottidex/connectkit';

const { status, environment, issues, signInWithGoogle, signInWithEmail, signOut, address } =
  useCircleLogin();

await signInWithEmail('user@example.com');
```

See [`examples/nextjs-app/app/circle-panel.tsx`](../examples/nextjs-app/app/circle-panel.tsx).

# Sign in with Circle

Let users create a wallet with a Google account instead of a browser extension,
backed by [Circle user-controlled wallets](https://developers.circle.com/wallets/user-controlled/build-a-wallet-app).

The result is a normal wagmi connector: `useAccount()`, `useSignMessage()`,
`useSendTransaction()` and SIWE all work without special-casing.

- **Opt-in.** Omit the `circle` option and nothing changes — no UI, no bundle cost.
- **Google today.** Email OTP and PIN appear in the modal marked *coming soon*.
- **A backend is required.** Circle's API key must never reach the browser.

---

## 1. Credentials

Three values, and it matters which side each one lives on.

| Value | Where to get it | Where it goes |
| --- | --- | --- |
| Circle **App ID** | [Circle Console](https://console.circle.com/) → your app | client (`NEXT_PUBLIC_…`) |
| Google **client ID** | Google Cloud → Credentials → OAuth 2.0 Client ID, type *Web application* | client (`NEXT_PUBLIC_…`) |
| Circle **API key** | Circle Console → API Keys (use a **sandbox** key in development) | **server only** |

Two steps people miss:

- The Google **client secret** is registered in the **Circle Console**, under social
  login settings. It does not belong in your app's environment at all.
- In Google Cloud, add your origin (e.g. `http://localhost:3000`) to that OAuth
  client's **Authorized redirect URIs**, or Google rejects the sign-in.

Sandbox API keys only work against **testnets**. Point `defaultChainId` at one.

```bash
# .env.local
NEXT_PUBLIC_CIRCLE_APP_ID=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
CIRCLE_API_KEY=...          # no NEXT_PUBLIC_ prefix — this grants full account access
```

## 2. Install

```bash
npm install @circle-fin/w3s-pw-web-sdk
```

It is an optional peer dependency, loaded on demand. Apps that never enable
Circle never download it.

## 3. Configure

Declare it once, where you build your wagmi config:

```ts
import { getDefaultConfig } from 'biscotti-finance-connectkit';
import { baseSepolia } from 'wagmi/chains';

export const config = createConfig(
  getDefaultConfig({
    appName: 'My App',
    chains: [baseSepolia],
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
    circle: {
      appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID,
      google: { clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID },
      defaultChainId: baseSepolia.id,
    },
  })
);
```

The connector carries these options, so `<ConnectKitProvider>` picks them up
automatically. If you build your wagmi config by hand, pass the same object as
`<ConnectKitProvider options={{ circle }}>` instead — that form takes precedence.

### Options

| Option | Default | Notes |
| --- | --- | --- |
| `enabled` | `true` | Set `false` to disable while keeping config in place. |
| `appId` | — | Circle App ID. |
| `google.clientId` | — | Google OAuth client ID. |
| `google.redirectUri` | `window.location.origin` | Must be registered in Google Cloud. |
| `defaultChainId` | app's first chain | Chain to provision the wallet on. |
| `feeLevel` | `MEDIUM` | `LOW` / `MEDIUM` / `HIGH`. Circle prices gas itself. |
| `endpoints.basePath` | `/api/circle` | Where your backend routes live. |
| `adapter` | — | Replace the HTTP client entirely. |
| `chains` | — | Add or override Circle chain identifiers. |
| `name` | `Sign in with Circle` | Label in the wallet list. |

## 4. Backend routes

ConnectKit calls **your** server, which holds the API key and forwards to Circle.
A complete reference implementation lives in
[`examples/nextjs-app/app/api/circle`](../examples/nextjs-app/app/api/circle) —
copy it, or point `endpoints.basePath` at your own.

| Route | Circle endpoint |
| --- | --- |
| `POST /api/circle/device-token` | `POST /users/social/token` |
| `POST /api/circle/initialize-user` | `POST /user/initialize` |
| `POST /api/circle/wallets` | `GET /wallets` |
| `POST /api/circle/sign-message` | `POST /user/sign/message` |
| `POST /api/circle/sign-typed-data` | `POST /user/sign/typedData` |
| `POST /api/circle/transaction` | `POST /user/transactions/contractExecution` |
| `GET /api/circle/health` | *(optional)* reports missing server config |

> **Production note.** These routes trust the `userToken` the browser sends. In a
> real application, also tie each request to your own session and verify the
> caller is entitled to act as that Circle user.

## 5. Diagnosing setup problems

Missing configuration never hides the button. Clicking it runs a preflight check
and the screen branches on environment:

- **Development** (or `<ConnectKitProvider debugMode>`) — every missing value is
  listed by name, tagged with whether it belongs in client env, server env, or a
  console.
- **Production** — a generic "temporarily unavailable" message. Environment
  variable names are never shown to end users.

`GET /api/circle/health` reports which server-side values are absent. It returns
only *presence*, never values, so it is safe to leave enabled.

## How it works

```
getDeviceId()  ->  /device-token  ->  performLogin(GOOGLE)
                                          |
                            full-page redirect to Google
                                          |
        userToken + encryptionKey  <-  redirect back
                                          |
                     /initialize-user  ->  challengeId
                                          |
                        sdk.execute()  ->  Circle's hosted PIN UI
                                          |
                              /wallets  ->  address
```

Signing follows the same shape: the backend returns a `challengeId`, the SDK
opens the PIN prompt, and the signature comes back on the challenge result — no
polling.

## Limitations

These are properties of Circle's model, not gaps in the integration:

- **No `eth_sign`** — legacy blind signing has no Circle equivalent.
- **No `eth_signTransaction`** — Circle broadcasts as part of the challenge and
  never returns a signed-but-unsent transaction.
- **No contract deployment** — transactions require a `to` address.
- **Explicit gas is ignored** — set `feeLevel` instead.
- **One wallet per chain** — switching chains selects a different Circle wallet,
  and fails if the user has none on the target chain.
- **60-minute sessions** — the user token expires and sign-in must be repeated.

Supported EVM chains are listed in
[`src/circle/chains.ts`](../packages/connectkit/src/circle/chains.ts). Circle's
`MONAD`, `ARC-TESTNET` and generic `EVM` buckets are deliberately absent rather
than guessed; add them with the `chains` option once you have confirmed the
chain IDs.

## Headless usage

For a custom UI, skip the modal entirely:

```tsx
import { useCircleLogin } from 'biscotti-finance-connectkit';

const { status, issues, signIn, signOut, address } = useCircleLogin();
```

See [`examples/nextjs-app/app/circle-panel.tsx`](../examples/nextjs-app/app/circle-panel.tsx).

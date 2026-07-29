# Bun Migration — Production Readiness Plan

**Status:** migration remediation implemented and verified locally on 2026-07-29.
**Branch:** `bun-migration-ibrahim` · **Baseline commit:** `03c2486`
**Bun:** 1.3.14 (pinned via `packageManager` + `oven-sh/setup-bun@v2`)

---

## 1. TL;DR

> **Implementation update:** CI now enumerates every workspace, all lint targets pass, and all
> build targets pass using Bun's isolated linker. The SIWE package has separate `/client` and
> `/server` exports, and previously phantom dependencies are declared. The measurements below
> remain as the `03c2486` baseline that motivated the work.

The Bun migration works. `bun install`, the hoisted linker, workspace filters, and the
`resolutions` → `overrides` translation are all functioning correctly.

The problem is not Bun. The problem is that `03c2486` **replaced whole-workspace CI commands
with hardcoded lists, and the excluded workspaces are exactly the broken ones.** CI is green
because the failures were removed from it, not because they were fixed.

Four of six lint targets and one of six buildable workspaces fail today. None of them run in CI.

---

## 2. What the last commit actually changed

| Script | Before (Yarn) | After (Bun) | Coverage |
|---|---|---|---|
| `build:ci` | `yarn workspaces foreach -R run build` | hardcoded chain of 5 | **8 → 5** |
| `lint:ci` | `yarn workspaces foreach -R run lint` | `nextjs` + `nextjs-app` only | **6 → 2** |

`yarn workspaces foreach -R` enumerated every workspace automatically. The Bun replacements
name specific workspaces, so anything failing simply stopped being checked. The two workspaces
still linted in CI are precisely the two that pass.

This is the core debt. Everything below is a symptom that was already there and is now invisible.

---

## 3. Verified baseline

Measured on `03c2486`, not inferred.

### Lint — 4 of 6 fail

| Workspace | Result | Cause |
|---|---|---|
| `connectkit` | **FAIL** (exit 2) | `ESLint couldn't find a configuration file` |
| `connectkit-next-siwe` | **FAIL** (exit 2) | `ESLint couldn't find a configuration file` |
| `nextjs-siwe` | **FAIL** (exit 1) | `@next/next/no-html-link-for-pages`: `path` argument undefined |
| `testbench` | **FAIL** (exit 1) | same rule error |
| `nextjs` | pass | in CI |
| `nextjs-app` | pass | in CI |

Both library packages run `eslint src --ext .ts`, but no `.eslintrc` exists anywhere under
`packages/`. Only the four examples have one.

### Build — 1 of 6 fails

`nextjs-siwe` fails; it is not in `build:ci`.

```
Import trace for requested module:
  node:process
  → node_modules/@peculiar/webcrypto/build/webcrypto.es.js
  → node_modules/iron-session/dist/index.mjs
  → packages/connectkit-next-siwe/build/index.es.js
  → ./src/utils/siweClient.ts
> Build failed because of webpack errors — Exited with code 1
```

Server-only code is reaching a browser bundle. Detail in step 4.

### Undeclared ("phantom") dependencies

Resolve today only because the hoisted linker flattens `node_modules`. All would break under
Bun's isolated linker.

| Package | Imported by | Declared? | Actually resolves via |
|---|---|---|---|
| `@wagmi/connectors` | `packages/connectkit/src/defaultConnectors.ts`, `src/wallets/index.ts` | **no** | `wagmi`'s own dependency (pins `5.7.7`) |
| `tailwindcss`, `postcss`, `autoprefixer` | `examples/nextjs-siwe` (`tailwind.config.js`, `postcss.config.js`, `src/styles/globals.css`) | **no** | **nothing — not installed at all** |
| `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin` | needed by `eslint src --ext .ts` in both packages | **no** | hoisted from `eslint-config-next` |

---

## 4. Already applied

- `bun ci` → `bun install --frozen-lockfile` in `.github/workflows/quality.yml`.
  Current Bun supports `bun ci` as a frozen-lockfile install alias; the explicit command is retained
  because its intent is clearer in CI.
- `resolutions` → `overrides` in root `package.json`.
  Bun silently translates the Yarn-era key, but that is undocumented compatibility behaviour, not
  a contract. Verified safe: re-running install produced **zero** `bun.lock` diff.
- Deleted the stale untracked `.yarn/` directory.
- Added `.claude` to `.gitignore`.

---

## 5. The plan

Ordering principle: **restore the safety net first, deliberately red.** Fixing things before the
gate exists means you cannot prove any of it worked. Steps 1–3 are roughly half a day of mechanical
work and they are what make step 4 verifiable rather than hopeful.

### Step 1 — Restore whole-workspace CI, and let it fail

*Why first:* a red baseline is the only honest measure of progress, and it prevents this class of
regression from recurring. Every later step is scored against it.

Replace the hardcoded lists with enumeration, so new workspaces are covered automatically:

```jsonc
"build:ci": "bun run build && bun run --filter '*' build",
"lint:ci":  "bun run --filter '*' lint"
```

Also fix `lint:all`, which currently uses npm syntax (`bun run --workspaces --if-present lint`) —
Bun's equivalent is `--filter '*'`.

Keep CI red for the duration of this plan, or temporarily allow failure on the new job while the
old narrow job stays required. Do **not** re-narrow the scripts to get green.

*Done when:* CI runs all 8 workspaces and the failure list matches §3 exactly — no surprises.

### Step 2 — One root ESLint config

*Why here:* unblocks two packages immediately, is the cheapest fix on the list, and every
subsequent step wants a working lint gate.

ESLint is 8.57.1 and the `--ext` flag is in use, so this is eslintrc format (not flat config).

Two things to get right:

1. **Scope it.** No example `.eslintrc.json` sets `"root": true`, so a new root config will cascade
   into all four of them and change their results. Either add `"root": true` to each example config,
   or confine the root config with `overrides` on `packages/*/src/**`. Prefer the explicit former.
2. **Declare the parser.** `@typescript-eslint/parser` and `/eslint-plugin` currently resolve only by
   hoisting from `eslint-config-next`. Add both as real root devDependencies — this is the same class
   of bug as step 3 and should be fixed the same way.

Separately, `@next/next/no-html-link-for-pages` throws in `nextjs-siwe` and `testbench` because the
plugin cannot locate the pages directory in a monorepo layout. Set the Next root explicitly in those
two configs:

```jsonc
{ "extends": "next/core-web-vitals", "root": true,
  "settings": { "next": { "rootDir": "examples/nextjs-siwe/" } } }
```

*Done when:* all 6 lint targets exit 0.

### Step 3 — Make every dependency declared

*Why here:* mechanical, low-risk, and a hard prerequisite for step 5. Also removes a real
correctness hazard, not just a hygiene one.

- **`@wagmi/connectors` → `packages/connectkit/package.json`.** Pin to `5.7.7` to match what
  `wagmi@2.14.11` resolves, and add it to root `overrides` so exactly one copy exists. Two copies
  of the connectors package means two connector identities and genuinely broken wallet reconnection —
  this is worth doing carefully, not just to satisfy a linter.
  Mark it external in the Rollup config alongside the other peers.
- **`tailwindcss`, `postcss`, `autoprefixer` → `examples/nextjs-siwe`.** Note this example is
  *configured* for Tailwind but the packages are not installed at all. Do not delete Tailwind here:
  this is the SIWE example, not a Tailwind demo, and removing it means rewriting the example's styles
  for no benefit.
- **`@typescript-eslint/*` → root devDependencies** (from step 2).

*Done when:* every import in the repo maps to a declared dependency.

### Step 4 — Split `connectkit-next-siwe` into client and server entry points

*Why here and not first:* this is the highest-value change and the only genuinely architectural one.
Steps 1–3 make it verifiable.

The package has a single fused entry (`"exports": "./build/index.es.js"`) and a barrel
`index.ts` re-exporting both halves. Because `iron-session`, `next`, and `node:http` are imported at
module top level in `configureSIWE.tsx`, **any** import of this package drags server code into the
bundle — which is exactly the failure in §3.

The good news: the file already has a clean seam and the client half is genuinely independent.

`configureClientSIWE` (lines 274–326) needs only:
- `react` — types only (`FunctionComponent`, `ComponentProps`)
- `connectkit` — `SIWEProvider`
- `viem/siwe` — `createSiweMessage`
- browser `fetch` / `window`

It needs **zero** `iron-session`. Its `TSessionData` type parameter is unused, and
`ConfigureClientSIWEResult` contains only `Provider`. Nothing forces the coupling — it is
purely an artifact of the two functions sharing a file.

Proposed layout:

| File | Contents | May import |
|---|---|---|
| `src/client.tsx` | `configureClientSIWE`, `NextClientSIWEConfig`, `NextSIWEProviderProps`, `ConfigureClientSIWEResult` | `react`, `connectkit`, `viem/siwe` |
| `src/server.ts` | `configureServerSideSIWE`, `getSession`, `nonceRoute`, `verifyRoute`, `sessionRoute`, `logoutRoute`, `envVar`, server types | `iron-session`, `next`, `node:http`, `viem`, `viem/chains`, `viem/siwe` |
| `src/shared.ts` | type-only declarations used by both (erased at build) | — |

```jsonc
"exports": {
  "./client": { "types": "./build/client.d.ts", "import": "./build/client.es.js" },
  "./server": { "types": "./build/server.d.ts", "import": "./build/server.es.js" }
},
"sideEffects": false
```

Rollup moves to two entry points. Drop the root `"."` export rather than keeping it as an alias —
a root export that pulls in both halves reintroduces the exact bug, and this is an internal fork
with no external consumers to break. Update `examples/nextjs-siwe/src/utils/siweClient.ts` to
import from `connectkit-next-siwe/client`.

*Done when:* `nextjs-siwe` builds, and no `node:` builtin appears in its client bundle.

### Step 5 — Attempt the isolated linker

*Why last:* it is the proof that step 3 was complete, not a task in its own right.

Remove `linker = "hoisted"` from `bunfig.toml`, reinstall clean, run the full CI. Any failure is a
remaining undeclared dependency — fix it and repeat. Once it passes, isolated becomes a permanent
guard against phantom dependencies reappearing.

If it does not pass quickly, keep `hoisted`. The comment currently in `bunfig.toml` is accurate and
should stay until this step actually succeeds.

---

## 6. Deferred, with reasons

**Circular dependencies — confirmed and deferred.**
`bunx madge --circular --extensions ts,tsx packages/connectkit/src` reports 51 cycles. Rollup also
reports the original `index.ts → useModal → ConnectKit → Modal/Portal → index.ts` chain. These are
pre-existing architectural debts rather than Bun migration blockers; untangling the public barrel,
provider/context modules, and modal components should be a separate refactor with focused tests.

**Bundle splitting / subpath exports (`/wallets`, `/themes`, …) — fold into the DEX rename.**
This is a public API design change, not migration debt. Doing it before package boundaries are
settled means doing it twice. Revisit once steps 1–5 are done and the rename begins.

---

## 7. Reference

```sh
bun install --frozen-lockfile          # reproducible install (CI)
bun run build:ci                       # ordered build of every workspace
bun run lint:ci                        # lint every workspace
bun run --filter <name> <script>       # single workspace
bunx madge --circular packages/connectkit/src
```

> Do **not** use `bun run --filter '*' build`. Bun does not topologically order workspace
> builds, so the examples can start before `connectkit` has emitted its declarations. See §8.

Workspace names differ from directory names in one case: `examples/vite` is `vite-example`.

**Not migration debt** — pre-existing, safe to ignore for now: the `pino-pretty` optional-peer
warning from WalletConnect, and the `swcMinify` key deprecated in Next 15.

---

## 8. Hardening pass

Applied after the remediation above. Verified from a full clean room (`node_modules`, `build/`,
`.next/`, rpt2 caches all removed): install, build, and lint each exit 0.

### Two latent bugs found

**Build order was never correct.** `build:ci` used `bun run --filter '*' build`, but Bun does not
topologically order workspace scripts — not even with an explicit workspace dependency declared.
`connectkit-next-siwe` and the examples were starting before `connectkit` had emitted
`build/index.d.ts`, failing with `TS2307: Cannot find module 'connectkit'`.

This never surfaced because stale `build/` output from previous local runs always satisfied the
resolution. Adding a clean step exposed it. On a fresh CI checkout it would have failed.
`build:ci` now sequences the two library packages explicitly and globs the examples:

```
bun run build.js
  && bun run --filter connectkit build
  && bun run --filter connectkit-next-siwe build
  && bun run --filter './examples/*' --if-present build
```

**rollup-plugin-typescript2 poisoned its own cache.** When the clean step removed
`connectkit/build` mid-build, rpt2 cached the `Cannot find module` result in
`packages/*/node_modules/.cache/` and kept returning it on every later build, even once the file
existed again. Fixed with `clean: true` in both production rollup configs — deterministic builds,
no cross-run cache.

### Changes

- **ESLint now enforces rules.** The config had a parser and plugin but no `extends` and no
  `rules`, so 153 files linted with zero rules applied — a file with unused vars, `==`, `debugger`
  and explicit `any` passed clean. Now extends `eslint:recommended` +
  `plugin:@typescript-eslint/recommended`. 126 real violations surfaced; all 126 fixed or
  configured. `browser` and `node` environments are scoped per directory instead of both being
  granted everywhere, so client code can no longer reference Node globals unnoticed.
- **`@typescript-eslint/no-explicit-any` is set to `warn`, not off.** 61 legacy sites remain and
  are reported on every lint run. Fixing them needs real type work that risks behaviour changes, so
  they are tracked as visible debt rather than silently suppressed. Burn this down over time.
- **`viem` is peer-only** in `connectkit-next-siwe`; it was declared as both a direct and a peer
  dependency, which could resolve two copies in a consuming app.
- **`connectkit` declared as a workspace devDependency** of `connectkit-next-siwe`. It was a real
  build-time dependency that was only listed as a peer.
- **Build output is cleaned before each build** in both packages. `build/` previously retained the
  pre-split `index.es.js` — the old fused bundle with `iron-session` in it — and `files: ["build"]`
  would have published it.
- **`connectkit-next-siwe` bumped 0.3.0 → 0.4.0** with a `CHANGELOG.md`, since removing the root
  export is breaking. Pre-1.0, so a minor bump per semver.
- **`react/jsx-runtime` externalised explicitly** in all four rollup configs. It was previously
  external only by accident of being unresolved.

### Reversed recommendation: keep the global `typescript` override

An earlier draft of this document recommended removing `"typescript": "5.3.3"` from root
`overrides` as a blunt instrument. Testing showed it is load-bearing:
`typescript-plugin-styled-components@2.0.0` (used by `packages/connectkit/rollup.config.dev.js`)
declares `peerDependencies.typescript: ^4.0`, which 5.3.3 does not satisfy. Without the override
every `bun install` prints `incorrect peer dependency "typescript@5.3.3"`.

Every workspace already pins 5.3.3 directly, so the override changes no actual resolution — its
only effect is suppressing that one stale peer range. It was restored. Revisit if
`typescript-plugin-styled-components` is ever updated or dropped.

# Deployment

This document records the monorepo deploy-shape settings retired offline in
Phase 1 Plan 01, Task 4, and the human-only dashboard steps this project
depends on. Update it as later plans (especially Plan 11) fill in real
deploy targets.

## Vercel (apps/web)

Checklist for connecting this repo to a Vercel project:

1. Create/select a Vercel project and connect this git repository.
2. Set **Root Directory** to `apps/web`.
3. **Enable "Include files outside the Root Directory in the Build Step."**
   Without this toggle, Vercel's build isolates `apps/web` from the rest of
   the monorepo and the `@games/schema` / `@games/rules` workspace imports
   fail on Vercel while succeeding locally (research Pitfall 5). This was
   not yet exercised against a live Vercel deploy in this plan — Wave 0 only
   retires the *local* `next build` risk (see below) — but the setting must
   be enabled before the first real Vercel deploy, so it's recorded here now.
4. Build command: `npm run build --workspace apps/web` (equivalently, Vercel's
   framework auto-detection running `next build` with Root Directory
   `apps/web` is fine once the toggle above is enabled).
5. Framework preset: Next.js (auto-detected).

**Local verification performed in this plan:** `npm run build --workspace
apps/web` (`next build`) succeeds from a clean, offline checkout while
importing `SCHEMA_SMOKE` from `@games/schema` — retiring Pitfall 5 locally.
The Vercel-specific "Include files outside Root Directory" toggle still
needs to be confirmed against a real Vercel deploy once the project is
connected (Plan 11).

## Cloudflare Workers (apps/worker)

Deploy command (once authenticated): `wrangler deploy` from `apps/worker`
(or `npm run deploy --workspace apps/worker` once that script exists —
Wave 0 only defines a `build` script that runs `wrangler deploy --dry-run`).

**Dry-run result (this plan, Task 4):** `wrangler deploy --dry-run --outdir
dist` succeeded with **no alias workaround needed**. wrangler
`4.128.0`'s bundler resolved both hoisted npm-workspace packages
(`@games/schema` and `@games/rules`) without any explicit `alias` entry in
`wrangler.jsonc` — confirming research assumption A3 (historical
wrangler + npm-workspace symlink/hoisting resolution issues) is fixed in
the current wrangler version. The produced bundle
(`apps/worker/dist/index.js`) was grepped and contains both
`schema-smoke-ok` and `rules-smoke-ok`, proving the cross-package imports
were bundled, not stubbed out.

No credentials were required for this dry-run — `--dry-run` bundles
offline, which is why this risk could be retired before Cloudflare account
setup was complete.

## User prerequisites (manual, dashboard-only)

| Prerequisite | Why | Needed by |
|---|---|---|
| Cloudflare account on the Workers Free plan + `npx wrangler login` run locally | Deploying `apps/worker` and its Durable Object namespace | Plan 11 onward (not needed for Wave 0 dry-runs, which run unauthenticated) |
| Vercel project connected to this repo, Root Directory = `apps/web`, "Include files outside the Root Directory in the Build Step" enabled | Deploying `apps/web` | Plan 11 onward |

## Live deployment (Plan 11)

Recorded 2026-09-15.

| Piece | Value |
|---|---|
| Worker | `games-worker` at `https://games-worker.rflores3113.workers.dev` (deployed with `npx wrangler deploy` from `apps/worker`) |
| Vercel project | `games-web` (team "Roger Flores' projects", Hobby), Root Directory `apps/web` |
| Production URL | `https://games.rogerflores.dev` |
| Web → Worker link | Vercel env var `NEXT_PUBLIC_WORKER_HOST = games-worker.rflores3113.workers.dev` (bare host, no scheme), set for Production and Preview |

`NEXT_PUBLIC_WORKER_HOST` is inlined at build time. Changing it does nothing
until Vercel rebuilds, so redeploy after every change to it. It is public by
construction (it is the host the browser dials), so it is not a secret.

### Worker origin allowlist

The Worker rejects WebSocket handshakes from origins it does not know
(`apps/worker/src/origin.ts`). `https://games.rogerflores.dev` and any
loopback origin are allowed in code. To allow another front-end origin (a
`*.vercel.app` preview URL, say), set the comma-separated `ALLOWED_ORIGINS`
Worker variable and **redeploy the Worker**. The allowlist is read at
connect time from the deployed Worker's environment, so an unredeployed
Worker keeps rejecting the new origin with close code 1008, and the page
renders as a room that never loads.

### Vercel monorepo build gotchas

Vercel installs only the `apps/web` workspace's dependencies, not the
monorepo root's devDependencies. Two consequences were hit on the first
real deploy:

- `typescript` must be declared in `apps/web/package.json`; the root copy
  is not installed, and `next build` fails with "do not have the required
  package(s) installed."
- `next build` type-checks through `apps/web/tsconfig.build.json`, which
  excludes test files. The normal `tsconfig.json` includes tests that
  import `vitest`, which is a root devDependency and fails to resolve on
  Vercel.

## Custom domain

`games.rogerflores.dev` is added to the `games-web` Vercel project. DNS for
`rogerflores.dev` is hosted on Cloudflare (nameservers
`mona.ns.cloudflare.com`, `yoxall.ns.cloudflare.com`), with a `CNAME`
record `games` → `2dd48b707c982d85.vercel-dns-017.com` set to **DNS only
(grey cloud)**. Cloudflare's orange-cloud proxy would stop Vercel from
issuing its certificate. Vercel serves TLS with a Let's Encrypt (YR2)
certificate. The full record is in `docs/manual-checks/custom-domain.md`.

## Running E2E against production

```
PLAYWRIGHT_BASE_URL=https://games.rogerflores.dev npx playwright test create-room join-room
```

With `PLAYWRIGHT_BASE_URL` set, Playwright skips its local `next dev` and
`wrangler dev` servers. Only run specs that create their own rooms. Note that
every run is traffic against the production Worker, which restarts the RT-02
cold-start idle window (`docs/manual-checks/cold-start.md`).

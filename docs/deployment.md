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

## Custom domain

TODO(Plan 11)

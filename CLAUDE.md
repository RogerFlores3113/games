<!-- GSD:project-start source:PROJECT.md -->
## Project

**games.rogerflores.dev**

A games subdomain on Roger Flores' personal domain hosting real-time multiplayer board games, playable by sharing a link — no accounts, no downloads. The first game is Hanabi (base game plus the box variants: Rainbow and Black); Innovation follows in a later milestone.

It is built for the author and their friends: a small group who want to sit on a voice call and play a good co-op card game together without the setup friction of existing options.

**Core Value:** A friend clicks a link and is playing Hanabi within seconds — and the game does not break, stall, or lose their seat for the next 25 minutes.

### Constraints

- **Hosting**: Must deploy on Vercel's free tier — personal project, no hosting budget
- **Cost**: Every dependency must have a workable free tier; no service is acceptable that requires a paid plan to stay reachable
- **Availability**: The backend must serve a cold link click after a week of total inactivity without manual intervention — this is what disqualified Supabase's free tier
- **Correctness**: Server-authoritative per-seat state filtering is mandatory; a client must never receive its own hand's card identities, because that leaks the game
- **Session durability**: A ~25-minute game must survive a refresh, a dropped connection, and a sleeping tab without ending
- **Scope**: Hanabi box variants only for v1 — base, Rainbow, Black
- **Extensibility**: Room, seating, and realtime layers must be game-agnostic so Innovation can be added later without a rewrite
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## THE CRITICAL DECISION: Where Authoritative State Lives
### Why Durable Objects wins this decision
### Why NOT the alternatives
- **PartyKit (hosted platform).** PartyKit was acquired by Cloudflare in 2024 and its server programming model (`Party.Server`) lives on as the `partyserver` library, which *is* the recommendation above — but the *separately hosted* PartyKit Cloud product has its own deployment target and billing surface layered on top of Cloudflare. There is no reason to add that layer for a single-table hobby app: deploying `partyserver` as your own Cloudflare Worker gets identical DX with one fewer account/vendor relationship and bills directly against the Workers Free plan you've already verified. Runner-up only if you want its dashboard/observability and are fine depending on a smaller company's product roadmap on top of Cloudflare's.
- **Neon + push service (the runner-up, detailed below).** Viable and genuinely free-forever (Neon free tier: 100 CU-hours/month, 0.5GB storage, scale-to-zero after 5 minutes of idle with wake time in the "few hundred milliseconds" range per Neon's own docs, confirmed no manual unpause — this is categorically different from Supabase's project-level pause). The reason it's the runner-up and not primary: it requires **three** coordinated pieces (Vercel serverless function for game logic, Neon for durable state, Ably for push-out) instead of one, and per-seat filtering has to be re-implemented as an application concern in the serverless function rather than falling out of the transport model for free. It's a fine choice if you'd rather keep the entire stack in Vercel + "boring Postgres" and are comfortable adding Ably as a fourth dependency, but it is strictly more moving parts for identical guarantees at this scale.
- **Upstash Redis alone (no Postgres).** Good ephemeral store (256MB, 500K commands/month free, confirmed 2026), but it is not a push mechanism by itself — you'd still need Ably/Pusher on top, and Redis alone gives you no durable persistence guarantee beyond your configured eviction/TTL policy. Fine as a *lock/ephemeral-room-index* layer if you ever needed multi-instance coordination, but unnecessary complexity here: a single DO already serializes all access to a room's state (no lock needed — a Durable Object is single-threaded per instance by design), which is exactly why Redis's traditional job (distributed locking) isn't needed at this scale.
- **Ably vs Pusher, if you do go the runner-up route.** Ably is the better fit of the two for per-seat filtering: Ably's free tier (verified 2026: 6M messages/month, 200 concurrent connections, 200 concurrent channels, 500 msg/s) supports one **channel per seat** (e.g., `room:{id}:seat:{n}`) so the server publishes each seat's filtered view to its own channel and a client only ever subscribes to its own — this is real per-recipient isolation, not client-side filtering of a shared broadcast. Pusher's free "Sandbox" tier (100 concurrent connections, 200,000 messages/day) can do the same per-channel pattern but has a harder connection ceiling and is explicitly positioned as a dev/test tier rather than a permanent free product. If you take the runner-up path, use Ably.
- **Vercel-native WebSockets.** Vercel Functions gained native WebSocket support in public beta (announced June 2026), but by Vercel's own documentation this has two disqualifying gaps for this project: (1) an established connection is pinned to one function instance for that invocation's max duration, and future connections for the same room are **not guaranteed to land on the same instance**, so there is no built-in way to broadcast to all sockets in a room without adding external pub/sub (Redis, Ably) anyway; (2) it is explicitly still positioned as needing a third-party/external state layer for anything beyond simple streaming. It buys you nothing over the DO approach and reintroduces the exact fan-out problem DOs solve natively. Do not use as the primary transport.
- **Supabase Realtime / Supabase Postgres.** Explicitly rejected per PROJECT.md — free-tier projects pause after ~1 week of inactivity, which is a direct violation of the core product promise ("click a link on a random Tuesday"). Not reconsidered here. Mentioned only for completeness.
- **Self-hosted on Fly.io / Railway / Render (a small long-running Node WebSocket server).** Verified 2026: Railway has no free tier (removed 2023, now trial-credit-then-paid). Fly.io has no standing free tier in 2026, only a time/VM-limited trial (2 VM-hours or 7 days). Render is the only one of the three with a real permanent free tier, but its free web services spin down after 15 minutes of inactivity with a **30-60 second cold start** on the next request — this directly violates constraint 5 ("warm enough to feel instant"). None of these are viable as the primary backend; ruled out.
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js (App Router) | 15.x (repo currently resolves 16.3.4 as latest; pin to latest stable 15.x or current 16.x — see note) | Frontend framework on Vercel | Vercel's first-party framework, zero-config deploy, good fit for the handful of static-ish routes you need (landing/create-room page, `/room/[id]` game view) even though the app is mostly one realtime view — see "Next.js vs Vite SPA" below for the honest tradeoff |
| React | 19.x | UI library | Required by current Next.js; concurrent features not critical here but no reason to fight the framework default |
| TypeScript | 5.7+ | Language, rules-engine type safety | Non-negotiable for a rules engine with this many edge cases (clue legality, endgame triggers, variant-specific card touching); catches an entire class of "forgot to handle Black suit" bugs at compile time |
| Cloudflare Workers + Durable Objects (SQLite storage) | `wrangler` 4.x (current major as of 2026) | Authoritative game server, one DO instance per room | See "The Critical Decision" above — this is the load-bearing infrastructure choice |
| `partyserver` | latest (0.x, actively maintained under `cloudflare/partykit` monorepo) | Room-routing + hibernation-aware WebSocket lifecycle on top of raw DO | Removes Hibernation API boilerplate while staying inside your own Cloudflare account/billing |
| `partysocket` | 1.3.0 | Client-side WebSocket wrapper (browser, used from Next.js) | Automatic reconnect with backoff + room-based URL helpers; pairs directly with `partyserver` on the backend, critical for constraint 7 (reconnect/resume) |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zustand | 5.0.x | Client state container for the live game view | Server is authoritative; client state is just "the last filtered view the server sent me" plus local UI state (selected card, hover). Zustand's minimal API avoids Redux ceremony for what is essentially a single-slice cache of server-pushed state |
| Zod | 4.x | Runtime validation of WebSocket message payloads on both client and server | Messages cross a network boundary between two different runtimes (Vercel/Node-ish and Cloudflare Workers) — validate at the boundary rather than trusting `JSON.parse` on either side; also gives you inferred TS types for message shapes |
| Motion (formerly Framer Motion) | 13.x (`motion` package; `framer-motion` is now a legacy alias for the same code) | Card movement animation, glow/luminosity transitions | The de facto standard React animation library; layout animations (`layoutId`) are exactly the primitive needed for a card visually moving from hand → played-stack/discard-pile across re-renders driven by server state changes |
| Tailwind CSS | 4.x | Styling | Utility-first is a strong fit for a component-dense, highly stateful card UI (many small conditional classes for glow intensity, clue highlight, disabled states) without hand-rolling a CSS-in-JS runtime; v4's CSS-based config also plays well with a dark, custom-palette "fireworks night" theme defined once as CSS variables |
| `clsx` or `tailwind-merge` | latest | Conditional class composition | Needed alongside Tailwind once card components have many boolean visual states (clued, playable-looking, own-hand-hidden, disconnected-owner) |
| Vitest | 4.x | Unit/integration testing for the rules engine | Fast, native ESM/TS support, works identically whether the rules engine package is tested standalone or imported into the Worker; no reason to reach for Jest in a 2026 TS project |
| fast-check | 4.x | Property-based testing of the Hanabi rules engine | See "Testing Approach" below — this is a deliberate, not default, choice given the stated edge-case risk in the rules |
| `nanoid` | latest | Room IDs, seat reconnect tokens | Short, URL-safe, collision-resistant; simpler than UUID for a link users will actually see/share |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `wrangler` | Cloudflare Worker local dev + deploy CLI | `wrangler dev` gives you a local DO runtime with hibernation simulated; `wrangler deploy` ships to the Workers Free plan |
| Turborepo (or plain npm workspaces) | Monorepo tooling for shared types between Next.js (Vercel) and Worker (Cloudflare) | See "Shared Types Strategy" below — you have two deploy targets in one repo and want the rules-engine + message-schema package importable by both without publishing to npm |
| Playwright | End-to-end test of a full room lifecycle (create → join → play → reconnect) | Not critical for MVP but valuable given how much of the risk here is in reconnect/session semantics rather than pure UI |
## Installation
# Monorepo scaffold (npm workspaces; Turborepo optional if you want cached builds)
# Frontend (apps/web) — Next.js on Vercel
# Worker (apps/worker) — Cloudflare Durable Object room server
# Shared packages (imported by both apps/web and apps/worker)
# Animation, class utilities (apps/web only)
# Testing (root or packages/rules)
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Cloudflare Durable Objects (+ `partyserver`) | Neon + Ably, logic in Vercel functions | You want everything except the WebSocket transport to live inside Vercel/Postgres tooling you already know, and you're fine adding Ably as a fourth service; also if you later want relational queries over game history (currently out of scope) |
| Cloudflare Durable Objects | Hosted PartyKit Cloud platform | You want a managed dashboard/observability UI for rooms and are fine with an extra vendor relationship layered on Cloudflare's own free tier |
| Ably (if using runner-up path) | Pusher | Never, for this project — Pusher's free tier is explicitly a dev/test "Sandbox," not a permanent free product, and its connection ceiling is lower |
| Next.js App Router | Plain Vite SPA on Vercel | See dedicated section below — genuinely close call, Next.js still wins here but only narrowly |
| Zustand | React Context + `useReducer` | Team strongly prefers zero dependencies; Zustand's selector-based subscriptions avoid unnecessary re-renders across many small card components, which Context alone does not |
| Motion | React Spring | You want physics-based spring animation as the primary model rather than Motion's declarative variants; either is fine, Motion has more Next.js-specific examples and a larger community for layout-animation patterns like card movement |
| Tailwind CSS | CSS Modules / vanilla-extract | You dislike utility classes on principle; otherwise Tailwind's velocity on a dark, highly conditional visual theme wins here |
| fast-check | Hand-written unit tests only | Project were pure UI with no rules engine — Hanabi's clue-legality/endgame edge cases are exactly the case property-based testing is good at, so this is a deliberate inclusion, not a default |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Supabase (Postgres + Realtime) as primary backend | Free-tier projects pause after ~1 week idle — directly violates the "click a link on a random Tuesday" product promise (explicitly rejected in PROJECT.md) | Cloudflare Durable Objects (primary) or Neon + Ably (runner-up) |
| Broadcasting one shared `GameState` object to all clients on any transport (Pusher/Ably "one channel for the room," or a naive `io.to(room).emit(state)`) | Trivially cheatable via browser devtools — a player's own hand's card identities would be present in the payload even if the UI hides them | Compute a distinct `toPlayerView(state, seatId)` payload server-side per connected seat and send/publish each seat's view separately (own channel per seat, or per-recipient `ws.send()` from a Durable Object) |
| Vercel serverless functions (Node runtime, non-Fluid) for holding realtime connections | Cannot hold persistent WebSocket connections at all; will terminate/timeout | Cloudflare Durable Objects, or Vercel's native WebSocket beta only with an external pub/sub layered on for cross-instance fan-out |
| Vercel's native WebSocket beta (June 2026) as the sole transport for a multi-seat room | No built-in cross-instance broadcast; a second player's socket is not guaranteed to land on the same function instance as the first, so room-wide fan-out requires bolting on Redis/Ably anyway — you get none of DOs' benefits and all of the extra-service complexity | Cloudflare Durable Objects |
| Fly.io / Railway free tier as a self-hosted WebSocket server | Neither has a standing permanent free tier in 2026 (Railway removed free tier in 2023; Fly.io now offers only a 2-VM-hour/7-day trial) | Cloudflare Durable Objects |
| Render free tier as a self-hosted WebSocket server | Real permanent free tier exists, but spins down after 15 minutes idle with a 30-60s cold start on wake — fails the "warm enough to feel instant" requirement | Cloudflare Durable Objects |
| Redux / Redux Toolkit for client state | Unjustified ceremony for a client that is fundamentally a thin renderer of server-pushed state plus a little local UI state | Zustand |
| Raw Durable Object WebSocket Hibernation API hand-rolled from scratch | Works fine, but you'll re-implement room routing, connection bookkeeping, and rehydrate-on-wake logic that `partyserver` already provides and maintains | `partyserver` |
| CSS-in-JS runtime libraries (styled-components, Emotion) in a Next.js App Router project | Runtime CSS-in-JS has known friction with React Server Components / streaming in the App Router; adds a runtime cost for no benefit over utility classes here | Tailwind CSS |
## Stack Patterns by Variant
- Add Neon Postgres as a secondary durable store the Cloudflare Worker writes completed-game summaries to via HTTP (Neon's serverless HTTP driver works fine from a Worker)
- Because Durable Object SQLite storage is the right fit for *live* room state (co-located with the compute that mutates it), but a shared Postgres instance is the right fit for *cross-room* queries you don't have today
- Keep the room/seat/reconnect/DO-hosting layer exactly as built for Hanabi; only the `rules` package and its `GameState`/`toPlayerView` implementation should be game-specific
- Because the constraint "room and realtime layer must be game-agnostic" (PROJECT.md) is satisfied precisely by keeping `partyserver`'s room routing, WebSocket lifecycle, and reconnect-token handling generic, and isolating all Hanabi-specific logic behind a small interface (`applyAction`, `toPlayerView`, `checkGameEnd`) that a second game implements independently
- Cloudflare Workers Paid plan is $5/month flat and removes the daily caps — cheap enough that it's a reasonable next step rather than an architecture change
- Because none of the surrounding design (DO-per-room, hibernation, per-seat filtering) changes when moving from Free to Paid; only the billing tier does
## Next.js vs Plain Vite SPA — the honest tradeoff
- **Vite SPA pros:** No SSR/RSC complexity to reason about for a page that's 95% client-driven WebSocket state anyway; slightly simpler mental model; deploys to Vercel as a static build with no framework-specific server runtime.
- **Next.js pros that tip it back:** (1) Vercel's zero-config deploy and preview-URL workflow is still marginally smoother with its own framework; (2) you do have a handful of genuinely server-renderable moments — the landing/room-creation page and a `/room/[id]` entry point that benefits from SSR for a fast first paint and clean shareable-link metadata (OpenGraph tags for the link friends click matters here, since "click a link" is the whole product entry point); (3) API routes are convenient for the thin "mint a room" server action even though the game itself never touches Vercel's server after that.
## Shared Types Strategy (client on Vercel/Node-ish, server on Cloudflare Workers)
- Put the Hanabi rules engine (`applyAction`, `toPlayerView`, deck construction, endgame detection, variant logic) in a **framework-free TypeScript package** (`packages/rules`) with zero Node-specific or Worker-specific APIs — pure functions and plain objects only. Both `apps/web` (for optimistic UI / client-side legality pre-checks, never as the source of truth) and `apps/worker` (as the actual source of truth) import it.
- Put the WebSocket message envelope shapes in a **separate `packages/schema` package** using Zod schemas, with `z.infer<>` for the TS types. Both sides validate incoming messages against the same schema, which also documents the wire protocol in one place.
- Use npm/pnpm workspaces (or Turborepo if you want cached builds later) rather than publishing these as versioned npm packages — at this scale, versioning overhead across packages you own and deploy together buys nothing.
- Verify at CI time (or a pre-deploy script) that `apps/worker`'s `wrangler.toml` build and `apps/web`'s Next.js build both type-check against the same `packages/rules`/`packages/schema` source — a monorepo with workspace `tsconfig` project references is sufficient; no need for a runtime RPC/codegen layer (tRPC etc.) since the transport is a raw WebSocket, not HTTP RPC.
## Testing Approach for the Rules Engine
- **Vitest** for straightforward example-based unit tests: known game states with known correct next-states (e.g., "giving a red clue in this exact hand highlights exactly these three cards").
- **fast-check (property-based testing) for the invariants that are easy to state generally and easy to get subtly wrong by hand-writing every case:**
- Confidence: HIGH that property-based testing is worth the (small) setup cost here — this is not a generic recommendation, it's specifically warranted because the domain has verifiable universal invariants (token conservation, hand-visibility redaction, variant-specific touching rules) that are exactly the shape property testing is built for, and the failure mode of getting them wrong (a cheatable leak, or a game that never ends) is high-severity for a co-op game meant to "just work."
## Reconnect / Resume Semantics
- On room join, the server (DO) issues each seat a **reconnect token** (a `nanoid`), stored client-side in `localStorage` keyed by room ID. This is not authentication — it is a durable seat claim so a refresh, dropped wifi, or a sleeping tab can be matched back to the same seat.
- On WebSocket open, the client sends `{ type: "join", roomId, seatToken? }`. If `seatToken` matches a known seat in the DO's SQLite-persisted room state, the server rebinds that seat's connection and immediately sends that seat's current filtered view — no game restart, no state loss.
- Because Durable Objects hibernate (not "spin down and lose memory") between messages while a WebSocket stays technically connected, and because room state is also persisted to SQLite storage (surviving even a full DO eviction/restart, e.g., after a Cloudflare maintenance event), a ~25-minute game does not depend on the DO's in-memory JS object surviving continuously — it depends on the DO's storage, which is durable by design.
- The server should track per-seat `connected: boolean` (flipped by `onClose`/`onConnect` lifecycle hooks) and include it in every other player's filtered view, so a disconnected teammate shows a clear "disconnected" indicator (per PROJECT.md requirement) rather than the table silently freezing or the disconnected seat's absence being ambiguous.
- Set a generous but finite grace period (e.g., mark the seat "left" rather than merely "disconnected" only after some number of minutes with no reconnect) — but do not auto-end or auto-remove a player from an in-progress co-op game on a short timeout; the whole point of this requirement is that a sleeping tab for several minutes should not cost someone their seat.
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js 15.x/16.x (App Router) | React 19.x | Current Next.js majors require React 19; do not mix with React 18 |
| `partyserver` | `wrangler` 4.x, Workers `nodejs_compat` off (pure Worker runtime) | Runs as a standard Durable-Object-backed Worker; no Node compat layer required for the rules engine if it is framework-free TS |
| `partysocket` (client) | Any browser WebSocket target, including `*.workers.dev` | No coupling to Next.js specifically — works from any client bundler |
| Zod 4.x | TypeScript 5.x strict mode | Use `z.infer<typeof Schema>` throughout `packages/schema` rather than hand-written interfaces, to guarantee runtime/compile-time shape stay in sync across the Vercel/Cloudflare boundary |
| Tailwind CSS 4.x | Next.js App Router | v4's CSS-first config (`@theme` in globals.css) is the current recommended setup, replacing the old `tailwind.config.js`-centric v3 flow |
| fast-check 4.x | Vitest 4.x | No special integration needed; fast-check's `fc.assert(fc.property(...))` runs as a normal Vitest test body |
## Sources
- `developers.cloudflare.com/durable-objects/platform/pricing` — fetched 2026-09-01, confirmed Free plan Durable Object limits (SQLite-only backend on Free plan; 100k req/day, 13,000 GB-s/day, 5GB total storage, 5M row reads/day, 100K row writes/day)
- `developers.cloudflare.com/durable-objects/best-practices/websockets` and `/durable-objects/examples/websocket-hibernation-server` — WebSocket Hibernation API behavior and cost model, confirmed 2026-09-01
- `developers.cloudflare.com/workers/configuration/routing/workers-dev/` — confirmed `*.workers.dev` subdomain available and appropriate for hobby/personal projects on the Free plan
- GitHub `cloudflare/partykit` (`packages/partyserver`) — confirmed `partyserver` is the current library form of the PartyKit server API, deployable directly as a Cloudflare Worker, MEDIUM confidence on exact current version number (actively developed, pin to latest at install time)
- Neon docs `neon.com/docs/introduction/plans` — fetched 2026-09-01, confirmed Free plan (100 CU-hours/month, 0.5GB storage, scale-to-zero after 5 min idle, cannot be disabled on Free tier, no documented automatic deletion of inactive free projects) — MEDIUM confidence on the "no deletion policy" absence, since this was inferred from omission in the fetched docs rather than an explicit statement
- Ably docs/pricing (`ably.com/docs/platform/pricing/limits`, `ably.com/pricing`) — WebSearch-verified 2026 Free plan figures (6M msgs/month, 200 concurrent connections, 200 concurrent channels, 500 msg/s, no credit card required) — MEDIUM confidence (WebSearch-sourced, not directly fetched from primary doc in this session; consistent across multiple aggregator sources)
- Pusher pricing (`pusher.com/channels/pricing/`) — WebSearch-verified 2026 Sandbox free tier (100 concurrent connections, 200,000 messages/day) — MEDIUM confidence, same caveat as above
- Vercel changelog "WebSocket support is now in Public Beta" and Vercel Knowledge Base "Do Vercel Serverless Functions support WebSocket connections?" — confirmed native WebSocket beta (June 2026) and its cross-instance-broadcast limitation — MEDIUM-HIGH confidence, multiple corroborating sources including Vercel's own docs
- WebSearch on Fly.io / Railway / Render 2026 free-tier status — MEDIUM confidence (aggregator/blog sources agree across multiple independent posts; not independently fetched from each vendor's own pricing page in this session, but consistent enough across sources to treat as reliable for a "ruled out" conclusion rather than a load-bearing "chosen" conclusion)
- npm registry (`npm view <pkg> version`) — HIGH confidence, directly queried 2026-09-01 for current published major versions of next, react, zustand, motion/framer-motion, zod, fast-check, vitest, tailwindcss, partysocket, ws
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

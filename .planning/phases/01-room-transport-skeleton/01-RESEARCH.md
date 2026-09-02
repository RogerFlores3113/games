# Phase 1: Room & Transport Skeleton - Research

**Researched:** 2026-09-01
**Domain:** Cloudflare Durable Objects + partyserver realtime rooms, Next.js/Vercel frontend, npm-workspaces monorepo
**Confidence:** MEDIUM-HIGH (core transport verified against live registry/docs this session; several dashboard-only steps and timing constants remain estimates)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Room link & lifecycle**
- **D-01:** Room links are `games.rogerflores.dev/room/ABC123` — a 6-character nanoid over an uppercase-safe alphabet. Rationale: players are on a voice call together, so the code must be readable aloud, not just pasteable.
- **D-02:** Abandoned rooms are garbage collected by a Durable Object alarm on an **idle** timer, not a fixed TTL from creation. Two thresholds: roughly 12 hours idle for a room with a game in progress (survives a meal, a break, a long gap), roughly 1 hour idle for a lobby that never started. Exact values are the planner's call within that intent.
- **D-03:** Room creation is a single screen: display name field + variant picker (base / Rainbow / Black) + "Create room". The host lands directly in the lobby, already seated, with the link ready to copy. No intermediate share screen.
- **D-04:** RT-02 (cold link click after a week of inactivity) is verified by a **documented manual cold-start check** — deploy, wait, click a fresh link, confirm connection within seconds — not by an automated latency test. Real elapsed idle time cannot be faked in CI.

**Seat identity & host role**
- **D-05:** Seat reclaim uses a server-minted seat token stored in `localStorage`, keyed by room ID, replayed by the client on every connect. A different browser or profile is treated as a different person — that is the intended semantics, not a limitation.
- **D-06:** When every seat is claimed, a new arrival is refused with a clear "this room is full" message. No waiting list, no observer state. (Consistent with the no-spectators decision in PROJECT.md.)
- **D-07:** The room creator is the host and holds the start control. If the host's seat stays disconnected past a short grace period **while in the lobby**, host auto-transfers to the next connected seat, so a host with bad wifi cannot strand the table.
- **D-08:** A second tab presenting a valid seat token rebinds the seat to the newest socket; the stale tab is told the room was opened elsewhere. Phase 1 only needs this to not corrupt seat state — RT-08 / multi-tab hardening is Phase 5's scope.

**Lobby behavior**
- **D-09:** Duplicate display names are auto-suffixed on join ("Roger" → "Roger (2)"). Seats are identified internally by seat ID, so this is purely a display concern (satisfies ROOM-03).
- **D-10:** **There is no ready state.** The host starts the game whenever they choose, gated only by 2–5 seated players. Readiness is judged on the voice call, not in the app.
- **D-11:** Following D-10, ROOM-04 and Phase 1 success criteria #2 and #3 were **amended in `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md`** on 2026-09-01. ROOM-04 now reads as seat list + per-seat *connection status*. Do not build a ready toggle.
- **D-12:** Leaving the lobby (or closing the tab) frees the seat for someone else. Seat order is join order and is not rearrangeable — no seat-swapping UI.
- **D-13:** The host can change the variant in the lobby at any time up to game start; it locks at start (ROOM-05).

**In-progress arrival & placeholder game**
- **D-14:** A visitor with no seat token arriving at an in-progress room gets a blocking message that names the room state ("this game is already in progress") — no board, no partial state, no auto-join-on-vacancy (ROOM-07). Mid-game seat reclaim for *new* people is explicitly not in Phase 1.
- **D-15:** The FDN-01 placeholder game is a **shared counter**: turn passes around the table and the active player clicks to increment a shared number. It exercises turn order, action submission, and broadcast with essentially no rules, and it makes Phase 2's swap to a secret-holding toy a small, visible diff.
- **D-16:** Phase 1 **establishes the dark "fireworks night" theme now** — palette and CSS variables (Tailwind v4 `@theme`) set up in this phase so the lobby and every later screen share one visual language. Phase 6 builds the game board on top of it rather than restyling. Phase 1 does not need finished visual design, but it should not ship light-mode defaults.
- **D-17:** Persisted Durable Object room state carries a schema version field. On version mismatch after a deploy, the room **resets to an empty lobby** rather than deserializing state it does not understand. No migration functions in v1 — a friend group can re-click a link; a corrupted mid-game state is worse.

### Claude's Discretion
- Exact idle-timeout values within D-02's stated intent.
- Monorepo layout, workspace tooling, and tsconfig project references (PROJECT.md/CLAUDE.md already fix the package split: `packages/rules`, `packages/schema`, `apps/web`, `apps/worker`).
- Wire message envelope shapes and Zod schema design.
- Length/format of the host-transfer and second-tab grace periods.
- All visual layout of the lobby beyond D-16's "dark theme established".
- How `games.rogerflores.dev` DNS and the Vercel project are wired (FDN-04) — flag any step that requires the user to act in a dashboard.

### Deferred Ideas (OUT OF SCOPE)
- **Mid-game seat reclaim for a new person** (someone drops out permanently and a new arrival takes the seat) — raised while deciding D-14, deliberately excluded from Phase 1. If it is ever wanted, it belongs with Phase 5's reconnect/durability work.
- **Multiple live sockets per seat** (both tabs stay functional) — considered in D-08; Phase 5 owns multi-tab hardening (RT-08).
- **Schema migration functions for persisted room state** — rejected for v1 in D-17 in favor of reset-on-mismatch. Revisit only if games ever need to survive deploys.
- **Seat rearrangement / deliberate turn-order control in the lobby** — considered in D-12 and cut; not currently wanted.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| ROOM-01 | Host can create a Hanabi room and receive a shareable link | `routePartykitRequest`/lazy DO creation pattern; nanoid room-code generation (Standard Stack, Architecture Patterns) |
| ROOM-02 | Player opening the link can join by entering a display name, with no account or email | `onConnect` seat assignment pattern; no auth surface required (Security Domain V2: N/A) |
| ROOM-03 | Two players entering the same display name are disambiguated rather than colliding | Auto-suffix logic is a pure function, unit-testable (Validation Architecture test map) |
| ROOM-04 | All players see the current seat list with per-seat connection status before game start (amended, no ready state) | `onClose`/`onConnect` connection-status broadcast pattern; `broadcast()` helper from `partyserver` |
| ROOM-05 | Host can configure the variant at room creation: base, Rainbow, or Black | Room state persisted via `ctx.storage`, variant field lockable at start |
| ROOM-06 | Host can start the game once 2–5 players are seated (no ready gate) | Room-state validation logic, unit-testable |
| ROOM-07 | A player arriving at a link for a game already in progress is told so clearly | `onConnect` branch for no-seat-token + in-progress state (D-14) |
| ROOM-08 | Abandoned rooms are garbage collected without manual intervention | Unified alarm scheduler pattern (Pitfall 1, Architecture Pattern 2) — directly addresses D-02 |
| RT-02 | Backend serves a cold link click after a week of inactivity, no manual intervention, no perceptible wake delay | Hibernation API + SQLite storage durability (Architecture Patterns, Summary); verification method is manual per D-04 (Validation Architecture, Wave 0 Gaps) |
| RT-07 | An occupied seat cannot be taken over by another person holding the room link | Seat-token reclaim pattern (Architecture Pattern 3); Security Domain V3/V4 |
| FDN-01 | Room/seat/reconnect machinery is separated from Hanabi-specific rules behind a game-adapter interface | Game-adapter interface (`applyAction`/`toPlayerView`/`checkGameEnd`) + D-15 shared-counter placeholder (Architecture, Don't Hand-Roll) |
| FDN-03 | Deployed system runs entirely within free tiers, no paid plan required | Cloudflare Workers Free plan limits confirmed (Sources, Standard Stack); Environment Availability |
| FDN-04 | games.rogerflores.dev resolves to the deployed application | Vercel custom-domain CNAME wiring (Common Pitfalls, Environment Availability) — flagged as manual/dashboard step |
</phase_requirements>

## Summary

The stack fixed by `CLAUDE.md` — Cloudflare Durable Objects (SQLite-backed) fronted by `partyserver`, a Next.js App Router frontend on Vercel, `partysocket` on the client — is current and actively maintained as of this session: `partyserver@0.5.10` (published 2026-08-03) and `partysocket@1.3.0` both resolve cleanly against the npm registry and their GitHub README, with no `nodejs_compat` requirement and no breaking API changes from what `CLAUDE.md` assumed. The one genuinely new piece of information this pass surfaced, not in `CLAUDE.md`, is a **hard constraint that changes how D-02 (idle GC), D-07 (host-transfer grace period), and D-08 (second-tab rebind) must be implemented together**: a Durable Object can have **only one alarm scheduled at a time** (`ctx.storage.setAlarm` overwrites any prior alarm). All three of this phase's timing mechanisms must be unified into a single "next due event" scheduler inside the room DO rather than three independent `setAlarm` calls, or later alarms will silently clobber earlier ones.

A second load-bearing finding: hibernation means the DO's **constructor runs again on every wake from hibernation** (including alarm-triggered wakes), so constructor logic must be idempotent and defensive — in particular, never unconditionally call `setAlarm` in the constructor, since a naive implementation will perpetually push the alarm forward and it will never fire. Persisted room state should live in `ctx.storage` (SQLite-backed `ctx.storage.sql` or plain KV-style `ctx.storage.get/put`, both available on the SQLite storage backend that the Workers Free plan requires), while any object identity/connection bookkeeping that doesn't need to survive eviction can stay in-memory and be reconstructed from `serializeAttachment`/`deserializeAttachment` on the WebSocket connection object.

**Primary recommendation:** Build the room DO as a single `partyserver`-derived `Server` subclass with SQLite storage, one unified alarm scheduler for all idle/grace-period timers, seat state persisted via `ctx.storage`, and the game-adapter interface (`applyAction`/`toPlayerView`/`checkGameEnd`) called from `onMessage` — routed through the trivial shared-counter game per D-15. Use npm workspaces with `packages/rules` and `packages/schema` as dependency-free TypeScript packages; watch the two known monorepo pitfalls (Vercel's "include files outside Root Directory" toggle, and wrangler's historical workspace symlink/hoisting resolution issues — largely fixed in current `wrangler@4.128.0` but worth a smoke-test deploy early).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Room creation, code generation | API/Backend (Worker via Next.js API route) | — | Room code must be minted server-side to avoid collisions; Next.js API route mints the code then redirects/creates the DO |
| Seat assignment & seat-token issuance | Backend (Durable Object) | — | Must be authoritative and atomic — DOs are single-threaded per instance, which is exactly the guarantee needed here |
| Seat-token storage (client) | Browser / Client | — | `localStorage` keyed by room ID, replayed on connect (D-05) |
| Live seat list / connection status broadcast | Backend (Durable Object) | Browser (render) | Server computes and pushes; client only renders |
| Room GC / idle timers / grace periods | Backend (Durable Object, Alarm API) | — | Only the DO can reliably fire logic without an external cron; must be unified into one scheduler (see Summary) |
| Placeholder game state (shared counter) | Backend (Durable Object, via game-adapter) | — | Proves FDN-01: the DO calls `applyAction`/`toPlayerView` without knowing the game is a counter |
| WebSocket transport & reconnect backoff | Browser / Client (`partysocket`) | Backend (`partyserver` hibernation) | Client owns retry/backoff policy; server owns durability across hibernation |
| Room creation UI, variant picker, lobby UI | Frontend Server (Next.js SSR) + Browser (interactivity) | — | `/` and `/room/[id]` benefit from SSR for fast first paint and OG tags (FDN-04-adjacent); live updates are client-side over WebSocket |
| Dark theme tokens (`@theme` CSS vars) | Frontend Server / Static (Tailwind build) | — | Compiled at build time, shipped as static CSS |
| DNS / custom domain wiring | External (Vercel dashboard + DNS registrar) | — | Not code — a manual, one-time dashboard operation (FDN-04) |
| Cold-start verification | External (manual procedure) | — | D-04: cannot be simulated in CI; requires real elapsed idle time |

## Standard Stack

### Core
| Library | Version (verified 2026-09-01) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `partyserver` | 0.5.10 (published 2026-08-03) | `Server` class: room-routing + hibernation-aware WebSocket lifecycle on a Durable Object | `[VERIFIED: npm registry + GitHub README]` Actively maintained under `cloudflare/partykit` monorepo; matches `CLAUDE.md`'s pick |
| `partysocket` | 1.3.0 | Client WebSocket wrapper with reconnect/backoff | `[VERIFIED: npm registry]` Confirmed current; pairs with `partyserver` |
| `wrangler` | 4.128.0 | Worker/DO build+deploy CLI | `[VERIFIED: npm registry]` |
| `next` | 16.3.4 (App Router stable, Turbopack default) | Frontend framework, deployed to Vercel | `[VERIFIED: npm registry]`; `[CITED: nextjs.org/blog/next-16]` App Router is now the recommended default, Pages Router in maintenance mode |
| `react` / `react-dom` | 19.2.8 | UI library, required by current Next.js | `[VERIFIED: npm registry]` |
| `zod` | 4.5.4 | Wire message schema validation, shared via `packages/schema` | `[VERIFIED: npm registry]` |
| `tailwindcss` | 4.3.3 | Styling, `@theme` CSS-first config for the dark theme (D-16) | `[VERIFIED: npm registry]` |
| `typescript` | project should pin to a 5.x line per `CLAUDE.md`'s "TypeScript 5.7+" constraint | Language | `[ASSUMED]` — npm currently resolves `typescript@latest` to 7.0.2, a major ahead of what `CLAUDE.md` specified; this is a meaningful version drift the planner must decide on (see Assumptions Log A1) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `nanoid` | 6.0.1 | 6-char room codes (D-01), seat reconnect tokens | `[VERIFIED: npm registry]`. Use a custom uppercase-safe alphabet (exclude ambiguous chars like `0`/`O`, `1`/`I`) since the code must be spoken aloud |
| `zustand` | 5.0.15 | Client cache of last server-pushed view + local UI state | `[VERIFIED: npm registry]` — not load-bearing for Phase 1 (lobby state is simple) but establishes the pattern later phases build on |
| `clsx` | 2.1.1 | Conditional Tailwind class composition | `[VERIFIED: npm registry]` |
| `@cloudflare/workers-types` | 5.20260902.1 (peer range `^4.20260424.1 \|\| ^5.20260703.1` per `partyserver`) | TS types for Worker/DO runtime | `[VERIFIED: npm registry]` — pin within partyserver's declared peer range |
| `vitest` | 4.1.11 | Unit tests for room state machine, seat reclaim, schema round-trips | `[VERIFIED: npm registry]`. Note: `vitest.workspace.ts` was **removed in Vitest 4** — see Pitfall below |
| `fast-check` | 4.9.0 | Property tests for token-conservation-style invariants (used more heavily from Phase 3 on; Phase 1 can seed the pattern on seat-assignment invariants) | `[VERIFIED: npm registry]` |
| `@playwright/test` | 1.62.1 | E2E: create → join → reconnect room lifecycle | `[VERIFIED: npm registry]` |

### Alternatives Considered
No alternatives researched for the core transport — `CLAUDE.md` locks Cloudflare DO + `partyserver` and this research found no reason to revisit it (see Package Legitimacy Audit; nothing flagged SLOP).

**Installation:**
```bash
# Worker (apps/worker)
npm install partyserver
npm install -D wrangler @cloudflare/workers-types

# Client (apps/web)
npm install partysocket next react react-dom zustand zod clsx

# Shared packages (packages/rules, packages/schema) — zod only, no framework deps
npm install zod --workspace=packages/schema

# Styling
npm install -D tailwindcss @tailwindcss/postcss

# Testing (root, or packages/rules + apps/worker as needed)
npm install -D vitest fast-check @playwright/test
```

**Version verification:** All versions above were checked via `npm view <package> version` against the live registry on 2026-09-01 (see Sources). `partyserver`'s `time.modified` field confirms a release as recent as 2026-08-03, so the library is not stale/abandoned.

## Package Legitimacy Audit

| Package | Registry | Age/Recency | Source Repo | slopcheck | Disposition |
|---------|----------|--------------|--------------|-----------|-------------|
| partyserver | npm | last published 2026-08-03 | github.com/cloudflare/partykit | OK | Approved |
| partysocket | npm | last published 2026-06-23 | github.com/cloudflare/partykit | OK | Approved |
| next | npm | current, 16.3.4 | github.com/vercel/next.js | OK | Approved |
| react / react-dom | npm | current, 19.2.8 | github.com/facebook/react | OK | Approved |
| zustand | npm | current, 5.0.15 | github.com/pmndrs/zustand | OK | Approved |
| zod | npm | current, 4.5.4 | github.com/colinhacks/zod | OK | Approved |
| tailwindcss | npm | current, 4.3.3 | github.com/tailwindlabs/tailwindcss | OK | Approved |
| clsx | npm | current, 2.1.1 | github.com/lukeed/clsx | OK | Approved |
| nanoid | npm | current, 6.0.1 | github.com/ai/nanoid | OK | Approved |
| wrangler | npm | current, 4.128.0 | github.com/cloudflare/workers-sdk | OK | Approved |
| @cloudflare/workers-types | npm | current, 5.20260902.1 | github.com/cloudflare/workerd | OK | Approved |
| @playwright/test | npm | current, 1.62.1 | github.com/microsoft/playwright | OK | Approved |
| typescript | npm | current, 7.0.2 | github.com/microsoft/TypeScript | OK | Approved (flag version drift, see A1) |
| vitest | npm | current, 4.1.11 | github.com/vitest-dev/vitest | **SUS** (`TYPOSQUAT_RISK`: "suspiciously close to 'vite'") | Approved — **false positive**. Vitest is the Vite team's own, extremely well-established test framework (already named explicitly in `CLAUDE.md`'s locked stack); the flag fires purely on name-similarity to `vite`, not on any registry/behavioral signal. No checkpoint needed, but noted per protocol. |
| fast-check | npm | current, 4.9.0 | github.com/dubzzz/fast-check | OK (info-level `HALLUCINATION_PATTERN` flag: "name starts with 'fast-'", explicitly noted as "package is established") | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** `vitest` — flagged on name-similarity to `vite` only; verified false positive against npm registry recency, GitHub org, and its explicit mention in `CLAUDE.md`'s already-locked stack. No `checkpoint:human-verify` needed for this one package; planner may proceed directly.

## Architecture Patterns

### System Architecture Diagram

```
Browser (Next.js client, partysocket)
   |
   |  1. POST /api/room (create)              4. WS connect: /parties/room/:code
   |     -> mints nanoid room code                {type:"join", roomId, seatToken?}
   v                                                    |
Next.js on Vercel (App Router)                          v
   - "/" create-room screen (SSR)             Cloudflare Worker (routePartykitRequest)
   - "/room/[code]" lobby/game shell (SSR)         |
   - API route: POST /api/room                     |  routes by :code -> DO instance name
        (mints code, redirects to /room/[code];         (getServerByName / kebab-case binding)
         DOES NOT create DO state itself --            v
         DO is created lazily on first WS connect) RoomDO extends Server<Env>  (partyserver)
                                                    - onConnect: validate seatToken,
                                                      rebind or assign seat
                                                    - onMessage: validate via Zod schema,
                                                      dispatch to game-adapter.applyAction()
                                                    - onClose: mark seat disconnected,
                                                      schedule/refresh grace-period timer
                                                    - alarm(): unified scheduler --
                                                      idle-GC check, host-transfer grace,
                                                      second-tab grace, reschedules itself
                                                    - storage: ctx.storage (SQLite) holds
                                                      room state, seat list, schema version
                                                          |
                                                          v
                                            broadcast(toPlayerView(state, seatId))
                                            -> one filtered send per connection
                                                          |
                                                          v
                                          Back to each Browser's partysocket
                                          (only its own seat's projected view)
```

Primary use case trace: browser POSTs to mint a code -> redirected to `/room/[code]` -> `partysocket` opens a WS to the Worker -> `routePartykitRequest` resolves `:code` to a DO instance (creating it lazily on first access) -> `onConnect` assigns/rebinds a seat and persists it -> every subsequent action flows through `onMessage` -> game-adapter -> per-seat `broadcast`.

### Recommended Project Structure
```
games/
├── apps/
│   ├── web/                  # Next.js App Router, deployed to Vercel
│   │   ├── app/
│   │   │   ├── page.tsx          # create-room screen (D-03)
│   │   │   ├── room/[code]/page.tsx  # lobby + game shell
│   │   │   └── api/room/route.ts # POST: mint room code
│   │   ├── lib/partysocket.ts    # client WS wrapper, points at worker host
│   │   └── app/globals.css       # Tailwind v4 @theme dark palette (D-16)
│   └── worker/                # Cloudflare Worker + Durable Object, deployed via wrangler
│       ├── src/
│       │   ├── index.ts          # fetch handler: routePartykitRequest
│       │   └── room-do.ts        # RoomDO extends Server<Env>
│       └── wrangler.jsonc
├── packages/
│   ├── rules/                 # framework-free TS: game-adapter interface + counter game
│   │   └── src/
│   │       ├── adapter.ts        # applyAction / toPlayerView / checkGameEnd contract
│   │       └── counter-game.ts   # D-15 placeholder game
│   └── schema/                 # Zod wire message envelope, shared client+server
│       └── src/messages.ts
├── package.json                # npm workspaces root
└── vitest.config.ts            # root config with `projects` (Vitest 4 — no workspace file)
```

### Pattern 1: partyserver Server subclass with hibernation
**What:** Extend `Server` from `partyserver`, set `static options = { hibernate: true }`, implement `onConnect`/`onMessage`/`onClose`/`onError`/`onStart`/`onAlarm`.
**When to use:** This is the only DO class in Phase 1 — one instance per room.
**Example:**
```typescript
// Source: github.com/cloudflare/partykit packages/partyserver README (fetched 2026-09-01)
import { Server, routePartykitRequest } from "partyserver";

export class RoomDO extends Server<Env> {
  static options = { hibernate: true };

  async onStart() {
    // Runs on cold start AND every wake from hibernation.
    // Load persisted room state; do NOT unconditionally setAlarm here.
    this.room = (await this.ctx.storage.get("room")) ?? createEmptyRoom();
  }

  async onConnect(connection, ctx) {
    // parse seatToken from ctx.request URL/query, validate against this.room.seats
  }

  async onMessage(connection, message) {
    // validate with Zod schema from packages/schema, dispatch to game-adapter
  }

  async onClose(connection, code, reason, wasClean) {
    // mark seat disconnected, schedule/refresh the unified alarm
  }

  async onAlarm() {
    // single entry point for idle-GC, host-transfer grace, second-tab grace
    // must read a small "next due events" table from storage and reschedule
    // the alarm for the soonest remaining event -- only one alarm can be
    // scheduled per DO at a time (see Pitfall: Single Alarm Slot)
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routePartykitRequest(request, env)) ??
      new Response("Not Found", { status: 404 })
    );
  },
};
```

### Pattern 2: Unified alarm scheduler (required, not optional)
**What:** Because a DO has exactly one alarm slot, D-02 (idle GC), D-07 (host-transfer grace), and D-08-adjacent grace timers must share one mechanism: store a small list/table of `{eventType, dueAt}` in `ctx.storage`, and on every state-changing event (message, connect, disconnect) recompute the soonest due time and call `ctx.storage.setAlarm(soonest)`. `onAlarm()` processes any events whose `dueAt` has passed, then reschedules for the next soonest remaining event (or clears the alarm if none remain).
**When to use:** Any time this phase needs "wake me up later" behavior — always in Phase 1.
**Example:** See Pitfall below for the failure mode this avoids.

### Pattern 3: Seat-token reclaim over hibernation
**What:** Server mints a `nanoid` seat token on first join, sent to the client in the join-ack message. Client persists it to `localStorage[room:{code}]`. On every WS connect (including reconnect after refresh/sleep), client includes `seatToken` in the connect URL query string or first message. `onConnect` looks up the token in persisted room state (survives hibernation because it's in `ctx.storage`, not memory) and rebinds the seat to the new connection, invalidating any prior connection object for that seat (D-08: "newest socket wins").
**When to use:** Every connect, not just first join — RT-05 in a later phase reuses this same path, so build it generically now.

### Anti-Patterns to Avoid
- **Calling `setAlarm` unconditionally in the constructor/`onStart`:** perpetually pushes the alarm forward on every hibernation wake; the alarm handler never fires. Guard with "only set if no closer alarm is already pending."
- **Keeping seat/room state only in memory:** it is wiped on every hibernation eviction and DO restart (deploys, maintenance). Anything that must survive must go through `ctx.storage`.
- **Broadcasting one shared state object to all seats** (explicitly forbidden by `CLAUDE.md`'s "What NOT to Use" table) — even for the trivial counter game in Phase 1, route every outbound send through a `toPlayerView`-shaped function, so Phase 2's real redaction contract has zero call sites to retrofit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnect/backoff on the client | Custom retry loop | `partysocket`'s built-in reconnection (`minReconnectionDelay`, `maxReconnectionDelay`, `reconnectionDelayGrowFactor`, `maxRetries`) | Already handles jittered backoff and connection-timeout retries; hand-rolling risks thundering-herd reconnects after a real outage |
| Room-code -> DO instance routing | Custom URL parsing + `env.NAMESPACE.idFromName` boilerplate | `routePartykitRequest` (and `getServerByName` for programmatic access, e.g. from the Next.js API route if it ever needs to poke the DO directly) | Handles binding-name kebab-casing, `locationHint`/`jurisdiction`, and the `/parties/:server/:name` URL convention consistently |
| WebSocket hibernation bookkeeping (attach/detach connection metadata across eviction) | Raw Hibernation API (`ctx.acceptWebSocket`, manual `serializeAttachment`) | `partyserver`'s `Server` base class, `getConnections`/`getConnectionTags` | This is precisely the boilerplate `partyserver` exists to remove; hand-rolling reintroduces the exact bugs (lost attachment data, forgotten tag filters) it was built to prevent |
| Wire message shape validation | Manual `JSON.parse` + hand-written type guards | Zod schemas in `packages/schema`, `z.infer<>` for types | Messages cross the Vercel<->Cloudflare Workers runtime boundary; validating at the boundary with a schema shared by both sides is the whole point of `CLAUDE.md`'s shared-types strategy |

**Key insight:** Everything in this table exists because the underlying problem (reconnect backoff, DO routing, hibernation bookkeeping, cross-runtime message validation) is exactly the kind of "looks simple until the edge case" problem this project's own constraints (reconnect-safety, cold-start reliability) make expensive to get subtly wrong.

## Common Pitfalls

### Pitfall 1: Single Alarm Slot Collision
**What goes wrong:** D-02's idle-GC alarm, D-07's host-transfer grace period, and any second-tab grace timer each naively call `ctx.storage.setAlarm(t)`. Cloudflare Durable Objects support only **one pending alarm per object** — the latest `setAlarm` call silently overwrites any earlier one.
**Why it happens:** The Alarm API is documented as "each Durable Object is able to schedule a single alarm at a time" — easy to miss if each timer is implemented independently.
**How to avoid:** Implement one scheduler: persist a small table of pending timer events (`{type, dueAt}`) in storage; every event that would schedule a timer instead upserts into this table and calls `setAlarm(min(dueAt))`; `onAlarm()` processes all events whose time has passed and reschedules for the next soonest remaining one.
**Warning signs:** A host-transfer grace period that never fires after an idle-GC alarm was also scheduled, or vice versa — one silently loses.

### Pitfall 2: Constructor Re-run on Hibernation Wake
**What goes wrong:** The DO constructor (and `onStart`) runs again every time the object wakes from hibernation, including alarm-triggered wakes — not just on true cold start.
**Why it happens:** Hibernation evicts the in-memory object entirely; "waking" is indistinguishable from a fresh instantiation from the DO's own code's perspective.
**How to avoid:** Treat constructor/`onStart` logic as idempotent. Never assume it runs exactly once for the object's lifetime. Load state from `ctx.storage`, don't assume in-memory defaults are safe to re-apply blindly (e.g., don't re-append a "room created" event on every wake).
**Warning signs:** Duplicate log/history entries, or an alarm that perpetually reschedules itself further into the future (see Pitfall 1's constructor variant).

### Pitfall 3: Schema-Version Reset Persistence Semantics (D-17)
**What goes wrong:** A naive implementation stores the schema version *inside* the same serialized blob it's meant to validate — so a version mismatch can't even be detected without first attempting to deserialize the (potentially incompatible) blob, which is exactly what D-17 wants to avoid.
**Why it happens:** It's tempting to put `schemaVersion` as a field on the room state object and load it in one `ctx.storage.get("room")` call.
**How to avoid:** Store `schemaVersion` as its own top-level storage key (`ctx.storage.get("schemaVersion")`), checked *before* attempting to load/parse the main room blob. On mismatch, skip parsing the old blob entirely and reset to an empty lobby, then write the current version.
**Warning signs:** A deploy that changes the room state shape throws inside JSON parsing/Zod validation instead of cleanly resetting.

### Pitfall 4: npm Workspaces + wrangler Symlink/Hoisting
**What goes wrong:** `apps/worker`'s local `node_modules` is nearly empty (deps hoisted to repo root under npm workspaces); wrangler's bundler historically failed to resolve hoisted or symlinked workspace packages (`packages/rules`, `packages/schema`), producing "Could not resolve" errors at deploy time.
**Why it happens:** npm workspaces hoist shared deps to the root `node_modules` and link local packages via symlinks; some bundlers don't follow symlinks correctly outside the local package dir.
**How to avoid:** `[MEDIUM confidence]` Current `wrangler@4.128.0` has had multiple fixes in this area (`workers-sdk` PR history shows workspace-resolution fixes landing), but this was not independently re-verified against a live monorepo deploy in this session — do an early smoke-test deploy of `apps/worker` importing from `packages/rules`/`packages/schema` before building real logic on top, per the plan's Wave 0.
**Warning signs:** `wrangler deploy` fails with "Could not resolve ../../packages/rules" or similar, or deploys successfully locally but fails in CI due to a clean-checkout `node_modules` state.

### Pitfall 5: Vercel Monorepo Root Directory + "Include Files Outside Root Directory"
**What goes wrong:** Vercel's project "Root Directory" setting points at `apps/web`; by default Vercel's build step for that directory cannot see `packages/rules`/`packages/schema` at the repo root, producing a "module not found" error for the shared workspace packages.
**Why it happens:** Vercel's build isolates the configured Root Directory unless explicitly told to include the rest of the monorepo.
**How to avoid:** In Vercel project settings, enable **"Include files outside the Root Directory in the Build Step."** `[CITED: vercel.com/docs/monorepos]`
**Warning signs:** Local `next build` from `apps/web` succeeds, but the Vercel deploy fails on the same import.

### Pitfall 6: Vitest 4 Removed `vitest.workspace.ts`
**What goes wrong:** Following older tutorials/`CLAUDE.md`-era guidance to create a separate `vitest.workspace.ts` file for the monorepo silently does nothing (or errors) on `vitest@4.1.11`.
**Why it happens:** Vitest 3.2 renamed "workspace" to "projects"; Vitest 4 removed the standalone workspace file entirely in favor of a `projects` array inside the root `vitest.config.ts`'s `test` block.
**How to avoid:** Use `defineConfig({ test: { projects: ["packages/*", "apps/worker"] } })` in a single root config. Also: a referenced project config must not itself declare a `projects` field — it's silently ignored if it does.
**Warning signs:** Tests in `packages/rules` or `apps/worker` don't get picked up by `vitest run` from the repo root.

### Pitfall 7: WebSocket Origin Is Not Browser-CORS-Gated
**What goes wrong:** Assuming the browser will block a cross-origin WebSocket connection the way it blocks a cross-origin `fetch` without CORS headers, and skipping origin validation in the Worker.
**Why it happens:** CORS as a concept applies to `fetch`/XHR; browsers do **not** apply CORS preflight/blocking to the WebSocket handshake — any page can attempt to open a WS to any origin.
**How to avoid:** `[ASSUMED — general WebSocket platform behavior, not independently re-confirmed against a Cloudflare-specific doc this session]` If restricting connections to only `games.rogerflores.dev`'s own client matters (defense in depth, not a hard requirement per PROJECT.md's threat model of "a small known friend group"), validate the `Origin` header manually inside `onConnect`/`onRequest` in the Worker rather than relying on the browser to enforce it.
**Warning signs:** N/A for Phase 1 functionality — this is a hardening note, not a blocking pitfall, given the friend-group threat model.

## Code Examples

### Room routing entry point
```typescript
// Source: partyserver README, github.com/cloudflare/partykit (fetched 2026-09-01)
import { routePartykitRequest } from "partyserver";

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routePartykitRequest(request, env)) ??
      new Response("Not Found", { status: 404 })
    );
  },
};
```

### wrangler.jsonc DO binding (SQLite-backed, required on Free plan)
```jsonc
// Source: partyserver README pattern + developers.cloudflare.com/durable-objects/platform/pricing (fetched 2026-09-01)
{
  "name": "games-worker",
  "main": "src/index.ts",
  "durable_objects": {
    "bindings": [{ "name": "ROOM", "class_name": "RoomDO" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["RoomDO"] }]
}
```
Note: the Workers **Free plan only supports SQLite-backed Durable Objects** (`new_sqlite_classes`, not the older KV-backed `new_classes`) — this is not optional, it's the only backend available without a paid plan. `[VERIFIED: developers.cloudflare.com/durable-objects/platform/pricing, fetched 2026-09-01]`

### Loading persisted state defensively (idempotent onStart)
```typescript
// Source: developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage (fetched 2026-09-01), adapted
async onStart() {
  const version = await this.ctx.storage.get<number>("schemaVersion");
  if (version !== CURRENT_SCHEMA_VERSION) {
    this.room = createEmptyLobby(); // D-17: reset, don't attempt to migrate
    await this.ctx.storage.put("schemaVersion", CURRENT_SCHEMA_VERSION);
    await this.ctx.storage.put("room", this.room);
    return;
  }
  this.room = (await this.ctx.storage.get("room")) ?? createEmptyLobby();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `vitest.workspace.ts` for monorepo test discovery | `projects` array inside root `vitest.config.ts`'s `test` block | Renamed in Vitest 3.2, old workspace file support removed in Vitest 4 | Any Phase 1 setup following `CLAUDE.md`-era or older tutorial guidance for a workspace file will not work as written |
| KV-backed Durable Objects on Workers Free plan | SQLite-backed only (`new_sqlite_classes`) on Free plan | Confirmed current as of pricing doc fetch 2026-09-01 | Consistent with `CLAUDE.md`'s existing assumption — no change needed, just re-confirmed |
| Raw Hibernation API hand-rolled connection bookkeeping | `partyserver`'s `Server` class (`getConnections`, `getConnectionTags`, `serializeAttachment` wrapper) | `partyserver` has been the stable recommended layer since its introduction; still current at v0.5.10 | No change from `CLAUDE.md`'s existing recommendation |

**Deprecated/outdated:** None found that materially affect Phase 1 beyond the Vitest workspace-file rename above.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Project should pin TypeScript to the 5.x line per `CLAUDE.md`'s "5.7+" language, even though `npm view typescript version` currently resolves `7.0.2` (a major ahead) | Standard Stack / Core | If TypeScript 7 (a from-scratch Go-based compiler rewrite per public roadmap discussion, not independently verified this session) has breaking changes vs. 5.x tooling (ts-node, some ESLint plugins, Next.js's own TS integration), pinning to `latest` blind could break the build; the planner should explicitly decide 5.x vs 7.x rather than let `npm install typescript` silently grab whatever is newest |
| A2 | Browsers do not apply CORS enforcement to WebSocket handshakes, so cross-origin WS connections are not blocked client-side by default | Common Pitfalls, Pitfall 7 | This is standard, well-documented web-platform behavior, but was not independently re-confirmed against a Cloudflare-specific doc this session. If wrong in some edge case (e.g., a stricter default in a specific browser), Origin-validation guidance could be treated as required rather than optional hardening |
| A3 | `wrangler@4.128.0`'s npm-workspace symlink/hoisting resolution issues (historically documented in `workers-sdk` GitHub issues) are largely fixed in the current version | Common Pitfalls, Pitfall 4 | Not independently verified via a live test deploy in this research session — if unresolved, Wave 0 of the plan needs an early smoke-test task rather than discovering the failure deep into implementation |
| A4 | The exact idle-GC thresholds (D-02: "roughly 12 hours" in-progress, "roughly 1 hour" lobby) and grace-period lengths (D-07 host-transfer, D-08 second-tab) are Claude's Discretion per CONTEXT.md and can be set as literal constants in this phase without further verification | Architecture Patterns | Low risk — CONTEXT.md explicitly delegates exact values to the planner; noted here only so the planner knows no external research constrains the specific numbers |

**If this table is empty:** N/A — see entries above.

## Open Questions (RESOLVED)

> Both questions below were resolved during planning (2026-09-02) by adopting the stated recommendation. Plan 01-08 explicitly implements lazy DO creation; no plan performs a server-to-server Vercel→Worker HTTP call. Retained for the reasoning trail.

1. **Does the Next.js API route (`POST /api/room`) need to create the DO's storage state directly, or is lazy creation on first WebSocket connect sufficient?**
   - What we know: `routePartykitRequest`/`getServerByName` will instantiate a DO on first access regardless of whether it "exists" yet — DOs don't have a separate creation step distinct from first access.
   - What's unclear: Whether the room code should be validated as "real" (e.g., checked against some registry) before the client is allowed to open a WebSocket, to avoid a client minting an arbitrary code and silently creating a DO for a room that was never actually "created" through the UI flow.
   - Recommendation: For Phase 1's scope, allow lazy creation — the `/api/room` route mints the code and the DO is created on first connect from the host's own browser immediately after redirect. This is simplest and matches D-03 ("host lands directly in the lobby"). No separate "room registry" needed at this phase's scale.

2. **Exact `getServerByName` vs. raw `env.ROOM.idFromName` usage for the Next.js API route, if the route ever needs to talk to the DO directly (not just mint a code).**
   - What we know: `partyserver` exposes `getServerByName` as a programmatic helper, but Phase 1's `/api/room` route may not need to touch the DO at all — it only needs to generate a code and redirect.
   - What's unclear: Whether any Phase 1 requirement needs the Vercel side to call into the Worker via HTTP (vs. everything happening over the client's own WebSocket connection).
   - Recommendation: Default to "no HTTP-to-Worker calls needed in Phase 1" — the client's WebSocket connection is the only path that talks to the DO. Revisit only if a specific task needs server-to-server communication.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Local dev, build tooling | ✓ | v24.14.1 | — |
| npm | Workspace tooling | ✓ | 11.13.0 | — |
| `wrangler` (installed as devDependency, not global) | `wrangler dev` / `wrangler deploy` | Not yet installed in this greenfield repo — installs cleanly per registry check | 4.128.0 available | — |
| Cloudflare account + Workers Free plan | Deploying `apps/worker`, DO bindings | Not verified in this session — requires user to have/create a Cloudflare account | — | Blocking: user must create account and run `wrangler login` before first deploy (flag as manual task) |
| Vercel account + project | Deploying `apps/web` | Not verified in this session | — | Blocking: user must connect the repo to a Vercel project (manual task, FDN-04-adjacent) |
| DNS control for `rogerflores.dev` | Wiring `games.rogerflores.dev` subdomain (FDN-04) | Not verified in this session | — | Blocking, manual: requires access to the domain's DNS registrar/Vercel DNS to add a CNAME record per Vercel's custom-domain docs |

**Missing dependencies with no fallback:**
- Cloudflare account/Workers Free plan enrollment — must be done by the user in a dashboard before any Worker deploy task can run.
- Vercel project + `games.rogerflores.dev` DNS wiring — must be done by the user in a dashboard; the planner should mark this a `checkpoint:human-verify`/manual task, not an automated one.

**Missing dependencies with fallback:**
- None — the two items above are hard blockers for FDN-04/RT-02 verification, though they do not block writing and locally testing the code itself (`wrangler dev` runs a local DO simulation without a live Cloudflare deploy).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (root config with `projects`), Playwright 1.62.1 for E2E |
| Config file | `vitest.config.ts` at repo root (does not exist yet — Wave 0) |
| Quick run command | `npx vitest run --project packages/rules --project apps/worker` (or `npx vitest run` for everything, once configured) |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROOM-01 | Room creation mints a code, returns shareable link | unit (API route logic) + E2E | `npx vitest run apps/web/app/api/room` / `npx playwright test create-room.spec.ts` | ❌ Wave 0 |
| ROOM-02 | Join by display name, no account | E2E | `npx playwright test join-room.spec.ts` | ❌ Wave 0 |
| ROOM-03 | Duplicate display names auto-suffixed | unit (room DO logic, pure function extracted for testability) | `npx vitest run apps/worker/src/seat-naming.test.ts` | ❌ Wave 0 |
| ROOM-04 | Seat list + per-seat connection status visible live | E2E (two simulated clients) | `npx playwright test seat-list.spec.ts` | ❌ Wave 0 |
| ROOM-05 | Host configures/locks variant | unit | `npx vitest run apps/worker/src/room-state.test.ts` | ❌ Wave 0 |
| ROOM-06 | Host starts game with 2-5 seated | unit + E2E | `npx vitest run` + `npx playwright test start-game.spec.ts` | ❌ Wave 0 |
| ROOM-07 | Late arrival to in-progress room sees blocking message | E2E | `npx playwright test in-progress-arrival.spec.ts` | ❌ Wave 0 |
| ROOM-08 | Abandoned rooms GC'd automatically | unit (alarm scheduler logic, simulate time via fake timers) | `npx vitest run apps/worker/src/alarm-scheduler.test.ts` | ❌ Wave 0 |
| RT-02 | Cold link click after a week idle, no manual step | **manual-only** (D-04) | N/A — documented manual procedure | N/A |
| RT-07 | Occupied seat cannot be taken over by a second person | unit + E2E (two seat-token holders) | `npx vitest run apps/worker/src/seat-reclaim.test.ts` + `npx playwright test seat-takeover.spec.ts` | ❌ Wave 0 |
| FDN-01 | Room machinery contains no Hanabi-specific logic | unit (adapter interface conformance test against counter-game) | `npx vitest run packages/rules/src/adapter.test.ts` | ❌ Wave 0 |
| FDN-03 | Runs entirely on free tiers | **manual-only** (verify billing dashboards show $0 / free-tier usage) | N/A | N/A |
| FDN-04 | `games.rogerflores.dev` resolves | **manual-only** (DNS propagation + browser check) | N/A | N/A |

### Sampling Rate
- **Per task commit:** run the relevant `vitest` project quickly (`--project packages/rules` etc.) — sub-second to a few seconds.
- **Per wave merge:** full `npx vitest run` (all projects) + relevant Playwright specs for that wave's surface.
- **Phase gate:** full suite (`vitest run && playwright test`) green, plus the three manual-only checks (RT-02, FDN-03, FDN-04) explicitly walked and documented before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `vitest.config.ts` at repo root with `projects: ["packages/*", "apps/worker"]` — no test framework installed yet (greenfield repo)
- [ ] `playwright.config.ts` in `apps/web` (or repo root) targeting a locally-run `wrangler dev` + `next dev` pair for E2E
- [ ] `apps/worker/src/*.test.ts` files for seat-naming, room-state, alarm-scheduler, seat-reclaim — none exist yet
- [ ] `packages/rules/src/adapter.test.ts` — conformance test proving the counter-game satisfies the `applyAction`/`toPlayerView`/`checkGameEnd` interface shape
- [ ] Framework install: `npm install -D vitest fast-check @playwright/test` at repo root
- [ ] A documented manual test procedure for RT-02 (see below) — does not exist yet, must be written as a checklist artifact (e.g., `docs/manual-checks/cold-start.md`) since D-04 explicitly rejects automating it

**Documented manual procedure for RT-02 (cold-start check), what it should contain:**
1. Deploy both `apps/web` (Vercel) and `apps/worker` (`wrangler deploy`) to their production targets.
2. Do not touch either deployment or open any room for **at least 7 days** (real elapsed time — cannot be simulated).
3. From a browser that has never visited the site (private/incognito), navigate to a previously-created (or freshly created) room link.
4. Time from click to a rendered, connected lobby. Confirm: (a) it succeeds without a manual redeploy/restart, (b) perceived wait is "a couple seconds," not tens of seconds.
5. Record the date, elapsed idle time, and observed wait in a short log entry (e.g., appended to `docs/manual-checks/cold-start.md`) so the check has an audit trail across repeated verifications (this phase, and again after Phase 4/5 if timing regresses).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | Explicitly out of scope — no accounts (PROJECT.md) |
| V3 Session Management | Yes | Seat token = a lightweight session credential, not a login session. Server-minted `nanoid`, stored client-side, validated server-side on every connect. Not a JWT/signed token in Phase 1 scope — token possession alone grants seat reclaim (accepted risk per D-05: "a different browser is treated as a different person") |
| V4 Access Control | Yes | DO is the sole authority over seat assignment; a client cannot assert "I am seat 2" without presenting the matching token that only the server issued |
| V5 Input Validation | Yes | Zod schemas (`packages/schema`) validate every inbound WebSocket message on the server side before dispatch — never trust `JSON.parse` output directly, per `CLAUDE.md`'s shared-types strategy |
| V6 Cryptography | No (Phase 1) | Seat tokens are unguessable-by-volume (`nanoid`'s CSPRNG-backed generation) but not cryptographically signed; this is an accepted tradeoff for a friend-group threat model, not a gap to fix with hand-rolled crypto |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|----------------------|
| Seat-token guessing/brute-force to hijack another player's seat | Spoofing | `nanoid`'s default alphabet/length is CSPRNG-backed with a large keyspace; do not shorten the seat-token's `nanoid` length to something guessable (room *codes* are intentionally short/speakable per D-01, but seat *tokens* are a different, longer identifier — a distinction the planner must maintain) |
| Client-supplied action payload asserting a resulting state instead of requesting an action | Tampering | Not fully in Phase 1's scope (HIDE-05 is Phase 3), but the game-adapter's `applyAction` should already be designed in Phase 1 to take an *action request*, never a state patch, so later phases don't have to retrofit this boundary |
| A stale/second tab silently overwriting the active tab's seat state | Tampering (session integrity) | D-08: newest-socket-wins rebinding, with the stale tab explicitly told it was superseded — prevents silent corruption |
| Cross-origin page opening a WebSocket to the Worker to scrape room state | Information Disclosure | Low severity given the friend-group threat model and per-seat projection (once Phase 2 lands); Phase 1 can optionally validate `Origin` in `onConnect` as defense-in-depth (see Pitfall 7) |

## Sources

### Primary (HIGH confidence)
- npm registry, `npm view <pkg> version` — directly queried 2026-09-01 for `partyserver`, `partysocket`, `next`, `react`, `react-dom`, `zustand`, `zod`, `tailwindcss`, `clsx`, `tailwind-merge`, `nanoid`, `wrangler`, `@cloudflare/workers-types`, `@playwright/test`, `vitest`, `fast-check`, `typescript`
- `slopcheck scan --pkg npm <name> --json` — directly run 2026-09-01 against all recommended packages
- `developers.cloudflare.com/durable-objects/platform/pricing` — fetched 2026-09-01, confirmed Free plan limits (100k req/day, 13,000 GB-s/day, 5M row reads/day, 100K row writes/day, 5GB storage, SQLite-only backend)
- `developers.cloudflare.com/durable-objects/best-practices/websockets` — fetched 2026-09-01, hibernation lifecycle, `serializeAttachment`/`deserializeAttachment`, alarm-prevents-hibernation behavior
- `developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage` — fetched 2026-09-01, `ctx.storage.sql`, `blockConcurrencyWhile` init pattern
- GitHub `cloudflare/partykit/packages/partyserver/README.md` — fetched 2026-09-01, `Server` class API surface, lifecycle hooks, `wrangler.jsonc` example, `routePartykitRequest`/`getServerByName`

### Secondary (MEDIUM confidence)
- WebSearch: Cloudflare Durable Objects Alarm API single-alarm-slot constraint and constructor-rerun-on-hibernation-wake caveat, cross-verified across `developers.cloudflare.com/durable-objects/api/alarms/`, `blog.cloudflare.com/durable-objects-alarms/`, and `developers.cloudflare.com/durable-objects/examples/alarms-api/`
- WebSearch: Vitest 4 `projects` field replacing `vitest.workspace.ts`, cross-verified against `vitest.dev/guide/projects` and a 2026 migration-guide aggregator
- WebSearch: Vercel monorepo "Include files outside the Root Directory" toggle — `vercel.com/docs/monorepos`
- WebSearch: wrangler + npm workspaces historical symlink/hoisting resolution issues — GitHub `cloudflare/workers-sdk` issue/PR history; **not independently re-tested against current `wrangler@4.128.0` in a live deploy this session** (see A3)
- WebSearch: Next.js 16 / App Router current stable status, Turbopack default — `nextjs.org/blog/next-16`

### Tertiary (LOW confidence)
- WebSearch: WebSocket handshake not being subject to browser CORS enforcement — general web-platform knowledge, not independently re-confirmed against a Cloudflare-specific or MDN primary source in this session (see A2)
- Vercel custom-domain CNAME wiring steps — WebSearch aggregator sources (TemperStack, ADHDecode), directionally consistent with each other but not independently fetched from `vercel.com/docs/domains/set-up-custom-domain` directly in this session

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every package version independently confirmed via `npm view` against the live registry and cross-checked with slopcheck; `partyserver`/`partysocket` API surface confirmed against the current GitHub README, not just training memory
- Architecture: MEDIUM-HIGH — Durable Object storage/hibernation/alarm mechanics confirmed against official Cloudflare docs fetched this session; the single-alarm-slot and constructor-rerun findings materially change the plan and were not present in prior research (`CLAUDE.md`)
- Pitfalls: MEDIUM — DO/partyserver pitfalls are HIGH confidence (official docs); monorepo/wrangler bundling pitfall (A3) and WebSocket-CORS note (A2) are MEDIUM/LOW and flagged as such

**Research date:** 2026-09-01
**Valid until:** ~14 days for the Cloudflare/partyserver surface specifically (moves quickly, per the roadmap's own research note); ~30 days for the rest of the stack (Next.js, Tailwind, testing tools) which is more stable

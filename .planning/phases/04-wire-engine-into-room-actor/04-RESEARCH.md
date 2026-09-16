# Phase 4: Wire Engine Into Room Actor - Research

**Researched:** 2026-09-16
**Domain:** Wiring a pure rules engine into a Durable Object transport through an existing adapter seam; WebSocket action idempotency; strict Zod view schemas; Playwright multi-context/reconnect testing
**Confidence:** HIGH

## Summary

This phase is almost entirely mechanical if the seam built in Phases 1-3 is respected: swap two imports in `game-registration.ts`, add one strict Zod schema module, bump the schema version, add an `actionId` idempotency field to the wire protocol and to persisted per-seat state, widen the closed error enum, delete the toy and its five coupling points, and build a deliberately plain board. No new runtime dependency is needed anywhere — `nanoid` (6.0.1) is already a dependency of both `apps/web` and `apps/worker`, and `zod` (4.5.4, current registry 4.6.5) is already pinned in `packages/schema`. The single largest risk is scope creep into `room-state.ts`/`room-do.ts`/`seat-projection.ts` — CONTEXT.md's own "small and boring diff" test is the right acceptance bar, and this research confirms every genuinely new piece of state (idempotency key, error detail) has an existing, non-erosive home: the persisted per-seat record (`SeatSchema`) and the wire `ErrorDetailSchema`, respectively.

The idempotency design (RT-09) requires persisting last-applied-actionId per seat (not in memory) because Durable Object hibernation wipes JS memory between messages while the client's retry can legitimately arrive after a wake. The natural, minimal-diff location is a new optional field on the persisted `Seat` record, mirrored by a `SeatView`-adjacent decision (the field must NOT reach the wire — it is server bookkeeping, not player-facing state). Testing RT-09 concretely is best done at the socket level (extending the existing `wrangler dev` + raw-`ws` harness `room-do.test.ts` already established), not in Playwright, because Playwright cannot easily force two frames to race or be byte-identical without reaching into the page's socket — a raw client trivially can.

**Primary recommendation:** Do the swap exactly as `game-registration.ts`'s header already promises (two imports, nothing else in the worker), add `actionId` to `Seat` (persisted) and `GameActionMessageSchema` (wire), add a `hanabi.ts` schema module copying `forehead-card.ts`'s structure field-for-field, and prove RT-09 with a `wrangler dev` + `ws` integration test that double-sends an identical `clue` frame.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rules evaluation (play/discard/clue legality, scoring) | API/Backend (Durable Object, via `packages/rules`) | — | Already isolated in a pure package; DO is the only place with `state.game` |
| Per-seat redaction / view projection | API/Backend (Durable Object) | — | `toSeatView`/`projectSeatView` are the sole exit point; must never move client-side |
| Idempotency dedup (actionId) | API/Backend (Durable Object, persisted storage) | — | Must survive DO hibernation; client only mints the key, never decides dedup |
| Client-side "obviously illegal" disabling (D-12) | Browser/Client | — | Cosmetic only; server remains sole authority — this is explicitly NOT full legality |
| actionId minting | Browser/Client | — | Client mints once per user intent, resends verbatim on retry; server never mints action ids |
| WebSocket transport/reconnect | Browser/Client (`partysocket`) + API/Backend (`partyserver`) | — | Unchanged from Phases 1-2; RT-03 reuses the existing join/reconnect path, no new path |
| Board rendering (interim) | Browser/Client (`RoomClient.tsx` + new component) | — | Pure renderer of server-pushed `HanabiView`; no local game-state derivation |
| Wire schema validation | API/Backend (fail-closed gate) | Browser/Client (structural type, not re-validated) | `seat-projection.ts`'s `validateGameView` is the only place a Hanabi view is checked before send; client trusts the socket payload it receives (already parsed by `ServerMessageSchema` upstream in `room-socket.ts`, unchanged this phase) |

## User Constraints (from CONTEXT.md)

<user_constraints>
### Locked Decisions

**Deleting the toy:**
- D-01: Toy deleted outright — `packages/rules/src/forehead-card.ts`, `forehead-card-leak-check.ts`, `forehead-card.property.test.ts`, `packages/schema/src/games/forehead-card.ts` + test, `apps/web/components/ForeheadCardGame.tsx`, and every toy export from `packages/rules/src/index.ts`.
- D-02: Leak-test coverage (`redaction-wire.test.ts`, the frame-capture test in `room-do.test.ts`) must be **repointed to `checkHanabiViewForLeaks`/`secretsForHanabiSeat`** before or in the same change as deletion — never absent from the suite.
- D-03: `source-structure.test.ts` keeps its exact chokepoint counts (one `.send(`, one `encodeServerMessage(`, one `toSeatView(`, one `projectSeatView(`, zero `broadcast(`), with the A9 game-naming-confinement check repointed from `foreheadCardGame` to `hanabiGame`/`hanabiGame`-equivalent in `game-registration.ts`.

**Wiring the engine in:**
- D-04: Swap happens **only** in `apps/worker/src/game-registration.ts`: imports become `hanabiGame` + the new Hanabi view schema; `ActiveGameState` becomes `HanabiState`. `room-state.ts`, `seat-projection.ts`, `room-do.ts` must not learn the game's name. Keep the compile-time assignability assertions, repointed to `HanabiView`/the new wire type.
- D-05: New `packages/schema/src/games/hanabi.ts` strict view schema: `z.strictObject` at every nesting level, `z.discriminatedUnion("hidden", …)` for cards. Ships with subpath export, `tsconfig.base.json` path entry, and the alias in all four Vitest projects, ordered **before** the bare `@games/schema` alias.
- D-06: `ROOM_SCHEMA_VERSION` bumped again so toy-persisted rooms reset to an empty lobby on deploy.

**Exactly-once actions (RT-09):**
- D-07: Client mints an opaque `actionId` per user intent (nanoid), reused verbatim on retry, sent alongside the action. `GameActionMessageSchema` gains a bounded, validated `actionId` string. Idempotency key only — never reaches the adapter, never influences game logic.
- D-08: DO records the **last applied `actionId` per seat in persisted room state**. A `game_action` whose `actionId` matches the seat's last applied id is **not re-applied** — server re-sends that seat's current view instead of an error. Must be **persisted**, not in-memory (hibernation wipes memory).
- D-09: A repeated play/discard is naturally rejected (card gone); a repeated **clue is legal and would spend a second token** — natural rejection is not sufficient. The RT-09 test must double-send a **clue**, not a play.

**Refusals the player can act on:**
- D-10: `ErrorDetailSchema` widened with a **closed enum** of rule-refusal reasons (out of clue tokens, clue touches no cards, discard at maximum tokens, not your turn, card not in your hand, game over). `mapAdapterError` maps the adapter's typed errors onto it. Error frames still carry no state — closed vocabulary, never free text, never game data.

**The interim table:**
- D-11: Plain, playable board: own hand as face-down slots with accumulated clue facts, other hands face up, played stacks, discard pile, clue/fuse tokens, deck count, whose turn, controls to play/discard a slot and give a colour/rank clue to a chosen seat. No card art/animation/glyphs/luminosity.
- D-12: Client-side disabling limited to what the view makes unambiguous: not your turn, no clue tokens, discard at 8 tokens, clue touching zero visible cards. Everything else submitted and may be server-refused.
- D-13: End of game shows final score + band from the engine, stops accepting actions. Designed end screen is Phase 6.

**Proving it:**
- D-14: RT-01/RT-03 proven by Playwright against the real worker, extending existing e2e specs.
- D-15: RT-09 proven by deliberately double-sending the same `actionId` (at the socket level where the duplicate is unambiguous), asserting state advanced exactly once (token count, history length, turn index all unchanged by the second send).
- D-16: Phase gate: `npm test` and `npx playwright test` green, per-package `tsc --noEmit` clean, matching Phases 2-3.

### Claude's Discretion
- Module/file split for interim board components and where action controls live.
- Exact `actionId` length/alphabet, and whether more than one id per seat is retained.
- Naming of the new refusal-reason enum members.
- Whether the Hanabi view schema is hand-written or derived, provided strict and unknown-key-rejecting.
- How e2e specs seed a deterministic game (seed is server-minted and secret; tests may need to assert relative change rather than absolute identities).

### Deferred Ideas (OUT OF SCOPE)
- Mobile backgrounding, multi-tab hardening, disconnected indicator (RT-04/05/06/08) — Phase 5.
- Designed board: clue memory rendering, colorblind glyphs, luminosity, end-of-game screen, illegal actions visibly disabled (UI-01…UI-11, RULES-11) — Phase 6.
- Rainbow/Black proven end to end (RULES-14, UI-07) — Phase 7.
- Turn history surfaced in the interface — v2 (QOL-01); recorded, never displayed.
- Hardening the leak checker's self-derived baseline (Phase 3 WR-01) — noted, not scheduled.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RT-01 | A player's action appears on every other player's screen without manual refresh | Already structurally satisfied by `#pushState` broadcasting a fresh per-seat view to every open connection after every mutation (room-do.ts). No new plumbing needed — proven by a two-browser-context Playwright test asserting a UI change on the passive side without a `page.reload()`. |
| RT-03 | A player who refreshes rejoins their same seat with full state, no lost turn | Already structurally satisfied by the existing seat-token reclaim path (`joinRoom`'s seatToken branch) — `startGame` already stores `seed` server-side and `HanabiState` is fully persisted in `RoomState.game`, so reload → `join` with saved token → `#handleJoin` → `#viewFor` returns the live game exactly as it stood. Proven by a Playwright reload mid-game asserting the same seat/turn/hand-size survives. |
| RT-09 | Submitting the same action twice applies it exactly once | New: `actionId` field (D-07/D-08) plus persisted last-applied-id per seat. See "Idempotency on a WebSocket Action" below for full design and pitfalls (esp. the clue-vs-play/discard asymmetry, D-09). |
</phase_requirements>

## Standard Stack

### Core
No new libraries are required for this phase. Everything needed is already an exact-pinned dependency in the repo.

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 4.5.4 (`packages/schema`) | Strict wire schema for `HanabiView` + `actionId`/refusal enum widening | Already the project's sole validation library; `z.strictObject`/`z.discriminatedUnion` are the established Phase 2 pattern |
| nanoid | 6.0.1 (`apps/web` and `apps/worker`, both exact) | `actionId` minting (client) and reuse of existing `mintSeatId`/`mintSeatToken`/`mintGameSeed` idioms (server, if any new id is needed) | Already used for every other opaque id in this codebase; no new package needed |
| partyserver / partysocket | 0.5.10 / 1.3.0 | Unchanged — transport layer this phase does not touch | Established in Phase 1 |
| `@games/rules` (hanabi engine) | in-repo, Phase 3 | `hanabiGame` adapter, `HanabiView`, legality predicates | Already built and tested; this phase only wires it in |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ws` (already a transitive/dev dependency via the existing `room-do.test.ts` harness) | pinned wherever `room-do.test.ts` already imports it | RT-09's socket-level double-send test | Reuse the existing `wrangler dev` + raw WebSocket integration pattern; do not add a second test harness |
| `@playwright/test` | 1.62.1 | RT-01/RT-03 browser-level proof | Already the project's e2e tool |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Persisted last-applied-actionId on `Seat` | A separate `idempotencyKeys: Record<seatId, string>` top-level map on `RoomState` | Functionally equivalent; per-seat field on `Seat` is preferred because it travels with seat lifecycle (reclaim, and eventually seat-release in Phase 5) with no separate cleanup path, and keeps `RoomStateSchema`'s top level unchanged |
| Raw `ws` socket double-send test | Playwright double `page.evaluate(() => ws.send(...))` | Playwright can technically reach into `window`-scoped socket objects, but the project has no existing hook exposing the raw socket to page scripts, and doing so would add a test-only surface to production code; the worker-level harness is already built and zero-additional-surface |
| Hand-written `hanabi.ts` Zod schema | Auto-derive Zod from `HanabiView`'s TS type (e.g. `zod-to-ts` reverse, or `ts-to-zod`) | CONTEXT.md leaves this as discretion; hand-written wins because `forehead-card.ts` already establishes the field-by-field, per-nesting-level pattern the plan/reviewer already knows how to audit, and a codegen tool adds a new dependency + build step for a one-time, small schema |

**Installation:** None. All packages above are already present at the pinned versions; no `npm install` step is needed for this phase.

**Version verification:**
```
npm view zod version         → 4.6.5 (registry latest; repo pins 4.5.4, no action needed — not this phase's concern)
npm view nanoid version      → 6.0.1 (matches repo pin exactly)
```
`[VERIFIED: npm registry]` for both — checked directly against the npm registry in this session; both are pre-existing pins, not new installs, so no slopcheck/legitimacy audit is required (see Package Legitimacy Audit below).

## Package Legitimacy Audit

**No new external packages are introduced by this phase.** `nanoid` and `zod` are already installed, pinned, and in production use since Phase 1/2. Per the Package Legitimacy Gate protocol, the audit is only required "whenever this phase installs external packages" — it does not. This section is included for completeness and to make that omission explicit and auditable.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| *(none — no new packages)* | — | — | — | — | — | N/A |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────┐         WebSocket (partysocket)        ┌──────────────────────────────────────┐
│  Browser (apps/web)         │ ───────────────────────────────────►  │  Durable Object (apps/worker)         │
│                              │   { type: "game_action",              │                                        │
│  RoomClient.tsx              │     actionId, request }               │  onMessage                             │
│   └─ HanabiBoard (new)       │                                       │   └─ applyGameAction(room, seat,       │
│       - own hand (hidden)    │                                       │       request, now)                    │
│       - other hands (visible)│                                       │        │                                │
│       - play/discard/clue    │                                       │        ├─ D-08: actionId == seat's     │
│         controls, D-12       │                                       │        │   lastAppliedActionId?         │
│         disabling only       │                                       │        │   YES → skip re-apply,        │
│                              │  ◄─────────────────────────────────   │        │        resend current view    │
│  room-store.ts (Zustand)     │   { type: "state", view }             │        │   NO  → adapter.applyAction    │
│   - thin cache of last       │   (per-seat, broadcast to ALL          │        │        (hanabiGame), record   │
│     server-pushed view       │    open connections after every        │        │        actionId on Seat        │
│                              │    mutation — RT-01)                   │        │                                │
└─────────────────────────────┘                                       │        ▼                                │
                                                                        │  #commit → persist RoomState           │
        Reload / RT-03:                                                │   (game: HanabiState, seats[].         │
        client resends saved                                           │    lastAppliedActionId)                │
        seatToken on `join` ──────────────────────────────────────────►│        │                                │
                                                                        │        ▼                                │
                                                                        │  #pushState → for each open connection: │
                                                                        │   #viewFor(room, seatId)                │
                                                                        │    = projectSeatView                    │
                                                                        │      → toSeatView                       │
                                                                        │        → hanabiGame.toPlayerView        │
                                                                        │      → validateGameView                 │
                                                                        │        (HanabiViewSchema, strict,       │
                                                                        │         fail-closed)                    │
                                                                        │   #send(connection, {type:"state",view})│
                                                                        └──────────────────────────────────────┘
```

A reader can trace RT-01 (an action → every screen updates) by following: browser sends `game_action` → `applyGameAction` mutates `RoomState.game` → `#pushState` iterates every live connection and sends each its own freshly projected view — no `page.reload()` anywhere on that path. RT-03 is traced by the separate reload arrow re-entering through `join`/`seatToken`, landing at the same `#viewFor` call used for live updates (D-10 from Phase 2: no separate resume path). RT-09 is traced by the branch inside `applyGameAction`/DO message handling that compares `actionId` before ever calling `adapter.applyAction`.

### Recommended Project Structure
```
apps/worker/src/
├── game-registration.ts       # MODIFIED (D-04): swap to hanabiGame + HanabiViewSchema
├── room-state.ts               # MODIFIED: mapAdapterError gains a parameter; applyGameAction
│                                #   gains actionId dedup check (still delegates to adapter
│                                #   for everything else — FDN-01 line unmoved)
├── room-do.ts                  # LIKELY UNCHANGED beyond passing actionId through — verify
│                                #   during planning that dedup logic lives in room-state.ts,
│                                #   not room-do.ts, to keep the DO "thin glue"
├── seat-projection.ts          # UNCHANGED (D-04) — still generic over activeGame
└── source-structure.test.ts    # MODIFIED: A9 repointed to hanabiGame

packages/schema/src/
├── games/
│   ├── forehead-card.ts        # DELETED (D-01)
│   └── hanabi.ts                # NEW (D-05): strict view schema, mirrors forehead-card.ts
├── messages.ts                  # MODIFIED: GameActionMessageSchema gains actionId;
│                                 #   ErrorDetailSchema widened (D-10)
├── room.ts                      # MODIFIED: SeatSchema gains lastAppliedActionId (persisted-only,
│                                 #   never in PublicSeatSchema/RoomViewSchema)
└── constants.ts                 # MODIFIED: ROOM_SCHEMA_VERSION bumped (D-06)

packages/rules/src/
├── forehead-card.ts             # DELETED (D-01)
├── forehead-card-leak-check.ts  # DELETED (D-01)
├── forehead-card.property.test.ts # DELETED (D-01)
├── index.ts                     # MODIFIED: toy exports removed
└── hanabi/                      # UNCHANGED — Phase 3 already shipped this; Phase 4 does not
                                  #   reopen it (per CONTEXT.md "No rules changes")

apps/web/
├── components/
│   ├── ForeheadCardGame.tsx     # DELETED (D-01)
│   └── HanabiBoard.tsx (+ subcomponents, discretion)  # NEW (D-11)
├── app/room/[code]/RoomClient.tsx  # MODIFIED: swap ForeheadCardGame → HanabiBoard;
│                                    #   game_action send site gains a minted actionId
└── lib/
    └── room-store.ts             # UNCHANGED structurally — still a thin cache

e2e/
├── start-game.spec.ts            # MODIFIED: drives Hanabi instead of the toy
├── in-progress-arrival.spec.ts   # MODIFIED: same
└── hanabi-realtime.spec.ts (or similar, discretion)  # NEW: RT-01/RT-03 proofs

apps/worker/src/room-do.test.ts   # MODIFIED: RT-09 double-send-a-clue integration test added,
                                    #   reusing the existing wrangler-dev + ws harness
```

### Pattern 1: The Registration-Point Swap (D-04)
**What:** `game-registration.ts` is the only file naming a specific game. Swapping to Hanabi means replacing exactly two imports and the type alias, keeping the compile-time assignability assertions.
**When to use:** This IS the phase's central task — everything else follows from it.
**Example:**
```typescript
// apps/worker/src/game-registration.ts (Phase 4 target shape)
import { hanabiGame } from "@games/rules";
import type { HanabiState, HanabiView } from "@games/rules";
import { HANABI_GAME_ID, HanabiViewSchema } from "@games/schema/games/hanabi";
import type { HanabiViewWire } from "@games/schema/games/hanabi";

export const activeGame = {
  adapter: hanabiGame,
  viewSchema: HanabiViewSchema,
  gameId: HANABI_GAME_ID,
} as const;

export type ActiveGameState = HanabiState;

type _AssertViewAssignable = [HanabiView] extends [HanabiViewWire] ? true : never;
const _assertViewAssignable: _AssertViewAssignable = true;
// ...keys-mutually-assignable assertion, same shape as the toy's
```
Note: `hanabiGame.id` is already `"hanabi"` (see `packages/rules/src/hanabi/adapter.ts:19`) — no new constant needed on the rules side; only the schema side needs a `HANABI_GAME_ID` export mirroring `FOREHEAD_CARD_GAME_ID`, used purely for the `adapterId` persisted field if the plan chooses to expose it (currently `createEmptyRoom` uses `adapter.id` directly from `packages/rules`, so a duplicate schema-side constant may be unnecessary — confirm at plan time whether `game-registration.ts` actually needs a `gameId` field at all, since nothing currently reads `activeGame.gameId`).

### Pattern 2: Strict Nested-Discriminated-Union Schema for a Redacted View (D-05)
**What:** `HanabiCardView` is `{id, hidden:true, facts}` | `{id, hidden:false, suit, rank, facts}`, nested inside arrays (`yourHand`, `otherHands[].cards`, `history[]`), inside a strict top-level object.
**When to use:** Any time a per-seat view has a hidden/visible card distinction — this generalizes Phase 2's D-05 pattern to Hanabi's richer shape.
**Example:**
```typescript
// packages/schema/src/games/hanabi.ts
import { z } from "zod";

const SuitSchema = z.enum(["red", "yellow", "green", "blue", "white", "rainbow", "black"]);
// NOTE: verify against packages/rules/src/hanabi/variant.ts's actual ALL_SUITS/Suit union
// at plan time — the schema's enum values MUST be a structural mirror, not a guess.
const RankSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

const ClueValueSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("color"), value: SuitSchema }),
  z.strictObject({ type: z.literal("rank"), value: RankSchema }),
]);

const ClueFactsViewSchema = z.strictObject({
  possibleSuits: z.array(SuitSchema),
  possibleRanks: z.array(RankSchema),
  positiveClues: z.array(ClueValueSchema),
  negativeClues: z.array(ClueValueSchema),
});

const HiddenCardViewSchema = z.strictObject({
  id: z.string().min(1),
  hidden: z.literal(true),
  facts: ClueFactsViewSchema,
});

const VisibleCardViewSchema = z.strictObject({
  id: z.string().min(1),
  hidden: z.literal(false),
  suit: SuitSchema,
  rank: RankSchema,
  facts: ClueFactsViewSchema,
});

const HanabiCardViewSchema = z.discriminatedUnion("hidden", [
  HiddenCardViewSchema,
  VisibleCardViewSchema,
]);

// ... OtherHandSchema, StackViewSchema, DiscardCardSchema, HistoryEntryViewSchema
// (discriminated union on "type": play|discard|clue|draw) — same strict-at-every-level
// discipline, each declared independently, never via .partial()/.omit()/.extend() tricks
// that could accidentally widen a nested shape.

export const HanabiViewSchema = z.strictObject({
  variant: z.enum(["base", "rainbow", "black"]),
  yourSeatId: z.string().nullable(),
  yourHand: z.array(HanabiCardViewSchema),
  otherHands: z.array(z.strictObject({
    seatId: z.string(),
    cards: z.array(HanabiCardViewSchema),
  })),
  stacks: z.array(z.strictObject({ suit: SuitSchema, topRank: z.number().int().min(0).max(5) })),
  discard: z.array(z.strictObject({ id: z.string(), suit: SuitSchema, rank: RankSchema })),
  clueTokens: z.number().int().min(0).max(8),
  fuses: z.number().int().min(0).max(3),
  deckCount: z.number().int().nonnegative(),
  finalTurnsRemaining: z.number().int().nonnegative().nullable(),
  activeSeatId: z.string(),
  isYourTurn: z.boolean(),
  score: z.number().int().nonnegative(),
  history: z.array(/* discriminated union by "type" */ z.unknown()), // expand fully at plan time
});

export type HanabiViewWire = z.infer<typeof HanabiViewSchema>;
export const HANABI_GAME_ID = "hanabi" as const;
```
**[CITED: Zod 4 docs — `z.discriminatedUnion` and `z.strictObject`]** — both APIs are unchanged from the versions Phase 2 already used successfully in this exact codebase (`forehead-card.ts`); no new Zod capability is required, only a larger instance of the same pattern.

### Pattern 3: Persisted Per-Seat Idempotency Key (D-07/D-08)
**What:** `SeatSchema` gains an optional field recording the last `game_action` `actionId` applied for that seat.
**When to use:** RT-09's dedup check.
**Example:**
```typescript
// packages/schema/src/room.ts
export const SeatSchema = z.object({
  seatId: z.string(),
  seatToken: SeatTokenSchema,
  displayName: DisplayNameSchema,
  displayLabel: z.string(),
  connected: z.boolean(),
  joinedAt: z.number(),
  disconnectedAt: z.number().nullable(),
  /** RT-09/D-08: the actionId of the most recently APPLIED game_action for
   * this seat, or null if none yet. Idempotency bookkeeping ONLY — never
   * reaches PublicSeatSchema/RoomViewSchema, never read by the adapter.
   * Optional/nullable so rooms persisted before this field existed still
   * parse (mirrors `seed`'s optional-field migration precedent). */
  lastAppliedActionId: z.string().nullable().optional(),
});
```
```typescript
// packages/schema/src/messages.ts
const ACTION_ID_MIN = 1;
const ACTION_ID_MAX = 64; // generous bound for a nanoid; exact length is discretion (D-07)

const GameActionMessageSchema = z.strictObject({
  type: z.literal("game_action"),
  actionId: z.string().min(ACTION_ID_MIN).max(ACTION_ID_MAX),
  request: z.unknown(),
});
```
```typescript
// apps/worker/src/room-state.ts — dedup lives here, NOT in room-do.ts, keeping the DO thin
export function applyGameAction(
  state: RoomState,
  actorSeatId: string,
  actionId: string,
  request: unknown,
  now: number,
): RoomResult {
  if (state.status !== "in_progress") return { ok: false, reason: "bad_request" };

  const actorSeat = state.seats.find((s) => s.seatId === actorSeatId);
  if (actorSeat?.lastAppliedActionId === actionId) {
    // D-08: already applied — re-send current state, do not re-apply and
    // do not treat as an error. Caller (room-do.ts) sends a "state" frame,
    // not a "refused"/"error" frame, on this branch.
    return { ok: true, state }; // unchanged state; #pushState resends current view
  }

  const gameState = state.game as ActiveGameState;
  const result = adapter.applyAction(gameState, actorSeatId, request);
  if (!result.ok) return { ok: false, reason: mapAdapterError(result.error) };

  const ended = adapter.checkGameEnd(result.state);
  const seats = state.seats.map((s) =>
    s.seatId === actorSeatId ? { ...s, lastAppliedActionId: actionId } : s,
  );

  return {
    ok: true,
    state: { ...state, status: ended !== null ? "ended" : state.status, game: result.state, seats, lastActivityAt: now },
  };
}
```
**Sharp edge (D-09):** because a repeated `play`/`discard` naming a card already removed from the hand would ALSO be naturally rejected by `findOwnSlot` returning null (→ `card_not_in_hand`), the dedup check must run **before** `adapter.applyAction`, not merely as a fallback for the cases the engine's own idempotence happens to miss — otherwise a double-sent play could look "handled" by luck while a double-sent clue silently spends a second token. This design (check `actionId` first, unconditionally, for every action type) closes that gap uniformly rather than relying on engine-level accidental idempotence for two of the three action types.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebSocket reconnect/backoff | A custom retry loop for `partysocket` | `partysocket`'s built-in reconnection (already wired in `room-socket.ts`) | Already established in Phase 1; this phase does not touch it |
| Detecting "is this actually a duplicate" | Content-hashing the request payload to detect duplicates | The client-minted `actionId` (D-07) | A content hash cannot distinguish "the same clue sent twice on purpose" (illegal to prevent) from "the same clue retried after a dropped ack" (must dedup) — an explicit, opaque, per-intent key is the correct primitive, which is why D-07/D-09 exist |
| Determining whose action is legal before submission | A client-side reimplementation of `canPlay`/`canDiscard`/`canClue` | The existing exported predicates from `packages/rules`, called with the FULL `HanabiState` — which the client does not have (D-12) | The client only has the redacted `HanabiView`; CONTEXT.md D-12 explicitly limits client disabling to what the view alone makes unambiguous, and Phase 6 owns the complete legality-driven UI |
| Per-seat wire validation | A generic/loose validator or manual key-checking | `z.strictObject`/`z.discriminatedUnion`, exactly as `forehead-card.ts` already does | Established, working pattern; reinventing it for Hanabi risks missing the `undefined`-key JSON.stringify gap Phase 2's RESEARCH.md already documented as Pitfall 2 |

**Key insight:** every "new" mechanism this phase needs (idempotency key, wider error enum, bigger schema) is a straightforward extension of a pattern Phases 1-3 already built and proved. The risk in this phase is not technical novelty — it's discipline in NOT teaching `room-do.ts`/`seat-projection.ts` about Hanabi, and not letting the interim board become a mini-Phase-6.

## Common Pitfalls

### Pitfall 1: Idempotency key held only in memory
**What goes wrong:** A client's retry arrives after the Durable Object hibernated and woke again; if the last-applied-actionId lived only in a JS field, it's gone, and the retry re-applies (spending a second clue token).
**Why it happens:** DOs hibernate between messages while sockets stay open; only `ctx.storage`-persisted data and connection `setState` attachments survive a wake (this codebase already learned this lesson twice — see `bindings` getter's comment and `disconnectedAt`'s persistence rationale in `room-state.ts`).
**How to avoid:** Store `lastAppliedActionId` on the persisted `Seat` record (goes through `#commit` → `saveRoom` on every mutation, same as every other seat field).
**Warning signs:** A test that manually evicts/restarts the DO process (the existing `room-do.test.ts` pattern that kills `wrangler dev` via `process.kill(-pid)`) and then double-sends should be part of the RT-09 test matrix, not just a same-connection double-send.

### Pitfall 2: Dedup check placed after adapter.applyAction, or only for some action types
**What goes wrong:** A play/discard's natural rejection ("card not in hand") masks the missing check, so the dedup logic looks correct in ad hoc testing but a duplicate clue slips through and spends a second token.
**Why it happens:** It's tempting to add the actionId check as a narrow patch for the one action type ad-hoc testing surfaced.
**How to avoid:** Check `actionId` unconditionally, for every `game_action`, before any adapter call — see Pattern 3 above. Test explicitly with a duplicate CLUE per D-09/D-15, not a play.

### Pitfall 3: actionId leaking into the adapter or into game state
**What goes wrong:** If `actionId` is threaded into `adapter.applyAction`'s `request` parameter (e.g. `{...request, actionId}`), it could accidentally get logged into `HistoryEntry` or otherwise become part of `HanabiState`, violating D-07's "never reaches the adapter" boundary and potentially becoming an identity-correlatable value in a leak-checker's blind spot.
**How to avoid:** Strip `actionId` at the `room-state.ts`/message-handling boundary; pass only `request` (unchanged shape) into `adapter.applyAction`, exactly as `applyHanabiAction`'s exact-own-key guards already expect (`isPlayRequest` etc. would reject an object with an extra `actionId` key anyway — this is actually a second line of defense already built into Phase 3's guards, worth calling out explicitly in the plan).

### Pitfall 4: Widening `ErrorDetailSchema` without updating `mapAdapterError`'s call sites
**What goes wrong:** `mapAdapterError` currently takes **zero parameters** and always returns `"bad_request"` (`room-state.ts:291-293`). D-10 requires it to inspect the adapter's actual `AdapterError` member. Every call site (`applyGameAction`'s one call, confirmed above) must be updated to pass `result.error` through — a signature change that is easy to make everywhere except a spot found later by `tsc -b` (which the D-16 gate catches, but better to plan for it explicitly as its own task).
**How to avoid:** Grep for `mapAdapterError(` before considering this task done; there is exactly one call site today (inside `applyGameAction`), so the signature change is contained, but the plan should explicitly verify no test file mocks the old zero-arg signature.
**Warning signs:** A `tsc -b` failure in `room-state.test.ts` if any test currently calls `mapAdapterError()` directly.

### Pitfall 5: `foreheadCardGame`/`@games/schema/games/` confinement test (A9) silently passing on zero matches after deletion
**What goes wrong:** `source-structure.test.ts`'s A9 assertion pattern (`expect(foreheadHits).toEqual([{file: "game-registration.ts", count: ...}])`) will trivially become an empty-array assertion once `foreheadCardGame` is deleted everywhere — but the test's INTENT (confine the active game's name to one file) must be repointed to assert `hanabiGame` appears ONLY in `game-registration.ts`, not simply relaxed to "zero matches for the old name."
**How to avoid:** Rewrite A9 to check `hanabiGame` (not `foreheadCardGame`) is confined to `game-registration.ts`, and that `@games/schema/games/` is still confined there too (now pointing at `@games/schema/games/hanabi`). Add an explicit regression assertion that the old toy identifier has zero occurrences anywhere (proves deletion completeness, per D-01/D-02), separate from the confinement check.

### Pitfall 6: Discriminated-union-in-array-in-strict-object Zod 4 parse cost at this payload size
**What goes wrong:** Hanabi state includes ~50-60 history entries by game end, plus up to 5 hands x 5 slots x nested `ClueFactsView` (each with up to 2 arrays of clue objects) — a meaningfully larger payload than the toy's flat structure. `HanabiViewSchema.safeParse` runs on **every** `#pushState` call, for **every** connected seat.
**Why it matters:** Zod 4's discriminated unions are generally fast (they dispatch on the discriminant key without trying every branch), but a strict object's exhaustive key-check still walks every key at every nesting level, and this runs once per seat per broadcast (up to 5x per action in a 5-player game).
**How to avoid:** This is very unlikely to be a real performance problem at this scale (a few hundred small objects, well under DO CPU limits per request), but the plan should NOT casually add per-request re-validation beyond the existing one-call-per-seat pattern, and should avoid re-parsing the same view twice (e.g. once for validation, once for logging) — `validateGameView` already returns the original object, not a reconstruction, which keeps this cheap.
**Confidence:** MEDIUM — no direct Cloudflare Workers CPU-time benchmark was run in this session; this is a reasoned extrapolation from the existing untimed test suite and Zod 4's documented discriminated-union dispatch behavior, not a verified number. Flagged for validation if `wrangler dev` integration tests become noticeably slower after this phase (compare against Phase 2/3 baseline timings if available).

### Pitfall 7: Toy deletion sweep missing a coupling point
**What goes wrong:** A dangling import, string fixture (`adapterId: "counter"`/`"forehead-card"`), or e2e selector (`data-testid="own-card"`, `guess-button-*`) survives the deletion and either fails to compile or silently passes a stale assertion.
**How to avoid:** Confirmed coupling points found in this research session (treat as the sweep's checklist, not necessarily exhaustive — re-grep at plan/execution time):
- `packages/rules/src/index.ts` — exports `foreheadCardGame`, `FOREHEAD_CARD_VALUES`, `ForeheadCardAction/State/Value/View`, `HiddenCardView`, `RevealedCard`, `VisibleCardView`, `checkSeatViewForLeaks`, `secretsForSeat`, `SeatSecrets`.
- `apps/worker/src/game-registration.ts` — the two active imports.
- `apps/worker/src/redaction-wire.test.ts` — imports layer-1 toy property-test generators (confirmed via grep: references `packages/rules/src/forehead-card.property.test.ts`'s helpers).
- `apps/worker/src/room-do.test.ts` — frame-capture leak-check assertions currently built against the toy's shape (D-02 requires repointing, not deleting, this coverage).
- `apps/worker/src/room-state.test.ts:485` — `expect(createEmptyRoom(...).adapterId).toBe("forehead-card")` must become `"hanabi"`.
- `apps/worker/src/persistence.test.ts` (lines ~17, ~129-137) and `apps/worker/src/scheduler.test.ts:38` — fixtures with `adapterId: "counter"` are Phase-1-era fixtures already testing the D-17 RESET behavior across an adapter swap; confirm at plan time whether these need a THIRD fixture generation (`"forehead-card"` → `"hanabi"`) added, since they exist specifically to prove old-adapterId rooms reset — they may be correct as-is (testing the reset mechanism generically) or may need an additional case proving a **forehead-card**-tagged persisted room also resets under the Phase 4 version bump.
- `apps/worker/src/source-structure.test.ts` A9 — see Pitfall 5.
- `apps/web/components/ForeheadCardGame.tsx` and its import in `RoomClient.tsx`.
- `e2e/start-game.spec.ts`, `e2e/in-progress-arrival.spec.ts` — `data-testid="own-card"`, `"other-cards"`, `"other-card"`, `"guess-button-*"`, `"revealed-list"`, `"revealed-entry"`, `"score"`, `"deck-count"`, `"turn-indicator"`, `"final-score"` selectors, and the `{type:"guess", value}` action shape.
- `packages/schema/package.json` `exports` map and `tsconfig.base.json` `paths` — remove the `forehead-card` subpath entries (or leave them dead until a cleanup pass; CONTEXT.md D-01 says delete outright, so remove them).
- All four `vitest.config.ts` project aliases currently referencing `@games/schema/games/forehead-card` — replace with `@games/schema/games/hanabi`, preserving the "subpath before bare alias" ordering (D-05).

## Code Examples

### RT-09 Socket-Level Double-Send Test (extends existing `room-do.test.ts` harness)
```typescript
// apps/worker/src/room-do.test.ts (new test, reusing the existing wrangler-dev + ws pattern)
// Source: pattern generalized from this file's existing D-17 eviction test structure
// (kills/respawns `wrangler dev` via process.kill(-pid)) — same harness, new scenario.

it("RT-09: a double-sent clue actionId is applied exactly once", async () => {
  // ...existing setup: spin up wrangler dev, open two raw `ws` clients, join both seats,
  // start the game (host `start_game`)...

  const clueFrame = JSON.stringify({
    type: "game_action",
    actionId: "test-fixed-action-id-1",
    request: { type: "clue", targetSeatId: seatB, clue: { type: "rank", value: 1 } },
  });

  actorSocket.send(clueFrame);
  await waitForStateFrame(actorSocket); // first application

  const clueTokensAfterFirst = /* read from the last captured "state" frame's view.clueTokens */;
  const historyLengthAfterFirst = /* not directly visible on the wire (history isn't in HanabiView
    per D-19 "no interface exposes history in v1") — assert on clueTokens and turnIndex/activeSeatId
    instead, which ARE in HanabiView */;

  actorSocket.send(clueFrame); // IDENTICAL frame, same actionId
  await waitForStateFrame(actorSocket); // dedup branch: resent current view, not re-applied

  const viewAfterSecond = /* last captured "state" frame */;
  expect(viewAfterSecond.game.clueTokens).toBe(clueTokensAfterFirst); // NOT decremented again
  expect(viewAfterSecond.game.activeSeatId).toBe(/* seatB, unchanged from after first send */);
});
```
**RETRACTED 2026-09-16 — this block was wrong; see the correction immediately below.**

> **Correction (orchestrator, verified by reading the code):** `HanabiView` **does** declare
> `history: HistoryEntryView[]` (`packages/rules/src/hanabi/state.ts`), and
> `toHanabiPlayerView` **does** populate it (`projection.ts` maps `state.history` and returns
> it in both the seated and unseated branches). History **is** wire-visible, so
> `history.length` **is** a valid RT-09 assertion target and no debug backdoor is needed.
> Phase 3's D-19 makes history *public-facts-only* — a draw entry carries just a card id —
> which is precisely what makes it safe to send; it does not keep history off the wire.
> CONTEXT.md D-15 is authoritative on this point. The original (incorrect) analysis is kept
> below strikethrough-style for the audit trail — do not act on it.

~~**Superseded analysis:** D-15 says to assert on "token count, history length and turn index." `history` is **not present in `HanabiView`**~~ (confirmed in `state.ts:103-118` — `HanabiView` has no `history` field at all; only `HanabiState`, the server-only internal type, carries history, per D-19 "no interface exposes history in v1"). The test must assert on `clueTokens`/`fuses`/`activeSeatId`/`isYourTurn`/`deckCount` — the fields actually present on the wire — not on history length, which is unobservable from the client's own received frames. **This is a discrepancy the planner must resolve**: either the test reaches into the DO's internal state directly (e.g. via a debug-only accessor, which the codebase does not currently have and D-11/D-13 CONTEXT.md gives no indication should be added), or the assertion is narrowed to the wire-visible fields. Recommend the latter — it is sufficient to prove RT-09 (a repeated clue must not decrement `clueTokens` twice) without requiring a new test-only backdoor into DO internals.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Forehead-card toy (`{type:"guess", value}`) drives the interim game screen | Real Hanabi engine (`{type:"play"/"discard"/"clue", ...}`) drives the interim `HanabiBoard` | This phase | Every game-shaped fixture, selector, and adapterId string in the existing suite needs updating (see Pitfall 7) |
| `mapAdapterError()` — parameterless, always `bad_request` | `mapAdapterError(error: AdapterError)` — maps to a widened closed enum | This phase (D-10) | One call site change, but a real signature change requiring `tsc -b` verification across the worker package |
| No idempotency concept on the wire | `actionId` required on every `game_action` | This phase (D-07) | `GameActionMessageSchema` is a breaking wire-protocol change; `apps/web`'s `game_action` send site (`RoomClient.tsx`'s `send()` call inside the interim board) must mint and attach an id on every submit |

**Deprecated/outdated:** The entire `forehead-card` toy stack (rules, schema, leak-check, UI, e2e assertions) is deprecated by this phase per D-01 — it was always scoped as Phase 2/3 scaffolding, not a lasting feature.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `lastAppliedActionId` should live on the persisted `Seat` record rather than a separate top-level map | Pattern 3 | Low — functionally equivalent either way; if the planner disagrees, the alternative in "Alternatives Considered" is a straightforward substitution with no cascading redesign |
| A2 | `game-registration.ts`'s `activeGame.gameId` field is currently unused elsewhere and may not need a Hanabi-side equivalent constant | Pattern 1 | Low — worst case, an unused export; verify with a grep for `activeGame.gameId` at plan time before assuming it can be dropped |
| A3 | Zod 4 discriminated-union-in-array-in-strict-object parse cost is not a real bottleneck at Hanabi's state size on Cloudflare Workers' free-tier CPU limits | Pitfall 6 | Medium if wrong — could require a schema restructuring or a "validate once, cache" optimization; no direct benchmark was run this session, this is reasoned from documented Zod 4 dispatch behavior and DO free-tier CPU-ms limits (`CLAUDE.md`'s cited 13,000 GB-s/day figure), not measured |
| A4 | The exact `Suit` enum values used in the example schema (`red, yellow, green, blue, white, rainbow, black`) match `packages/rules/src/hanabi/variant.ts`'s real `ALL_SUITS`/`Suit` union | Pattern 2 | Medium if wrong — the example code block is illustrative; the plan/executor MUST read `variant.ts`'s actual `Suit` type and `ALL_SUITS` array before writing the real schema, not copy the illustrative enum verbatim |
| A5 | Existing `persistence.test.ts`/`scheduler.test.ts` `adapterId: "counter"` fixtures do not need a parallel `"forehead-card"` fixture added for Phase 4's version bump to be adequately tested | Pitfall 7 | Low-Medium — if wrong, a gap exists in proving the D-06 reset path specifically for toy-tagged (not just counter-tagged) persisted rooms; recommend the planner add this case explicitly rather than assume the existing "any mismatched adapterId resets" coverage generalizes without a corresponding test |

## Open Questions

**ALL RESOLVED (2026-09-16, planner). This section is closed — no question below blocks planning or execution.**

1. **RESOLVED — full 1:1 mapping. All 8 `AdapterError` members each get their own `ErrorDetail` member; nothing collapses.**
   Settled by CONTEXT.md D-10, which states the mapping is 1:1 and names all 8 members verbatim after a direct read of `packages/rules/src/adapter.ts`. `invalid_action` and `clue_target_invalid` therefore DO get their own members. Implemented in plan `04-02` (enum widening) and plan `04-04` (`mapAdapterError(error: AdapterError): ErrorDetail`).
   Planner-settled consequence: `mapAdapterError`'s return type changes from `RefusalReason` to `ErrorDetail`. The wire `code` stays `"bad_request"` and the specific reason rides in the error frame's `detail`, because D-10 widens `ErrorDetailSchema` — NOT the shared `RefusalReasonSchema`, which `refused` frames also use. `RoomResult`'s failure branch gains an optional `detail?: ErrorDetail`.
   *Original question text retained below for the audit trail.*
   ~~Does `mapAdapterError` need a full 1:1 mapping, or can several `AdapterError` members collapse onto one `ErrorDetail` member?~~
   - What we know: `AdapterError` has 8 members (`not_your_turn`, `invalid_action`, `game_over`, `card_not_in_hand`, `no_clue_tokens`, `clue_touches_nothing`, `clue_target_invalid`, `discard_at_max_clues`). D-10 names 6 player-facing reasons explicitly (clue tokens, clue touches nothing, discard at max, not your turn, card not in hand, game over) — `invalid_action` and `clue_target_invalid` are not named.
   - What's unclear: whether `invalid_action` (malformed/hostile payload) and `clue_target_invalid` (targeting self or a nonexistent seat — should be prevented by D-12 client disabling anyway) get their own enum members or collapse to a generic fallback.
   - Recommendation: give every `AdapterError` member a corresponding `ErrorDetail` member for a clean 1:1 map (simpler, no lossy collapsing, and `invalid_action`/`clue_target_invalid` are cheap to add) — matches D-10's spirit ("widened with a closed enum of rule-refusal reasons") without inventing an asymmetric partial mapping. Flag as a planning decision, not fully closed by research.

2. **RESOLVED (2026-09-16, orchestrator, verified in code) — no change needed: `history` is already on `HanabiView` and already populated by `toHanabiPlayerView`.** The premise of this question was false. Assert `history.length` alongside `clueTokens`, `activeSeatId`/`isYourTurn` and `deckCount`; add no debug path and reach into no DO internals. Original question text retained below for the audit trail.
   ~~Should `history` be added to `HanabiView` for the RT-09 test's benefit, or does the test work fine without it?~~
   - What we know: D-19/D-13(Phase3) deliberately exclude history from any interface in v1; D-15(Phase4) asks the RT-09 test to assert on "history length," which isn't wire-visible.
   - What's unclear: whether CONTEXT.md intended a DO-internal test assertion (bypassing the wire) or simply wrote D-15 loosely.
   - Recommendation: assert on wire-visible fields only (`clueTokens`, `activeSeatId`, `isYourTurn`, `deckCount`) — do not add a history-exposing debug path or reach into DO internals just to satisfy a literal reading of D-15's assertion list. Confirm this interpretation with the user/planner before execution if it matters to them.

3. **RESOLVED — the board renders hand slots by `.map()`ing the actual array; a hardcoded slot count is forbidden.**
   Settled by `04-UI-SPEC.md` "Component Notes — Trap 1", an APPROVED contract: `HanabiView.yourHand` and each `otherHands[].cards` are already exactly as long as the real hand (4 cards for 4-5 players, 5 for 2-3), so the board must iterate the array and never render a fixed 5-slot grid. Enforced by an explicit acceptance criterion in plan `04-06`.
   *Original question text retained below for the audit trail.*
   ~~Does the interim board need per-seat "your hand slot count" derived correctly when a player has fewer than 5 cards?~~
   - What we know: `handSizeFor` in `packages/rules/src/hanabi/variant.ts` already parametrizes this; `HanabiView.yourHand`/`otherHands[].cards` arrays are simply as long as the actual hand.
   - What's unclear: nothing structurally — this is a non-issue as long as the board renders `.map()` over the actual array length rather than hardcoding "5 slots."
   - Recommendation: explicit reminder for the plan/executor, since a hardcoded 5-slot grid would silently misrender in a 4-5 player game (RULES-01 already correctly implemented server-side; don't let the UI reintroduce the bug visually).

### Planner-resolved discrepancy (not an original open question — recorded here because it corrects Pattern 2 above)

**`ClueValueSchema` must NOT be a `z.discriminatedUnion("type", ...)` in `packages/schema/src/games/hanabi.ts`.**

Pattern 2 sketches it as a discriminated union of `{type:"color", value: Suit}` and `{type:"rank", value: Rank}`. That sketch would break `game-registration.ts`'s compile-time assertion. `ClueFactsView.positiveClues`/`negativeClues` are declared in `packages/rules/src/hanabi/state.ts:61-62` as `Array<{ type: "color" | "rank"; value: Suit | Rank }>` — a single loose object type, not a discriminated union — and the same loose shape appears on `HistoryEntryView`'s clue branch (`state.ts:93`). A value of that loose type is **not** assignable to the narrower discriminated union, so `[HanabiView] extends [HanabiViewWire]` would evaluate to `never` and fail to compile.

The schema must therefore mirror the loose type exactly: one `z.strictObject` with `type: z.enum(["color","rank"])` and `value: z.union([SuitSchema, RankSchema])`. This is a deliberate, documented concession to the Phase 3 view type (which this phase does not reopen, per CONTEXT.md "No rules changes"). It is a view-shape nuance only and costs nothing in redaction terms: the own-hand boundary — the actual HIDE-01 line — is still carried by a strict `z.discriminatedUnion("hidden", ...)`. Plan `04-01` requires this rationale as an inline comment in the schema file.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| wrangler | RT-09 socket-level test, local dev | ✓ (pinned dependency) | 4.128.0 | — |
| @cloudflare/workers-types | typecheck | ✓ | 5.20260902.1 | — |
| Node.js (for Vitest/Playwright) | test execution | ✓ (assume — project already runs) | — | — |
| Playwright browsers (chromium) | RT-01/RT-03 e2e | Not directly verified this session — assume present since existing e2e suite already runs in CI/locally per `playwright.config.ts` | — | Run `npx playwright install chromium` if missing |

No new external service dependency is introduced by this phase (no new SaaS, no new CLI). Full audit skipped for brevity beyond the above — this phase adds no new environment dependency, only exercises the existing worker/web/e2e toolchain already in place since Phase 1.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (four `projects`: schema, rules, worker, web) + Playwright 1.62.1 (e2e) |
| Config file | `vitest.config.ts` (repo root), `playwright.config.ts` (repo root) |
| Quick run command | `npx vitest run --project worker` (or `--project rules` / `schema` / `web` as scoped to the file being changed) |
| Full suite command | `npm test` (all four Vitest projects) followed by `npm run test:e2e` (Playwright) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RT-01 | Action on one client appears on another without refresh | e2e (Playwright, two browser contexts) | `npx playwright test e2e/start-game.spec.ts` (extended) or a new spec | ✅ existing file to extend (`start-game.spec.ts` already opens two contexts) |
| RT-03 | Refresh mid-game rejoins same seat, full state, no lost turn | e2e (Playwright, `page.reload()`) | `npx playwright test e2e/in-progress-arrival.spec.ts` (extended) or a new spec | ✅ existing file to extend; confirm it currently covers pre-game arrival only — mid-game reload during an active turn is new coverage |
| RT-09 | Double-sent action (a clue) applies exactly once | integration (Vitest `worker` project, raw `ws` against `wrangler dev`) | `npm run test:integration --workspace apps/worker` (existing script: `vitest run --project worker room-do`) | ❌ new test case inside `room-do.test.ts` — Wave 0 gap |
| D-02 (leak coverage carryover) | Wire-level frames contain no own-hand identity for Hanabi | unit + integration (fast-check property test + frame-capture) | `npx vitest run --project rules` (property tests already exist per Phase 3: `redaction.property.test.ts`) and `npx vitest run --project worker` (`redaction-wire.test.ts`, `room-do.test.ts` frame capture, repointed) | ✅ Phase 3 already built `packages/rules/src/hanabi/redaction.property.test.ts`; ❌ the WORKER-level wire tests (`redaction-wire.test.ts`, `room-do.test.ts`'s frame-capture assertions) still reference the toy and need repointing — Wave 0 gap |
| D-03 (structural chokepoint) | Chokepoint counts unchanged; A9 repointed to `hanabiGame` | unit | `npx vitest run --project worker source-structure` | ✅ file exists, needs the A9 rewrite (not a new file) |

### Sampling Rate
- **Per task commit:** the narrowest relevant `--project` (e.g. `schema` while editing `hanabi.ts`, `worker` while editing `game-registration.ts`/`room-state.ts`)
- **Per wave merge:** full `npm test` (all four projects)
- **Phase gate:** `npm test` + `npx playwright test` green, plus `tsc -b` clean per D-16 — matches Phases 2-3's own gate exactly

### Wave 0 Gaps
- [ ] `apps/worker/src/room-do.test.ts` — new RT-09 double-send-a-clue test case (extends existing harness, no new file)
- [ ] `apps/worker/src/redaction-wire.test.ts` — repoint from the toy's property-test generators to Hanabi's (`checkHanabiViewForLeaks`/`secretsForHanabiSeat`, already built in Phase 3)
- [ ] `apps/worker/src/room-do.test.ts` frame-capture leak assertions — repoint from toy shape to Hanabi shape (D-02)
- [ ] A new or extended Playwright spec explicitly covering a mid-game reload (RT-03) — confirm `in-progress-arrival.spec.ts`'s current scope (this research did not read its full body; likely covers pre-game/lobby arrival, not necessarily an in-progress reload after actions have been taken)
- [ ] Framework install: none — all frameworks already present

*(If any of the above turn out to already exist upon closer inspection at plan time, mark them done rather than re-creating; this list reflects what was confirmed absent or toy-coupled during this research session.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This app has no accounts (explicit non-goal); seat tokens are capability tokens, not authentication — unchanged by this phase |
| V3 Session Management | Yes | Seat-token reclaim (RT-03) — already built in Phase 1, unchanged in shape this phase; this phase only extends WHAT is reclaimed (a live Hanabi game) not HOW |
| V4 Access Control | Yes | Server-authoritative legality via `canPlay`/`canDiscard`/`canClue` (Phase 3), enforced again here by NOT trusting client-side D-12 disabling — every action still runs the full server check regardless of what the UI disabled |
| V5 Input Validation | Yes | `z.strictObject` + exact-own-key guards (`isPlayRequest`/`isDiscardRequest`/`isClueRequest`, Phase 3) for `request`; new `actionId` field gets its own bounded string validation (Pattern 3) |
| V6 Cryptography | No new surface | Seed/PRNG already covered by Phase 2/3 (`shuffle.ts`, 128-bit state); this phase does not touch shuffling |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client asserts a resulting game state via an extra key on `game_action.request` | Tampering | Exact-own-key guards already reject any payload with an extra key (Phase 3, `isPlayRequest` etc.) — the new `actionId` field lives OUTSIDE `request` at the message envelope level specifically so it cannot be confused with or smuggled into the hostile `request` payload (Pitfall 3 above) |
| Replay of a captured `game_action` frame to force a duplicate clue/token spend | Tampering / Repudiation | RT-09's actionId dedup (D-07/D-08) — this is precisely the mitigation this phase builds |
| A malicious/buggy client submits a wildly long `actionId` string to bloat storage | Denial of Service | Bounded `.max(64)` (or similar) on `actionId` in `GameActionMessageSchema` — see Pattern 3 |
| A client infers another seat's hand by exploiting a schema validation failure that leaks issue details | Information Disclosure | Already covered by Phase 2's fail-closed `validateGameView`, which logs only `seatId`/issue `code`/`path`, never the view contents — unchanged this phase, and the new `hanabi.ts` schema must preserve this discipline (no `.superRefine` with custom messages that echo input values) |

## Sources

### Primary (HIGH confidence)
- Direct file reads of this repository's own source: `apps/worker/src/game-registration.ts`, `seat-projection.ts`, `room-do.ts`, `room-state.ts`, `persistence.ts`, `source-structure.test.ts`; `packages/schema/src/messages.ts`, `room.ts`, `constants.ts`; `packages/rules/src/adapter.ts`, `hanabi/adapter.ts`, `hanabi/state.ts`, `hanabi/actions.ts`, `hanabi/legality.ts`, `hanabi/test-support.ts`, `index.ts`; `packages/schema/src/games/forehead-card.ts`; `apps/web/app/room/[code]/RoomClient.tsx`, `components/ForeheadCardGame.tsx`, `lib/room-store.ts`, `lib/room-socket.ts`; `vitest.config.ts`; `playwright.config.ts`; `package.json` files for `apps/web`, `apps/worker`, and the repo root — all read in this session, HIGH confidence, primary sources for this codebase's own established patterns.
- `.planning/phases/04-wire-engine-into-room-actor/04-CONTEXT.md`, `.planning/phases/02-per-seat-redaction-contract/02-CONTEXT.md`, `.planning/phases/03-hanabi-rules-engine/03-CONTEXT.md`, `.planning/phases/03-hanabi-rules-engine/03-REVIEW.md` (WR-01 section), `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — read in full or in relevant part this session.

### Secondary (MEDIUM confidence)
- `npm view zod version` and `npm view nanoid version` — directly queried this session against the live npm registry (2026-09-16); confirms current registry latest (zod 4.6.5, nanoid 6.0.1) against the repo's pinned versions (zod 4.5.4, nanoid 6.0.1) — MEDIUM confidence on "no upgrade needed" judgment call (zod is one minor behind registry latest, but upgrading zod is explicitly out of this phase's scope and not flagged as a blocker).

### Tertiary (LOW confidence)
- None used as load-bearing claims. The Zod-4-discriminated-union-parse-cost claim (Pitfall 6) is flagged explicitly as MEDIUM/reasoned-not-measured in its own entry and the Assumptions Log (A3), rather than stated as fact.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; every version claim was directly verified against either the repo's own lockstep pins or a live `npm view` call this session.
- Architecture: HIGH — every pattern recommendation traces to an existing, already-shipped file in this exact repository (Phases 1-3), not to external precedent.
- Pitfalls: HIGH for pitfalls 1-5 and 7 (all directly traced to specific lines of existing code or specific CONTEXT.md decisions); MEDIUM for pitfall 6 (performance claim, explicitly flagged as reasoned-not-measured).

**Research date:** 2026-09-16
**Valid until:** 30 days (this is a brownfield/internal-codebase research pass, not a fast-moving external-ecosystem one; the only external-facing claim with a freshness window is the zod/nanoid registry version check)

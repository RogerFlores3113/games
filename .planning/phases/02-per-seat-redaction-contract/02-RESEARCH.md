# Phase 2: Per-Seat Redaction Contract - Research

**Researched:** 2026-09-15
**Domain:** Whitelist-serialize per-seat state projection; property-based leak testing; Zod strict schema validation at a wire boundary; source-structure enforcement tests
**Confidence:** HIGH

## Summary

Phase 2 does not introduce new infrastructure — it hardens a pattern Phase 1 already scaffolded. `packages/rules/src/adapter.ts`'s `GameAdapter` interface, `apps/worker/src/room-state.ts`'s `toSeatView` chokepoint, and `packages/schema/src/room.ts`'s "declare the view type independently, never `.omit()`" convention already exist and already point at exactly the pattern D-01–D-17 in CONTEXT.md ask for. The work is: (1) delete the D-15 counter and replace it with a toy "forehead card" adapter that has a real thing to hide, (2) add a game-namespaced Zod schema that validates every projected view before it is ever stringified, fed through the existing `encodeServerMessage` chokepoint, (3) consolidate the several `connection.send` call sites in `room-do.ts` behind one `#send` method, and (4) add a three-layer fast-check + wire-string + wrangler-dev-integration leak test suite, including a canary that proves the checker can fail.

No new runtime dependencies are needed. `fast-check@4.9.0` and `zod@4.5.4` are already installed (root `package.json` and `packages/schema/package.json` respectively) — current published versions are `fast-check@4.10.0` and `zod@4.6.5` `[VERIFIED: npm registry]`, both minor-version-behind and not a blocker; upgrading is the planner's discretion, not a requirement.

The one genuine gap this research surfaced that CONTEXT.md's open question (D-17 interaction) flagged correctly: `apps/worker/src/persistence.ts`'s `loadRoom` resets only on a `schemaVersion` mismatch, and does **not** compare the persisted room's `adapterId` against the currently wired adapter. A persisted room from before this phase's deploy (`adapterId: "counter"`, `schemaVersion: 1`) would currently **pass** `RoomStateSchema.safeParse` unchanged (its `game` field is `z.unknown()`) and get handed to the toy adapter's `toPlayerView`, which does not know the counter's shape. This must be closed in this phase — the lowest-risk fix, consistent with the existing D-17 "no migrations, reset instead" policy, is to bump `ROOM_SCHEMA_VERSION` in `packages/schema/src/constants.ts` as part of the adapter swap, since a schema-version bump is already the established, tested reset trigger. An explicit `adapterId` equality check in `loadRoom` is a defensible alternative but adds a second reset trigger to a module whose comments currently promise exactly one.

**Primary recommendation:** Do not build new infrastructure. Extend the three existing chokepoints (`GameAdapter.toPlayerView`, `toSeatView`, `encodeServerMessage`) with a game-namespaced strict Zod schema and a single `#send` wrapper in `room-do.ts`; prove correctness with a three-layer fast-check suite; close the persisted-`adapterId` gap by bumping `ROOM_SCHEMA_VERSION`.

## Project Constraints (from CLAUDE.md)

- **Monorepo package boundaries are load-bearing, not stylistic.** `packages/rules` must stay zero-runtime-dependency (FDN-02) — the new toy adapter and its seeded shuffle utility live there with no imports beyond TypeScript itself. `packages/schema` is the only package allowed to depend on `zod`; the new game-view schema belongs under it (or under `apps/worker`, per Open Question 1) but never inside `packages/rules`.
- **No hand-rolled Durable Object WebSocket hibernation API.** This phase does not touch hibernation lifecycle wiring, but any new code in `room-do.ts` must continue routing through `partyserver`'s `Server`/`Connection` primitives already in place — never raw `WebSocketPair`/hibernation API calls.
- **No broadcasting one shared state object to all seats.** Explicitly forbidden in CLAUDE.md's "What NOT to Use" table and directly enforced by this phase's D-09 structural test (`broadcast(` must appear zero times in `apps/worker/src`, excluding tests).
- **Exact version pins, not `^`/`~` ranges.** Established convention (STATE.md: TypeScript pinned to exact `5.9.3`, `nanoid` pinned to exact `6.0.1`). If `fast-check`/`zod` are bumped this phase, pin exactly.
- **Zustand for client state, not Redux/Context+useReducer.** The new `ForeheadCardGame.tsx` renders from the same `room-store.ts` Zustand cache `CounterGame.tsx` already uses — no new client state management library.
- **Tailwind v4 `@theme` tokens, not CSS-in-JS.** The toy's minimal UI (D-03) must use the existing dark theme CSS variables established in Phase 1, matching `CounterGame.tsx`'s current styling approach.
- **fast-check for hand-visibility redaction invariants is an explicit, deliberate inclusion** (CLAUDE.md "Testing Approach for the Rules Engine") — this phase is precisely the case CLAUDE.md pre-committed to property-based testing for.
- **Vitest 4.x, not Jest.** All new test files use Vitest's API (`describe`/`it`/`expect` from `vitest`), consistent with the existing `vitest.config.ts` `projects` setup.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Toy game rules (`applyAction`, `checkGameEnd`, deck/deal logic) | Backend (`packages/rules`, zero-dep) | — | Pure state transition, no I/O; must stay importable by both worker and web per FDN-02 |
| Per-seat view projection (`toPlayerView`) | Backend (`packages/rules`, invoked from `apps/worker`) | — | The adapter is the only code with access to full state; projection must happen before any network boundary is crossed |
| Wire-shape validation of a projected view | Backend (`apps/worker` send path, backed by a game-namespaced schema in `packages/schema` or a new sibling module) | — | Validation must run on the server, after projection, before serialization — a client-side check proves nothing about what was actually sent |
| Single outbound chokepoint (`#send`) | Backend (`apps/worker/src/room-do.ts`) | — | Durable Object is the only process that ever holds a live socket; consolidating here is what makes "no bypass" grep-verifiable |
| Toy game UI (face-down placeholder, guess buttons) | Browser/Client (`apps/web`) | — | Pure rendering of the already-redacted view; the client never receives enough information to reconstruct the hidden card, so there is nothing for the client tier to leak |
| Leak test suite (property + wire-string + integration) | Test tooling (Vitest, `apps/worker` + `packages/rules`) | — | Verification layer, not a runtime tier — but it must reach both the pure adapter and the real wire, hence spanning two of Vitest's `projects` |

## User Constraints

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Toy secret game shape**
- D-01: Toy is a Hanabi-shaped "forehead card" game — one hidden card per seat, visible to every other seat, invisible to its owner. Shared draw deck hidden from everyone (server-minted seed). On their turn the active player guesses their own card's value; right or wrong, the card is revealed publicly (moves to a public revealed pile/score) and the player draws a replacement. Game ends when the deck runs out; `checkGameEnd` returns a score. Mirrors Hanabi's three visibility classes: visible-to-others-not-self, hidden-from-all (deck), public-after-transition.
- D-02: D-15 counter is deleted, not kept alongside: `packages/rules/src/counter-game.ts` (+tests), `apps/web/components/CounterGame.tsx`, counter exports in `packages/rules/src/index.ts`. `apps/worker/src/room-state.ts`'s `const adapter = counterGame` line switches to the toy adapter; `CounterState`/`CounterAction` casts there go away. `e2e/start-game.spec.ts` and `e2e/in-progress-arrival.spec.ts` update to the toy.
- D-03: Toy is minimally playable in browser — other seats' cards face up, viewer's own card face-down placeholder, revealed pile/score, turn indicator, one guess control per possible value. Bare styling matching `CounterGame.tsx`'s current level, on existing Phase 1 theme tokens. Exists to be deleted in Phase 4.
- D-04: Every card instance (including hidden ones) carries an opaque card id — React key material, and Phase 6's clue memory will need it. Must NOT correlate with identity: not the pre-shuffle deck index or anything derivable from deck composition. A predictable id is a leak.

**Wire-level enforcement (HIDE-03)**
- D-05: `toPlayerView` builds views by explicit whitelist construction, copying named fields one by one. Spread (`...card`), `omit`, `delete`, "set to null/undefined" are forbidden in projection code. Hidden card is a distinct shape (discriminated union: `{ id, hidden: true }` vs `{ id, hidden: false, value }`) — hidden variant has no identity key at all.
- D-06: Game views validated on every send by a strict (unknown-key-rejecting) Zod schema. `RoomViewSchema.game` stays generic (`z.unknown()` at room layer, preserving FDN-01), but the send path also runs the active game's strict view schema — a stray `value` key on a hidden card fails validation. `packages/rules` stays zero-dependency (FDN-02), so the Zod view schema cannot live there. It lives in a game-namespaced module reached only through a single adapter registration point, never imported throughout generic code.
- D-07: Validation fails closed. If a projected view fails its schema, that connection gets an `error` frame and no view; failure is logged. No fallback to sending the unvalidated/raw object.

**Single outbound chokepoint (HIDE-02)**
- D-08: Exactly one method in the worker calls `connection.send` (e.g. private `#send(connection, frame)` in `room-do.ts`). `joined`, `state`, `refused`, `superseded`, `error` frames all pass through it. Frames carrying a room view get that view only from `#viewFor` → `toSeatView` → `adapter.toPlayerView`. Frames without a view (`refused`, `superseded`, `error`) are built from closed strict schemas with no state-bearing fields. HIDE-02's "error responses" clause is satisfied by guaranteeing error frames can never carry state.
- D-09: "No bypass" proven by a structural source test in the normal Vitest suite, failing the build. Extends Phase 1's grep-verifiable single-call-site convention: in `apps/worker/src`, excluding tests, `connection.send(`/`.send(` occurs exactly once, `toSeatView(` has exactly one call site, `toPlayerView(` is called only from `toSeatView`, partyserver's room-wide `broadcast(` appears zero times. Type-level branding of projected views on top is Claude's discretion; the structural test is required.
- D-10: Join, live update, and reconnect all use the same `#viewFor` path. Phase 1 already made first join and reconnect the same `join` handler (RT-05 groundwork); this phase must not introduce a separate resume serializer.

**Leak test strategy (HIDE-04)**
- D-11: Leak test is layered, every layer runs in standard `npm test`:
  1. Adapter property test (fast-check): from any seeded initial state advanced by random legal action sequences, for every seat, `toPlayerView` contains no identity on that seat's own card, no deck contents or seed appear anywhere.
  2. Wire-level property test: same generated states through `toSeatView` + `encodeServerMessage`, checked on the encoded JSON string that would actually be sent.
  3. Integration test against a running worker (the `wrangler dev` pattern from `room-do.test.ts`): capture real frames each seat receives on initial join, a live update after an action, and a reconnect via seat token; run the same leak checker over them.
- D-12: Leak checker asserts BOTH structural absence (own card's entry has no identity key: `!("value" in entry)`, not `entry.value === undefined`) AND absence of the true secret in the raw serialized string. Secret values in the toy must not collide with other numbers legitimately present in a view (seat counts, scores). Fixtures use distinctive secret values/identity tokens so a raw-string scan cannot pass or fail by coincidence. Exact technique is planner's call.
- D-13: Leak checker must be proven able to fail. A canary test runs it against a deliberately leaky projection (own value included, and separately `value: null`/`undefined` present) and asserts it reports a leak.
- D-14: The server-only seed (`RoomState.seed`, WR-07) and the undealt deck order fall under the leak checker's "never in any view" rule too, for every seat.

### Claude's Discretion
- Exact toy rules within D-01: value range, deck size and composition, and scoring.
- Module location and naming for the toy adapter and its Zod view schema, within D-06's constraints (rules package stays zero-dependency; one registration point).
- Whether to generify the adapter typing in `room-state.ts` (removing the `as CounterState` cast pattern) or keep a single module-level adapter constant.
- Whether to add a branded `SeatProjection` type in addition to D-09's structural test.
- Number of fast-check runs and shrinking configuration.
- Minimal toy UI layout within D-03.

### Deferred Ideas (OUT OF SCOPE)
- Playwright network-payload capture test (inspecting frames in a real browser's DevTools protocol). The wrangler-dev frame capture already exercises the real wire; a browser-level check is optional hardening for Phase 5/6 if wanted.
- Distinguishing adapter refusal reasons on the wire (today every `AdapterError` collapses to `bad_request`). Not a redaction concern; revisit when Phase 4/6 need player-facing rule-refusal messages.
</user_constraints>

## Phase Requirements

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HIDE-01 | A player's client never receives the suit/rank (here: value) of any card in that player's own hand, verifiable by inspecting the network payload | D-01/D-05 toy shape + discriminated-union view schema; D-11 layer 2/3 wire-string leak tests read the actual serialized payload, not the in-memory object |
| HIDE-02 | Every outbound payload — initial join, live update, reconnect, error — is produced by a single per-seat projection function, no bypass path | D-08/D-09/D-10; existing `#viewFor`/`toSeatView` chokepoint already in `room-do.ts`, extended with `#send` consolidation and a structural source test |
| HIDE-03 | The wire format for a hidden card structurally lacks suit/rank fields rather than nulling/emptying them | D-05 discriminated union + D-06 strict Zod schema rejecting stray keys (including `value: undefined`), verified pre-stringify since JSON.stringify silently drops `undefined` values |
| HIDE-04 | An automated test fails if a serialized seat view contains the true identity of any card in that seat's own hand | D-11 three-layer fast-check + wire-string + wrangler-dev integration suite; D-13 canary proves the checker itself can fail |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `fast-check` | 4.9.0 installed (4.10.0 current) `[VERIFIED: npm registry]` | Property-based testing of the redaction invariant across randomly generated legal action sequences | Already the project's chosen tool (CLAUDE.md "Testing Approach"); no alternative considered |
| `zod` | 4.5.4 installed in `packages/schema` (4.6.5 current) `[VERIFIED: npm registry]` | Strict, unknown-key-rejecting runtime validation of the game view before it is sent | Already the project's wire-validation library; `z.strictObject` + `z.discriminatedUnion` are the exact primitives D-05/D-06 ask for |
| `vitest` | 4.1.11 installed `[VERIFIED: npm registry]` | Test runner for all three leak-test layers, plus the structural source test | Already wired via `vitest.config.ts` `projects` (schema/rules/worker/web) |

### Supporting
No new supporting libraries. The toy adapter's deterministic shuffle can reuse a small seeded PRNG written in-package (zero-dep, per FDN-02) rather than an npm dependency — see Don't Hand-Roll below for why a seeded PRNG is the one exception to "don't hand-roll."

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fast-check's `fc.property` with hand-rolled action sequences | fast-check's `fc.commands`/`asyncModelRun` (formal model-based testing) | `fc.commands` is the more idiomatic fit for "random legal action sequences" (it models the exact command-then-check shape D-11 layer 1 describes) but adds a `Command` class per action type (guess) for a toy with essentially one action kind. For this phase's narrow one-action-type toy, a plain `fc.property` generating an array of legal actions and folding `applyAction` over them is simpler and equally rigorous; reserve `fc.commands` for Phase 3's richer action set (play/discard/clue) where the extra ceremony earns its keep. |
| A new game-namespaced Zod schema module | Extending `RoomViewSchema.game` itself to a game-specific type | Rejected by D-06 explicitly — `RoomViewSchema.game` must stay `z.unknown()` (FDN-01: the schema package must not know what a game is). The game-specific schema is a separate, smaller module the send path additionally validates against. |

**Installation:**
No install needed — `fast-check` and `zod` are already present in the lockfile at the versions above. If the planner chooses to bump to current (`fast-check@4.10.0`, `zod@4.6.5`), the exact-pin convention (STATE.md: "TypeScript pinned to exact 5.9.3", "nanoid pinned to exact 6.0.1") applies — pin exactly, do not use `^`/`~`.

**Version verification:**
```
npm view fast-check version   -> 4.10.0 (installed: 4.9.0)
npm view zod version          -> 4.6.5  (installed: 4.5.4)
npm view vitest version       -> (installed 4.1.11, already current at Phase 1 research time)
```
Both installed versions are one minor behind current as of 2026-09-15. Neither gap blocks this phase's work; flagged for the planner's discretion only.

## Package Legitimacy Audit

No new external packages are introduced by this phase. `fast-check`, `zod`, and `vitest` were already vetted and approved during Phase 1 (see `.planning/phases/01-room-transport-skeleton/01-RESEARCH.md`'s audit table, which recorded `fast-check` as `[OK]` with an info-level `HALLUCINATION_PATTERN` false positive explicitly noted as "package is established"). No `slopcheck`/registry re-verification is required for this phase.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                     Client guess action (WS "game_action")
                              │
                              ▼
                    room-do.ts#onMessage
                              │
                  applyGameAction (room-state.ts)
                              │
              adapter.applyAction(gameState, seatId, request)
                   (forehead-card.ts — pure, zero-dep)
                              │
                    new gameState returned
                              │
                              ▼
                    room-do.ts#commit → persist
                              │
                              ▼
                    room-do.ts#pushState
                              │
               for each connection: #viewFor(room, seatId)
                              │
                    toSeatView (room-state.ts)
                              │
             adapter.toPlayerView(gameState, seatId)  ◄── ONLY exit point
              (whitelist-construct: hidden→{id,hidden:true}
                              visible→{id,hidden:false,value})
                              │
                              ▼
            game-view schema (forehead-card-view.ts, packages/schema
            or a sibling game-namespaced module) .parse()  ◄── fails closed
                              │
                    ┌─── pass ─┴─ fail ───┐
                    ▼                     ▼
          encodeServerMessage      error frame (no view)
           (ServerMessageSchema)         │
                    │                    │
                    └────────┬───────────┘
                              ▼
                    room-do.ts#send (SOLE connection.send call site)
                              │
                              ▼
                    connection.send(json) → browser
                              │
                              ▼
                    apps/web ForeheadCardGame.tsx (pure render,
                    cannot reconstruct hidden value — never received it)
```

### Recommended Project Structure
```
packages/rules/src/
├── adapter.ts             # unchanged interface
├── forehead-card.ts        # NEW toy adapter (replaces counter-game.ts, deleted)
├── forehead-card.test.ts   # unit tests + fast-check property test (D-11 layer 1)
├── shuffle.ts               # NEW zero-dep seeded PRNG (mulberry32 or splitmix32-style), used
│                             # by createInitialState for deterministic deck order (D-04, WR-07)
└── index.ts                # export forehead-card adapter instead of counterGame

packages/schema/src/
├── room.ts, messages.ts    # unchanged
└── games/
    └── forehead-card.ts     # NEW: game-namespaced strict Zod view schema (D-06)
                              # imported ONLY by apps/worker's send path, never by
                              # generic room/schema code — this IS the "one
                              # registration point" D-06 requires

apps/worker/src/
├── room-state.ts            # `const adapter = foreheadCardGame` (one-line swap, D-02)
├── room-do.ts                # #send single chokepoint; #viewFor validates against
│                              # the game view schema before returning
├── leak-check.ts            # NEW: shared leak-checker fn used by both fast-check
│                              # layers and the integration test (D-11, D-12, D-13)
├── room-do.test.ts          # extended: capture join/state/reconnect frames, run
│                              # leak-check over them (D-11 layer 3)
├── source-structure.test.ts # NEW: D-09's structural grep test
└── persistence.ts            # ROOM_SCHEMA_VERSION bump closes the adapterId gap

apps/web/components/
└── ForeheadCardGame.tsx     # replaces CounterGame.tsx (D-03)
```

### Pattern 1: Whitelist Discriminated-Union Projection (D-05)
**What:** `toPlayerView` never spreads or omits. For the seat's own card it constructs `{ id, hidden: true }` and nothing else; for every other seat's card it constructs `{ id, hidden: false, value }`.
**When to use:** Any place server state crosses into a per-seat view.
**Example:**
```typescript
// packages/rules/src/forehead-card.ts — illustrative, not copy-paste-exact
type HiddenCard = { readonly id: string; readonly hidden: true };
type VisibleCard = { readonly id: string; readonly hidden: false; readonly value: number };
type ProjectedCard = HiddenCard | VisibleCard;

function projectCard(card: { id: string; value: number }, viewerCanSee: boolean): ProjectedCard {
  if (!viewerCanSee) {
    // Whitelist construction — literally cannot carry `value` because the
    // object literal never mentions it, not because it was deleted or nulled.
    return { id: card.id, hidden: true };
  }
  return { id: card.id, hidden: false, value: card.value };
}
```

### Pattern 2: Game-Namespaced Strict Schema Gate on the Send Path (D-06, D-07)
**What:** A Zod schema specific to the forehead-card view, declared in a module only the worker's send path imports, run in addition to `ServerMessageSchema`.
**When to use:** Immediately after `adapter.toPlayerView` returns, before the result is handed to `encodeServerMessage`.
**Example:**
```typescript
// packages/schema/src/games/forehead-card.ts (or apps/worker/src/, if avoiding a
// generic-package import is preferred — see Open Questions)
import { z } from "zod";

const HiddenCardSchema = z.strictObject({ id: z.string(), hidden: z.literal(true) });
const VisibleCardSchema = z.strictObject({ id: z.string(), hidden: z.literal(false), value: z.number() });
export const ForeheadCardSchema = z.discriminatedUnion("hidden", [HiddenCardSchema, VisibleCardSchema]);

export const ForeheadCardViewSchema = z.strictObject({
  yourCard: HiddenCardSchema,                 // structurally CANNOT be a VisibleCard
  otherCards: z.array(z.object({ seatId: z.string(), card: ForeheadCardSchema })),
  revealed: z.array(z.object({ id: z.string(), value: z.number(), seatId: z.string() })),
  deckCount: z.number(),
  activeSeatId: z.string(),
  score: z.number(),
});
```
```typescript
// apps/worker/src/room-do.ts — inside #viewFor, before returning
const rawView = toSeatView(room, seatId);
const gameCheck = ForeheadCardViewSchema.safeParse(rawView.game);
if (!gameCheck.success) {
  console.error("HIDE-03 validation failure:", gameCheck.error);
  return { failed: true } as const; // caller sends `error` frame, no view (D-07)
}
return { failed: false, view: rawView } as const;
```

### Pattern 3: Single `#send` Chokepoint (D-08, D-09)
**What:** Exactly one private method in `room-do.ts` calls `connection.send`. Every other method builds a `ServerMessage` value and passes it to `#send`.
**When to use:** Every outbound frame — `joined`, `state`, `refused`, `superseded`, `error`.
**Example:**
```typescript
// apps/worker/src/room-do.ts
#send(connection: Connection, msg: ServerMessage): void {
  connection.send(encodeServerMessage(msg));
}
// Every prior `connection.send(encodeServerMessage({...}))` call site in this
// file becomes `this.#send(connection, {...})`.
```
The structural test (D-09) greps this file (excluding `*.test.ts` and comment lines) and asserts `.send(` appears exactly once outside `#send`'s own definition line, `toSeatView(` appears exactly once, and `broadcast(` appears zero times. Phase 1's `room-do.ts` already has two lines of *prose* mentioning `toSeatView(` inside comments (lines 14 and 381-382 as read in this session) — the test MUST strip `//` and block-comment lines before counting, or it will false-positive against Phase 1's own file. See Pitfall 3 below.

### Pattern 4: fast-check Property Test Over Random Legal Action Sequences (D-11 layer 1)
**What:** Generate a random initial toy state (seat count, seed) and a random sequence of legal `guess` actions, fold `applyAction` over them, and assert no seat's projected view ever contains its own card's `value`.
**When to use:** `packages/rules/src/forehead-card.test.ts`.
**Example:**
```typescript
// Source: fast-check docs https://fast-check.dev/docs/core-blocks/arbitraries/
// and https://fast-check.dev/docs/advanced/model-based-testing/ (pattern adapted;
// plain fc.property chosen over fc.commands for this phase's single-action toy —
// see "Alternatives Considered").
import fc from "fast-check";
import { foreheadCardGame } from "./forehead-card";

const seatCountArb = fc.integer({ min: 2, max: 5 });
const seedArb = fc.hexaString({ minLength: 32, maxLength: 32 });

test("no seat's view ever exposes its own card value across any legal action sequence", () => {
  fc.assert(
    fc.property(seatCountArb, seedArb, fc.array(fc.constant({ type: "guess" }), { minLength: 0, maxLength: 40 }), (n, seed, _actions) => {
      const seatIds = Array.from({ length: n }, (_, i) => `seat-${i}`);
      let state = foreheadCardGame.createInitialState({ seatIds, variant: "base", seed });
      // Drive the active seat's action each iteration — value doesn't matter
      // (any guess reveals the card either way per D-01), so a fixed-shape
      // action sequence exercises turn order without needing to encode
      // "legal" beyond "it's this seat's turn."
      for (let i = 0; i < 40 && foreheadCardGame.checkGameEnd(state) === null; i++) {
        const activeSeatId = /* derive from state, adapter-specific */ seatIds[0];
        const result = foreheadCardGame.applyAction(state, activeSeatId, { type: "guess", value: 0 });
        if (result.ok) state = result.state;
        for (const seatId of seatIds) {
          const view = foreheadCardGame.toPlayerView(state, seatId) as { yourCard: { hidden: true; value?: unknown } };
          expect("value" in view.yourCard).toBe(false); // structural absence, D-12
        }
      }
    }),
    { numRuns: 200 }, // Claude's discretion, per CONTEXT.md — 200 is a reasonable
                       // default for a fast, few-branch toy; raise if CI time allows.
  );
});
```

### Anti-Patterns to Avoid
- **Spreading state into a view (`{ ...card }`):** Explicitly forbidden by D-05. Any future field added to the internal card shape leaks by default.
- **Nulling instead of omitting (`value: card.hidden ? null : card.value`):** Explicitly forbidden by D-03/D-13's canary — this is exactly the deliberately-leaky shape the canary test constructs to prove the checker catches it.
- **Checking truthiness instead of key presence (`entry.value === undefined`):** `JSON.stringify` silently drops `undefined`-valued keys, so an object that has `value: undefined` as an own key produces `{"id":"...","hidden":true}` on the wire either way — but the *in-memory* object still had the key. A checker using `entry.value === undefined` would report "safe" for both the correctly-whitelisted object AND the buggy one that set-to-undefined instead of omitting, silently accepting a latent bug (if the value-setting code path is later changed to a real value under some condition, nothing catches it). D-12 mandates `"value" in entry` instead — this is the load-bearing distinction the canary (D-13) exists to prove.
- **Validating client-side or in a Playwright DevTools capture as the primary leak-test evidence:** Deferred explicitly (see Deferred Ideas) — the server-side wire-string check is authoritative; a browser-level check is optional hardening, not required here.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Strict, unknown-key-rejecting object validation | A hand-written `Object.keys(x).every(k => allowedKeys.includes(k))` check | `z.strictObject` (already the project's convention, `PublicSeatSchema`/`ServerMessageSchema`) | Zod's strict mode is battle-tested, composes with `z.discriminatedUnion`, and gives you the same validated object for free type inference — a hand-rolled key-allowlist check duplicates logic Zod already owns and is easy to get subtly wrong (e.g. forgetting to check nested objects) |
| Random legal action-sequence generation for property testing | Hand-written loop with `Math.random()` and manual seed tracking | `fast-check`'s `fc.array`/`fc.integer`/`fc.property` + its own shrinking | Already the project's chosen tool; hand-rolled fuzzing has no shrinking (a failing 40-action sequence is undebuggable without it) and no reproducibility across CI runs |
| Deep-structural "did this object leak a secret" diffing | A recursive walk written ad hoc per test | A single shared `leak-check.ts` helper (`hasKey(obj, "value")` walked recursively + `JSON.stringify(obj).includes(secretToken)`) used identically by all three D-11 layers | D-11 explicitly requires the SAME checker across all three layers — writing it once and importing it three times is what makes the canary (D-13) meaningful evidence about all three call sites, not just one |

**Key insight:** This phase is not "add security features" — it's "make an existing structural pattern airtight and prove it with a test that can itself fail." Every "don't hand-roll" item above exists because a hand-rolled version would be *harder to trust*, not because a library adds functionality that's missing.

## Common Pitfalls

### Pitfall 1: Persisted `adapterId: "counter"` rooms survive the deploy (D-17 interaction)
**What goes wrong:** `apps/worker/src/persistence.ts`'s `loadRoom` only compares the persisted `schemaVersion` top-level storage key against `ROOM_SCHEMA_VERSION` (currently `1`, unchanged since Phase 1). It never inspects `room.adapterId`. `RoomStateSchema.game` is `z.unknown()`, so a persisted counter-shaped `game` blob parses successfully under the unchanged schema. If this phase deploys without bumping `ROOM_SCHEMA_VERSION`, any room a friend created before the deploy (in `lobby` status, or worse, `in_progress` with counter state) reloads with `adapterId: "counter"` and gets handed to `foreheadCardGame.toPlayerView`/`applyAction`, which do not understand a `CounterState` shape — likely a runtime crash inside an untyped-cast path (`state.game as CounterState`-equivalent) rather than a clean refusal.
**Why it happens:** `loadRoom`'s reset trigger was designed in Phase 1 for cross-deploy *shape* incompatibility, and an adapter swap is exactly that kind of incompatibility, but nothing currently wires the two together.
**How to avoid:** Bump `ROOM_SCHEMA_VERSION` in `packages/schema/src/constants.ts` as part of this phase's adapter swap. This reuses the exact reset path already tested in Phase 1's `room-do.test.ts` D-17 restart test, requires a one-line change, and keeps `loadRoom` at exactly one reset trigger (matching its current doc comment "a version mismatch means the room resets... WITHOUT deserializing the old blob at all"). An alternative — adding an explicit `room.adapterId !== adapter.id` check inside `loadRoom` — is defensible but adds a second, independent reset condition to a function whose whole design point was "one trigger, checked before the blob is touched"; only reach for it if a future phase needs to swap adapters without also wanting a version bump (unlikely, since FDN-01 makes an adapter swap a breaking shape change by definition).
**Warning signs:** Any integration test that persists a room under the OLD adapter, deploys/reloads under the new adapter, and observes anything other than a clean empty-lobby reset.

### Pitfall 2: `JSON.stringify` hides `undefined`-valued keys, but Zod validation runs on the pre-stringify object
**What goes wrong:** A future maintainer might reason "if `value: undefined` doesn't show up in the network payload anyway, why forbid it in projection code?" — and relax D-05's whitelist-construction rule to allow `{ id, hidden: true, value: undefined }`.
**Why it happens:** `JSON.stringify({ a: undefined })` produces `"{}"` for that key — a *browser inspecting the wire payload* genuinely would not see `value` on a hidden card built this way, which looks like it satisfies HIDE-03 on casual inspection.
**How to avoid:** D-06's strict Zod schema validates the object BEFORE `encodeServerMessage` stringifies it. `z.strictObject`/`z.discriminatedUnion` check `Object.keys(input)`, which DOES include `value` even when its value is `undefined` — Zod will reject this object with an "unrecognized key" error, independent of what JSON.stringify would later do to it. This is why D-06 (schema validation) and D-12 (key-presence check, not truthiness check) both matter: they catch the bug at the object level, not the string level, closing the gap a naive "just check the wire string" approach would miss for a hidden card that happens to have no OTHER numeric field for the coincidentally-dropped key to collide with. `[CITED: zod.dev/api — "unspecified keys will make Zod throw an error" under strict mode]`
**Warning signs:** A leak test written ONLY against the JSON string (D-11 layer 2/3) without also running layer 1's structural `"value" in entry` check on the pre-stringify object — this would let the `value: undefined` anti-pattern through undetected, since the string representation looks identical to the correct whitelist-constructed object.

### Pitfall 3: Comment text fools a naive grep-based structural test (D-09)
**What goes wrong:** `apps/worker/src/room-do.ts` already contains multiple lines of *prose* that literally include the substring `toSeatView(` inside `//` comments (e.g. the file-header comment and the `#viewFor` docstring, both quoted verbatim in this research's Code Context). A structural test implemented as `grep -c "toSeatView(" room-do.ts` would count these comment occurrences alongside the one real call site and either false-positive-fail (count > 1) immediately upon this phase touching the file, or worse, silently pass a FUTURE bug that adds a second real call site, because the comment-inflated baseline already "looked like more than one."
**Why it happens:** Naive substring/grep counting does not distinguish code from comments.
**How to avoid:** Implement D-09's structural test in Vitest by reading the file with `fs.readFileSync`, stripping `//` line comments and `/* */` block comments (a simple line-based strip is sufficient here — this file has no string literals containing `//`), THEN counting occurrences of `.send(`, `toSeatView(`, and `broadcast(` on the stripped text, excluding `*.test.ts` files from the scan entirely. Assert the exact expected counts (not just "at most N") so both a bypass (too many) and a dead pattern (too few, meaning the refactor silently broke something) are caught.
**Warning signs:** The structural test passing immediately without ever having been run against a deliberately-broken fixture (mirrors D-13's canary requirement, applied to D-09 as well — though CONTEXT.md does not explicitly require a canary for D-09, it is good practice to write one manual "add a second `.send(` call, confirm the test fails" check during implementation, even if not left in the permanent suite).

### Pitfall 4: `checkGameEnd`'s score/reveal transition itself leaks the seed or deck order
**What goes wrong:** D-14 explicitly calls out that the server-only seed and undealt deck order must never appear in ANY seat's view — including after the game ends. A naive `checkGameEnd`-triggered "final reveal" screen that dumps the whole game state for a results summary (a pattern that would make sense product-wise, e.g. "show what everyone's card really was") is easy to implement by passing the raw internal state to the client, which reintroduces the deck/seed leak this phase exists to prevent, at the one moment (game end) when engineers most want to "just show everything."
**Why it happens:** End-of-game UI naturally wants more transparency than mid-game UI; the temptation to special-case the final `toPlayerView` call is real, and D-01/D-03 do not explicitly forbid it (the scope says the toy ends when the deck runs out and returns a score — it does not describe an end-of-game "reveal all" screen).
**How to avoid:** `toPlayerView` has no `ended`-vs-`in_progress` branch that changes its redaction behavior. Every already-revealed card (moved to the public "revealed" pile during play per D-01) is legitimately visible to everyone by that point via the normal `revealed` list — an end screen can render that list. There is no product requirement in this phase to show a still-hidden card's final value (the game ends because the deck ran out, not because someone's forehead card was still unguessed), so no code path in this phase has a reason to expose it. If Phase 6 later wants a "big reveal" screen for the real game, that is an explicit, deliberate design decision for that phase, not an accidental consequence of Phase 2's `checkGameEnd`.
**Warning signs:** Any `toPlayerView` implementation that checks `state.status === "ended"` or receives a `gameEnded: boolean` flag and returns a different (more permissive) shape.

## Code Examples

### Structural source test (D-09)
```typescript
// apps/worker/src/source-structure.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Strips `//` line comments and `/* */` block comments so prose mentioning
 * `toSeatView(` (see room-do.ts's own file-header/docstring comments) does
 * not inflate the count. Sufficient for this file: no string literal here
 * contains a literal `//` sequence. See Pitfall 3. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("HIDE-02 structural chokepoint audit (D-09)", () => {
  const source = stripComments(readFileSync(new URL("./room-do.ts", import.meta.url), "utf-8"));

  it("connection.send is called exactly once, inside #send", () => {
    const matches = source.match(/\.send\(/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("toSeatView is called exactly once, inside #viewFor", () => {
    const matches = source.match(/toSeatView\(/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("partyserver's room-wide broadcast is never called", () => {
    const matches = source.match(/\bbroadcast\(/g) ?? [];
    expect(matches.length).toBe(0);
  });
});
```

### Leak checker shared by all three D-11 layers, with D-13's canary
```typescript
// apps/worker/src/leak-check.ts
export interface LeakResult {
  readonly leaked: boolean;
  readonly reasons: string[];
}

/** Recursively checks for a forbidden OWN key anywhere in `obj` (D-12
 * structural check: `"value" in entry`, not a truthiness check — see
 * Pitfall 2) plus a raw substring scan of `serialized` for `secretToken`
 * (D-12: fixtures must use a distinctive token so this cannot pass/fail by
 * coincidence with an unrelated legitimate number in the view). */
export function checkForLeak(
  obj: unknown,
  serialized: string,
  forbiddenKey: string,
  secretToken: string,
): LeakResult {
  const reasons: string[] = [];
  if (hasKeyRecursive(obj, forbiddenKey)) {
    reasons.push(`structural: found own key "${forbiddenKey}" somewhere in the view`);
  }
  if (serialized.includes(secretToken)) {
    reasons.push(`string: found secret token "${secretToken}" in the serialized payload`);
  }
  return { leaked: reasons.length > 0, reasons };
}

function hasKeyRecursive(obj: unknown, key: string): boolean {
  if (obj === null || typeof obj !== "object") return false;
  if (Array.isArray(obj)) return obj.some((item) => hasKeyRecursive(item, key));
  if (key in obj) return true;
  return Object.values(obj).some((value) => hasKeyRecursive(value, key));
}
```
```typescript
// apps/worker/src/leak-check.test.ts — D-13's canary
import { describe, expect, it } from "vitest";
import { checkForLeak } from "./leak-check";

describe("leak checker canary (D-13)", () => {
  it("flags a deliberately leaky view with the own value present", () => {
    const leaky = { yourCard: { id: "c1", hidden: true, value: 4 } };
    const result = checkForLeak(leaky, JSON.stringify(leaky), "value", "4");
    expect(result.leaked).toBe(true);
  });

  it("flags a view where hidden variant carries value: undefined (structural, not string-based)", () => {
    const leaky = { yourCard: { id: "c1", hidden: true, value: undefined } };
    // JSON.stringify DROPS the undefined key — the string check alone would
    // miss this. The structural `"value" in entry` check must catch it.
    const serialized = JSON.stringify(leaky);
    expect(serialized).not.toContain("value"); // proves the string-only gap exists
    const result = checkForLeak(leaky, serialized, "value", "UNUSED");
    expect(result.leaked).toBe(true);
  });

  it("flags a view where hidden variant carries value: null", () => {
    const leaky = { yourCard: { id: "c1", hidden: true, value: null } };
    const result = checkForLeak(leaky, JSON.stringify(leaky), "value", "UNUSED");
    expect(result.leaked).toBe(true);
  });

  it("does not flag a correctly whitelist-constructed hidden card", () => {
    const clean = { yourCard: { id: "c1", hidden: true } };
    const result = checkForLeak(clean, JSON.stringify(clean), "value", "UNUSED");
    expect(result.leaked).toBe(false);
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A (this phase extends Phase 1's own newly-established pattern, not an industry migration) | — | — | — |

No externally-outdated patterns apply here — this phase's domain (whitelist projection, Zod strict validation, fast-check) is the project's own established convention, not a public library API that has changed.

**Deprecated/outdated:** None identified.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `fc.property` (plain arbitrary-driven) is a better fit than `fc.commands`/model-based testing for this phase's single-action-type toy, reserving `fc.commands` for Phase 3's richer rule set | Standard Stack / Alternatives Considered | Low — both approaches are valid fast-check patterns; if the planner prefers `fc.commands` for consistency with Phase 3 now, that is a reasonable, low-cost deviation, not a correctness risk |
| A2 | Bumping `ROOM_SCHEMA_VERSION` is the lower-risk fix for the persisted-`adapterId` gap versus adding an explicit `adapterId` check in `loadRoom` | Common Pitfalls / Pitfall 1 | Medium — if a future phase needs to swap adapters WITHOUT wanting a schema-version-triggered wipe (e.g. a hot adapter upgrade that preserves state), the version-bump approach would be wrong; not a concern for v1's roadmap (adapter swaps happen exactly twice: Phase 2 and Phase 4, both already treated as "the toy is deleted" events where a reset is desired) |
| A3 | A simple line-based `//` / `/* */` comment strip is sufficient for the D-09 structural test's exclusion logic, since `room-do.ts` has no string literal containing `//` | Common Pitfalls / Pitfall 3, Code Examples | Low — verified by reading the actual current file content in this session; would need revisiting only if a future edit introduces a URL or similar `//`-containing string literal into `room-do.ts` |
| A4 | The toy's opaque card ids (D-04) can be generated with a simple counter/nanoid at deal/draw time rather than needing cryptographic unpredictability, since the threat model is "does not correlate with pre-shuffle index," not "is unguessable by an adversary" | Standard Stack / Don't Hand-Roll (implicit) | Low — D-04's stated concern is correlation with deck composition, not adversarial guessing; `nanoid()` (already a project dependency via `apps/worker`/`apps/web`) or a simple incrementing counter both satisfy "not the pre-shuffle index," though `nanoid` is the safer default and keeps the property consistent with the rest of the project's id conventions |

## Open Questions

1. **Should the game-namespaced Zod view schema live in `packages/schema/src/games/forehead-card.ts` or directly inside `apps/worker/src/`?**
   - What we know: D-06 requires it NOT live in `packages/rules` (zero-dep, FDN-02) and requires exactly one registration point that generic room/transport code never imports directly.
   - What's unclear: `packages/schema` already depends on `zod` and is the project's existing "wire protocol" package, making it a natural home — but putting a game-specific schema inside a package whose whole design point (per FDN-01 canonical refs) is staying generic is a mild tension. Putting it in `apps/worker/src/` instead keeps `packages/schema` fully generic but means the worker owns both the game-agnostic wire schema AND the game-specific view schema in one app, which is also defensible (the worker is where adapter registration already happens).
   - Recommendation: Either is consistent with D-06 as written; lean toward `packages/schema/src/games/forehead-card.ts` (a games-namespaced SUBFOLDER, not a top-level export from `packages/schema/src/index.ts`) so the pattern is easy to repeat identically in Phase 4 (Hanabi's own view schema) without re-deciding architecture, while `packages/schema/src/index.ts`'s existing generic exports (`RoomViewSchema`, `ServerMessageSchema`, etc.) remain untouched and the games subfolder is imported only by `apps/worker`, never by `packages/rules` or `apps/web`'s generic code paths. Confirm this placement explicitly during planning since CONTEXT.md leaves it to Claude's discretion.

2. **Does `apps/web`'s `ForeheadCardGame.tsx` need its own local TypeScript type for the discriminated-union card shape, or can it import the Zod-inferred type from the new schema module?**
   - What we know: `apps/web` already imports `RoomView` from `@games/schema` and `CounterView` from `@games/rules` in the current `CounterGame.tsx`. The new game view type could come from either `@games/rules` (a plain TS type, zero-dep, matching the existing `CounterView` pattern) or `@games/schema`'s new games-namespaced Zod schema (`z.infer<...>`).
   - What's unclear: whether importing a Zod-inferred type into the web app for pure UI typing purposes is desirable, or whether the web app should keep depending on a plain TS type from `packages/rules` (as it already does for `CounterView`) to avoid pulling Zod-specific types into rendering code that doesn't validate anything itself.
   - Recommendation: Keep `apps/web`'s import pattern unchanged — a plain exported TS type from `packages/rules/src/forehead-card.ts` (mirroring `CounterView`), structurally compatible with (but not literally imported from) the Zod schema's inferred type. This avoids coupling the client bundle's type-checking to the validation-schema module and matches the existing precedent exactly.

## Environment Availability

No new external dependencies, services, or CLIs are introduced by this phase — it operates entirely within the Phase 1 stack (Vitest, fast-check, Zod, `wrangler dev`, Playwright), all already confirmed available in `.planning/phases/01-room-transport-skeleton/01-RESEARCH.md`'s Environment Availability audit. Skipped per the phase having no new external dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11, four `projects` (schema, rules, worker, web) per `vitest.config.ts` |
| Config file | `/home/rflor/games/vitest.config.ts` |
| Quick run command | `npx vitest run --project rules` (fast-check property tests, no network) or `npx vitest run --project worker -t "leak"` for a filtered subset |
| Full suite command | `npm test` (repo root — runs `vitest run` across all four projects, including the `worker` project's `wrangler dev` integration harness) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIDE-01 | Own card's value never in the serialized payload for any seat | unit + property + integration | `npx vitest run --project rules forehead-card.test.ts` (layer 1); `npx vitest run --project worker room-do.test.ts` (layer 3) | ❌ Wave 0 — new toy adapter + tests |
| HIDE-02 | Single projection function, no bypass path | structural (source) test | `npx vitest run --project worker source-structure.test.ts` | ❌ Wave 0 — new file |
| HIDE-03 | Hidden card structurally lacks the value field | unit (Zod schema rejection test) | `npx vitest run --project schema` (or wherever the game-view schema's own unit test lives — see Open Question 1) | ❌ Wave 0 — new schema + test |
| HIDE-04 | Automated leak test fails the build on a real leak | property + integration + canary | `npx vitest run --project rules leak-check.test.ts`; `npx vitest run --project worker leak-check.test.ts` (canary lives once, imported/asserted from both projects or duplicated — planner's call) | ❌ Wave 0 — new file |

### Sampling Rate
- **Per task commit:** `npx vitest run --project rules` and `npx vitest run --project schema` (fast, no network — seconds)
- **Per wave merge:** `npm test` (full suite, including the `worker` project's `wrangler dev` spawn/kill integration test — this is the slow one, already ~15-30s+ per Phase 1's `testTimeout`/`hookTimeout` overrides)
- **Phase gate:** Full suite green before `/gsd:verify-work`, per the existing Phase 1 convention

### Wave 0 Gaps
- [ ] `packages/rules/src/forehead-card.ts` + `.test.ts` — new toy adapter, replaces `counter-game.ts` (deleted per D-02)
- [ ] `packages/rules/src/shuffle.ts` — zero-dep seeded PRNG for deterministic deck order (D-04, WR-07 precedent)
- [ ] `packages/schema/src/games/forehead-card.ts` (or `apps/worker/src/` — see Open Question 1) — strict Zod view schema
- [ ] `apps/worker/src/leak-check.ts` + `.test.ts` — shared checker + canary (D-13)
- [ ] `apps/worker/src/source-structure.test.ts` — D-09's structural audit
- [ ] `apps/worker/src/room-do.test.ts` — extended with join/state/reconnect frame capture run through `leak-check.ts` (D-11 layer 3)
- [ ] `apps/web/components/ForeheadCardGame.tsx` — replaces `CounterGame.tsx`
- [ ] `e2e/start-game.spec.ts`, `e2e/in-progress-arrival.spec.ts` — updated to drive the toy instead of the counter

*(fast-check and zod frameworks themselves are already installed — only new test FILES are the Wave 0 gap, not new tooling.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Out of scope — no accounts (PROJECT.md) |
| V3 Session Management | Partial (inherited from Phase 1) | Seat-token bearer credential (`SeatTokenSchema`, RT-07) — unchanged this phase |
| V4 Access Control | Yes | Per-seat projection IS the access-control mechanism this phase hardens: a seat may see every OTHER seat's card but not its own — an authorization rule enforced server-side by construction (whitelist projection), not by client-side hiding |
| V5 Input Validation | Yes | `z.strictObject`/`z.discriminatedUnion` reject any unrecognized key on both inbound (`ClientMessageSchema`, unchanged) and — new this phase — the server's own OUTBOUND game view, validated before send (D-06/D-07) |
| V6 Cryptography | No | No new cryptographic material this phase; the existing `mintGameSeed` (128-bit CSPRNG) is reused unchanged, not reimplemented |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Information disclosure via over-broad serialization (own-hand leak) | Information Disclosure | Whitelist-construct every outbound object (D-05); validate the constructed object against a strict schema before it can be stringified (D-06/D-07) — this phase's entire scope IS this mitigation |
| Information disclosure via a secondary/forgotten send path | Information Disclosure | Single `#send` chokepoint (D-08) + structural source test (D-09) that fails the build if a second `connection.send`/`broadcast` call site appears anywhere in the worker |
| Information disclosure via a "looks safe but isn't" nulled/undefined field that survives serialization inconsistently across environments | Information Disclosure | Structural key-presence check (`"value" in entry`), not truthiness (D-12) — catches the case where JSON.stringify's undefined-dropping behavior would otherwise mask a real bug (Pitfall 2) |
| Predictable/correlatable identifiers leaking deck composition via card id (a side-channel distinct from the `value` field itself) | Information Disclosure | D-04: opaque card ids assigned at deal/draw time, not derived from pre-shuffle deck index |

## Sources

### Primary (HIGH confidence)
- `packages/rules/src/adapter.ts`, `packages/rules/src/counter-game.ts`, `packages/schema/src/room.ts`, `packages/schema/src/messages.ts`, `apps/worker/src/room-state.ts`, `apps/worker/src/room-do.ts`, `apps/worker/src/persistence.ts`, `apps/worker/src/seat-identity.ts`, `packages/schema/src/constants.ts`, `vitest.config.ts`, and all `package.json` files — read directly in this session, current repository state as of 2026-09-15
- `npm view fast-check version` / `npm view zod version` — directly queried 2026-09-15, confirmed `4.10.0`/`4.6.5` current against installed `4.9.0`/`4.5.4`
- `node_modules/partyserver/dist/index.d.ts` — directly grepped, confirmed a `broadcast(` method exists on the `Server` class (line 317), which D-09's structural test forbids calling

### Secondary (MEDIUM confidence)
- `zod.dev/api` (via WebSearch) — confirmed `z.strictObject`/`.strict()` throws on unrecognized keys; used for Pitfall 2's claim that Zod's key check operates on `Object.keys`, independent of JSON.stringify's undefined-dropping behavior. Not independently fetched via WebFetch in this session — WebSearch summary only, hence MEDIUM not HIGH, though this is standard, stable, well-documented Zod behavior unlikely to have changed.
- `fast-check.dev/docs/advanced/model-based-testing/` (via WebSearch) — confirmed `fc.commands`/`asyncModelRun` as the idiomatic model-based-testing API, informing the Alternatives Considered recommendation to use plain `fc.property` instead for this phase's simpler toy. Not independently fetched via WebFetch.

### Tertiary (LOW confidence)
None — all findings above were either directly verified against the repository/registry or cross-checked against official documentation via WebSearch.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing versions and their currency directly verified against npm registry
- Architecture: HIGH — every pattern recommended extends code read directly from the repository in this session, not inferred from training data
- Pitfalls: HIGH — Pitfall 1 (persisted adapterId gap) and Pitfall 3 (comment-fooled grep) were discovered by directly reading `persistence.ts` and `room-do.ts`'s actual current content, not hypothesized; Pitfall 2 is standard, well-documented Zod/JSON behavior

**Research date:** 2026-09-15
**Valid until:** 30 days (stable domain — no fast-moving external API surface; the one time-sensitive fact, dependency version currency, was directly re-verified today)

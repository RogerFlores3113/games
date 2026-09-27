# Phase 11: Adapter, Schemas & Worker Wiring - Research

**Researched:** 2026-09-27
**Domain:** Backend adapter wiring — Zod schemas, GameAdapter conformance, per-seat redaction, property-based leak testing
**Confidence:** HIGH

## Summary

This phase has no unknowns about *what* the engine does — Phases 9 and 10 already built and
property-tested the entire Expedition rules/run engine (`packages/rules/src/expedition/`). The
work here is a **wiring and redaction** phase: implement `ExpeditionAdapter` (the fifth
`GameAdapter` conformance, after Hanabi and Phase 8's test-only toy game), write Expedition's
`@games/schema` wire types (view + errors + create-room + `GameId` widening), register it in
`apps/worker/src/game-registration.ts`, and — the phase's real hard part — write
`toPlayerView` as an explicit-allowlist projection and a **real per-seat leak checker** that
runs across whole simulated runs (extending `run.property.test.ts`'s existing "interim"
structural checks, which its own header comments explicitly say Phase 11 must replace).

Every architectural seam this phase needs already exists and is documented with Phase-11
forward-pointers left by Phase 8/9/10 authors: `GameAdapter`'s 5-type-parameter generic
(`packages/rules/src/adapter.ts`), the registry (`apps/worker/src/game-registration.ts`), the
Hanabi adapter/projection/schema pattern to mirror (`packages/rules/src/hanabi/{adapter,
projection}.ts`, `packages/schema/src/games/hanabi.ts`), and the exact privacy contract already
written into `run/types.ts`'s header and the design spec's §6.4 ("A seat's view contains... A
view never contains..."). This phase does not invent new privacy rules — it implements ones
Phase 10 already specified and partially tested for.

**Primary recommendation:** Write `packages/rules/src/expedition/adapter.ts` and
`packages/rules/src/expedition/view.ts` (`toExpeditionPlayerView`) following the Hanabi
adapter/projection split exactly; mirror `packages/schema/src/games/hanabi.ts`'s strict,
field-by-field, own-hand-literal discipline for `packages/schema/src/games/expedition.ts`; then
extend `run.property.test.ts` (or a new sibling file) with a real per-seat leak checker that
calls `toExpeditionPlayerView` for every seat at every recorded state and asserts card-identity
containment.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `ExpeditionAdapter` (createInitialState/applyAction/toPlayerView/checkGameEnd) | Backend / Rules package | — | `packages/rules` is the framework-free engine package; the adapter is its sole seam to the room layer, per `adapter.ts` |
| Wire request validation (`unknown` → `RunAction`) | Backend / Rules package | — | Per `adapter.ts`'s invariant #2, the adapter (not the caller) validates hostile input; mirrors Hanabi's `isPlayRequest`-style guards in `actions.ts` |
| Wire view/error/create-room schemas | Backend / Schema package | — | `packages/schema` is the Zod boundary layer both Worker and Web import; game-specific schemas live under `packages/schema/src/games/*` and are never re-exported from the generic barrel |
| Registry entry (adapter + schemas + limits + error mapper) | Backend / Worker (API) | — | `apps/worker/src/game-registration.ts` is the ONLY file permitted to name a specific game outside `packages/rules`/`packages/schema/src/games/*` |
| Per-seat leak-checking property tests | Backend / Rules package (test-only) | — | Tests live beside the engine they check (`packages/rules/src/expedition/run/*.property.test.ts`), consistent with Phase 9/10's existing property-test placement |
| Landing-page picker enabling Expedition | Frontend (Next.js) | — | Explicitly OUT of scope for Phase 11 (Roadmap: Phase 12 flips the picker visible) — do not touch `apps/web/app/page.tsx`'s "coming soon" flag |

## Standard Stack

### Core
| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zod | 4.x (workspace-pinned; matches `packages/schema`'s existing Hanabi schemas) | Wire schema validation for Expedition's view/errors/create-room | Already the project's only validation library; every existing game schema (Hanabi) uses `z.strictObject` + closed enums exclusively — no alternative under consideration |
| Vitest | 4.1.11 [VERIFIED: package.json] | Unit + property-test runner | Already the project's sole test runner across all packages |
| fast-check | 4.9.0 [VERIFIED: package.json] | Property-based leak-checker and whole-run simulation extension | Already used by `run.property.test.ts`, `gear.contract.test.ts`, `boss.contract.test.ts` for the exact same "drive N random runs, assert an invariant at every step" shape this phase needs |

### Supporting
None — this phase adds zero new runtime dependencies. `packages/rules` remains
zero-dependency (FDN-02); `packages/schema`'s only runtime dependency is `zod`, already present.

### Alternatives Considered
None applicable — the stack is fully fixed by the existing monorepo conventions from Phases
1-10; introducing any new library here (e.g. a different schema validator, a different
property-testing framework) would break the "one validation library, one test runner" project
convention with no compensating benefit.

**Installation:** None required. No `npm install` needed for this phase.

## Package Legitimacy Audit

Not applicable — this phase installs no new external packages.

## User Constraints

No `11-CONTEXT.md` exists for this phase (planned under `--auto`, no discuss-phase run). The
constraints below are inferred from the phase description, ROADMAP.md's Phase 11 entry, and the
locked precedents Phase 8/9/10 already established (CONTEXT.md files for those phases, D-06/D-07/D-08/D-09
from Phase 8, and the privacy contract embedded in Phase 10's `run/types.ts` header and README).
Treat these as strongly-implied locked decisions, not open questions:

- **Locked:** `ExpeditionAdapter` must be a real, 5th `GameAdapter` conformance (mirroring
  Hanabi's structure exactly) — not a shortcut or a partial adapter.
- **Locked:** Expedition's `GameId` and registry entry are added to PRODUCTION
  (`GameIdSchema`, `GAME_REGISTRY`) in this phase, per Phase 8's own D-09 comment ("Expedition
  joins the enum and the registry in Phase 11"). This is backend wiring only — the **landing
  page's disabled "coming soon" picker option is untouched** (Phase 12's job per ROADMAP.md).
- **Locked:** Per the design spec §6.4/§6.6 (`docs/superpowers/specs/2026-09-22-expedition-design.md`),
  a seat's view contains: its own hand; every other hand's size only; objectives (all face-up
  ones, or **only its own** under Thick Fog); reveals addressed to it; public loadouts; its own
  draft offer only; removed cards; supplies/camp/phase; log entries addressed to it. A view
  never contains: another seat's cards except via an addressed reveal, the play deck or
  objective deck order, other players' draft offers, or `RunState.seed`.
- **Locked:** `checkGameEnd` returns Expedition's own end-result shape: outcome (won/lost),
  camp reached, supplies left (spec §6.6) — this is `GameEndResult`'s Expedition-specific
  analogue, a NEW type, not a reuse of Hanabi's `{ score, reason, band? }`.
- **Out of scope (deferred to later phases):** Phaser/UI rendering of Expedition (Phase 12+),
  enabling the landing-page picker (Phase 12), disconnect/pause semantics beyond
  `readySeatIds`'s existing pure-data field (explicitly called out as "Phase 11" in
  `run/types.ts`'s D-07 comment, but the reconnect/pause POLICY itself is UI-adjacent session
  work — this research treats "the seam exists and is data-only" as in scope, "new pause
  behavior" as likely out of scope; flagged as an open question below).

**Claude's discretion:** exact file names/splits inside `packages/rules/src/expedition/`
(e.g. `adapter.ts` + `view.ts` vs. a single file), whether the leak-checker property test is a
new file or an extension of `run.property.test.ts`, and the precise Zod schema structure for
Expedition's view as long as it is `z.strictObject` at every level and field-by-field mirrors
`RunState`'s Phase-11-visible subset.

## Standard Stack — Recommended Structure

## Architecture Patterns

### System Architecture Diagram

```
Wire (unknown JSON)
   |
   v
apps/worker: GameActionMessageSchema (request: z.unknown())  [existing, game-agnostic]
   |
   v
room-state.ts: applyGameAction(state, actorSeatId, actionId, request)
   |
   v
game-registration.ts: resolveGame("expedition") -> GameRegistryEntry
   |
   v
ExpeditionAdapter.applyAction(state: RunState, actorSeatId, request: unknown)
   |
   |-- 1. Guard: request is object, has known "type", exact keys  -> else invalid_action
   |-- 2. Narrow unknown -> RunAction (per-type type guards, mirrors Hanabi's isPlayRequest)
   |-- 3. Delegate: applyRunAction(state, actorSeatId, action, CATALOG)
   v
run-actions.ts: applyRunAction (Phase 10, unchanged) -> AdapterResult<RunState, RunError>
   |
   v
ExpeditionAdapter returns { ok, state } up to room-state.ts
   |
   v
room-state.ts: checkGameEnd(state) -> null | ExpeditionEndResult
   |
   v
toSeatView(state, seatId) [existing, game-agnostic]
   |
   v
ExpeditionAdapter.toPlayerView(state: RunState, seatId) -> ExpeditionView (unknown to worker)
   |         (explicit allowlist: own hand, other-hand SIZES only, own objectives full /
   |          others' objectives per objectiveAssignment hook, reveals filtered by audience,
   |          own draftOffer only, log filtered by entry.audience, NEVER seed/objectiveDeck order)
   v
seat-projection.ts: validateGameView -> ExpeditionViewSchema.parse(view)  [per-registry-entry, existing]
   |
   v
Wire (validated JSON) -> browser
```

### Recommended Project Structure
```
packages/rules/src/expedition/
├── adapter.ts          # NEW: ExpeditionAdapter object (mirrors hanabi/adapter.ts)
├── view.ts             # NEW: toExpeditionPlayerView (mirrors hanabi/projection.ts)
├── request-guards.ts    # NEW (or inline in adapter.ts): unknown -> RunAction type guards
├── run/
│   ├── types.ts         # EXISTING — RunState/RunAction/RunError, privacy notes already here
│   ├── run-actions.ts    # EXISTING — applyRunAction, the one dispatcher the adapter wraps
│   ├── lifecycle.ts      # EXISTING — createRun, runStatus (for checkGameEnd)
│   ├── catalog.ts        # EXISTING — production CATALOG the adapter imports
│   └── run.property.test.ts  # EXTEND: real per-seat leak checker (or new sibling file)
└── view.property.test.ts     # NEW (recommended): dedicated leak-checker property suite

packages/schema/src/games/
├── expedition.ts         # NEW: ExpeditionViewSchema, EXPEDITION_GAME_ID (mirrors hanabi.ts)
└── expedition-errors.ts  # NEW: ExpeditionErrorCodeSchema (mirrors hanabi-errors.ts)

packages/schema/src/
├── room.ts               # EDIT: GameIdSchema widens to z.enum(["hanabi", "expedition"])
└── create-room.ts        # EDIT: CreateRoomRequestSchema gains an expedition union member (config: z.null() or empty strictObject, per MGR-03 "Expedition: none in v2.0")

apps/worker/src/
└── game-registration.ts  # EDIT: GAME_REGISTRY gains an "expedition" entry (adapter, view/config schemas, limits {min:3,max:5}, error mapper, displayName)
```

### Pattern 1: Adapter as a thin delegation layer (mirror Hanabi exactly)
**What:** `ExpeditionAdapter`'s four methods contain no logic of their own — they delegate to
`run/lifecycle.ts` (`createRun`, `runStatus`), `run/run-actions.ts` (`applyRunAction`), and the
new `view.ts` (`toExpeditionPlayerView`). This is Hanabi's own pattern verbatim
(`packages/rules/src/hanabi/adapter.ts`).
**When to use:** Always, for this adapter — do not inline any rule logic in `adapter.ts`.
**Example:**
```typescript
// packages/rules/src/expedition/adapter.ts (sketch, following hanabi/adapter.ts:1-53)
import type { AdapterResult, GameAdapter } from "../adapter";
import { createRun, runStatus } from "./run/lifecycle";
import { applyRunAction } from "./run/run-actions";
import { CATALOG } from "./run/catalog";
import { toExpeditionPlayerView } from "./view";
import { parseRunAction } from "./request-guards";
import type { RunAction, RunError, RunState } from "./run/types";

export type ExpeditionConfig = null; // MGR-03: no settings in v2.0

export type ExpeditionEndResult = {
  outcome: "won" | "lost";
  campReached: number;
  suppliesLeft: number;
};

export const expeditionGame: GameAdapter<RunState, RunAction, ExpeditionConfig, ExpeditionEndResult, RunError> = {
  id: "expedition",

  createInitialState({ seatIds, seed }) {
    return createRun({ seatIds, seed }, CATALOG);
  },

  applyAction(state, actorSeatId, request): AdapterResult<RunState, RunError> {
    const parsed = parseRunAction(request);
    if (parsed === null) return { ok: false, error: "invalid_action" };
    return applyRunAction(state, actorSeatId, parsed, CATALOG);
  },

  toPlayerView(state, seatId) {
    return toExpeditionPlayerView(state, seatId, CATALOG);
  },

  checkGameEnd(state) {
    const status = runStatus(state);
    if (status === "in_progress") return null;
    return {
      outcome: status,
      campReached: state.campNumber,
      suppliesLeft: state.supplies,
    };
  },
};
```

### Pattern 2: Own-hand-literal, no-spread projection (Hanabi's D-07 discipline, reused)
**What:** Every object `toExpeditionPlayerView` returns is built field-by-field from named
values — no object spread, no `delete`, no omit helper. A hidden field is structurally absent
from the literal, not merely stripped.
**When to use:** For every nested object in the Expedition view — hands, objectives, reveals,
log entries, draft offers.
**Example (own hand vs. other hand sizes):**
```typescript
// Source: pattern from packages/rules/src/hanabi/projection.ts:47-60, adapted
function toOwnHandView(hand: Hand) {
  return { seatId: hand.seatId, cards: hand.cards.map((c) => ({ id: c.id, identity: c.identity })) };
}

function toOtherHandSizeView(hand: Hand) {
  // Deliberately NO `cards` key at all — not an empty array, not a
  // hidden-card-shape array. Structurally cannot leak a card count that
  // looks like card data.
  return { seatId: hand.seatId, size: hand.cards.length };
}
```

### Pattern 3: Reveal-gated card visibility for other seats
**What:** A viewer sees another seat's specific card identity ONLY when a `Reveal` in
`attempt.reveals` has `audience.includes(viewerSeatId)` for that `cardId`. This is layered ON
TOP of Pattern 2 (own hand full identity, other hands size-only) — reveals are an additive
allow-list, never a replacement of the base redaction.
**When to use:** Whisper, Spyglass, Signal Flare targets.
**Example:**
```typescript
function revealedCardsFor(state: RunState, seatId: string): ReadonlyMap<string, CardIdentity> {
  const map = new Map<string, CardIdentity>();
  const reveals = state.attempt?.reveals ?? [];
  for (const reveal of reveals) {
    if (reveal.audience.includes(seatId)) {
      const card = findCardById(state, reveal.cardId); // look up identity from the actual hand
      if (card) map.set(reveal.cardId, card.identity);
    }
  }
  return map;
}
```

### Pattern 4: Thick Fog objective omission (own vs. omitted, not own vs. masked)
**What:** When the composed `objectiveAssignment` hook returns `"face-down"` for the current
run/camp, a viewer's objectives array contains ONLY objectives where `ownerSeatId === seatId`.
Other seats' face-down objectives are omitted from the array entirely — not present as a
masked/placeholder entry. This directly satisfies Phase 11's Success Criterion #2.
**When to use:** Building the `objectives` field of the view.
**Example:**
```typescript
// Source: pattern derived from run/run-rules.ts's objectiveAssignment hook contract
// and boss/blind-orders.ts's header comment ("each player sees only their own").
function objectivesFor(camp: CampState, seatId: string, assignment: "face-up" | "face-down") {
  const visible = assignment === "face-down"
    ? camp.objectives.filter((o) => o.ownerSeatId === seatId)
    : camp.objectives;
  return visible.map(toObjectiveView); // status is still always included — XRULE-06 holds
}
```
**Open question:** Whether a face-down objective's mere EXISTENCE (owned by some other seat,
identity/order unknown) should still surface as a placeholder count for camp-progress UI
purposes. The design spec (§6.4) reads as "only its own" with no placeholder language — treat
absence as the default; flag as `[ASSUMED]` and confirm during planning/discuss if the UI later
needs a "N objectives still out there" counter (Phase 12+ concern, not blocking for Phase 11's
adapter work).

### Pattern 5: Draft offers and seed — per-seat field lookup, not a filter
**What:** `SeatRun.draftOffer` and `RunState.seed` are the two fields Phase 10's README
explicitly calls out as "Phase 11 must redact, not implemented in this package." `draftOffer`
redaction is a plain conditional field lookup (`seatId === viewerSeatId ? seat.draftOffer :
null`), not a filter over a shared list — there is no shared list; `SeatRun[]` already stores
each seat's own private offer. `seed` must simply never appear as a key in the view literal at
all (not `null`, not omitted-via-undefined — never write the key).
**When to use:** Building the `seats` view array and the top-level view object respectively.

### Anti-Patterns to Avoid
- **Filtering a shared array post-hoc:** Do not build a full public view first and then
  `.filter()`/`.map()` to redact — construct the redacted literal directly per seat, per
  Hanabi's own established discipline (`projection.ts`'s header comment forbids spread/delete/
  Object.assign for exactly this reason: a filter-after-build approach risks a future field
  addition silently leaking through an unfiltered path).
- **Trusting `request`'s shape before validating:** `applyAction`'s `request: unknown` must be
  guarded with exact-own-key checks per action `type` (mirroring Hanabi's `isPlayRequest`),
  never cast directly to `RunAction` — the wire is hostile input (adapter.ts invariant #2).
  Test-only: Hanabi's `isPlayRequest`-style guards check `Object.keys(request).length === N`.
- **Testing leak-freedom only "immediately after a reveal":** Phase 11's Success Criterion #1
  explicitly calls this out as insufficient. The leak checker must run at EVERY step of a
  simulated run's state array (`states` from `driveRun` in `run-test-support.ts`), not just the
  turn after a `Reveal` is created — a stale reveal from three attempts ago, or a
  loadout/draft-offer field, could leak on a turn with no reveal activity at all.
- **Re-deriving the `objectiveAssignment` hook per objective:** call
  `rulesFor(state, catalog).objectiveAssignment(state)` ONCE per `toPlayerView` call (it is
  camp-wide, not per-objective), mirroring how `run/compose.ts`'s `rulesFor` is documented as
  "recomputed on every call, never cached" but should still be computed once per view build,
  not once per field.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Redaction/allowlisting logic | A generic "omit these keys" helper or a runtime object-diffing redactor | Hanabi's field-by-field object-literal discipline, copied verbatim into `view.ts` | A generic redaction helper reintroduces exactly the "forgot to redact a new field" bug class Hanabi's own header comment calls out; the whole point of the literal-construction discipline is that a new `RunState` field requires a compile error (an unused-variable-shaped signal) at every view call site, not silent pass-through |
| unknown → RunAction parsing | A generic Zod schema for `RunAction` reused as the request validator | Explicit per-type hand-written guards (mirroring `isPlayRequest`) | Hanabi deliberately validates requests with hand-rolled guards, not Zod, at the adapter boundary — Zod is reserved for the OUTBOUND view/error schemas in `packages/schema`, which `packages/rules` must never import (FDN-02, zero-dependency) |
| Whole-run property test harness (seeded runs, boss pairs, loadouts) | A new test-generation harness for Phase 11 | `run-test-support.ts`'s existing `setupRun`/`driveRun`/`replayRun`/`advanceTo` | Phase 10 built and validated this harness already (`run.property.test.ts`); Phase 11 extends the SAME harness with an additional per-step assertion, it does not need a second harness |
| Boss-camp / gear leak coverage | New ad-hoc leak assertions per gear/boss file | The existing `gear.contract.test.ts` / `boss.contract.test.ts` "interim no-leak" assertions, upgraded in place to call the real `toExpeditionPlayerView` once it exists | Both files' headers explicitly say "Phase 11 extends this... (that projection does not exist yet in this phase)" — this is a planned upgrade point, not new work |

**Key insight:** Everything Phase 11 needs to build a correct, leak-free adapter was
deliberately staged by Phase 10's authors — private fields are already isolated into their own
records (`SeatRun.draftOffer`, `Reveal.audience`), logs are already structurally incapable of
carrying a card id (`LogEntry` has no such field), and the property-test harness driving whole
runs already exists. The risk in this phase is entirely in the CONSTRUCTION discipline of the
projection function (spread vs. literal) and in making the leak checker exhaustive (every step,
not just post-reveal), not in discovering new engine behavior.

## Common Pitfalls

### Pitfall 1: Testing leak-freedom only immediately after a reveal is created
**What goes wrong:** A leak checker that only asserts redaction correctness on the turn a
`Reveal` is added would miss a reveal that persists (correctly) for several turns, or a
draftOffer/seed field that leaks on a turn with zero reveal activity.
**Why it happens:** It's the natural place to check — right where the interesting event just
happened — but Success Criterion #1 explicitly requires checking "at every step... not only in
the turn immediately following a reveal's creation."
**How to avoid:** Call `toExpeditionPlayerView` for every seat, at every recorded state in
`driveRun`'s `states` array (the same array `run.property.test.ts`'s Property D already
iterates for card-conservation), and assert containment at every index.
**Warning signs:** A leak-check assertion nested inside an `if (event === "reveal")` branch.

### Pitfall 2: Own-hand card comparison producing false negatives in the leak checker
**What goes wrong:** A naive leak checker might flag a seat's OWN hand cards as "another seat's
card" if it does the comparison by scanning "does this view contain any card identity that
belongs to seat X" for `X !== viewer` without first excluding the viewer's own hand from that
scan, or (the opposite bug) accidentally excluding the reveal-permitted cards and reporting a
false leak on a legitimate Whisper/Spyglass reveal.
**Why it happens:** The containment check needs three disjoint buckets per viewer: own hand
(always visible), revealed cards (visible only via an addressed `Reveal`), and everything else
(never visible). Getting the set arithmetic wrong in either direction produces either a flaky
false-positive test or (worse) a checker that silently passes a real leak.
**How to avoid:** Build the "allowed card identities for this seat" set explicitly as
`ownHandCardIds ∪ {cardId : reveal ∈ reveals, viewer ∈ reveal.audience}`, then assert every
card identity appearing anywhere in the view (including nested in objectives, if any objective
kind ever carries a card) is a member of that set OR belongs to no seat (e.g. a discard/played
card, which is public in a trick-taking game once played face-up in a completed trick).
**Warning signs:** The leak checker passes trivially (0 assertions ever fail) across all 40+
fast-check runs — a suspiciously easy green suggests the checker isn't actually inspecting the
right shape.

### Pitfall 3: Forgetting that PLAYED cards are public (unlike Hanabi's discard pile analogy)
**What goes wrong:** Unlike a card sitting in a hidden hand, a card played into a completed or
current trick IS public — every seat sees every card ever played in a trick (that's how
trick-taking works; XRULE-02's "highest card of the led suit wins" requires every seat to see
what was played). A leak checker that treats "any card identity in the view" as suspect,
without excluding played-trick cards, will produce false positives on every single simulated
turn.
**Why it happens:** The mental model carried over from Hanabi (where even played/discarded
cards are just "less hidden," not universally public from turn one) doesn't map directly onto a
standard trick-taking game where played cards are always public.
**How to avoid:** The "allowed" set for containment checking must include: own hand, revealed
cards, AND every card identity appearing in `completedTricks`/`currentTrick` (public by the
rules of trick-taking) and `removedCards` (shown to everyone per XRULE-01). Only cards still
sitting in ANOTHER seat's hand, not yet played, not revealed to the viewer, are the actual leak
surface.
**Warning signs:** The leak checker fails on the very first fast-check run, on turn 1, before
any reveal or gear use has happened — a near-certain sign it's flagging public trick/discard
cards, not real hand leaks.

### Pitfall 4: `checkGameEnd`'s shape drifting from the wire schema (repeat of Hanabi's own guard)
**What goes wrong:** `game-registration.ts` already has a compile-time assertion pattern
guarding exactly this class of bug for Hanabi (`_AssertViewAssignable`,
`_AssertKeysMutuallyAssignable`) — an adapter's TS view type silently drifting from its Zod
wire schema, so the schema either rejects every real view or accepts a shape the adapter no
longer emits.
**Why it happens:** The view type and the Zod schema are maintained in two different packages
(`packages/rules` vs. `packages/schema`) by design (FDN-02 zero-dependency), so nothing
enforces they match except a manual assertion.
**How to avoid:** Add the SAME `[ExpeditionView] extends [ExpeditionViewWire]` /
`[HanabiErrorCode]`-style mutual-assignability compile-time assertions to
`game-registration.ts` for Expedition's view and error types, exactly mirroring lines 58-86 of
the existing file.
**Warning signs:** `npm run typecheck` passes but a real e2e/integration test gets a Zod parse
failure on every Expedition view send.

## Code Examples

### Registering Expedition in the production registry (mirrors Hanabi's own entry)
```typescript
// Source: pattern from apps/worker/src/game-registration.ts:135-146
export const GAME_REGISTRY = Object.freeze({
  [HANABI_GAME_ID]: defineGame<HanabiState, HanabiAction, Variant, GameEndResult, AdapterError>({
    /* ...unchanged... */
  }),
  [EXPEDITION_GAME_ID]: defineGame<RunState, RunAction, ExpeditionConfig, ExpeditionEndResult, RunError>({
    gameId: EXPEDITION_GAME_ID,
    displayName: "Expedition",
    adapter: expeditionGame,
    viewSchema: ExpeditionViewSchema,
    configSchema: ExpeditionConfigSchema, // z.null() — MGR-03: no settings in v2.0
    defaultConfig: null,
    limits: { min: 3, max: 5 }, // MGR-02, confirmed by REQUIREMENTS.md and 08-CONTEXT.md
    mapError: mapExpeditionError,
  }),
}) satisfies Readonly<Record<GameId, GameRegistryEntry>>;
```

### GameId widening (mirrors D-09's own forward-pointer comment)
```typescript
// packages/schema/src/room.ts
export const GameIdSchema = z.enum(["hanabi", "expedition"]);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Interim structural no-leak checks (`reveal.audience` non-empty, `LogEntry` key allowlist) in `gear.contract.test.ts`/`boss.contract.test.ts`/`run.property.test.ts` | Real per-seat `toPlayerView`-based containment checks | This phase (Phase 11) | These three test files' own header comments already document this as the planned upgrade; expect to EDIT existing tests, not just add new ones — the "interim" comments should be removed once the real checker lands, per the pattern established when Phase 10 itself resolved earlier "interim" markers (e.g. WR-01/WR-02 gap closures) |

**Deprecated/outdated:** None — this is the first Phase to implement the Expedition view; there
is no prior Expedition-specific approach being replaced, only the Phase 10 placeholder checks.

## Runtime State Inventory

Not applicable — this is a greenfield adapter-wiring phase, not a rename/refactor/migration.
No existing Expedition adapter, schema, or registry entry exists to migrate away from. (Note:
MGR-06's schema-version-bump reset pattern from Phase 8 already covers "a deploy resets saved
rooms" for any future wire shape change — no NEW migration concern is introduced by adding a
second game to an already-versioned envelope.)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Under Thick Fog, other seats' face-down objectives are omitted entirely from the view (no placeholder/count), not merely masked | Pattern 4 | Low-medium: if the design intent was actually "show a placeholder count," the planner would need one extra field; does not affect COMM-03/ENG-03 leak-freedom either way, since a placeholder count carries no card identity |
| A2 | `ExpeditionConfig` should be `null` (no settings) rather than an empty `strictObject({})` | Standard Stack / Structure | Low: either satisfies MGR-03 ("Expedition: none in v2.0"); a strictObject is marginally more extensible if settings are ever added, but `null` more directly signals "no config exists yet" |
| A3 | Expedition's seat limits are exactly `{ min: 3, max: 5 }` | Code Examples | Low: this is directly stated in `.planning/REQUIREMENTS.md` (MGR-02) and ROADMAP's Phase 8 goal text — treat as effectively CITED, not truly assumed, but flagged since Phase 11 is where it's actually wired into the registry for the first time |
| A4 | `readySeatIds`/disconnect-pause behavior needs NO new logic beyond what Phase 10 already modeled as pure data — Phase 11 only needs to READ it for view purposes, not add pause semantics | User Constraints | Medium: if the phase actually expects a disconnect/pause POLICY (distinct from Hanabi's own reconnect handling, which lives at the room layer, not the adapter), that would be additional undiscovered scope; recommend the planner explicitly confirm this boundary before writing tasks |

**If this table is empty:** N/A — see above.

## Open Questions (RESOLVED)

1. **Does Phase 11 need any new disconnect/pause behavior, or does it purely consume
   `readySeatIds` as already-modeled pure data?**
   - What we know: `run/types.ts`'s D-07 comment says "Whether a disconnected seat's un-readied
     state pauses the table... is entirely Phase 11's concern — there is no such action in
     RunAction, by design." `RunAction` has no explicit "pause" type.
   - What's unclear: whether "Phase 11's concern" means "Phase 11 must add pause behavior" or
     "Phase 11 merely inherits the room layer's existing per-seat `connected` tracking
     (`apps/worker/src/room-state.ts`'s `PublicSeat.connected`, already game-agnostic) with
     zero new adapter code."
   - Recommendation: Treat as OUT of Phase 11's scope unless the planner finds a specific
     requirement ID demanding it — COMM-03/ENG-03 (this phase's only two requirements) do not
     mention reconnection at all, and the room layer's existing `connected` flag is already
     game-agnostic per Phase 5 (v1.0)'s reconnect hardening. Flag for discuss-phase if the
     planner disagrees.
   - RESOLVED: Out of scope. Plan 11-03 adds no pause/disconnect behavior; ready state is exposed read-only as `seats[].ready`.

2. **Exact wire shape for objective/reveal/log view fields (field names, nesting).**
   - What we know: the design spec §6.4 lists the CONTENTS at a conceptual level (own hand,
     other-hand sizes, objectives per assignment mode, reveals, public loadouts, own draft
     offer, removed cards, supplies/camp/phase, addressed log entries) but does not give a
     literal wire schema — unlike Hanabi, which has years of shipped behavior to mirror
     field-for-field.
   - What's unclear: precise per-field names/types for the Expedition view schema.
   - Recommendation: The planner should derive the exact schema directly from `RunState`/
     `CampState`'s existing field names in `run/types.ts` and `state.ts`, mirroring Hanabi's
     "field-for-field mirror" convention (see `packages/schema/src/games/hanabi.ts`'s own
     header: "Field-for-field mirror of HanabiView"). This is design work appropriately left to
     planning/implementation, not a research gap — the CONTENTS are fully specified above; only
     naming is open.
   - RESOLVED: Plan 11-01 defines the exact `ExpeditionView` field list, derived from `RunState`/`CampState`; Plan 11-02 mirrors it field-for-field in Zod.

## Environment Availability

Not applicable — this phase has no external tool/service dependencies beyond the existing
monorepo's already-installed `zod`/`vitest`/`fast-check` (all verified present via
`package.json`). No new CLI, database, or network dependency is introduced.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (root; per-package `--project` selection, e.g. `--project rules`) |
| Quick run command | `npx vitest run --project rules packages/rules/src/expedition/adapter.test.ts` |
| Full suite command | `npm test` (root) — runs all workspace packages' vitest projects |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMM-03 | No seat's view/log ever contains another seat's card except via an addressed reveal, at every step of full simulated runs | property (fast-check) | `npx vitest run --project rules packages/rules/src/expedition/run/run.property.test.ts` (extended) or a new `view.property.test.ts` | ❌ Wave 0 — extend existing "interim" checks |
| ENG-03 | Property-based simulated runs (3/4/5 players, every boss twist, random loadouts) always end, never throw, conserve cards, never leak | property (fast-check) | Same file as above; extends the EXISTING `runInputArb`/`driveRun` harness (already covers boss pairs, loadouts, 3/4/5 players — only the leak assertion itself is new) | ✅ harness exists; ❌ leak assertion is new |
| (adapter conformance, no dedicated req ID but structurally required by the phase goal) | `ExpeditionAdapter` upholds all three `GameAdapter` invariants (no mutation, never throws on hostile `request`, `toPlayerView` is the only exit point) | unit | `npx vitest run --project rules packages/rules/src/expedition/adapter.test.ts` | ❌ Wave 0 |
| (view schema conformance) | `ExpeditionViewSchema` validates every view the adapter actually produces (mirrors Hanabi's compile-time assertion pattern) | unit + compile-time | `npm run typecheck` + `npx vitest run --project schema packages/schema/src/games/expedition.test.ts` | ❌ Wave 0 |
| (registry wiring) | `resolveGame("expedition")` returns a valid entry; seat limits 3-5 enforced; `GameIdSchema`/`CreateRoomRequestSchema` accept `"expedition"` | unit | `npx vitest run --project worker apps/worker/src/game-registration.test.ts` | ✅ file exists (extend), or check for `.test.ts` sibling |

### Sampling Rate
- **Per task commit:** targeted `npx vitest run --project rules <touched file>`
- **Per wave merge:** `npm run typecheck && npm test` (full workspace)
- **Phase gate:** Full suite green (including the extended property tests at their existing
  `numRuns` budgets — 40 for the combined replay+safety property, 15 for the cross-run
  determinism property, per `run.property.test.ts`'s existing configuration) before
  `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `packages/rules/src/expedition/adapter.ts` + `adapter.test.ts` — new
- [ ] `packages/rules/src/expedition/view.ts` (`toExpeditionPlayerView`) + a property/unit test
      file for it — new
- [ ] `packages/schema/src/games/expedition.ts` + `expedition.test.ts` — new (mirrors
      `hanabi.ts`/`hanabi.test.ts`)
- [ ] `packages/schema/src/games/expedition-errors.ts` — new (mirrors `hanabi-errors.ts`)
- [ ] Extend `packages/rules/src/expedition/run/run.property.test.ts`,
      `gear/gear.contract.test.ts`, `boss/boss.contract.test.ts` to call the real
      `toExpeditionPlayerView` in place of their documented "interim" structural checks
- [ ] `apps/worker/src/game-registration.ts` gains the Expedition entry; its existing test file
      (if any) needs a new-game-entry test mirroring Hanabi's own registry test coverage

*(Framework itself is fully present — Vitest/fast-check are already configured project-wide;
no framework install step needed.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Room/seat auth is handled entirely at the room layer (seat tokens), unchanged by this phase |
| V3 Session Management | No | Unchanged by this phase; `readySeatIds`/`connected` tracking is pre-existing, game-agnostic |
| V4 Access Control | Yes | Per-seat view redaction IS the access-control boundary this phase implements — `toPlayerView`'s allowlist discipline is the control |
| V5 Input Validation | Yes | `applyAction`'s `request: unknown` must be validated with exact-own-key type guards before use (mirrors Hanabi); `ExpeditionViewSchema`/`ExpeditionConfigSchema` are the Zod-level input/output validation at the wire boundary |
| V6 Cryptography | No | No new crypto surface; `RunState.seed` is not a credential, but must never be projected (an information-disclosure, not a cryptographic, control) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Own-hand/other-hand confusion in a redaction literal | Information Disclosure | Field-by-field object-literal construction (no spread/delete), per Hanabi's established discipline; compile-time `extends` assertion between adapter view type and Zod wire schema |
| Client asserting a `RunAction` shape carrying extra/spoofed keys (e.g. a `play-card` request also carrying a `resultingState` key) | Tampering / Spoofing | Exact-own-key guards per action type before narrowing `unknown` → `RunAction`, mirroring Hanabi's `isPlayRequest`'s `Object.keys(request).length !== N` check |
| Predicting future RNG draws via a leaked `seed` | Information Disclosure | `seed` is never written into any view literal, at any nesting level — enforced by the "own-hand-literal" construction discipline plus a dedicated leak-checker assertion specifically for `seed` |
| A gear/boss content author's new file accidentally leaking a card (e.g. a new gear's `apply` op forgetting to route through `reveal`) | Information Disclosure | `purity.test.ts`'s existing recursive scan (already covers all current and future files under `run/`, `gear/`, `boss/`) plus this phase's real per-seat leak checker running across EVERY registered gear/boss via the existing contract-test iteration pattern (`Object.entries(GEAR_REGISTRY)`/`Object.entries(BOSS_REGISTRY)`) |

## Sources

### Primary (HIGH confidence)
- `packages/rules/src/adapter.ts` — the `GameAdapter` interface and its three file-level invariants
- `packages/rules/src/hanabi/adapter.ts`, `packages/rules/src/hanabi/projection.ts` — the exact
  pattern this phase's adapter/view files mirror
- `apps/worker/src/game-registration.ts` — the registry, `defineGame`, `resolveGame`, and the
  existing compile-time view/error mutual-assignability assertion pattern
- `packages/schema/src/games/hanabi.ts`, `packages/schema/src/games/hanabi-errors.ts`,
  `packages/schema/src/room.ts`, `packages/schema/src/create-room.ts` — the wire-schema
  patterns and the exact `GameIdSchema`/`CreateRoomRequestSchema` widening points
- `packages/rules/src/expedition/run/types.ts` — `RunState`/`RunAction`/`RunError`/`Reveal`/
  `SeatRun`/`LogEntry` and their explicit Phase-11 privacy notes (seed, draftOffer, reveal
  audience)
- `packages/rules/src/expedition/run/run-actions.ts`, `run/lifecycle.ts` — `applyRunAction`,
  `createRun`, `runStatus`, the exact functions the adapter delegates to
- `packages/rules/src/expedition/run/run-test-support.ts`, `run/run.property.test.ts` — the
  existing whole-run property-test harness (`setupRun`/`driveRun`/`replayRun`) this phase
  extends, and its own header comments explicitly marking what Phase 11 must add
- `packages/rules/src/expedition/README.md` — ENG-01/ENG-02 recipes, the RNG stream-naming
  table, and the "Reveals are the only private channel" / "seed and draft offers are private"
  invariants section
- `docs/superpowers/specs/2026-09-22-expedition-design.md` §6.3-6.6 — the toolkit, hidden-
  information contract (exact "a view contains / never contains" list), randomness model, and
  adapter shape (owner-approved source of truth per REQUIREMENTS.md header)
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` — phase goal, success criteria, MGR-02
  (Expedition 3-5 seat limits), MGR-03 (no Expedition settings in v2.0), traceability table
- `.planning/phases/08-multi-game-rooms/08-CONTEXT.md` — D-06/D-07/D-08/D-09 (GameAdapter
  generics, error namespacing, registry shape, GameId/registry gating until Phase 11)
- `.planning/phases/10-run-layer-gear-engine-bosses/10-02-PLAN.md` — the explicit "RunState →
  Phase 11 per-seat view" trust-boundary row and T-10-04/T-10-05/T-10-06 threat register

### Secondary (MEDIUM confidence)
None required — every claim above traces to a primary source already in the repository.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, fully fixed by existing monorepo convention
- Architecture: HIGH — every seam (adapter interface, registry, schema pattern) already exists
  and is exercised by four prior working conformances (Hanabi + Phase 8's test-only toy game
  count as two; Phase 9/10's engine itself is the third "conformance" of the toolkit/hook
  pattern, though not a `GameAdapter` per se)
- Pitfalls: HIGH — sourced directly from Phase 10 authors' own forward-pointer comments and the
  design spec's explicit hidden-information contract, not speculative

**Research date:** 2026-09-27
**Valid until:** No expiry driven by external ecosystem drift (zero new external dependencies);
valid until the Expedition engine's `RunState`/`CampState` shapes change, which would only
happen via a future in-repo phase, not external staleness.

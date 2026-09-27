# Phase 10: Run Layer, Gear Engine & Bosses - Pattern Map

**Mapped:** 2026-09-26
**Files analyzed:** 28 (10 gear, 4 boss, 8 run/, 6 Phase 9 modifications)
**Analogs found:** 28 / 28 (all have a strong same-repo analog; Phase 9 is the load-bearing precedent for every new file)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `expedition/run/run-state.ts` | model + derived-state | CRUD (derived, not cached) | `expedition/camp.ts` (`campPhase`/`currentActorSeatId`/`checkCampOutcome`) | exact — same "derive, never cache" discipline, one layer up |
| `expedition/run/run-actions.ts` | controller/dispatcher | request-response (state transition) | `expedition/actions.ts` (`applyCampAction`) | exact — same dispatch-on-`action.type`, `AdapterResult` return shape |
| `expedition/run/compose.ts` | utility (functional composition) | transform | `expedition/rules.ts` (`CoreRules`/`baseRules`) | exact — this *is* the extension of that seam |
| `expedition/run/toolkit.ts` | service (mutation-surface boundary) | transform, invariant-preserving | `expedition/actions.ts` (`applyPickObjective`/`applyPlayCard` — pure `(state) => newState` primitives) + `expedition/test-support.ts` (`locateAllCards`) | role-match — Phase 9 has no toolkit-as-object precedent, but its pure non-mutating transition functions are the direct style ancestor |
| `expedition/run/balance.ts` | config (data table) | batch/lookup | `expedition/state.ts`'s `ObjectiveSlot` type + `docs` spec §4.3 table | role-match — no existing balance-table file, but `ObjectiveSlot` is reused unchanged |
| `expedition/run/draft.ts` | service (RNG-driven generator) | transform | `expedition/deck.ts` (`dealHands`, stream-name-per-seat convention) | exact — same `seedToRngState(seed, streamName)` per-entity pattern |
| `expedition/run/replay.ts` | service (attempt bookkeeping) | transform | `expedition/camp.ts` (`createCamp`'s seed-in, state-out determinism) | exact |
| `expedition/gear/gear-def.ts` | model + registry | lookup/dispatch | `expedition/objectives.ts` (`ObjectiveKindDef`, `KindRegistry`, `OBJECTIVE_KINDS`) | exact — explicitly the stated pattern to mirror (RESEARCH.md "Don't Hand-Roll") |
| `expedition/gear/{chatter,peek,broadcast,ghost,reroll,pickpocket,commandeer,jam,reassign,overclock}.ts` (10 files) | model (declarative content entry) | transform (pure `apply`) | `expedition/objectives.ts`'s per-kind `ObjectiveKindDef` const objects (`winCardKind`, `orderedKind`, etc.) | exact |
| `expedition/gear/gear.contract.test.ts` | test (registry contract) | batch (iterates registry) | `expedition/purity.test.ts` (directory-scan philosophy) + `objectives.test.ts` (per-kind assertions) | exact |
| `expedition/boss/boss-def.ts` | model + registry | lookup/dispatch | `expedition/objectives.ts`'s `KindRegistry` mapped type | exact |
| `expedition/boss/{radio-silence,eclipse,blind-orders,mutiny}.ts` (4 files) | model (declarative content entry, `Partial<CoreRules>`) | transform | `expedition/rules.ts` (`baseRules`'s per-hook implementations) | exact |
| `expedition/boss/boss.contract.test.ts` | test (registry contract) | batch | `expedition/purity.test.ts` + `gear.contract.test.ts` (sibling) | exact |
| `expedition/rules.ts` (MODIFIED — additive hooks) | model (hook-type contract) | transform | itself, Phase 9 version (additive, not rewritten) | exact |
| `expedition/trick.ts` (MODIFIED — route isTrump, WR-03) | service (rules primitive) | transform | itself, Phase 9 version | exact |
| `expedition/actions.ts` (MODIFIED — WR-05/WR-06 throw policy) | controller/dispatcher | request-response | `hanabi/actions.ts`'s throw-on-programmer-error precedent (see Shared Patterns) | role-match |
| `expedition/camp.ts` (MODIFIED — skip nextLeader after final trick) | model + derived-state | CRUD | itself, Phase 9 version | exact |
| `expedition/state.ts` (MODIFIED — additive `RunState`/`Reveal` types, or new `run/run-state.ts` types) | model | CRUD | itself, Phase 9 version (type-vocabulary file) | exact |
| `expedition/test-support.ts` (MODIFIED — run-level `driveRun`/`enumerateLegalRunActions`) | test-support utility | batch (simulation) | itself, Phase 9 version (`driveCamp`/`enumerateLegalActions`) | exact |
| `expedition/purity.test.ts` (MODIFIED — recurse into `run/`, `gear/`, `boss/`) | test (static guard) | batch | itself, Phase 9 version | exact |
| `expedition/README.md` (new — ENG-01 recipes) | docs | — | no code analog; write fresh per RESEARCH.md's recommended project structure | n/a |

## Pattern Assignments

### `expedition/run/run-state.ts` (model, derived-state)

**Analog:** `packages/rules/src/expedition/camp.ts` and `packages/rules/src/expedition/state.ts`

**Header-comment convention** (`camp.ts` lines 1-9, `state.ts` lines 1-20): every state/derivation file opens with a comment naming (a) which spec section/plan it realizes, (b) the "derive, never cache" discipline, and (c) any labeled assumption. Copy this convention for `run-state.ts` and note explicitly that `RunState` phase/outcome/capacity/supplies-vs-loss are all derived on every call, exactly like `campPhase`/`checkCampOutcome`/`currentActorSeatId`:

```typescript
// packages/rules/src/expedition/camp.ts lines 144-168
export function checkCampOutcome(state: CampState, rules: CoreRules = baseRules): CampOutcome {
  const statuses = objectiveStatuses(state);
  const failedObjectiveIds = statuses.filter((s) => s.status === "failed").map((s) => s.objectiveId);
  const firedFailureCheckIds = [...rules.failureChecks(state)];

  if (failedObjectiveIds.length > 0 || firedFailureCheckIds.length > 0) {
    return { status: "failed", failedObjectiveIds, firedFailureCheckIds };
  }
  if (statuses.every((s) => s.status === "done")) {
    return { status: "succeeded" };
  }
  return { status: "in_progress" };
}

export function campPhase(state: CampState, rules: CoreRules = baseRules): CampPhase {
  const outcome = checkCampOutcome(state, rules);
  if (outcome.status !== "in_progress") return "ended";
  const anyUnowned = state.objectives.some((o) => o.ownerSeatId === null);
  return anyUnowned ? "objective-pick" : "playing";
}
```

**Type-vocabulary pattern** (`state.ts` lines 107-126): `CampState` deliberately stores no phase/outcome/tricks-won field — mirror this exactly for `RunState`: no cached `runPhase`, no cached "camp N cleared" boolean, no cached capacity-vs-loadout-sum check. Compute `runPhase(state)`, `capacityRemaining(state, seatId)`, `suppliesExhausted(state)` as functions, never fields.

**Validation-at-setup pattern** (`camp.ts` lines 21-70, `validateSlots`): throw a plain `Error` describing the first violation for malformed *setup* input (e.g. a balance-table entry that's internally inconsistent) — this is the same policy `run-state.ts`'s setup helpers (fresh-attempt construction) should use.

---

### `expedition/run/run-actions.ts` (controller, request-response)

**Analog:** `packages/rules/src/expedition/actions.ts`

**Dispatch pattern** (`actions.ts` lines 91-107):
```typescript
export function applyCampAction(
  state: CampState,
  actorSeatId: string,
  action: CampAction,
  rules: CoreRules = baseRules,
): AdapterResult<CampState, CampError> {
  if (typeof action !== "object" || action === null) {
    return { ok: false, error: "invalid_action" };
  }
  if (action.type === "pick-objective") {
    return applyPickObjective(state, actorSeatId, action.objectiveId, rules);
  }
  if (action.type === "play-card") {
    return applyPlayCard(state, actorSeatId, action.cardId, rules);
  }
  return { ok: false, error: "invalid_action" };
}
```
`applyRunAction` should follow this exact shape: guard `typeof action !== "object"`, dispatch on `action.type`, delegate `pick-objective`/`play-card` unchanged into `applyCampAction(campState, actor, action, composedRulesForAttempt)` (per RESEARCH.md's Alternatives Considered — `RunAction` is a new superset type, not an extension of `CampAction`), and handle `whisper`/`use-gear`/`skip-window`/`pick-draft`/`set-loadout`/`ready` locally.

**Per-action legality-then-apply pattern** (`actions.ts` lines 19-33, `applyPickObjective`):
```typescript
function applyPickObjective(
  state: CampState,
  actorSeatId: string,
  objectiveId: string,
  rules: CoreRules,
): AdapterResult<CampState, CampError> {
  const legality = canPickObjective(state, actorSeatId, objectiveId, rules);
  if (!legality.legal) return { ok: false, error: legality.reason };

  const objectives = state.objectives.map((o) =>
    o.id === objectiveId ? { ...o, ownerSeatId: actorSeatId } : o,
  );

  return { ok: true, state: { ...state, objectives } };
}
```
Every new run-action handler (`use-gear`, `whisper`, etc.) should follow this same "legality check first, return the reason on failure, otherwise return a new spread-copied state" shape — never mutate `state` in place. `use-gear`'s legality check is the gear's own `canUse(ctx)` (GEAR-06), analogous to `canPickObjective`/`canPlayCard` from `legality.ts`.

**AdapterResult import convention** (`actions.ts` line 14): `import type { AdapterResult } from "../adapter";` — reuse the generic `AdapterResult<TState, TError>` type unchanged; do not invent a new result wrapper for `RunAction`.

---

### `expedition/run/compose.ts` (utility, hook composition)

**Analog:** `packages/rules/src/expedition/rules.ts`

**Additive-extension pattern** (`rules.ts` lines 1-14, 21-53): `CoreRules` is a flat object of named hook functions; `baseRules` is the one concrete value implementing every hook by delegating to existing pure functions. This phase's `compose.ts` builds new `CoreRules` values by layering `Partial<CoreRules>` overrides on top of `baseRules`:
```typescript
// packages/rules/src/expedition/rules.ts lines 21-53
export type CoreRules = {
  deckFor(playerCount: PlayerCount): readonly CardIdentity[];
  leaderFor(hands: readonly Hand[]): string;
  isTrump(identity: CardIdentity): boolean;
  trickWinner(plays: readonly TrickPlay[]): string;
  legalPlays(state: CampState, seatId: string): readonly ExpeditionCard[];
  nextLeader(state: CampState, trick: CompletedTrick): string;
  failureChecks(state: CampState): readonly string[];
};

export const baseRules: CoreRules = {
  deckFor: baseDeckFor,
  leaderFor,
  isTrump,
  trickWinner,
  legalPlays(state, seatId) { /* ... */ },
  nextLeader(_state, trick) { return trick.winnerSeatId; },
  failureChecks() { return []; },
};
```
Extend this exact type additively (new hooks appended, none renamed/removed) so every existing Phase 9 call site (`createCamp`, `checkCampOutcome`, `canPickObjective`, `canPlayCard`, `applyCampAction`) keeps compiling untouched — this is the load-bearing compatibility guarantee RESEARCH.md's Pattern 1 describes.

**Registry-as-mapped-type exhaustiveness pattern** (`objectives.ts` lines 206-219, `KindRegistry`):
```typescript
type KindRegistry = {
  readonly [K in ObjectiveKind]: ObjectiveKindDef<Extract<Objective, { kind: K }>>;
};

export const OBJECTIVE_KINDS: KindRegistry = {
  "win-card": winCardKind,
  ordered: orderedKind,
  "no-tricks": noTricksKind,
  "exactly-n": exactlyNKind,
};
```
Use this exact mapped-type-keyed-by-literal-union trick for `ALL_HOOK_NAMES`/hook exhaustiveness checking in `compose.ts`, and reuse it again for `GEAR_REGISTRY`/`BOSS_REGISTRY` (a missing registry line becomes a compile error, satisfying ENG-01).

---

### `expedition/run/toolkit.ts` (service, invariant-preserving mutation surface)

**Analog:** `packages/rules/src/expedition/actions.ts` (pure state-transition style) + `packages/rules/src/expedition/test-support.ts` (`locateAllCards`)

**Pure, non-mutating transform pattern** (`actions.ts` lines 35-57, `applyPlayCard`):
```typescript
const hands = state.hands.map((h) =>
  h.seatId === actorSeatId
    ? { seatId: h.seatId, cards: h.cards.filter((c) => c.id !== cardId) }
    : h,
);
// ...
return { ok: true, state: { ...state, hands, currentTrick } };
```
Every toolkit primitive (`moveCard`, `swapCards`, `reveal`, `addModifier`, `setNextLeader`) must follow this exact style: `.map`/spread to build new arrays/objects, never `.push`/index-assignment on the input, and return a wholly new top-level state object.

**Conservation-checking helper to extend** (`test-support.ts` lines 58-80, `locateAllCards`):
```typescript
export function locateAllCards(state: CampState): Map<string, string> {
  const locations = new Map<string, string>();
  const record = (id: string, location: string): void => {
    const existing = locations.get(id);
    locations.set(id, existing === undefined ? location : `${existing}+${location}`);
  };
  for (const hand of state.hands) {
    for (const card of hand.cards) record(card.id, "hand");
  }
  for (const trick of state.completedTricks) {
    for (const play of trick.plays) record(play.card.id, "trick");
  }
  for (const play of state.currentTrick.plays) record(play.card.id, "current-trick");
  return locations;
}
```
Extend this (or wrap it per-attempt) so `moveCard`/`swapCards` can internally assert "before === after, modulo the declared move" the way RESEARCH.md's Pattern 3 requires — this is the existing, only card-location-tracking primitive in the codebase; do not re-derive one.

**RNG-by-stream-name pattern for `ctx.rng(streamSuffix)`** (`shuffle.ts` lines 62-73, `seedToRngState`, and `deck.ts` lines 11, 135-145 for the calling convention):
```typescript
// packages/rules/src/shuffle.ts lines 62-73
export function seedToRngState(seed: string, stream: string): RngState {
  let state: RngState = cyrb128(`${stream}:${seed}`);
  for (let i = 0; i < 4; i++) {
    state = sfc32Step(state).state;
  }
  return state;
}
```
```typescript
// packages/rules/src/expedition/deck.ts lines 137-145 (calling convention)
let idRng = seedToRngState(seed, "expedition-card-ids");
const takenIds = new Set<string>();
const idCards: ExpeditionCard[] = [];
for (const identity of shuffled) {
  const minted = mintCardId(idRng, takenIds);
  idRng = minted.rng;
  takenIds.add(minted.id);
  idCards.push({ id: minted.id, identity });
}
```
`ctx.rng(streamSuffix)` must call `seedToRngState(runState.seed, streamSuffix)` fresh every time (never store/thread a live `RngState`), matching Assumption A1. Spyglass/Trained Monkey's random-card-selection must derive their stream name from `(runSeed, campNumber, attemptNumber, gear-use-sequence)` per RESEARCH.md's RNG section — never `Math.random()` (the `purity.test.ts` guard forbids the literal substring, see Shared Patterns below).

---

### `expedition/run/balance.ts` (config/data table)

**Analog:** `packages/rules/src/expedition/state.ts`'s `ObjectiveSlot` type (reused unchanged) + `deck.ts`'s constant-table style (`SUITS`, `STANDARD_RANKS`, `RANK_LABELS`)

**Plain-data-table pattern** (`deck.ts` lines 14-20, 36-57):
```typescript
export const SUITS: readonly Suit[] = ["spades", "hearts", "diamonds", "clubs"] as const;
export const STANDARD_RANKS: readonly StandardRank[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
] as const;
const RANK_LABELS: Record<StandardRank, string> = { /* ... */ };
```
`BALANCE_TABLE` should follow this same `Record<CampNumber, CampBalanceEntry>` const-table shape — plain exported data, no class, no builder function needed for the static parts. Reuse `ObjectiveSlot` (`state.ts` lines 87-91) verbatim as the balance table's per-slot type — do not redefine it.

---

### `expedition/run/draft.ts` (service, RNG-driven generator)

**Analog:** `packages/rules/src/expedition/deck.ts` (`dealHands`)

**Per-entity independent-stream pattern** (`deck.ts` lines 122-160, `dealHands`): the same seed produces independent, uncorrelated draws per distinct stream name; `dealHands` derives one stream (`"expedition-deck"`) for the shuffle and another (`"expedition-card-ids"`) for id minting. Draft offers should derive one stream per seat (`` `expedition-draft-${seatId}-camp${campNumber}` ``, per RESEARCH.md's Draft & Loadout section), following the exact same "distinct descriptive stream name, same seed" idiom — no new PRNG algorithm, only a new naming convention. Reuse `shuffleWithSeed`/`seedToRngState`/`nextRandom` from `../shuffle` unchanged, matching every other Phase 9 module's import (`import { mintCardId, seedToRngState, shuffleWithSeed } from "../shuffle";`, `deck.ts` line 11).

---

### `expedition/run/replay.ts` (service, attempt bookkeeping)

**Analog:** `packages/rules/src/expedition/camp.ts` (`createCamp`)

**Deterministic seed-in/state-out pattern** (`camp.ts` lines 76-142, `createCamp`): takes `{ seatIds, seed, objectiveSlots }` and produces a fully-formed, deep-equal-on-replay `CampState`, storing no seed/RNG state on the output. `rulesForAttempt(runState)` (composing rules) and `seedForAttempt(runSeed, campNumber, attemptNumber)` (deriving the composite per-attempt seed string) should mirror this: pure functions of their inputs, nothing hidden, nothing cached — exactly RESEARCH.md's own Code Examples section already sketches this against `createCamp`'s precedent.

---

### `expedition/gear/gear-def.ts` + 10 gear files (model, declarative content + registry)

**Analog:** `packages/rules/src/expedition/objectives.ts`

**Per-kind declarative-def-object pattern** (`objectives.ts` lines 56-60, 90-101):
```typescript
export type ObjectiveKindDef<O extends Objective> = {
  readonly id: O["kind"];
  describe(objective: O): string;
  evaluate(state: CampState, objective: O): ObjectiveStatus;
};

export const winCardKind: ObjectiveKindDef<WinCardObjective> = {
  id: "win-card",
  describe(objective) {
    return `Win the trick containing ${cardLabel(objective.target)}`;
  },
  evaluate(state, objective) {
    if (objective.ownerSeatId === null) return "pending";
    const trick = trickContaining(state, objective.target);
    if (trick === undefined) return "pending";
    return trick.winnerSeatId === objective.ownerSeatId ? "done" : "failed";
  },
};
```
Every `GearDef` (`gear/reassign.ts` etc.) is this exact shape one level richer: `{ id, name, size, window, text, targets, canUse(ctx): true | string, apply(ctx): RunState }`. One file per entry, one line in the registry — copy `objectives.ts`'s `winCardKind`/`orderedKind`/etc. as the literal template for file structure and doc-comment density (each kind def has a multi-line comment explaining its evaluation-order rationale; each gear file should have an equivalent comment citing its CONTEXT.md decision, e.g. D-08 for Signal Flare, D-10 for Trail Map).

**Registry pattern** (`objectives.ts` lines 210-219, shown above under compose.ts) — apply verbatim for `GEAR_REGISTRY: Record<GearId, GearDef>` and `BOSS_REGISTRY: Record<BossId, BossDef>`.

**Guard-order / evaluate-fresh-every-call discipline** (`objectives.ts` lines 90-129, `winCardKind`/`noTricksKind`/`exactlyNKind`): `canUse` must be recomputed fresh from `ctx.state` every call (no cached "already used" boolean read from anywhere but the per-attempt used-flags field) — same "derive, never cache" rule as the rest of the package.

---

### `expedition/gear/gear.contract.test.ts`, `expedition/boss/boss.contract.test.ts` (test, registry contract)

**Analog:** `packages/rules/src/expedition/purity.test.ts`

**Directory/registry-scan-not-hand-list pattern** (`purity.test.ts` lines 1-6, 38-60):
```typescript
const FORBIDDEN_TOKENS = [
  "node:", "from \"fs\"", "from 'fs'", "partyserver", "cloudflare:",
  "Math.random", "Date.now", "../hanabi/",
];

function sourceFiles(): string[] {
  return readdirSync(HERE).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
}

describe("expedition package purity", () => {
  it("imports no Node/Worker-specific runtime modules...", () => {
    const files = sourceFiles();
    for (const file of files) {
      const source = readFileSync(join(HERE, file), "utf-8");
      for (const token of FORBIDDEN_TOKENS) {
        expect(source.includes(token)).toBe(false);
      }
    }
  });
});
```
`gear.contract.test.ts`/`boss.contract.test.ts` should iterate `Object.entries(GEAR_REGISTRY)`/`Object.entries(BOSS_REGISTRY)` the same way this file iterates `readdirSync(HERE)` — no hand-written per-item assertion list, so a new 11th gear item needs zero test-file edits (ENG-01/ENG-02). RESEARCH.md's own sketch (lines 514-550 of RESEARCH.md) is ready to use nearly verbatim.

---

### `expedition/purity.test.ts` (MODIFIED — recurse into subdirectories)

**Analog:** itself (Phase 9 version, shown above)

Current implementation only scans `readdirSync(HERE)` non-recursively and has a hard-coded `MUST_BE_SCANNED` list (lines 25-36). Per RESEARCH.md Pitfall 2, this must be extended to recurse into `run/`, `gear/`, `boss/` (walk subdirectories, same forbidden-token scan, same `MUST_BE_SCANNED`-style completeness check extended per subdirectory) — do not simply add new flat files to dodge the gap, since ENG-01 explicitly wants subdirectory organization for 10 gear + 4 boss files.

---

### `expedition/actions.ts` (MODIFIED — WR-05/WR-06 throw policy)

**Analog for the "throw for programmer error" policy:** `packages/rules/src/hanabi/endgame.ts`'s and `packages/rules/src/expedition/camp.ts`'s existing throw-on-malformed-input convention (`camp.ts` lines 24-38, 123-128):
```typescript
// packages/rules/src/expedition/camp.ts lines 123-128
const expeditionLeaderSeatId = rules.leaderFor(hands);
if (!seatIds.includes(expeditionLeaderSeatId)) {
  throw new Error(
    `createCamp: leaderFor returned unknown seat ${expeditionLeaderSeatId}`,
  );
}
```
Per Pitfall 4 / Assumption A3, convert `actions.ts`'s current `return { ok: false, error: "invalid_rule_hook" }` (lines 71-76 today) to this same thrown-`Error` style, and apply the identical validation to `trickWinner`'s result (WR-05) and skip `nextLeader` once `completedTricks.length === state.totalTricks` (WR-06). This is a deliberate, documented policy change — flag the corresponding `actions.test.ts` assertion update in the plan.

---

## Shared Patterns

### Header-comment discipline (apply to every new file)
**Source:** every existing Phase 9 file (`rules.ts` lines 1-14, `state.ts` lines 1-20, `camp.ts` lines 1-9, `objectives.ts` lines 1-39, `test-support.ts` lines 1-12, `trick.ts` lines 1-10)
**Apply to:** all new `run/`, `gear/`, `boss/` files
Every file opens with a multi-line comment stating: which phase/plan/spec-section it realizes, which invariant/discipline it must uphold (derive-don't-cache, pure-never-mutate, no-second-copy-of-a-check), and any labeled assumption (`A-*`) or decision (`D-*`) it encodes. New gear/boss files should cite their governing `D-##` from `10-CONTEXT.md` explicitly (e.g. Trail Map cites D-10) the same way `objectives.ts` cites `A-TIE`/`A-LAST`/`A-END`.

### `rules: CoreRules = baseRules` trailing-parameter convention
**Source:** every Phase 9 Core function (`camp.ts`'s `createCamp`/`checkCampOutcome`/`campPhase`/`currentActorSeatId`; `actions.ts`'s `applyCampAction`; `legality.ts`'s `canPickObjective`/`canPlayCard`; `test-support.ts`'s `currentActor`/`enumerateLegalActions`/`driveCamp`)
**Apply to:** every new/modified function that behaves differently under a composed rule set. Never change an existing call site's signature — only add a new caller that passes a composed value instead of `baseRules`.

### Pure, non-mutating state transitions returning new objects
**Source:** `actions.ts` lines 28-32, 46-56 (`.map`/spread, never in-place mutation)
**Apply to:** all toolkit primitives, all `GearDef.apply`, all `BossDef.modifiers` closures, `run-actions.ts`'s handlers.

### RNG via `seedToRngState(seed, streamName)`, never a threaded live `RngState`
**Source:** `shuffle.ts` lines 62-73 (`seedToRngState`), `deck.ts` lines 137-145 (calling convention), doc comment at `shuffle.ts` line 63 ("different stream names on the same seed yield independent, uncorrelated generators")
**Apply to:** `toolkit.ts`'s `ctx.rng(...)`, `draft.ts`'s offer generation, `balance.ts`'s camp-5 trick-count resolution, Spyglass/Trained Monkey. Never call the forbidden `Math.random`/`Date.now` (banned literal substrings, see `purity.test.ts`) — and avoid writing those literal tokens even in comments (Pitfall 1).

### Registry-as-exhaustive-mapped-type
**Source:** `objectives.ts` lines 206-219 (`KindRegistry`/`OBJECTIVE_KINDS`)
**Apply to:** `GEAR_REGISTRY`, `BOSS_REGISTRY`, and `compose.ts`'s `ALL_HOOK_NAMES`/hook-name exhaustiveness check.

### `AdapterResult<TState, TError>` for every fallible transition
**Source:** `adapter.ts` lines 36-38; consumed by `actions.ts` line 14 and throughout `legality.ts`
**Apply to:** `run-actions.ts`'s `applyRunAction`, and any new toolkit function that can legitimately fail (most cannot — they're gated by `canUse` first, matching `canPickObjective`/`canPlayCard`'s "legality first" split).

### Directory/registry-scan test philosophy (never a hand-written per-item list)
**Source:** `purity.test.ts` lines 38-48 (`sourceFiles()` via `readdirSync`)
**Apply to:** `gear.contract.test.ts`, `boss.contract.test.ts`, and the extended `purity.test.ts` itself.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `expedition/README.md` | docs | — | ENG-01's recipe documentation has no existing codebase analog (Phase 9 has no README); write fresh, structured as "add a gear / add an objective kind / add a boss twist / add an interactable" recipes per RESEARCH.md's recommended structure |
| `expedition/run/toolkit.ts`'s `ToolkitContext` object-with-narrowed-capabilities shape | service | transform | No existing file in this repo restricts a content-author's surface area via a narrow context object (Phase 9's transition functions read/write `CampState` directly since there's no third-party content yet); RESEARCH.md's own Pattern 3 code sketch is the primary reference here, cross-checked against `actions.ts`'s pure-transform style for the *mutation implementation* half only |

## Metadata

**Analog search scope:** `packages/rules/src/expedition/` (all 20 files, Phase 9), `packages/rules/src/hanabi/` (`endgame.ts`, `hanabi-leak-check.ts`), `packages/rules/src/shuffle.ts`, `packages/rules/src/adapter.ts`
**Files scanned:** 24 read in full this session (all of `expedition/`'s non-test source files plus `rules.ts`, `state.ts`, `camp.ts`, `actions.ts`, `objectives.ts`, `test-support.ts`, `purity.test.ts`, `trick.ts`, `legality.ts`, `deck.ts`, `shuffle.ts`, `adapter.ts`, `hanabi/endgame.ts`, `hanabi/hanabi-leak-check.ts`)
**Pattern extraction date:** 2026-09-26

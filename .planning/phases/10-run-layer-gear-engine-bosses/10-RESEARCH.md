# Phase 10: Run Layer, Gear Engine & Bosses - Research

**Researched:** 2026-09-26
**Domain:** Layered pure-function game-rules composition (roguelite run state machine, declarative content catalogues), extending an existing framework-free TypeScript engine
**Confidence:** HIGH for architecture/composition design (grounded directly in Phase 9's committed code and the owner-approved spec); MEDIUM for RNG-threading and dispatch-shape specifics (reasoned extensions, flagged as assumptions below)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Phase Boundary
The full six-camp Expedition run as a pure rules layer in `packages/rules/src/expedition/`, built on the Phase 9 Core:
- supplies, fail-then-replay, and camp-number capacity
- the draft and loadouts
- the layered rule-hook composition (base → boss twist → gear), plus the toolkit and reveals
- the v1 gear catalogue (10 items), the 4 provisional boss twists, and the Whisper
- catalogue contract tests
- deterministic replay from the seed and action log

Requirements: COMM-01, COMM-02, RUN-01..07, GEAR-01..06, BOSS-01, ENG-01, ENG-02.

Out of this phase:
- `GameAdapter` registration, `toPlayerView`, zod schemas, worker wiring and the leak checker. Phase 11 owns these.
- Any Phaser or scene work. Phase 12+.
- GEAR-05 (confirm step) and GEAR-06 (visible reason) are UI-facing. This phase delivers only the engine side: final-once-resolved actions, and `canUse` returning a reason string.

### Locked Decisions

**Replay & boss rules**
- **D-01:** After a failed camp, the crew returns to the fireside before the replay. Players may re-pack their loadout within the same capacity; capacity stays the camp number, so failing never makes anyone stronger. Nobody drafts, because drafting happens only after a *cleared* camp.
- **D-02:** A failed boss camp keeps the same boss twist on replay. The twist is fixed per boss camp, not per attempt.
- **D-03:** Camp 6's twist is drawn from the boss pool minus camp 3's twist, so a run never repeats a boss twist.
- **D-04:** Rain Poncho cancels the twist for that attempt only. Used flags reset on replay (RUN-06), so the twist returns on a replay unless someone uses Poncho again.

**Draft & gear ownership**
- **D-05:** Different players may own the same gear. Offers exclude only gear the *offered player* already owns (spec §4.2 as written).
- **D-06:** Arriving at the fireside, a player's loadout defaults to their last loadout. New capacity is empty space they can fill. This applies after a cleared camp and before a replay.
- **D-07:** The next camp, or a replay, starts only when every player is Ready, with their draft picked if a draft is due. A disconnected player pauses the table in place until they reconnect, the same as Hanabi's pause. There is no host force-start.

**Gear edge-case rulings**
- **D-08:** Signal Flare (`broadcast`) must be armed *before* whispering. It is unusable once you have whispered this camp (`canUse` returns a reason). An armed Flare widens the audience of your **next** Whisper only, then it is spent. A second Whisper from Signal Whistle is private unless broadcast again.
- **D-09:** Machete (`commandeer`) is usable in **any** between-tricks window, including before trick 1, where it takes the first lead from the expedition leader. Objective picking happens before that window opens, so the expedition leader still picks the first objective.
- **D-10:** Trail Map (`reassign`) always swaps between **the user and one chosen teammate**. Its targets become a single `teammate` target rather than the spec's `player-pair`. Only unresolved objectives move; completed ones stay.
- **D-11:** Camouflage (`ghost`):
  - The dropped objective is **removed from play**: it no longer needs completing and cannot fail the camp.
  - Camouflage stays unusable once you have won a trick this camp (spec guard kept).
  - Its "win any trick → camp fails" check is stated over the whole camp, which the guard makes equivalent to "from activation onward". This was the owner's clarification, option 2.

**Window waiting & pacing**
- **D-12:** In the pre-deal window, the deal waits for each player with pre-deal gear equipped to use it or skip it. Players without pre-deal gear are never blocked.
- **D-13:** Between tricks there is no wait and no grace period. The window closes the moment the trick's leader plays, and actions are serialised in arrival order (spec §4.4).
- **D-14:** For camp 5's trick-count objective, the seeded RNG chooses between no-tricks and exactly-N. For exactly-N, N is drawn from a range in the balance table, so it can be tuned without code changes.
- **D-15:** The trick-count objective is a normal face-up objective in the pool, taken in the clockwise pick order. This matches Phase 9's A-TRICKCOUNT: N comes from the `ObjectiveSlot` input, supplied by the balance table.

### Claude's Discretion
- **Hook-robustness debt carried from Phase 9** (`09-VERIFICATION.md` deferred items, `09-REVIEW.md`):
  - WR-03: the `isTrump` hook is never called. Route the joker checks through it as part of hook composition.
  - WR-05: validate the `trickWinner` hook's result.
  - WR-06: a bad `nextLeader` result currently leaves the camp stuck, which must end. Pick one policy for rule-hook failures. Also skip `nextLeader` after the final trick.
  - All three must be resolved here, since this phase introduces the layered overrides that make them reachable.
- The shape of the hook-composition API (each layer receives the previous layer's answer, per spec §6.1), the toolkit's internal structure, and the balance-table format.
- How reveals are stored: a list of reveals with audiences, cleared at camp end or replay.
- Spyglass and Trained Monkey randomness: draw from the carried seeded RNG only, never `Math.random()`.
- Energy Tonic stacking: capacity +2 and +1 failure cost per equipped Tonic (spec §5.1). Duplicate ownership across players is allowed (D-05), so several Tonics can be equipped at once.
- Thick Fog: face-down random assignment of objectives. Choose the distribution rule for fewer objectives than players.

### Deferred Ideas (OUT OF SCOPE)
None came up in this discussion. Already deferred at milestone scoping: the best-run record, a "why we failed" moment, a "what can I do now" window signal, and multi-trick history (see spec §10 and REQUIREMENTS.md Future Requirements).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COMM-01 | Once per camp, after objectives are picked and only between tricks, a player can show one card from their hand to one teammate; whisperer/target public, card private | `Reveal` model (§6.4 below), `whisperAllowed`/`whisperAudience`/`whispersPerCamp` hooks, `between-tricks` window gating |
| COMM-02 | A private reveal (Whisper, Spyglass) stays visible to its audience for the rest of the camp; clears on camp end or replay | `RunState.reveals` lifecycle, cleared by the same replay/advance path that resets used flags |
| RUN-01 | 6 camps, camps 3/6 boss, counts/difficulty from the balance table | Balance Table section, boss-draw-at-first-reach design |
| RUN-02 | 3 supplies, -1 (+Tonic) per fail, replay with fresh deal/objectives, 0 = loss, camp 6 clear = win | Run State Machine section |
| RUN-03 | Capacity = camp number regardless of attempts | Run State Machine, capacity hook |
| RUN-04 | Draft 1-of-3 at run start and after each cleared camp; never already-owned; private offers | Draft & Loadout section |
| RUN-05 | Equip owned gear up to capacity between camps; loadouts public | Draft & Loadout section |
| RUN-06 | Each equipped gear usable once/camp in its window; used flags/modifiers/leader reset on replay | Replay Reset Contract section |
| RUN-07 | Deterministic replay from seed + action log | Deterministic RNG Threading section |
| GEAR-01..04 | v1 gear catalogue (info/objective/table/run gear) works as specced, with D-08..D-11 overrides | Gear Catalogue section, per-item code sketches |
| GEAR-05 | Confirm step before targeted gear/Whispers take effect; final once resolved | Explicitly UI-facing (Phase 12+); engine delivers atomic, non-reversible `apply` only — see Architectural Responsibility Map |
| GEAR-06 | Gear that can't be used shows the reason | `canUse(ctx): true \| string` contract |
| BOSS-01 | 4 provisional boss twists | Boss Catalogue section |
| ENG-01 | One file + one registry line per gear/objective/boss/interactable; README recipes | Don't Hand-Roll + Code Examples + README Recipes section |
| ENG-02 | Every catalogue entry auto-checked: unique id, valid size/window, deterministic effect, card conservation, no view leak (interim) | Catalogue Contract Tests section |
</phase_requirements>

## Summary

Phase 9 left a clean, well-documented seam for exactly this phase: `CoreRules` (7 hooks), `createCamp`/`applyCampAction` that already accept `rules: CoreRules = baseRules` as a trailing parameter everywhere, and three explicitly deferred hook-robustness gaps (WR-03/05/06) that the 09-REVIEW.md and 09-VERIFICATION.md frontmatter both say become reachable only once Phase 10 composes hooks that diverge from `baseRules`. This phase's job is threefold: (1) build a `RunState` that wraps repeated `CampState` attempts with supplies/capacity/draft/loadout/reveals/boss-twist-id bookkeeping, all replayable from a seed string plus the action log; (2) build a three-layer hook composer (`composeRules(base, boss, gear[])`) plus a small "toolkit" of invariant-preserving state-mutation primitives that gear/boss `apply`/`modifiers` functions are restricted to; (3) populate two one-file-per-entry catalogues (10 gear, 4 bosses) plus the Whisper mechanic, all validated by an automatic catalogue-contract test that scans the registry the same way `purity.test.ts` scans the directory.

The highest-leverage design decision is how randomness is threaded. Phase 9 established a strong, already-tested convention: **never store PRNG state in game state** — instead call `seedToRngState(seed, streamName)` fresh wherever randomness is needed, with the stream name carrying enough deterministic context (camp number, attempt number, gear-use sequence) to make every draw independent and replay-safe. This phase should extend that convention rather than literally "carrying a live RNG object" in `RunState`, which would require correctly threading and persisting mutated RNG state through every code path — a classic bug source the existing pattern was built to avoid. This is flagged as an assumption (deviates from a literal reading of spec §6.5) for planner/discuss-phase confirmation, but it is low-risk because it's a strictly safer instance of the same mechanism Phase 9 already committed and property-tested.

**Primary recommendation:** Build `RunState` as a thin wrapper around a per-attempt `CampState` plus run-scoped bookkeeping (supplies, camp number, attempt number, owned/equipped gear, drafted-but-unequipped gear, boss-twist ids, reveals, phase). Compose `CoreRules` fresh on every camp/replay from `(baseRules, bossDef?.modifiers, ...equippedGear.map(g => g.modifiers ?? deriveFromApply(g)))`, add the four new hooks (`whisperAllowed`, `whisperAudience`, `whispersPerCamp`, `objectiveAssignment`, `capacity`, `failureCost`) to `CoreRules`, close WR-03/05/06 as part of this composition work (they are literally unreachable without it), and give every catalogue entry (gear/boss/objective kind) a matching contract test generated by iterating the registry object, not a hand-written list.

## Architectural Responsibility Map

This project has no browser/API/DB tiers for this phase — it's a single pure-function package. The relevant "tiers" are the ROADMAP's own phase boundaries.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Run state machine (supplies, replay, capacity, draft, loadout, Ready-gating) | `packages/rules/src/expedition/` (this phase) | — | Pure, framework-free; Phase 11 only wires it to the room actor |
| Hook composition (base → boss → gear) | `packages/rules/src/expedition/` (this phase) | — | Extends Phase 9's `CoreRules` seam; Core call sites must stay boss/gear-name-agnostic |
| Toolkit (`moveCard`, `swapCards`, `reveal`, `addModifier`, ...) | `packages/rules/src/expedition/` (this phase) | — | The *only* way gear/boss code touches state — enforced by construction, not convention |
| Gear/boss/objective-kind catalogues | `packages/rules/src/expedition/` (this phase) | — | One file + one registry line each (ENG-01) |
| Catalogue contract tests (unique id, size/window, determinism, conservation, interim no-leak) | `packages/rules/src/expedition/*.test.ts` (this phase) | — | ENG-02; runs automatically over the registry |
| Confirm-step UX for targeted gear/Whispers (GEAR-05) | Phaser scene (Phase 12+) | Adapter validation (Phase 11) | Explicitly out of this phase's scope per CONTEXT.md; engine delivers only atomic, final `apply` |
| Real per-seat view / leak checker (COMM-03, ENG-03) | Adapter (Phase 11) | — | This phase only shapes reveals so Phase 11's `toPlayerView` can filter them; no `toPlayerView` exists yet |
| Worker wiring, `GameAdapter` registration, zod schemas | Worker/Adapter (Phase 11) | — | Out of scope here per ROADMAP boundary |

## Standard Stack

No new external packages. This phase extends `packages/rules` (`@games/rules`), which is a zero-runtime-dependency workspace package (`FDN-02`) — confirmed by reading `packages/rules/package.json` (no `dependencies` key) `[VERIFIED: repo file read]`. All logic must be pure TypeScript, reusing `packages/rules/src/shuffle.ts` (`seedToRngState`, `shuffleWithSeed`, `mintCardId`) unchanged.

### Core (already installed, reused)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | project's pinned 5.9.x (root config) | Language | Matches CLAUDE.md's 5.7+ pin and existing monorepo config `[VERIFIED: repo file read]` |
| Vitest | 4.1.11 | Unit/property test runner | Already the monorepo's test runner (root `package.json`) `[VERIFIED: npm ls]` |
| fast-check | 4.9.0 | Property-based testing | Already used throughout `packages/rules` (Phase 9's `*.property.test.ts` files) `[VERIFIED: npm ls]` |

### Supporting
None. No new libraries are needed for run/gear/boss logic — everything is plain data plus pure functions, matching Phase 9's established style.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Deriving every RNG stream from `(seed, descriptive-name)` per draw | Threading a literal mutable `RngState` object through `RunState`, mutated and persisted after every draw | The literal-threading approach matches spec §6.5's exact wording ("carried in state") but reintroduces exactly the "forgot to persist the new state" bug class Phase 9's `seedToRngState`-per-call convention was designed to avoid. Recommended: keep the by-name-derivation convention; flagged as an assumption below for owner confirmation, since it is a documented deviation from a literal spec reading. |
| A single closed `CampAction` union for both the Phase 9 Core and this phase's new action types | Extending `CampAction` itself | `actions.ts`'s Core file is documented as intentionally minimal (XRULE-08: no undo, no auto-play) and Phase 9's purity guard forbids expedition Core files from naming boss/gear ids. Recommended: a new `RunAction` superset type at the run layer, with `pick-objective`/`play-card` delegated unchanged into `applyCampAction`, and `whisper`/`use-gear`/`skip-window`/`pick-draft`/`set-loadout`/`ready` handled by a new run-level dispatcher. This keeps Core's file untouched and its purity guard meaningful. |

**Installation:** None required.

## Package Legitimacy Audit

Not applicable — this phase introduces zero new external packages. All new code lives in `packages/rules/src/expedition/`, which is a zero-runtime-dependency package by existing convention (`FDN-02`), and reuses only in-repo modules (`../shuffle.ts`, `../adapter.ts`) already present and already audited in prior phases.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| — | — | — | — | — | — | N/A — no new packages |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │              RunState                    │
                         │  seed: string                            │
                         │  campNumber, attemptNumber, supplies      │
                         │  perSeat: { ownedGearIds, equippedGearIds,│
                         │             draftOffer? }                │
                         │  bossTwistId (per boss camp, once drawn)  │
                         │  reveals: Reveal[]                        │
                         │  phase: "draft"|"loadout"|"pre-deal"|     │
                         │         "camp"|"run-end"                  │
                         │  camp: CampState | null  (current attempt)│
                         └───────────────┬───────────────────────────┘
                                         │ RunAction (superset of CampAction)
                                         ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                     applyRunAction (this phase)                │
        │  dispatch on action.type:                                      │
        │   pick-draft / set-loadout / ready  → run-phase transitions    │
        │   use-gear / skip-window / whisper  → toolkit ops on RunState  │
        │   pick-objective / play-card        → delegate to Phase 9's    │
        │                                        applyCampAction(state,  │
        │                                        actor, action, rules)   │
        └───────────────┬─────────────────────────────────┬─────────────┘
                         │                                 │
                         ▼                                 ▼
        ┌────────────────────────────┐      ┌───────────────────────────────┐
        │   composeRules(seed, camp) │      │   Phase 9 Core (unchanged      │
        │   base → bossDef.modifiers │──────▶   call sites, extra hooks     │
        │   → equippedGear.modifiers │ rules │   added additively to         │
        │   (fresh CoreRules value   │      │   CoreRules; WR-03/05/06       │
        │   built per camp/replay)   │      │   closed here)                 │
        └────────────────────────────┘      └───────────────────────────────┘
                         │
                         ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                    The Toolkit (§6.3)                          │
        │  moveCard / swapCards / replaceObjective / swapObjectives /    │
        │  reveal(card, audience) / addModifier(hooks) / setNextLeader / │
        │  log(event, audience) / rng(streamName)                        │
        │  — the ONLY functions gear.apply / boss.modifiers may call     │
        └───────────────────────────────────────────────────────────────┘
                         ▲                                 ▲
                         │                                 │
        ┌────────────────────────────┐      ┌───────────────────────────────┐
        │   Gear catalogue (10 files) │      │   Boss catalogue (4 files)     │
        │   GearDef{id,size,window,   │      │   BossDef{id,name,text,        │
        │   targets,canUse,apply}     │      │   modifiers: Partial<CoreRules>│
        └────────────────────────────┘      └───────────────────────────────┘
```

A reader can trace one full turn: a client sends a `RunAction` → `applyRunAction` dispatches → for a card play, rules are freshly composed for the current camp attempt and handed to Phase 9's unchanged `applyCampAction` → for gear/whisper, the toolkit is the only mutation surface, and any modifier the gear adds (e.g. Camouflage's failure check) is attached via `addModifier` and folds into the *next* rule composition (or the current one, if composition happens per-action rather than per-camp — see Open Questions).

### Recommended Project Structure
```
packages/rules/src/expedition/
├── state.ts            # Phase 9 — CampState/CampAction/CampError (UNCHANGED shape, additive CampError members only)
├── rules.ts             # Phase 9 CoreRules — EXTENDED additively with whisper*/objectiveAssignment/capacity/failureCost
├── camp.ts, actions.ts, legality.ts, objectives.ts, trick.ts, leader.ts, deck.ts, test-support.ts   # Phase 9, extended per WR-03/05/06 below
├── run/
│   ├── run-state.ts     # RunState type, phase derivation (mirrors camp.ts's derived-not-stored discipline)
│   ├── run-actions.ts   # RunAction type + applyRunAction dispatcher
│   ├── compose.ts        # composeRules(base, boss, gear[]) — the hook-layering mechanism
│   ├── toolkit.ts        # moveCard/swapCards/reveal/addModifier/log/rng — the only content-mutation surface
│   ├── balance.ts        # the balance table (camp -> objectiveSlots, boss-pool draw rules, Tonic constants, camp-5 N range)
│   ├── draft.ts          # draft-offer generation (RUN-04), private-offer redaction-readiness
│   └── replay.ts         # attempt bookkeeping: supplies, fresh-deal-per-attempt seed derivation, reset-on-replay contract
├── gear/
│   ├── gear-def.ts       # GearDef type, target-kind vocabulary, GEAR_REGISTRY
│   ├── chatter.ts, peek.ts, broadcast.ts, ghost.ts, reroll.ts, pickpocket.ts,
│   │   commandeer.ts, jam.ts, reassign.ts, overclock.ts   # one file per gear item (ENG-01)
│   └── gear.contract.test.ts   # ENG-02, iterates GEAR_REGISTRY
├── boss/
│   ├── boss-def.ts       # BossDef type, BOSS_REGISTRY
│   ├── radio-silence.ts, eclipse.ts, blind-orders.ts, mutiny.ts
│   └── boss.contract.test.ts   # ENG-02, iterates BOSS_REGISTRY
└── README.md             # ENG-01 recipes: add gear / objective kind / boss twist / interactable / card pack / hook
```

### Pattern 1: Additive `CoreRules` extension (never break Phase 9 callers)
**What:** Add the four new hooks from spec §6.1 to the existing `CoreRules` type as new, non-optional members with base-layer defaults in `baseRules`, exactly like Phase 9 added its 7 hooks with `baseRules` defaults.
**When to use:** Every new hook this phase needs.
**Example:**
```ts
// packages/rules/src/expedition/rules.ts — additive extension
export type CoreRules = {
  // ...Phase 9's 7 hooks, unchanged signatures...
  whisperAllowed(state: CampState, seatId: string): boolean;
  whisperAudience(state: CampState, seatId: string, targetSeatId: string): readonly string[];
  whispersPerCamp(state: CampState, seatId: string): number;
  objectiveAssignment(state: CampState): "face-up" | "face-down";
  capacity(state: RunState, seatId: string): number;
  failureCost(state: RunState): number;
};

export const baseRules: CoreRules = {
  // ...Phase 9's 7 base implementations, byte-for-byte unchanged...
  whisperAllowed: () => true,
  whisperAudience: (_state, _seatId, targetSeatId) => [targetSeatId],
  whispersPerCamp: () => 1,
  objectiveAssignment: () => "face-up",
  capacity: (_runState, _seatId) => _runState.campNumber,
  failureCost: () => 1,
};
```
Every Phase 9 call site (`createCamp`, `checkCampOutcome`, `canPickObjective`, `canPlayCard`, `applyCampAction`) keeps working unchanged because `rules: CoreRules = baseRules` already defaults, and none of them read the four new hooks — only this phase's new run-level code does.

### Pattern 2: Hook composition (`composeRules`)
**What:** Build one `CoreRules` value per camp attempt by layering `baseRules`, then the boss's `modifiers` (a `Partial<CoreRules>`), then each equipped gear's `modifiers` (also `Partial<CoreRules>`) in loadout order, then any mid-camp `addModifier`-attached modifiers (Camouflage) — each layer's hook implementation receives the *previous* layer's hook as an argument, per spec §6.1: "Each hook receives the previous layer's answer and returns its own."
**When to use:** Recomposed fresh at the start of every camp attempt (including replays — this is how RUN-06's "reset on replay" is satisfied structurally: a stale modifier simply isn't in the list next time), and again whenever a mid-camp modifier is added (Camouflage).
**Example:**
```ts
// packages/rules/src/expedition/run/compose.ts
type HookName = keyof CoreRules;

function composeOne<K extends HookName>(
  base: CoreRules[K],
  layers: readonly Partial<CoreRules>[],
  name: K,
): CoreRules[K] {
  return layers.reduce<CoreRules[K]>((prev, layer) => {
    const override = layer[name];
    return override === undefined ? prev : (override as CoreRules[K]);
    // NOTE: "receives the previous layer's answer" for hooks whose override
    // needs to WRAP rather than REPLACE (e.g. Poncho's whisperAllowed must
    // AND with the base result, not just return its own) is a per-hook
    // authoring convention: a wrapping override closes over `prev` itself,
    // e.g. `whisperAllowed: (state, seat) => false` for a hard block, or
    // `(state, seat) => prev(state, seat) && myCondition` for a narrowing
    // override. This function only walks layers in order; each Partial's
    // author decides whether their function calls `prev`.
  }, base);
}

export function composeRules(
  base: CoreRules,
  boss: Partial<CoreRules> | undefined,
  gearModifiers: readonly Partial<CoreRules>[],
  extraModifiers: readonly Partial<CoreRules>[] = [], // mid-camp additions (Camouflage)
): CoreRules {
  const layers = [boss ?? {}, ...gearModifiers, ...extraModifiers];
  const composed = {} as CoreRules;
  for (const name of ALL_HOOK_NAMES) {
    composed[name] = composeOne(base[name], layers, name);
  }
  return composed;
}
```
`ALL_HOOK_NAMES` must be a literal `const` array of every `CoreRules` key, kept in sync by a compile-time exhaustiveness check (mirrors `objectives.ts`'s `KindRegistry` mapped-type trick), so adding a hook without adding it to the array is a type error, not a silent no-op.

### Pattern 3: The toolkit as the only mutation surface
**What:** A small set of pure functions taking `(state, ...) => newState` that gear/boss code is *structurally* restricted to, by giving `apply`/`modifiers` a narrow `ToolkitContext` object rather than the raw `RunState`/`CampState`.
**When to use:** Every gear `apply`, every boss `modifiers` closure, Whisper handling, Signal Flare arming.
**Example:**
```ts
// packages/rules/src/expedition/run/toolkit.ts
export type ToolkitContext = {
  readonly self: string; // acting seatId
  readonly state: RunState; // read-only
  target(index: number): string; // resolves a declared target by index
  chosenCard(index: number): string; // resolves a declared own-card target
  handSize(seatId: string): number;
  rng(streamSuffix: string): RngState; // derives a fresh, deterministic stream (see RNG section)
  // --- state-changing primitives; return a NEW RunState, never mutate ---
  moveCard(cardId: string, fromSeatId: string, toSeatId: string): RunState;
  swapCards(seatA: string, cardIdA: string, seatB: string, cardIdB: string): RunState;
  replaceObjective(objectiveId: string): RunState;
  swapObjectives(seatA: string, seatB: string): RunState; // unresolved only (D-10)
  reveal(cardId: string, audience: readonly string[]): RunState;
  addModifier(hooks: Partial<CoreRules>): RunState;
  setNextLeader(seatId: string): RunState;
  log(event: string, audience: readonly string[] | "public"): RunState;
};
```
`GearDef.apply(ctx: ToolkitContext): RunState` can *only* reach state through these calls — there is no escape hatch to `ctx.state` mutation, because `ctx.state` is typed `readonly`/frozen and every mutator returns a new `RunState`. This is what "keeps invariants by construction" (spec §6.3) means concretely: `moveCard`/`swapCards` internally assert card conservation before returning, so a buggy gear author cannot accidentally duplicate or drop a card — the toolkit function itself would throw.

### Pattern 4: Declarative gear definitions with contract-testable shape
**What:** `GearDef` as flat data plus two small functions (`canUse`, `apply`), matching spec §6.2's example almost verbatim, with D-10's Trail Map override applied.
**Example:**
```ts
// packages/rules/src/expedition/gear/reassign.ts (Trail Map, D-10)
import type { GearDef } from "./gear-def";

export const reassign: GearDef = {
  id: "reassign",
  name: "Trail Map",
  size: 3,
  window: "between-tricks",
  text: "Swap your unresolved objectives with one teammate's. Completed objectives stay.",
  // D-10: a single `teammate` target, not the spec's `player-pair` — the
  // user is always one side of the swap.
  targets: [{ kind: "teammate" }],
  canUse: (ctx) => {
    const teammate = ctx.target(0);
    const mine = unresolvedObjectivesOf(ctx.state, ctx.self);
    const theirs = unresolvedObjectivesOf(ctx.state, teammate);
    if (mine.length === 0 && theirs.length === 0) return "Neither of you has an unresolved objective";
    return true;
  },
  apply: (ctx) => ctx.swapObjectives(ctx.self, ctx.target(0)),
};
```

### Anti-Patterns to Avoid
- **Reading or writing `RunState`/`CampState` fields directly from gear/boss files.** Breaks the "toolkit is the only mutation surface" invariant (spec §6.3) and makes card-conservation/no-view-leak contract tests meaningless (they only guard the toolkit's own functions).
- **Hard-coding a gear or boss id inside a Core file** (`camp.ts`, `actions.ts`, `objectives.ts`, `trick.ts`, `legality.ts`). Phase 9's `purity.test.ts` already forbids `../hanabi/` imports and nondeterministic APIs from Core files; this phase should extend that same guard (or add a sibling one for `run/`, `gear/`, `boss/`) to forbid Core files from importing anything under `gear/` or `boss/`.
- **Storing "tricks won" or "objective status" as a mutable field anywhere in `RunState`.** Phase 9's `state.ts` header is explicit that these are always derived from `completedTricks`; Trail Map's mid-camp ownership swap (D-10) is exactly the scenario that discipline was written to protect — a cached field would need manual invalidation that a holder swap would otherwise silently miss.
- **Persisting a live, mutated PRNG `RngState` object as a `RunState` field and threading it through every action handler.** See the RNG section below — recommended instead: derive-by-name from the stored seed string, matching Phase 9's own convention and avoiding a whole bug class (forgetting to persist the advanced state after a draw).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Card ownership tracking across swaps/reveals | A custom card-location index | The toolkit's `moveCard`/`swapCards`, verified by `locateAllCards` (already exists in `test-support.ts`, extend for `RunState`) | Phase 9 already built and property-tested a "every card in exactly one place" invariant checker; reuse it rather than re-deriving location logic per gear item |
| Objective-kind dispatch | A chain of `if (kind === ...)` in run code | The existing `KindRegistry`/`OBJECTIVE_KINDS` mapped-type pattern from `objectives.ts`, mirrored for `GEAR_REGISTRY`/`BOSS_REGISTRY` | Guarantees a missing registration is a compile error (exhaustiveness), which is exactly ENG-01's "one file plus one registry line" promise — the registry's *type* is what makes a forgotten line fail fast |
| Deterministic id generation for reveals/log entries/objectives | A new id scheme | `mintCardId`/`seedToRngState` from `shuffle.ts`, with a new stream name per id kind (mirrors `deck.ts`'s `"expedition-card-ids"` / `"expedition-objective-ids"` pattern) | Already proven collision-free and replay-deterministic; a second id scheme would need its own collision-avoidance and determinism proof |
| Contract-testing catalogue entries | Hand-written per-item test files asserting "id is unique" etc. | One generic contract test that iterates `Object.values(GEAR_REGISTRY)` (mirrors `purity.test.ts`'s directory-scan-not-hand-list philosophy) | ENG-01/ENG-02 explicitly require that adding an entry needs no test-file edit; a hand-written per-item list would violate that the moment someone forgets to add their new gear's row |

**Key insight:** Phase 9 already solved "how do you keep a registry-based extensible system honest" twice (the `KindRegistry` mapped type for objectives, and `purity.test.ts`'s directory scan for source files). This phase's job is to apply the *same two solved patterns* to two more registries (gear, boss) rather than inventing new validation machinery.

## Reveal Model (COMM-01/02)

A `Reveal` is `{ cardId: string; audience: readonly string[]; source: "whisper" | "spyglass" | "signal-flare" }`. `RunState` (or the current camp-attempt wrapper) carries `reveals: readonly Reveal[]`.

- **Whisper** (COMM-01): once per camp per seat (`whispersPerCamp` hook, base = 1, Signal Whistle's gear modifier returns 2), only after objective-pick is complete and only in the `between-tricks` window (`whisperAllowed` hook checked, `campPhase(camp) === "playing"` and no trick currently mid-resolution). Calling it creates a `reveal(cardId, whisperAudience(state, self, targetSeatId))` — base `whisperAudience` returns `[targetSeatId]`; an *armed* Signal Flare (D-08) widens this to all seats for exactly the next Whisper, then un-arms itself (a `RunState`-scoped per-seat `flareArmed: boolean` flag, reset like other used-flags on replay). The "whisperer/target public" half of COMM-01 is a `log(event, audience: "public")` call alongside the private `reveal` call — logs and reveals share the audience-tagging mechanism per spec §6.3.
- **Spyglass** (`peek`): also a `reveal`, audience = `[self]` only, card chosen randomly from the target's hand via `ctx.rng(...)`.
- **Reveal lifetime** (COMM-02): reveals live on the per-attempt camp wrapper (not the run-level draft/loadout state), so they are naturally cleared by the same "start a fresh camp attempt" path that resets used-flags and modifiers (RUN-06) — no separate clearing logic needed if reveals are stored alongside `CampState` in the run wrapper rather than at the top `RunState` level.

**Interim leak assertion for ENG-02** (Phase 11 owns the real per-seat view): since no `toPlayerView` exists yet, the catalogue contract test's "no view leak" check must be a structural stand-in — assert that every `reveal`/`log` call a gear's `apply` makes carries an audience that is a subset of `state.seatIds`, and that `apply`'s returned `RunState` contains no *new* card-identity information reachable outside a `reveal`/`log` entry (i.e., diff the returned state against the input state for any hand/objective field that changed without a matching toolkit call — achievable by making `moveCard`/`swapCards`/`reveal` the only functions capable of producing such a diff, then asserting by construction rather than by re-implementing a leak checker here). Document this explicitly as an interim, narrower check than Phase 11's real leak checker.

## Run State Machine (RUN-01..03, RUN-07)

**Phases** (derived, not stored, per Phase 9's `campPhase`/`currentActorSeatId` discipline):
`draft` (initial gear draft, run start) → `loadout` (fireside: pack gear up to capacity) → `pre-deal` (D-12 window, only if anyone has pre-deal gear equipped) → `camp` (the wrapped `CampState`, `objective-pick`/`playing`/`ended` sub-phases as today) → on camp end: `succeeded` → `loadout` for next camp (with a `draft` sub-step first per RUN-04) or `run-end` (won, if camp 6); `failed` → `loadout` (D-01: re-pack only, no draft) → `pre-deal` → `camp` (replay) or `run-end` (lost, if supplies hit 0).

**Ready gating (D-07):** a `ready: Set<seatId>` (or per-seat boolean) at the run level; the phase only advances once every connected seat is Ready, mirroring the pattern implied by "the same as Hanabi's pause" — research the existing Hanabi pause/reconnect mechanism in `apps/worker` (outside this phase's package boundary, but the *shape* of "disconnected seat pauses the table" should be mirrored by the pure rules layer exposing a phase that simply never advances past `loadout`/`pre-deal` until Ready-set === connected-seat-set; the actual disconnect detection is Phase 11/worker's job, not this phase's).

**Capacity (RUN-03):** `capacity(state, seatId)` hook — base returns `state.campNumber` (not attempt-dependent, satisfying "capacity stays the camp number, so failing never makes anyone stronger"); Energy Tonic's gear modifier layers `+2` per equipped Tonic on top of the previous layer's answer (this is a case where the composed hook *must* call `prev(...)` and add, not replace — see Pattern 2's note on wrapping vs. replacing overrides).

**Supplies (RUN-02):** `RunState.supplies: number`, starts at 3. On camp failure: `supplies -= failureCost(composedRules, runState)`; base `failureCost` = 1, each equipped Energy Tonic layer adds +1 (again a wrapping override). `supplies <= 0` → `run-end` with `status: "lost"`. Camp 6 cleared → `run-end` with `status: "won"`.

**Deterministic replay (RUN-07):** see the dedicated RNG section below; the load-bearing property is that `RunState` plus the full ordered list of applied `RunAction`s (the "action log") must be sufficient to reconstruct every intermediate state byte-for-byte, including which camp attempt is being played, which boss twist was drawn, what every draft offer was, and what every gear's random effect produced.

## Draft & Loadout (RUN-04, RUN-05, D-05, D-06)

- **Draft offers:** per seat, 3 gear ids drawn from `GEAR_REGISTRY` minus that seat's already-owned gear ids (D-05: exclusion is per-offered-player, so two players can be offered — and pick — the same gear id independently). Draw via `seedToRngState(seed, \`expedition-draft-${seatId}-camp${campNumber}\`)` (deterministic, replay-safe, and — because the stream name embeds `seatId` — trivially produces different, independent offers per seat from the same underlying seed). Offers are private: stored per-seat on `RunState`, and only Phase 11's `toPlayerView` (not this phase) is responsible for actually hiding other seats' offers from the wire — but this phase's `RunState` shape should keep them in a seat-keyed map (not a flat public list) so Phase 11's redaction is a straightforward per-seat field lookup rather than a filter over shared data.
- **Loadout:** per seat, `equippedGearIds: readonly string[]` such that `sum(equippedGear.map(g => g.size)) <= capacity(state, seatId)`. Loadouts are fully public (RUN-05), unlike offers — no redaction concern here, can live in a flat/public `RunState` field.
- **D-06 default-to-last-loadout:** when a new camp's capacity opens (fireside after a clear, or before a replay), `equippedGearIds` for each seat defaults to *last camp's* equipped set (filtered to gear still owned — always true since gear is never lost) with the newly-opened capacity simply unused until the player actively re-equips. This is a straightforward "carry forward, don't reset" rule — the only reset RUN-06 requires is *used flags and mid-camp modifiers*, never the equipped-gear selection itself.

## Timing Windows & Between-Tricks Serialization (D-12, D-13)

- **`pre-deal`:** before a camp's deal, the run waits (blocks phase advance) until every seat *with pre-deal gear equipped* has sent either `use-gear` or `skip-window` for it; seats with no pre-deal gear are never blocked (D-12) — track via a per-seat "resolved pre-deal?" derived check: `equippedGear.some(g => g.window === "pre-deal") ? (used-or-skipped) : true`, ANDed across all seats.
- **`between-tricks`:** no wait, no grace period (D-13); the window is simply "open" from objective-pick completion until the *next* card is played, and closes the instant a play-card action is accepted. Because the spec says "the server serialises actions in arrival order," the run-level dispatcher should process `RunAction`s strictly in receipt order with no reordering/buffering — this falls out naturally from a single-threaded pure reducer (no explicit implementation needed beyond "don't add a queue").

## Gear Catalogue (GEAR-01..06)

10 items across four categories. Each is one file in `gear/`, one line in `GEAR_REGISTRY`.

| Gear | id | Size | Window | Targets | Key ruling |
|------|----|----|--------|---------|-----------|
| Signal Whistle | `chatter` | 1 | between-tricks | none | `modifiers: { whispersPerCamp: (state, seat) => prev(state, seat) + 1 }` |
| Spyglass | `peek` | 1 | between-tricks | `[teammate]` | `apply` calls `ctx.reveal(randomCardFrom(ctx.target(0)), [ctx.self])` using `ctx.rng(...)`, never `Math.random` |
| Signal Flare | `broadcast` | 1 | between-tricks | none | D-08: arms a per-seat flag; `canUse` returns a reason once `hasWhisperedThisCamp(self)` is true; the *next* Whisper's `whisperAudience` widens to all seats, then un-arms |
| Camouflage ✦ | `ghost` | 1 | between-tricks | `[own-objective]` | D-11: `apply` removes the chosen objective from `state.objectives` entirely (not merely marks it done/skipped — "no longer needs completing and cannot fail the camp") and calls `ctx.addModifier({ failureChecks: (state) => wonAnyTrickSince(self, activationTrickIndex) ? [...prev(state), "ghost-broke-cover"] : prev(state) })`; `canUse` returns a reason once `countTricksWon(state, self) > 0` |
| Compass | `reroll` | 2 | objective-pick | `[face-up-objective]` | `apply` calls `ctx.replaceObjective(objectiveId)`; toolkit's `replaceObjective` preserves an `ordered` objective's `order` marker by construction (draws a new `target` card only, keeps `kind`/`order`) |
| Trained Monkey ✦ | `pickpocket` | 2 | between-tricks | `[teammate, own-card]` | `apply` calls `ctx.swapCards(self, chosenCardId, target, ctx.rng-selected card from target's hand)` |
| Machete | `commandeer` | 2 | between-tricks | none | D-09: usable in *any* between-tricks window including before trick 1; `apply` calls `ctx.setNextLeader(self)`, which (per Pattern 2) should be realized as the composed `nextLeader` hook returning `self` for the *next* trick regardless of `trickWinner`'s result — this is precisely the scenario WR-05's validation must handle correctly (a `trickWinner` result that legitimately differs from the stored `nextLeader` because Machete overrode it) |
| Rain Poncho ✦ | `jam` | 2 | pre-deal | none | `apply` calls `ctx.addModifier({ whisperAllowed: () => false })` (D-04: only for this attempt; boss-twist cancellation is `addModifier({ failureChecks: () => [] })`-style suppression of the boss's specific check, or more simply a per-attempt `bossCancelled: boolean` flag consulted when composing the boss layer at all) |
| Trail Map | `reassign` | 3 | between-tricks | `[teammate]` (D-10 override) | `apply` calls `ctx.swapObjectives(self, target)`, toolkit only moves `ownerSeatId === null`-excluded (i.e. taken-but-unresolved) objectives, per D-10 "only unresolved objectives move; completed ones stay" |
| Energy Tonic ✦ | `overclock` | 0 | passive | none | `modifiers: { capacity: (state, seat, prev) => prev(state, seat) + 2, failureCost: (state, prev) => prev(state) + 1 }` — passive gear has no `apply`, only `modifiers` |

**GEAR-05/GEAR-06 scope note:** this phase's `canUse(ctx): true | string` *is* GEAR-06 in full. GEAR-05's confirm step is explicitly UI-facing (per CONTEXT.md); the engine-side contract is simply that `apply` is atomic and irreversible once called — there is no partial-apply or rollback path, matching XRULE-08's "no undo" discipline already established in Phase 9.

## Boss Catalogue (BOSS-01, D-02/D-03/D-04)

| Boss | id | Effect | Implementation note |
|------|----|--------|---------------------|
| Monsoon | `radio-silence` | No Whispers | `modifiers: { whisperAllowed: () => false }` |
| Eclipse | `eclipse` | No Sun/Moon; even per-player-count deck; A♠ holder leads | `modifiers: { deckFor: (playerCount) => baseDeckFor(playerCount).filter(c => c.kind !== "joker"), leaderFor: (hands) => leaderFor(hands) }` — since `leaderFor` (Phase 9, `leader.ts`) is *already* written generically to fall back to A♠ when the Sun is absent from every hand (confirmed by direct code read, `leader.ts` header comment: "written generically... so Phase 10's Eclipse twist reuses it unchanged"), Eclipse's `leaderFor` override can literally be the unmodified base function — Eclipse only needs to override `deckFor`. Per-player-count sizing is explicit in spec §5.3 (3p: 51 cards/17 each; 4p: 52/13 each; 5p: 50/10 each) — this differs from the base removed-card counts and must be a *distinct* filter, not a reuse of `removedCardsFor`. |
| Thick Fog | `blind-orders` | Objectives dealt face-down at random, each player sees only their own | `modifiers: { objectiveAssignment: () => "face-down" }`; the actual random *assignment* (which objective goes to which seat) is a toolkit/run-layer concern that reads this hook, not a boss-layer state mutation — the boss only flips a flag; assigning ownership at random (instead of the clockwise pick order) happens in the run dispatcher when it sees `objectiveAssignment(state) === "face-down"` at camp setup |
| Mutiny | `mutiny` | Leader must not win the first trick, or camp fails | `modifiers: { failureChecks: (state, prev) => (state.completedTricks[0]?.winnerSeatId === state.expeditionLeaderSeatId ? [...prev(state), "mutiny-leader-won-first-trick"] : prev(state)) }` |

**D-02 (fixed twist per boss camp, not per attempt):** `RunState` stores `bossTwistId: Record<3 | 6, string | undefined>`, set once (lazily, on first reaching that boss camp) and never re-drawn on replay — composing rules for a replay attempt reads the *already-stored* id rather than drawing again.

**D-03 (camp 6 excludes camp 3's twist):** the camp-6 draw, at the moment it first happens, filters `BOSS_POOL` to exclude `bossTwistId[3]` before drawing — `seedToRngState(seed, "expedition-boss-camp6")` applied to the filtered 3-entry pool, still fully deterministic from `seed` alone (no player-input dependency), so replay-from-seed still reconstructs it correctly regardless of when during the run it's first computed.

**D-04 (Poncho cancels for one attempt only):** model as a per-attempt boolean (`bossCancelledThisAttempt`) set by Rain Poncho's `apply` and consulted only at rules-composition time for the *current* attempt; it is not stored on `bossTwistId` and is reset to `false` at the start of every new attempt (including a replay after a different failure), matching "the twist returns on a replay unless someone uses Poncho again."

**Thick Fog's face-down distribution rule (discretion item, no fewer-objectives-than-players guidance in the spec):** recommend round-robin assignment (deal one objective per seat in seat order, wrapping if there are more objectives than seats, and — for fewer objectives than seats — simply leaving the remaining seats with none) mirroring `dealHands`'s existing round-robin convention (`deck.ts`: "card i goes to seat i % seatCount"). This keeps the distribution rule consistent with the one other place the codebase already deals things out unevenly-by-count. Flagged as `[ASSUMED]` — confirm with the owner if a seat having zero objectives under Thick Fog feels wrong.

## Balance Table Format (RUN-01, D-14/D-15)

A plain, camp-number-keyed table, tunable without touching engine code (BAL-01, Phase 15's job to tune values, but the *shape* is this phase's job):

```ts
// packages/rules/src/expedition/run/balance.ts
export type CampBalanceEntry = {
  readonly objectiveSlots: readonly ObjectiveSlot[]; // ObjectiveSlot from Phase 9's state.ts, reused unchanged
  readonly isBossCamp: boolean;
};

export const CAMP5_EXACTLY_N_RANGE: { readonly min: number; readonly max: number } = { min: 2, max: 4 }; // placeholder, tuned in Phase 15

// D-14: camp 5's trick-count slot is resolved at camp-creation time by a
// seeded coin-flip (no-tricks vs exactly-N) then, if exactly-N, a seeded
// draw of N within CAMP5_EXACTLY_N_RANGE — both draws are per-attempt
// (stream name includes attempt number) since a fresh deal also means a
// fresh objective mix on replay (spec §4.1: "replayed with a fresh deal and
// fresh objectives").
export function resolveCamp5TrickCountSlot(seed: string, attemptStreamSuffix: string): ObjectiveSlot {
  const coin = seedToRngState(seed, `expedition-camp5-kind-${attemptStreamSuffix}`);
  const { value: coinValue } = nextRandom(coin);
  if (coinValue % 2 === 0) return { kind: "no-tricks" };
  const nRng = seedToRngState(seed, `expedition-camp5-n-${attemptStreamSuffix}`);
  const { value: nValue } = nextRandom(nRng);
  const span = CAMP5_EXACTLY_N_RANGE.max - CAMP5_EXACTLY_N_RANGE.min + 1;
  return { kind: "exactly-n", n: CAMP5_EXACTLY_N_RANGE.min + (nValue % span) };
}

export const BALANCE_TABLE: Record<1 | 2 | 3 | 4 | 5 | 6, CampBalanceEntry> = {
  1: { objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }], isBossCamp: false },
  2: { objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }, { kind: "win-card" }], isBossCamp: false },
  3: { objectiveSlots: [{ kind: "win-card" }, { kind: "win-card" }, { kind: "win-card" }], isBossCamp: true },
  4: { objectiveSlots: [{ kind: "ordered", order: 1 }, { kind: "ordered", order: 2 }, { kind: "win-card" }, { kind: "win-card" }], isBossCamp: false },
  5: { objectiveSlots: [/* trick-count slot resolved dynamically, see above */ { kind: "win-card" }, { kind: "win-card" }, { kind: "win-card" }], isBossCamp: false },
  6: { objectiveSlots: [{ kind: "ordered", order: 1 }, { kind: "ordered", order: 2 }, { kind: "win-card" }, { kind: "win-card" }, { kind: "win-card" }], isBossCamp: true },
};
```
D-15 confirms this is exactly Phase 9's `A-TRICKCOUNT` assumption: the trick-count objective is a normal face-up slot in the pool (not specially injected outside the pick order), with `n` supplied by the balance table via `ObjectiveSlot`. Exact camp 1/2/4/6 objective-kind mixes above are read directly from spec §4.3's table `[CITED: spec §4.3]`; the camp-5 trick-count range bounds (`2..4`) are a placeholder pending Phase 15's balance pass and are explicitly `[ASSUMED]`.

## Deterministic RNG Threading (RUN-07)

**Recommendation (deviates from a literal reading of spec §6.5 — flagged as Assumption A1 below):** do not store a live `RngState` object anywhere in `RunState`. Instead, store only the run's `seed: string` (exactly as Phase 9's `CampState` stores no RNG state and `createCamp` takes `seed: string`), and derive every random draw via `seedToRngState(seed, streamName)` where `streamName` deterministically encodes enough context to make the draw (a) independent from every other draw in the same run, and (b) exactly reproducible from `(seed, action log)` alone.

Concretely, `streamName` should embed:
- **Camp-attempt-scoped draws** (deal, objective deck, boss draw, camp-5 trick-count): `camp number` + `attempt number` (attempt number is itself deterministically derivable from the action log: count of prior failed-and-replayed attempts at that camp number).
- **Player-scoped draws** (draft offers): `+ seatId`.
- **Multiple-uses-per-attempt draws** (Spyglass/Trained Monkey random card selection, usable by multiple different gear items multiple times within one camp attempt): `+ a use-sequence number`, itself derived deterministically as "the count of prior gear-use actions in this camp attempt requiring randomness" — i.e., a counter carried in `RunState` (or recomputed from the action log) that increments once per such action. This is the one place a small persisted counter *is* warranted (it's an integer, not RNG state, and trivially reconstructible by replaying the log).

This whole scheme is a direct extension of the pattern already proven in `deck.ts` (`"expedition-deck"`, `"expedition-card-ids"`, `"expedition-objective-deck"` as independent named streams off one seed) and in `shuffle.ts`'s own doc comment ("different stream names on the same seed yield independent, uncorrelated generators"). No new PRNG algorithm, no new determinism proof needed — only new stream-name conventions.

**Assumption A1** (see Assumptions Log): this trades a literal "RNG carried in state" reading for "seed carried in state, RNG re-derived by name," which is strictly safer (removes a whole bug class) but is a deviation from the spec's literal wording and should be confirmed with the owner or accepted by the planner as the concrete realization of §6.5's intent.

## Replay Reset Contract (RUN-06)

An explicit table the plan should turn into an integration test (ROADMAP Phase 10 success criterion #2 requires exactly this):

| Resource | Resets on replay? | Where it lives | Mechanism |
|----------|-------------------|-----------------|-----------|
| Gear used-this-camp flags (Whisper count used, Signal Flare armed, Machete used, etc.) | Yes | Per-attempt camp wrapper (not top-level `RunState`) | A fresh camp wrapper is constructed at replay time; used-flags are fields on it, not on `RunState` |
| Mid-camp modifiers (Camouflage's failure check, Machete's `nextLeader` override) | Yes | `addModifier` results live in the per-attempt wrapper's modifier list, folded into `composeRules` only for that attempt | Same as above — a fresh wrapper has an empty modifier list |
| Current trick's leader | Yes | `CampState.currentTrick.leaderSeatId`, freshly computed by `createCamp`'s `rules.leaderFor(hands)` call | `createCamp` already recomputes this from scratch every call (Phase 9, unchanged) |
| Reveals (Whisper/Spyglass contents) | Yes | Per-attempt wrapper | Same as used-flags — COMM-02 requires this explicitly |
| Owned gear | **No** — persists | `RunState.perSeat[seatId].ownedGearIds` | Never touched by the replay path; only camp-attempt-scoped structures are rebuilt |
| Equipped gear (loadout) | **No** — persists (subject to D-01's re-pack allowance) | `RunState.perSeat[seatId].equippedGearIds` | Carried forward; D-01 lets players *change* it before the replay, but nothing forces a reset |
| Supplies | **No** — persists (it's the resource being spent) | `RunState.supplies` | Decremented once per failure, never reset |
| Boss twist id (per boss camp) | **No** — persists (D-02) | `RunState.bossTwistId[campNumber]` | Set once, read again on replay |

## Catalogue Contract Tests (ENG-02)

One generic test file per catalogue (`gear.contract.test.ts`, `boss.contract.test.ts`), each iterating its registry object rather than a hand-written list (mirrors `purity.test.ts`'s directory-scan philosophy):

```ts
// packages/rules/src/expedition/gear/gear.contract.test.ts
import { describe, expect, it } from "vitest";
import { GEAR_REGISTRY } from "./gear-def";

describe("gear catalogue contract", () => {
  const entries = Object.entries(GEAR_REGISTRY);

  it("has unique ids matching their registry key", () => {
    for (const [key, def] of entries) expect(def.id).toBe(key);
    const ids = entries.map(([, def]) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has a valid size (>=0 integer) and a known window", () => {
    const validWindows = new Set(["pre-deal", "objective-pick", "between-tricks", "passive"]);
    for (const [, def] of entries) {
      expect(Number.isInteger(def.size) && def.size >= 0).toBe(true);
      expect(validWindows.has(def.window)).toBe(true);
    }
  });

  it("apply is deterministic given the same ctx inputs (same rng draws)", () => {
    // build two identical fixture RunStates + a fixed rng seed; call apply
    // twice; assert deep-equal results (excluding any log timestamp fields,
    // if added later)
  });

  it("apply conserves cards (locateAllCards before === after, modulo the declared move)", () => {
    // reuse/extend test-support.ts's locateAllCards for RunState
  });

  it("apply never reveals a card outside a declared reveal/log audience (interim leak check)", () => {
    // see "interim leak assertion" in the Reveal Model section above
  });
});
```
`BOSS_REGISTRY`'s contract test is the same shape but validates `modifiers` shape (every key is a known `CoreRules` hook name) instead of `apply`/`targets`.

## Common Pitfalls

### Pitfall 1: `purity.test.ts`'s substring guard will false-positive on this phase's own doc comments
**What goes wrong:** Phase 9's `purity.test.ts` bans the literal substrings `"Math.random"` and `"Date.now"` anywhere in a scanned source file — including inside comments. This RESEARCH.md's own recommended pattern of writing a doc comment like "never Math.random()" inside a new `run/toolkit.ts` file would trip that guard.
**Why it happens:** The guard is a raw substring scan (09-REVIEW.md's IN-04, still open/carried-forward, confirmed by direct code read of `purity.test.ts`), not an AST/import-specifier check.
**How to avoid:** When documenting the "never use `Math.random`" rule inside new source files, avoid writing the literal token `Math.random` (e.g. write "the platform's non-seeded random API" or split the token). Alternatively, extend the guard to strip comments first (09-REVIEW.md's own suggested fix), which the planner may choose to do as a small hygiene task while adding `MUST_BE_SCANNED` entries for every new file.
**Warning signs:** A new file's test suite fails with an opaque `expect(source.includes(token)).toBe(false)` assertion failure pointing at a comment line, not code.

### Pitfall 2: Extending `CoreRules` without updating `purity.test.ts`'s `MUST_BE_SCANNED` list (or converting it to a directory scan for the new `run/`/`gear/`/`boss/` subdirectories)
**What goes wrong:** `purity.test.ts` currently only scans `readdirSync(HERE)` — the `expedition/` directory itself — with a hard-coded `MUST_BE_SCANNED` list of Phase 9's own files. If this phase's new files live in subdirectories (`run/`, `gear/`, `boss/` as recommended above), they are invisible to the existing guard entirely (it doesn't recurse).
**Why it happens:** The guard was written before subdirectories existed.
**How to avoid:** Either (a) keep all new files flat in `expedition/` (no subdirectories) so the existing recursive-free scan still covers them, or (b) extend `purity.test.ts` to recurse into `run/`, `gear/`, `boss/` and apply the same forbidden-token scan there. Given ENG-01's "one file plus one registry line" promise for *content* (gear/boss/objective-kind) specifically, and given ten gear files plus four boss files, subdirectories are strongly recommended for organization — meaning (b) is the correct fix, not (a). This should be an explicit task in the plan, not an incidental side effect.

### Pitfall 3: Composing `nextLeader` incorrectly breaks WR-05's fix instead of exercising it
**What goes wrong:** Machete's `commandeer` effect is *exactly* the scenario 09-REVIEW.md's WR-05 finding describes: "A Phase 10 layer that overrides `nextLeader` independently of `trickWinner`... removes that accidental guard." If the composed `nextLeader` simply returns the acting seat unconditionally (ignoring whether a trick has even completed, or ignoring `trickWinner`'s validity), and `trickWinner`'s own result is not independently validated (WR-05's fix), a bad `trickWinner` result becomes silently unrecoverable exactly the way the review predicted.
**Why it happens:** It's tempting to implement Machete as `nextLeader: () => macheteUserSeatId` without also confirming the `actions.ts` validation of `trickWinner`'s result against `plays.some(...)` has actually been added first.
**How to avoid:** Land the WR-05 fix (validate `trickWinner` against the trick's own players) as an early, foundational task — before or in the same task as introducing the first hook-composition consumer (Machete) — and add a regression test that combines "a deliberately bad `trickWinner`" with "a valid overridden `nextLeader`" exactly as 09-REVIEW.md's own suggested fix describes.
**Warning signs:** A camp with Machete equipped silently produces a wrong-seat trick winner attribution with no error, only detectable by a failed objective that "shouldn't have" failed.

### Pitfall 4: `invalid_rule_hook` policy inconsistency (WR-06) if only half of it is fixed
**What goes wrong:** `camp.ts`'s `leaderFor` validation and `currentActorSeatId`'s invariant already *throw* a plain `Error`; `actions.ts`'s `nextLeader` validation currently *returns* an `AdapterResult` error (`invalid_rule_hook`). If this phase adds new hook-result validations (for `trickWinner`, or for any new hook) using the *return-an-error* style to match `actions.ts`'s existing local convention, the inconsistency 09-REVIEW.md flagged (WR-06: "the same class of defect throws in `createCamp`... and returns a `CampError` here") gets worse, not better, and the camp-stuck failure mode WR-06 describes remains real.
**Why it happens:** `actions.ts`'s existing code is the path of least resistance to copy from, but it's the *inconsistent* half.
**How to avoid:** Pick one policy — 09-REVIEW.md's own suggested fix (throw a plain `Error` everywhere for rules-composition defects, since "this is a programmer error that no player can fix") is the simplest and matches the majority of existing call sites. Apply it uniformly: convert `actions.ts`'s `invalid_rule_hook` `AdapterResult` returns to thrown Errors, and skip the `nextLeader` call entirely once `completedTricks.length === state.totalTricks` (closing IN-01/WR-06's "final trick" gap in the same change). This requires updating `actions.test.ts`'s existing test(s) that currently assert an `invalid_rule_hook` `AdapterResult` — flag this as a small, deliberate breaking change to Phase 9 test expectations, justified by the owner-approved discretion to "pick one policy."
**Warning signs:** A test asserting `result.ok === false && result.error === "invalid_rule_hook"` starts throwing instead of returning — expected and correct once the policy change lands, but worth calling out explicitly in the plan so it isn't mistaken for a regression.

### Pitfall 5: Forgetting that `CampState` (Phase 9) deliberately stores no phase/outcome/tricks-won field, and re-adding one at the `RunState` level
**What goes wrong:** A natural-seeming optimization is to cache "current camp phase" or "objectives remaining" on `RunState` for quick access from a future adapter. Trail Map's ownership swap (D-10) and Camouflage's objective removal (D-11) are exactly the kind of mid-camp mutation that would silently desync a cached field.
**Why it happens:** `RunState` is new code with no established discipline yet; it's easy to not notice the precedent `CampState` set.
**How to avoid:** Apply the same "derive, never cache" rule to every new run-level status (run phase, current supplies-vs-loss check, capacity-vs-loadout-sum check) that Phase 9 applied to camp phase/outcome.
**Warning signs:** A property test that swaps objective ownership (Trail Map) mid-camp and then reads a *cached* status field gets a stale answer that a freshly-recomputed read would not.

### Pitfall 6: Eclipse's per-player-count deck sizing must not reuse `removedCardsFor`
**What goes wrong:** It's tempting to implement Eclipse's `deckFor` override as `baseDeckFor(playerCount).filter(c => c.kind !== "joker")`, which is in fact exactly correct per spec §5.3's stated card counts (51/17, 52/13, 50/10) — confirmed by hand-checking: base `removedCardsFor` for 3p removes nothing (54 total, minus 2 jokers = 52, not 51) — **this does NOT match**. Spec §5.3 explicitly states Eclipse's own distinct removal table ("3p removes 2♣ (51, 17 each); 4p removes nothing (52, 13 each); 5p removes 2♣ 2♦ (50, 10 each)"), which is a *different* removed-card set per player count than the base game's (base 3p removes nothing at 54; base 4p removes 2♣2♦ at 52; base 5p removes all four 2s at 50).
**Why it happens:** Both tables produce the same *final counts* by coincidence-adjacent reasoning ("higher player counts remove more"), but the specific cards removed differ, and naively composing `baseDeckFor` (which already removes low 2s) with "also strip jokers" gives 3p=52 (wrong, should be 51), 4p=50 (wrong, should be 52), 5p=48 (wrong, should be 50).
**How to avoid:** Eclipse needs its *own* `removedCardsForEclipse(playerCount)` table (2♣ only at 3p; nothing at 4p; 2♣+2♦ at 5p) distinct from the base game's `removedCardsFor`, then filter out both that table's cards *and* the two jokers from `buildFullDeck()`. Write this as an explicit unit test asserting exact deck sizes (51/17, 52/13, 50/10) per player count, not just "no jokers present."
**Warning signs:** An Eclipse camp at 3 players deals only 17 cards where 18 were expected (or the reverse), or a property test's hand-size invariant fails only under the Eclipse boss twist.

## Code Examples

### Composing rules per camp attempt (verified pattern, extending Phase 9's own seam)
```ts
// packages/rules/src/expedition/run/replay.ts
import { baseRules, type CoreRules } from "../rules";
import { composeRules } from "./compose";
import { BOSS_REGISTRY } from "../boss/boss-def";
import { GEAR_REGISTRY } from "../gear/gear-def";

export function rulesForAttempt(runState: RunState): CoreRules {
  const bossId = runState.bossTwistId[runState.campNumber as 3 | 6];
  const boss = bossId !== undefined && !runState.bossCancelledThisAttempt
    ? BOSS_REGISTRY[bossId].modifiers
    : undefined;
  const gearModifiers = runState.seatIds
    .flatMap((seatId) => runState.perSeat[seatId]!.equippedGearIds)
    .map((gearId) => GEAR_REGISTRY[gearId].modifiers)
    .filter((m): m is Partial<CoreRules> => m !== undefined);
  return composeRules(baseRules, boss, gearModifiers, runState.currentAttemptExtraModifiers);
}
```
*Source: synthesized from spec §6.1's composition description and Phase 9's `rules.ts` `baseRules` pattern, both directly read this session.*

### Deriving a per-attempt camp seed (RUN-07, "fresh deal" on replay)
```ts
// packages/rules/src/expedition/run/replay.ts
export function seedForAttempt(runSeed: string, campNumber: number, attemptNumber: number): string {
  return `${runSeed}:camp${campNumber}:attempt${attemptNumber}`;
}
// Passed as createCamp's `seed` input unchanged — createCamp/deck.ts's own
// stream-naming (`seedToRngState(seed, "expedition-deck")` etc.) then derives
// independent sub-streams from THIS composite string, so a replay (attempt
// N+1 after a failure) gets a genuinely different deal/objective deck while
// remaining perfectly reproducible from (runSeed, campNumber, attemptNumber)
// alone — all three of which are derivable from the action log.
```

## State of the Art

| Old Approach (Phase 9) | Current Approach (Phase 10) | When Changed | Impact |
|--------------------|------------------|--------------|--------|
| Single fixed `CoreRules = baseRules` per camp, no composition | Fresh `composeRules(base, boss, gear[])` per camp attempt | This phase | Every Core call site already accepts `rules` as a parameter — no Core signature changes needed, only a new caller |
| `isTrump` hook declared but never called (WR-03) | `trickWinner`/`legalPlaysFor` route their joker/trump checks through `rules.isTrump` | This phase | Closes a real extensibility gap flagged by two independent review passes |
| `trickWinner`/`nextLeader` hook results validated inconsistently (WR-04 fixed `leaderFor`/`nextLeader` at setup/storage time; `trickWinner` unvalidated) | All three seat-returning hooks validated the same way, with one consistent failure policy (throw) | This phase | Removes the "camp permanently stuck" failure mode WR-06 identified as a *new* bug introduced by WR-04's own fix |
| No run-level state exists at all | `RunState` wrapping repeated `CampState` attempts | This phase | This *is* the phase's primary deliverable |

**Deprecated/outdated:** None — this phase is additive to Phase 9, not a replacement of anything.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `RunState` should store only a `seed: string` and re-derive every RNG draw by descriptive stream name (never store/thread a literal mutable `RngState` object), deviating from a literal reading of spec §6.5 ("A seeded PRNG... is carried in state") | Deterministic RNG Threading | Low — this is a strictly safer instance of the same mechanism already tested in Phase 9; if the owner insists on literal RNG-object threading, the fix is a mechanical substitution, not a redesign |
| A2 | A new `RunAction` superset type (not an extension of Phase 9's closed `CampAction` union) is the correct action-dispatch boundary, with a new run-level dispatcher handling non-camp actions | Alternatives Considered / Architecture Diagram | Medium — if wrong, Core's `actions.ts` would need modification, which risks the purity/no-boss-or-gear-name-in-Core guarantee Phase 9 established; should be confirmed with the planner before locking file boundaries |
| A3 | `invalid_rule_hook`'s resolution policy should be "throw a plain `Error` for every rules-composition defect," replacing `actions.ts`'s current `AdapterResult`-return style for `nextLeader`, and applying the same policy to the new `trickWinner` validation (WR-05) | Common Pitfalls #4 | Medium — this is an explicit Claude's-Discretion item (WR-06: "Pick one policy"), but it changes at least one existing Phase 9 test's expected behavior; flagged so the plan accounts for updating `actions.test.ts` |
| A4 | Reveals (and used-flags, mid-camp modifiers) live on a per-camp-attempt wrapper distinct from top-level `RunState`, so replay-reset (RUN-06/COMM-02) falls out of "construct a fresh wrapper" rather than needing explicit per-field reset logic | Replay Reset Contract | Low — this is a structural choice with no behavior difference if implemented correctly either way; flagged because getting the *boundary* wrong (e.g. accidentally putting a used-flag on `RunState` instead of the attempt wrapper) is an easy, silent RUN-06 violation |
| A5 | Thick Fog's face-down objective distribution for fewer objectives than players uses round-robin-by-seat-order (mirroring `dealHands`'s existing convention), leaving some seats with zero objectives when objectives < seats | Boss Catalogue | Low — explicitly called out in CONTEXT.md as Claude's Discretion; only a UX/balance judgment call, not a correctness risk |
| A6 | Camp 5's exactly-N range is a placeholder `[2, 4]` pending Phase 15's balance pass | Balance Table Format | None — explicitly deferred to Phase 15 by ROADMAP; this phase only needs the *shape* to be tunable, not the correct final numbers |

**If this table is empty:** N/A — six assumptions logged above; all are either low-risk structural choices consistent with established Phase 9 precedent, or explicitly deferred/discretionary per CONTEXT.md.

## Open Questions

1. **Does rule composition happen once per camp attempt, or does it need to be recomposed after every mid-camp `addModifier` call (Camouflage)?**
   - What we know: Camouflage's failure check is added *mid-camp*, after the camp's initial rule composition already happened at camp-attempt start.
   - What's unclear: whether `composeRules` should be called fresh every time `checkCampOutcome`/`canPlayCard` etc. run (reading the *current* `RunState`'s modifier list, which grows over the camp), or whether a single composed `CoreRules` value is cached at attempt-start and only Camouflage's specific check is appended imperatively.
   - Recommendation: recompute per-call (cheap — these are small pure functions over a handful of hooks), reading the modifier list off `RunState`/the per-attempt wrapper fresh each time, exactly matching Phase 9's "nothing cached, always derived" discipline. This avoids a whole class of "forgot to recompose after `addModifier`" bugs.

2. **Should the run-level `ready`/pause mechanism be modeled at all in `packages/rules`, or is it entirely a Phase 11/worker concern?**
   - What we know: D-07 explicitly says disconnected-player pausing mirrors "Hanabi's pause," which (based on file names seen, e.g. `heartbeat.ts`, `scheduler.ts` in `apps/worker`) is implemented at the worker/room-actor layer, not inside `packages/rules/src/hanabi/`.
   - What's unclear: whether this phase needs a `ready: Set<seatId>` *field* in `RunState` at all (pure data, no disconnect-detection logic), versus that being entirely a Phase 11 wiring concern layered on top.
   - Recommendation: this phase should model *only* the pure-data half — a `readySeatIds: readonly string[]` field and a `phase` derivation that requires all `seatIds` present in `readySeatIds` before advancing — and explicitly leave "what marks a seat unready on disconnect" to Phase 11, matching the CONTEXT.md phase boundary ("Worker wiring... Phase 11 owns these").

3. **Exact wire/action shape for `use-gear`'s declarative targets (spec §6.2's `targets: [{kind}, ...]`) — how does a `RunAction` carry chosen target values generically across 10 different gear items with different target-kind combinations?**
   - What we know: spec §6.2 says "The UI builds targeting from [declarative targets]," implying the action payload is a generic ordered list of resolved target values (seat ids, card ids, objective ids) matching the gear's `targets` array positionally.
   - What's unclear: the exact TypeScript shape best balances type safety (Trail Map's single `teammate` target vs. Trained Monkey's `[teammate, own-card]` pair) against genericity (ENG-01's one-file-per-gear promise implies the action-payload shape must not need a new field for the 11th gear item added later).
   - Recommendation: `{ type: "use-gear", gearId: string, targets: readonly string[] }` — a flat, order-matched string array validated at apply-time against that gear's declared `targets` array length/kinds (not encoded in the TS type itself, since the type must stay generic across all gear). This is exactly how Phase 9 already treats `CampAction`'s `cardId`/`objectiveId` as plain strings validated by `legality.ts`, not narrowed types per action.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 + fast-check 4.9.0 (both already installed at the repo root, confirmed via `npm ls`) |
| Config file | Root `vitest.config.ts` (existing; no new config needed — `packages/rules` already has a `rules` project) |
| Quick run command | `npx vitest run --project rules` |
| Full suite command | `npm test` (root, runs all workspaces) plus `npm run typecheck` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COMM-01 | Whisper: once/camp, post-objective-pick, between-tricks only, target-only visibility, public whisperer/target log | unit + property | `npx vitest run whisper` | ❌ Wave 0 — `run/whisper.test.ts` |
| COMM-02 | Reveal lifetime: survives to camp end, clears on replay | integration | `npx vitest run replay-reset` | ❌ Wave 0 — `run/replay-reset.test.ts` |
| RUN-01 | 6-camp structure, boss camps 3/6, balance-table-driven counts | unit | `npx vitest run balance` | ❌ Wave 0 — `run/balance.test.ts` |
| RUN-02 | Supplies: -1/fail, +Tonic penalty, 0 = loss, camp 6 clear = win | unit + property | `npx vitest run run-state` | ❌ Wave 0 — `run/run-state.test.ts` |
| RUN-03 | Capacity = camp number regardless of attempt count | unit | `npx vitest run capacity` | ❌ Wave 0 — folded into `run-state.test.ts` |
| RUN-04 | Draft: 1-of-3, never-owned, private, post-start and post-clear | unit + property | `npx vitest run draft` | ❌ Wave 0 — `run/draft.test.ts` |
| RUN-05 | Loadout: equip up to capacity, public | unit | `npx vitest run loadout` | ❌ Wave 0 — `run/loadout.test.ts` |
| RUN-06 | Fail-then-replay resets used-flags/modifiers/leader/reveals; owned+equipped gear persists | integration (explicit, matching ROADMAP success criterion #2) | `npx vitest run replay-reset` | ❌ Wave 0 |
| RUN-07 | Full run replays deterministically from seed + action log | property (whole-run simulation) | `npx vitest run run.property` | ❌ Wave 0 — `run/run.property.test.ts` |
| GEAR-01..04 | Each gear item's specced behavior + D-08..D-11 overrides | unit, one file per item | `npx vitest run gear/` | ❌ Wave 0 — `gear/<id>.test.ts` × 10 |
| GEAR-06 | `canUse` returns a reason string when blocked | unit (part of each gear's own test + the contract test) | `npx vitest run gear.contract` | ❌ Wave 0 |
| BOSS-01 | 4 boss twists, D-02/D-03/D-04 fixed-per-camp / no-repeat / Poncho-cancels-once | unit, one file per twist | `npx vitest run boss/` | ❌ Wave 0 — `boss/<id>.test.ts` × 4 |
| ENG-01 | One-file-plus-registry-line extensibility; README recipes exist and are accurate | manual/doc review (not automatable) | — | ❌ Wave 0 — `README.md` |
| ENG-02 | Registry-driven contract tests: unique id, valid size/window, deterministic, conservation, interim no-leak | property, registry-iterating | `npx vitest run contract` | ❌ Wave 0 — `gear/gear.contract.test.ts`, `boss/boss.contract.test.ts` |
| WR-03/05/06 | Hook-composition robustness (isTrump routed, trickWinner validated, one throw policy, skip nextLeader after final trick) | unit (regression, mirroring 09-REVIEW.md's own mutation-testing approach) | `npx vitest run rules` | ❌ Wave 0 — extend `trick.test.ts`/`actions.test.ts` |

### Sampling Rate
- **Per task commit:** `npx vitest run --project rules` (fast — Phase 9's full rules project is 357 tests, sub-few-seconds per prior verification evidence)
- **Per wave merge:** `npm test` (full monorepo) + `npm run typecheck`
- **Phase gate:** Full suite green before `/gsd:verify-work`, plus a manual re-read of `README.md`'s recipes against the actual registries (ENG-01 is not fully automatable)

### Wave 0 Gaps
- [ ] `run/run-state.test.ts` — RunState shape, phase derivation, capacity/supplies (RUN-02, RUN-03)
- [ ] `run/draft.test.ts` — draft-offer generation, exclusion rule, privacy-readiness (RUN-04)
- [ ] `run/loadout.test.ts` — capacity-respecting equip, public visibility (RUN-05)
- [ ] `run/replay-reset.test.ts` — the explicit fail-then-replay integration test ROADMAP calls out by name (RUN-06, COMM-02)
- [ ] `run/whisper.test.ts` — Whisper mechanics, Signal Flare arming (COMM-01, D-08)
- [ ] `run/balance.test.ts` — balance table shape, camp-5 dynamic slot resolution (RUN-01, D-14/D-15)
- [ ] `run/run.property.test.ts` — whole-run fast-check simulation across 3/4/5 players, every boss twist, random loadouts (mirrors Phase 9's `camp.property.test.ts` structure, extended to run scope) — this is the property suite ENG-03/Phase 11 will later extend with real leak-checking; this phase's version checks termination/conservation/determinism only
- [ ] `gear/gear-def.ts` + `gear/gear.contract.test.ts` — the registry and its generic contract test
- [ ] `boss/boss-def.ts` + `boss/boss.contract.test.ts` — same, for bosses
- [ ] Ten `gear/<id>.test.ts` files and four `boss/<id>.test.ts` files — one per catalogue entry (ENG-01's literal deliverable)
- [ ] `README.md` — ENG-01's recipes: add gear / objective kind / boss twist / interactable / card pack / hook
- [ ] Extend `purity.test.ts` (or add sibling guards) to recurse into `run/`, `gear/`, `boss/` — see Pitfall 2

## Environment Availability

Not applicable — this phase has no external dependencies (no new packages, no network calls, no services). All work is pure TypeScript inside an already-configured monorepo workspace.

## Sources

### Primary (HIGH confidence — direct code/doc reads this session)
- `packages/rules/src/expedition/{rules.ts,state.ts,camp.ts,actions.ts,objectives.ts,trick.ts,legality.ts,test-support.ts,leader.ts,deck.ts}` — read in full this session
- `packages/rules/src/shuffle.ts`, `packages/rules/src/adapter.ts` — read in full this session
- `packages/rules/src/hanabi/hanabi-leak-check.ts`, `packages/rules/src/expedition/purity.test.ts` — read this session (leak-check and purity-guard precedent)
- `docs/superpowers/specs/2026-09-22-expedition-design.md` — read in full this session, owner-approved 2026-09-22
- `.planning/phases/09-expedition-rules-core/09-VERIFICATION.md`, `09-REVIEW.md` — read in full this session (WR-03/05/06 source)
- `.planning/phases/10-run-layer-gear-engine-bosses/10-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — read in full this session
- `npm ls fast-check vitest` — run this session, confirmed 4.9.0 / 4.1.11 already installed

### Secondary (MEDIUM confidence)
- CLAUDE.md's project instructions (`/home/rflor/games/CLAUDE.md`) — read via system context, cross-checked against `.planning/config.json`'s workflow settings

### Tertiary (LOW confidence)
None — no WebSearch/external sources were needed for this phase; everything load-bearing was already committed to the repo or in the owner-approved spec.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages, all versions confirmed via `npm ls` against an already-installed, already-audited monorepo
- Architecture (hook composition, toolkit, run state machine): HIGH — directly extends Phase 9's committed, tested, reviewed code with the same patterns Phase 9 itself used (`CoreRules` seam, `KindRegistry` mapped types, `purity.test.ts`'s scan philosophy)
- RNG threading, action-dispatch boundary, hook-failure policy: MEDIUM — reasoned extensions flagged explicitly as assumptions (A1-A3) since they involve a discretionary design choice not fully pinned by the spec or Phase 9 precedent
- Pitfalls: HIGH — five of six are grounded directly in 09-REVIEW.md's own findings (WR-03/05/06, IN-04) or a direct-read code-tracing exercise (Eclipse deck sizing arithmetic, Pitfall 6)

**Research date:** 2026-09-26
**Valid until:** No external dependency; valid until Phase 9's code changes underneath it (unlikely) or the spec/CONTEXT.md are revised

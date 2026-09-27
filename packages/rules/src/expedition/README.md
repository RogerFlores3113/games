# Expedition rules engine

This package (`packages/rules/src/expedition/`) is the whole Expedition rules
engine: framework-free TypeScript, zero Node/Worker/browser APIs, imported by
both the Cloudflare Worker (source of truth) and the Next.js client
(optimistic UI / legality pre-checks only — never the source of truth). See
`packages/rules/src/expedition/purity.test.ts` for the enforced import/API
restrictions.

ENG-01's promise: adding a piece of gear, an objective kind, a boss twist, a
hook or a toolkit op is **one new file plus one registry (or union/list)
line**, and the existing catalogue contract tests (`gear.contract.test.ts`,
`boss.contract.test.ts`, `objective-kinds.contract.test.ts`) cover the new
entry automatically, with zero test-file edits (ENG-02). Every recipe below
names the exact files and identifiers involved.

## Layout

- **Core** (this directory's top level): `state.ts` (the type vocabulary —
  `CampState`, `Objective`/`ObjectiveSlot` unions, `CampAction`/`CampError`),
  `camp.ts` (`createCamp`, `checkCampOutcome`, `campPhase`,
  `currentActorSeatId`), `actions.ts` (`applyCampAction`), `objectives.ts`
  (`OBJECTIVE_KINDS`, `evaluateObjective`), `rules.ts` (`CoreRules`,
  `baseRules`), `deck.ts`, `trick.ts`, `leader.ts`, `legality.ts`. The Core
  never imports a boss or gear id — it only ever calls through a `CoreRules`
  value.
- **`gear/`**: one file per gear item (a `GearDef`), plus `gear/registry.ts`'s
  `GEAR_REGISTRY` and `gear/gear-def.ts`'s type contract
  (`GearWindow`/`TargetKind`/`ToolkitOp`/`GearContext`/`GearDef`).
- **`boss/`**: one file per boss twist (a `BossDef`), plus
  `boss/registry.ts`'s `BOSS_REGISTRY` and `boss/boss-def.ts`'s type contract.
  The four v1 twists are **provisional placeholders** (10-CONTEXT.md, owner
  review) — too close to The Crew's own boss twists, expected to be replaced.
  Replacing one touches only its own file plus its one registry line.
- **`run/`**: the six-camp run layer on top of Core — `run/types.ts`
  (`RunState`, `RunAction`, `Catalog`), `run/lifecycle.ts` (`createRun`,
  `runPhase`, `runStatus`, `startAttempt`, `dealAttempt`, `settleIfDecided`,
  `advanceRun`), `run/run-actions.ts` (`applyRunAction`, the single run-level
  transition), `run/compose.ts` (`rulesFor`, `ruleLayersFor`,
  `activeBossId`), `run/run-rules.ts` (`RunHooks`, `HOOK_NAMES`,
  `baseRunHooks`), `run/toolkit.ts` (`applyToolkitOps`, the sole mutation
  surface for gear), `run/whisper.ts`, `run/use-gear.ts`, `run/balance.ts`
  (the tunable ramp), `run/rng.ts` (`STREAMS`, `seededIndex`), and
  `run/catalog.ts`'s `CATALOG` (the production `{ gear: GEAR_REGISTRY,
  bosses: BOSS_REGISTRY }` value Phase 11's adapter passes to
  `applyRunAction`/`createRun`).

**Layering order** (spec §6.1, `run/compose.ts`'s `ruleLayersFor` /
`composeRules`): **base → active boss twist → each seat's equipped passive
gear (seat order, then loadout order) → active mid-camp effects (in
`attempt.effects` order)**. Each layer's `RuleModifier` maps the *previous*
layer's answer to its own, hook by hook — never full replacement. `isTrump`
is folded first and separately from every other hook (WR-03); every other
hook in `run/run-rules.ts`'s `HOOK_NAMES` is folded over the base layer built
from that composed `isTrump`.

**The toolkit is the only mutation surface** (`run/toolkit.ts`'s
`applyToolkitOps`): a `GearDef.apply` returns `ToolkitOp` *data*
(`gear/gear-def.ts`'s `ToolkitOp` union) — it can never mutate `RunState`/
`CampState` directly. `applyToolkitOps` is the sole executor, and it asserts
card conservation after every op; a broken op throws (a content-author
defect, POLICY A3), it never silently corrupts state.

**The RNG stream rule (A1):** `RunState` carries only a `seed` string, never
a mutable generator. Every draw derives a **fresh, uniquely-named stream**
via `run/rng.ts`'s `STREAMS` builder — two draws must never share a stream
name. `run/types.ts`'s header reproduces the full table; the load-bearing
rows for content authors are:

| Draw | Stream name |
|---|---|
| Draft offer | `expedition-draft:camp{N}:seat{seatId}` |
| Boss selection | `expedition-boss:camp{N}` |
| Attempt deal seed | `{seed}:camp{N}:attempt{A}` |
| Face-down assignment (Thick Fog) | `expedition-face-down:camp{N}:attempt{A}` |
| Gear draw (any `ctx.randomIndex`/`ctx.randomCardIdFrom` call) | `expedition-gear:camp{N}:attempt{A}:use{k}:{gearId}:{seatId}:{purpose}` |

For gear, `k` is `attempt.gearUses.length` at the time of the draw — this is
built for you by `GearContext`; a `GearDef`'s `apply` never constructs a
stream name itself, it only picks a `purpose` string, which must be distinct
within one `apply` call if it draws more than once.

## Add a piece of gear

1. Create `gear/<id>.ts` exporting a `GearDef` (`gear/gear-def.ts`):
   `id`, `name`, `size` (an integer ≥ 0, the loadout-capacity cost),
   `window` (one of `gear/gear-def.ts`'s `GearWindow`:
   `"pre-deal" | "objective-pick" | "between-tricks" | "passive"`), `text`,
   an optional `downside`, and `targets` (a list of `TargetSpec`, each a
   known `TargetKind`: `"teammate" | "own-card" | "face-up-objective" |
   "own-objective"`).
   - `canUse?(ctx)` — target-free availability; return `true` or a reason
     string (GEAR-06).
   - `canTarget?(ctx)` — checked after the generic per-`TargetSpec`-kind
     validation every gear gets for free (`run/toolkit.ts`'s
     `validateTargets`).
   - `apply?(ctx)` — required unless `window === "passive"`; returns a list
     of `ToolkitOp` data for `applyToolkitOps` to execute. Never mutate
     anything directly here.
   - `passiveModifier?(ownerSeatId)` — only for `window: "passive"` gear:
     a `RuleModifier` that applies unconditionally while equipped (see
     Energy Tonic, `gear/overclock.ts`).
   - `effectModifier?(effect: ActiveEffect)` — only for gear whose `apply`
     includes an `{ op: "add-modifier" }`: a `RuleModifier` that applies for
     the rest of the current attempt once activated (see Camouflage/Signal
     Whistle/Signal Flare/Rain Poncho — `gear/ghost.ts`, `gear/chatter.ts`,
     `gear/broadcast.ts`, `gear/jam.ts`).
2. Add one line to `gear/registry.ts`'s `GEAR_REGISTRY` object literal
   (import the def, add `<id>: <def>`). `GearId` (`keyof typeof
   GEAR_REGISTRY`) picks up the new id automatically.
3. `gear/gear.contract.test.ts` iterates `Object.entries(GEAR_REGISTRY)` and
   covers the new entry with zero edits: shape checks, and — for non-passive
   gear — a driven-camp fixture at 3/4/5 players proving determinism, card
   conservation, a JSON round-trip, attempt-scoping, GEAR-05 finality (a
   second use is `gear_already_used`), and the interim no-leak check. You
   may add your own behavior-specific tests alongside it (a new
   `gear/<id>.test.ts`), but the contract test needs no changes.

**Worked example, in prose (Spyglass, `gear/peek.ts`):** size 1,
`window: "between-tricks"`, one `teammate` target. `canTarget` refuses "They
have no cards" when the target's hand is empty. `apply` draws one random
card id from the target's hand via `ctx.randomCardIdFrom(target, "peek")`
(the seeded A1 stream — never `Math.random`), then returns a single
`{ op: "reveal", cardId, audience: [ctx.self] }` — the audience is the
*user* only, never the target, which is what keeps the reveal private
(COMM-02). That's the whole file: no other mutation, no other draw.

## Add an objective kind

1. Add a member to `state.ts`'s `Objective` union (and, if it needs
   setup-time data, `ObjectiveSlot` too) — e.g. a new `{ id, kind: "<kind>",
   ...fields, ownerSeatId: string | null }` shape.
2. Add an `ObjectiveKindDef` in `objectives.ts` (`describe(objective)`, a
   human-readable string; `evaluate(state, objective)` returning
   `"pending" | "done" | "failed"`, recomputed fresh from `CampState` on
   every call — never cached, never reading a stored status field).
3. Add one line to `objectives.ts`'s `OBJECTIVE_KINDS` registry (keyed by
   `kind`). `OBJECTIVE_KINDS`'s type (`KindRegistry`, a mapped type over
   `ObjectiveKind`) makes a missing entry a **compile error** — the registry
   line isn't optional, the compiler enforces it.
4. `objective-kinds.contract.test.ts` iterates
   `Object.entries(OBJECTIVE_KINDS)` and checks every registered kind
   (`key === id`, a non-empty `describe()`, a deterministic `evaluate()` in
   `{pending, done, failed}`) — but it also keeps its own `FIXTURE_SLOT_FOR`
   map (the file's only per-kind data) with a guard test asserting its keys
   exactly match `OBJECTIVE_KINDS`'s keys. **Adding a kind means adding one
   line here too**, or the guard test fails loudly (by design — a silently
   un-fixtured kind would otherwise pass its contract vacuously).
5. Honestly: `camp.ts`'s `createCamp` builds each `Objective` from its
   `ObjectiveSlot` in a single `objectiveSlots.map(...)` with one branch per
   card-bearing vs. cardless kind (`slot.kind === "win-card"` /
   `"ordered"` both pull from `objectiveDeckRemaining`; anything else is
   assumed cardless). A genuinely new *shape* of slot (neither
   card-bearing nor a bare cardless flag) may need one more branch there —
   the existing four kinds needed none beyond that split, but this is not
   a promise that every future kind is literally zero extra lines in
   `camp.ts`.

## Add a boss twist

1. Create `boss/<id>.ts` exporting a `BossDef` (`boss/boss-def.ts`): `id`,
   `name`, `text`, and `modifiers` — a plain `RuleModifier`, composed exactly
   like a gear item's `passiveModifier`/`effectModifier` (see
   `boss/radio-silence.ts`'s single `whisperAllowed` override, or
   `boss/mutiny.ts`'s single `failureChecks` override). A boss twist has no
   `apply`, no toolkit ops, no targets — it is pure hook data, active for the
   whole camp from `run/compose.ts`'s `activeBossId` (unless cancelled this
   attempt by Rain Poncho, D-04).
2. Add one line to `boss/registry.ts`'s `BOSS_REGISTRY` object literal.
   `BossId` (`keyof typeof BOSS_REGISTRY`) and camp 6's twist-pool exclusion
   of camp 3's twist (D-03, `run/lifecycle.ts`'s `drawBossTwist`) both pick
   up the new entry with no other change.
3. `boss/boss.contract.test.ts` iterates `Object.entries(BOSS_REGISTRY)` and
   drives a real camp-3 attempt at 3/4/5 players to a decided outcome for
   every registered twist automatically — shape (every `modifiers` key is a
   known `HookName`), card conservation, a JSON round-trip, a full replay
   producing a byte-identical action log (determinism), and the interim
   no-leak check.

Note again: the four v1 twists (Monsoon/`radio-silence`, Eclipse/`eclipse`,
Thick Fog/`blind-orders`, Mutiny/`mutiny`) are explicitly **provisional
placeholders**, expected to be replaced by more original, jungle-native
twists later. This recipe is exactly what that replacement will use.

## Add a hook

1. Add the hook's signature to `run/run-rules.ts`'s `RunHooks` type (or, for
   a hook the *Core* itself calls rather than the run layer, to
   `rules.ts`'s `CoreRules`).
2. Give it a base implementation: `run/run-rules.ts`'s `baseRunHooks` (or
   `rules.ts`'s `baseRulesWith`/`baseRules` for a `CoreRules` hook).
3. List it in `run/run-rules.ts`'s `HOOK_NAMES` (built from a `Record<
   HookName, true>` object literal, `HOOK_NAME_SET`) — **omitting it here is
   a compile error**, by construction, the same exhaustiveness idiom
   `objectives.ts`'s `KindRegistry` uses for objective kinds. `HOOK_NAMES`
   is what `run/compose.ts`'s `composeRules` iterates to fold every layer's
   `RuleModifier`, so a hook missing from this list is never composed at
   all, silently.
4. Call it from the one Core or run-layer site that needs it — e.g. a new
   Core hook is called from `camp.ts`/`actions.ts`; a new run hook is called
   from wherever in `run/` needs its answer (`run/toolkit.ts`,
   `run/whisper.ts`, `run/lifecycle.ts`, etc., following the pattern of
   `capacityOf`/`whisperAllowed`/`failureCost`'s own single call sites).

## Add a toolkit op

1. Extend `gear/gear-def.ts`'s `ToolkitOp` union with a new `{ readonly op:
   "<name>"; ...fields }` variant.
2. Implement it as a new `case "<name>":` branch in `run/toolkit.ts`'s
   `applyOp` — state its invariant in a comment (mirroring `move-card`'s
   card-conservation guard, `reveal`'s non-empty-audience/no-duplicates
   guard, `swap-objectives`'s pending-only guard D-10, or
   `set-next-leader`'s no-trick-in-progress guard) and enforce it by
   throwing (POLICY A3) rather than silently producing an invalid state.
   `applyToolkitOps`'s exhaustiveness check (`const exhaustive: never = op`)
   makes a missing `case` a compile error.

## Add an interactable (Phase 14)

Interactables are clickable world objects, for fun only (spec §5.4): a
campfire's spark burst, scattering fireflies, a swinging lantern, the camp
mascot's reactions. **They never change game state and never reach the
server** — this registry lives entirely in `apps/web`, not in this package,
and is built in Phase 14. The fixed contract for that future registry: an
`InteractableDef` is one file plus one registry line, purely client-side
(a Phaser scene reacting to a click), with no `RunAction`, no toolkit op,
and no server round-trip of any kind.

## Add a card pack (Phase 12)

Card packs are the player's chosen card-face art (spec §7.3), stored per
browser like Hanabi's tile colour — not part of the rules engine's state or
legality at all. This registry also lives in `apps/web` and is built in
Phase 12. The fixed contract: `CardPackDef { id, name, face(card), back() }`,
drawing to Phaser textures, one file plus one registry line per pack (v1
ships two: Big Index and Classic, per spec §7.3).

## Invariants

- **No state mutation outside the toolkit.** A `GearDef.apply` only ever
  returns `ToolkitOp` data; `run/toolkit.ts`'s `applyToolkitOps` is the only
  function that ever writes to a `CampState`/`RunState` on gear's behalf.
  Every other transition in this package (`applyCampAction`,
  `applyRunAction`, `applyWhisper`) builds and returns a new state, never
  mutates its input.
- **Derive, don't cache.** Phase, status, the current actor, capacity, the
  next attempt number, and every seat's remaining Whisper count are all
  *computed* from `CampState`/`RunState` on every call (`campPhase`,
  `checkCampOutcome`, `currentActorSeatId`, `runPhase`, `runStatus`,
  `capacityOf`, `nextAttemptNumber`, `whispersUsedBy`) — none of them is a
  stored field. A composed `RunRules` value is likewise never cached
  (`run/compose.ts`'s `rulesFor` recomputes fresh every call); this is what
  lets a replay reset every camp-scoped resource structurally, by simply
  building a fresh `AttemptState`, rather than needing to hand-clear
  anything.
- **No non-seeded randomness or clock.** Every draw goes through
  `run/rng.ts`'s `seededIndex`/`STREAMS`, exposed to gear only through
  `GearContext.randomIndex`/`randomCardIdFrom`. `purity.test.ts` scans this
  whole directory and fails on a stray non-seeded random or clock call, or
  a Node/Worker/browser/Hanabi import — new files are covered automatically,
  with no test edit required.
- **Reveals are the only private channel.** A card identity is visible to a
  seat only via a `Reveal` addressed to it (`run/toolkit.ts`'s `reveal` op:
  audience must be non-empty, no duplicates, every seat known) or via that
  seat's own hand. A `LogEntry` never carries a card id, by its own type
  (`run/types.ts`).
- **The seed and draft offers are private** (Phase 11 must redact them, not
  implemented in this package): `RunState.seed` must never be projected to
  any client — it is the root of every RNG stream, and its exposure would
  let a client predict future draws. `SeatRun.draftOffer` is owner-only.
- **Rule-hook defects throw (A3).** A composed hook returning an
  out-of-domain value (an unknown seat, a missing catalogue id) is a
  content-authoring defect, not a player error, and it throws a plain
  `Error` naming the problem — it is never silently corrected or allowed to
  soft-lock a run.

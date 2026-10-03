# Expedition rules engine

This package (`packages/rules/src/expedition/`) is the whole Expedition rules
engine: framework-free TypeScript, zero Node/Worker/browser APIs, imported by
both the Cloudflare Worker (source of truth) and the Next.js client (display
only; the client never decides legality). See `purity.test.ts` for the
enforced import and API restrictions.

ENG-01's promise: adding an item, a character, an objective kind, a boss
twist, a hook or a toolkit op is **one new file plus one registry (or union
or list) line**, and the catalogue contract tests
(`content/sources.contract.test.ts`, `run/targets.contract.test.ts`,
`boss/boss.contract.test.ts`, `objective-kinds.contract.test.ts`) cover the
new entry with no test edits (ENG-02). Every recipe below names the exact
files and identifiers involved.

## Layout

- **Core** (this directory's top level): `state.ts` (the type vocabulary:
  `CampState`, the `Objective`/`ObjectiveSlot` unions, `CampAction`/
  `CampError`), `camp.ts` (`createCamp`, `checkCampOutcome`, `campPhase`,
  `currentActorSeatId`), `actions.ts` (`applyCampAction`), `objectives.ts`
  (`OBJECTIVE_KINDS`, `evaluateObjective`), `rules.ts` (`CoreRules` with
  `isTrump` and `rankOf`, `baseRules`), `deck.ts`, `trick.ts`, `leader.ts`,
  `legality.ts`. The Core never imports a boss or source id; it only calls
  through a `CoreRules` value.
- **`content/`**: the catalogue. `content/source-def.ts` holds the def types
  (`CharacterDef`, `UpgradeDef`, `ItemDef`, `ActiveAbility`,
  `PassiveAbility`, `UsageLimit`, `PoolDef`, `AbilityContext`) and the
  `defineCharacter`/`defineUpgrade`/`defineItem`/`ability` helpers.
  `content/characters/<id>.ts` is one character with its base power and its
  two upgrades; `content/items/<id>.ts` is one item. Each folder has a
  `registry.ts` (`CHARACTERS`, `ITEMS`). `content/helpers.ts` holds shared
  effect helpers (`winnerExcluding`, `freshObjectiveAvailable`).
- **`boss/`**: one file per boss twist (a `BossDef`), plus `boss/registry.ts`'s
  `BOSS_REGISTRY`.
- **`run/`**: the six-camp run on top of Core. `run/types.ts` (`RunState`,
  `SeatRun` with its `ledger`, `RunAction`, `Catalog`), `run/lifecycle.ts`
  (muster, `startAttempt`, `dealAttempt`, rescue-aware `settleIfDecided`,
  `advanceRun`), `run/run-actions.ts` (`applyRunAction`, the single run-level
  transition), `run/abilities.ts` (`abilityStatus`, `useAbility`,
  `passWindow`), `run/targets.ts` (`TARGET_KINDS`, `resolveTargets`,
  `stepsFor`), `run/windows.ts` (`WINDOWS`, `currentWindow`,
  `gatedPendingSeatIds`), `run/usage.ts` (`remaining`, `poolBalance`,
  `liveSourceIds`), `run/visibility.ts` (`visibleObjectives`),
  `run/compose.ts` (`rulesFor`, the rule layers), `run/run-rules.ts`
  (`RunHooks`, `HOOK_NAMES`), `run/toolkit.ts` (`ToolkitOp`,
  `applyToolkitOps`, the only mutation surface for abilities),
  `run/draft.ts`, `run/whisper.ts`, `run/balance.ts` (the tunable ramp),
  `run/rng.ts` (`STREAMS`, `seededIndex`) and `run/catalog.ts`'s `CATALOG`
  (`{ characters, items, bosses }` plus the flattened `sources` index).

**Layering order** (`run/compose.ts`): **base, then the active boss twist,
then per seat (seat order) each live source's passive in `[character,
...kit]` order, then each live effect's layer in `attempt.effects` order.**
Each layer's `RuleModifier` maps the previous layer's answer to its own, hook
by hook. The card-reading hooks `isTrump` and `rankOf` fold first (WR-03);
every other hook folds over the base built from them. A trick-scoped effect
(`lasts: "trick"`) is live only while `currentTrick.index === atTrick`.

**The toolkit is the only mutation surface** (`run/toolkit.ts`'s
`applyToolkitOps`): an ability's `apply` returns `ToolkitOp` data and never
touches `RunState` or `CampState` itself. `applyToolkitOps` asserts card
conservation after every op; a broken op throws (a content-author defect,
POLICY A3).

**Spending is the engine's job.** `useAbility` appends a `used` ledger entry
(with its pool cost), takes the supplies of a supplies limit, and removes a
single-use item from the kit. Authors never count uses.

**The RNG stream rule (A1):** `RunState` carries only a `seed` string. Every
draw derives a fresh, uniquely named stream via `run/rng.ts`'s `STREAMS`:

| Draw | Stream name |
|---|---|
| Draft, upgrade slot | `expedition-draft:camp{N}:seat{id}:upgrade` |
| Draft, item slots | `expedition-draft:camp{N}:seat{id}:items` |
| Boss selection | `expedition-boss:camp{N}` |
| Attempt deal seed | `{seed}:camp{N}:attempt{A}` |
| Face-down assignment (Thick Fog) | `expedition-face-down:camp{N}:attempt{A}` |
| Ability draws (`ctx.randomCards`, `ctx.randomIndex`) | `expedition-ability:camp{N}:attempt{A}:seat{id}:use{k}:draw{j}` |

`k` is the seat's ledger length before the use and `j` counts draws inside
one `apply`; the context builds both, so an ability never names a stream.

## Add an item

1. Create `content/items/<id>.ts` exporting `defineItem({ id, name, text,
   active?, passive? })`. `text` is one short sentence about the effect; the
   window and limit render as badges from the def, so the text never repeats
   them.
2. For an active item, `active: ability({ window, limit, targets, apply })`:
   - `window`: one of `run/windows.ts`'s `ActiveWindow`s (see "Add a
     window").
   - `limit`: `{ kind: "per-camp", times }`, `{ kind: "per-run", times }`,
     `{ kind: "single-use" }` or `{ kind: "supplies", cost }`. A `pool` limit
     is for characters only.
   - `targets`: a list of `TargetSpec`s, one picker step each (see "Add a
     target kind"). `ctx.targets` arrives resolved and typed per kind; you
     never parse an id or check a choice.
   - `canUse?(ctx)`: target-free availability, `true` or a player-facing
     reason. `canTarget?(ctx)`: rules across targets, `true` or a reason.
   - `apply(ctx)`: returns `ToolkitOp` data. If it emits `add-modifier`,
     also give `effect(e)`, the `RuleModifier` that op switches on.
   A passive item gives `passive: { modifier(owner) }` instead.
3. Add one line to `content/items/registry.ts`'s `ITEMS`.
4. `content/sources.contract.test.ts` covers it with no edits: shape, one
   sentence of text, `effect` iff `add-modifier`, determinism, conservation,
   a JSON round-trip, the per-seat leak check and the usage limits. Add its
   16x16 icon as `apps/web/public/expedition/sprites/sources/<id>.png` and its
   id to `SOURCE_ICON_IDS` (`apps/web/components/expedition/phaser/art/
   art-registry.ts`); `source-icons.test.ts` fails until you do.

**Worked example (Bait, `content/items/bait.ts`):** window `"in-trick"`,
limit `single-use`, one `{ kind: "card", where: "board" }` target. `apply`
returns one trick-scoped `add-modifier` whose params name the card, and
`effect` overrides `trickWinner` with `winnerExcluding(prev, plays, ...)`, so
that card can't win this one trick.

## Add a character

1. Create `content/characters/<id>.ts` exporting `defineCharacter({ id,
   name, theme, power, text, pool?, active?, passive?, upgrades })`. `power`
   names the base power ("Spyglass"); `text` says what it does.
2. `pool` (optional) is the character's resource: `{ name, start, max,
   regain }`. Abilities of this character and its upgrades may use
   `{ kind: "pool", cost }`; the engine regains it after each cleared camp.
3. `upgrades` is exactly two `defineUpgrade({...})` entries in the same
   file. `defineCharacter` stamps the character id onto both. An upgrade
   that tunes the base power has no ability of its own: the base power reads
   `owner.hasUpgrade("<upgrade id>")` through a `Tuned<T>` value (see
   Pathfinder in `guide.ts`).
4. Add one line to `content/characters/registry.ts`'s `CHARACTERS`. The
   contract tests cover the character and both upgrades with no edits. Add
   the 64x80 silhouette as `sprites/crew/<id>.png`, the icons for the power
   and both upgrades under `sprites/sources/`, and the ids to `CREW_IDS` and
   `SOURCE_ICON_IDS`.

## Add a target kind

1. Add the kind to `run/targets.ts`'s `TargetKind` union, its spec params to
   `SpecParams`, and what `apply` receives to `TargetOf`.
2. Add its entry to `TARGET_KINDS` (a mapped type, so a missing entry is a
   compile error): `describe(spec)` is the prompt line ("Pick a teammate's
   hand"), and `choices(scope, spec)` returns every legal `{ id, target }`
   pair the seat may see, in stable table order. The ids ship to the client,
   so they must name only things the seat can see; hidden things are
   targeted as wholes. Validation and resolution both come from `choices`.
3. `run/targets.contract.test.ts` checks every kind at 3, 4 and 5 players
   (stable choices, each resolves to itself, a foreign id is refused, the
   leak check passes).
4. In the web client, map the id prefix to a clickable thing:
   `apps/web/lib/expedition/local-ui.ts`'s `PickEntity` and
   `ENTITY_PREFIX`, then highlight it from `choiceFor` in
   `build-scene-model.ts`, or offer it in the pick tray (`buildTray`) when it
   has no single place on the table. `describeChoice` in `build-prompt.ts`
   names it on the confirm line.

## Add a window

1. Add the id to `run/windows.ts`'s `ActiveWindow` and its `WindowDef` to
   `WINDOWS`: `phrase` (the badge text), `gated` (whether the table waits
   for every eligible seat to use or pass), `isOpen(run, rules)` and
   `mayAct(run, rules, seatId)`. The `isOpen` predicates must stay mutually
   exclusive: `currentWindow` assumes at most one is open.
2. A gated window needs a hold in `run/lifecycle.ts`'s `advanceRun` (pre-deal
   holds the deal; rescue holds the settle) and is passed with
   `skip-window`. `gatedPendingSeatIds` already counts any gated window.
3. The web client shows a gated window as the banner on the stump
   (`buildBanner` in `apps/web/lib/expedition/build-scene-model.ts`); an open
   window needs nothing more, since `yourAbilities` already says what is
   usable now.

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
   `name`, `text`, and `modifiers`: a plain `RuleModifier`, composed exactly
   like a source's passive or effect layer (see
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
   producing a byte-identical action log (determinism), and the per-seat
   leak check (adapter/view-leak-check.ts, run for every seat and an
   unseated viewer).

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
   `whisperAllowed`/`failureCost`'s own single call sites).

## Add a toolkit op

1. Extend `run/toolkit.ts`'s `ToolkitOp` union with a new `{ readonly op:
   "<name>"; ...fields }` variant.
2. Implement it as a new `case "<name>":` branch in `run/toolkit.ts`'s
   `applyOp` — state its invariant in a comment (mirroring `move-card`'s
   card-conservation guard, `reveal`'s non-empty-audience/no-duplicates
   guard, `swap-objectives`'s pending-only guard D-10, or
   `set-next-leader`'s no-trick-in-progress guard) and enforce it by
   throwing (POLICY A3) rather than silently producing an invalid state.
   `applyToolkitOps`'s exhaustiveness check (`const exhaustive: never = op`)
   makes a missing `case` a compile error.

## Add an interactable

Interactables are clickable world objects, for fun only (spec §5.4): a
campfire's spark burst, scattering fireflies, a swinging lantern, the camp
mascot's click bubble. **They never change game state and never reach the
server** — the registry lives entirely in `apps/web`, not in this package:
`apps/web/components/expedition/phaser/interactables/registry.ts`'s
`INTERACTABLE_REGISTRY`, built in Phase 12. The fixed contract: an
`InteractableDef` is one new file under `interactables/<id>.ts` plus one
import and one object-literal line in that registry, purely client-side (a
Phaser scene reacting to a click), with no `RunAction`, no toolkit op, and no
server round-trip of any kind — enforced automatically for every registered
entry by `interactables.contract.test.ts`'s source scan. The mascot's
reactions to game events (hopping on a completed objective, flopping on a
failed camp) arrive with Phase 14's art pass; only its click bubble exists
today.

## Add a card pack

Card packs are the player's chosen card-face art (spec §7.3), stored per
browser like Hanabi's tile colour — not part of the rules engine's state or
legality at all. This registry also lives in `apps/web`, built in Phase 12:
`apps/web/components/expedition/phaser/card-packs/registry.ts`'s
`CARD_PACK_REGISTRY`, typed against `CardPackId`
(`apps/web/lib/expedition/card-pack-ids.ts`) so a missing or misnamed pack is
a compile error. The fixed contract: `CardPackDef { id, name, face(card),
back() }`, drawing to Phaser textures, one file plus one registry line per
pack (v1 ships two: Big Index and Classic, per spec §7.3) — covered
automatically by `card-packs.contract.test.ts`.

## Invariants

- **No state mutation outside the toolkit.** An ability's `apply` only ever
  returns `ToolkitOp` data; `run/toolkit.ts`'s `applyToolkitOps` is the only
  function that ever writes to a `CampState`/`RunState` on its behalf.
  Every other transition in this package (`applyCampAction`,
  `applyRunAction`, `applyWhisper`) builds and returns a new state, never
  mutates its input.
- **Derive, don't cache.** Phase, status, the current actor, the open
  window, the next attempt number, every seat's remaining Whisper count and
  every source's remaining uses are *computed* from `CampState`/`RunState`
  and the seat ledgers on every call (`campPhase`, `checkCampOutcome`,
  `currentActorSeatId`, `currentWindow`, `runPhase`, `runStatus`,
  `nextAttemptNumber`, `whispersUsedBy`, `remaining`). None is a stored
  field; rescue is not a stored mode. A composed `RunRules` value is likewise never cached
  (`run/compose.ts`'s `rulesFor` recomputes fresh every call); this is what
  lets a replay reset every camp-scoped resource structurally, by simply
  building a fresh `AttemptState`, rather than needing to hand-clear
  anything.
- **No non-seeded randomness or clock.** Every draw goes through
  `run/rng.ts`'s `seededIndex`/`STREAMS`, exposed to abilities only through
  `AbilityContext.randomIndex`/`randomCards`. `purity.test.ts` scans this
  whole directory and fails on a stray non-seeded random or clock call, or
  a Node/Worker/browser/Hanabi import — new files are covered automatically,
  with no test edit required.
- **Reveals are the only private channel.** A card identity is visible to a
  seat only via a `Reveal` addressed to it (`run/toolkit.ts`'s `reveal` op:
  audience must be non-empty, no duplicates, every seat known) or via that
  seat's own hand. A `LogEntry` never carries a card id, by its own type
  (`run/types.ts`).
- **The seed and draft offers are private.** `RunState.seed` is redacted by
  `adapter/view.ts`'s explicit allowlist — it is never written into any view
  literal, at any nesting level — since it is the root of every RNG stream
  and its exposure would let a client predict future draws. `SeatRun.draftOffer`
  is likewise redacted to a plain per-seat conditional lookup: a viewer's
  `yourDraftOffer` is their own offer or `null`, never another seat's. Both
  are proven redacted by `adapter/view.property.test.ts`'s whole-run
  per-seat leak property (COMM-03/ENG-03).
- **A reveal pins identity only (WR-03).** A `Reveal` shows the card's
  identity and the seat that held it at the moment of the reveal; it never
  follows the card after a later move/swap, and the view never re-derives a
  revealed card's CURRENT holder from that reveal. A reveal is a fixed,
  point-in-time fact, not a live tracker.
- **Rule-hook defects throw (A3).** A composed hook returning an
  out-of-domain value (an unknown seat, a missing catalogue id) is a
  content-authoring defect, not a player error, and it throws a plain
  `Error` naming the problem — it is never silently corrected or allowed to
  soft-lock a run.

## Adapter

`adapter/adapter.ts` (`expeditionGame`, the `GameAdapter` conformance),
`adapter/view.ts` (`toExpeditionPlayerView`, the sole per-seat projection),
`adapter/request-guards.ts` (hostile-input `unknown` → `RunAction` narrowing)
and `adapter/view-leak-check.ts` (`checkExpeditionViewForLeaks`/
`secretsForExpeditionSeat`, the real per-seat leak checker) are this
engine's only seam to the room layer. A new source, target kind or boss
registered per the recipes above is leak-checked automatically by
`sources.contract.test.ts`, `targets.contract.test.ts` and
`boss.contract.test.ts`, which call the real checker for every registered
entry with zero test edits. `adapter/catalog-display.ts` projects the
catalogue for the client (`SOURCE_DISPLAY`, `CHARACTER_DISPLAY`,
`BOSS_DISPLAY`): names, text, window and limit badges, never a function.

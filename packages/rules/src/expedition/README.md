# Expedition rules engine

This package (`packages/rules/src/expedition/`) is the whole Expedition rules
engine: framework-free TypeScript, zero Node/Worker/browser APIs, imported by
both the Cloudflare Worker (source of truth) and the Next.js client (display
only; the client never decides legality). See `purity.test.ts` for the
enforced import and API restrictions.

ENG-01's promise: adding an item, a character, an objective kind, a hook or
a toolkit op is **one new file plus one registry (or union or list) line**,
and the catalogue contract tests (`content/sources.contract.test.ts`,
`run/targets.contract.test.ts`, `objective-kinds.contract.test.ts`) cover
the new entry with no test edits (ENG-02). Every recipe below names the exact
files and identifiers involved.

## Layout

- **Core** (this directory's top level): `state.ts` (the type vocabulary:
  `CampState` with its `discards`, `ResolvedPlay`, the `Objective`/
  `ObjectiveSlot` unions, `Goal`, `CampEvent`, `CampAction`/`CampError`),
  `camp.ts` (`createCamp`, `checkCampOutcome`, `campPhase`,
  `currentActorSeatId`, `guard`), `actions.ts` (`applyCampAction`, which
  also reports the action's `CampEvent`s), `objectives.ts`
  (`OBJECTIVE_KINDS`, `evaluateObjective`), `rules.ts` (`CoreRules`,
  `baseRules`), `deck.ts`, `trick.ts` (`legalPlaysFor`, `trickWinner`,
  `resolveTrick`), `leader.ts`, `legality.ts`. The Core never imports a
  source id; it only calls through a `CoreRules` value.

**Core hooks** (`rules.ts`'s `CoreRules`): `deckFor`, `objectiveDeckFor`
(base: standard cards ranked above the deck's lowest rank), `leaderFor`, the
card reading `identityOf`, `isTrump` and `rankOf`, `trickWinner(plays,
led)`, `legalPlays`, `burns(plays, led, winnerOf)`, `nextLeader`,
`objectiveStatus` (base: `evaluateObjective`) and `goals` (camp-wide
conditions; every one must be done). A full trick resolves once, in
`resolveTrick`: the led identity is what the lead counts as, burned plays
leave the trick (and never count for an objective), and the winner is the
highest trump kept, else the highest kept card following the led identity,
else the highest kept card; equal strength goes to the earliest play. A card
objective fails at once when its printed card burned, counted as another
card or was discarded, and fails if never played by the final trick.
- **`content/`**: the catalogue. `content/source-def.ts` holds the def types
  (`CharacterDef`, `UpgradeDef`, `ItemDef`, `ActiveAbility`,
  `PassiveAbility`, `UsageLimit`, `PoolDef`, `AbilityContext`) and the
  `defineCharacter`/`defineUpgrade`/`defineItem`/`ability` helpers.
  `content/characters/<id>.ts` is one character with its base power and its
  two upgrades; `content/items/<id>.ts` is one item. Each folder has a
  `registry.ts` (`CHARACTERS`, `ITEMS`). `content/helpers.ts` holds shared
  effect helpers (`winnerExcluding`, `freshObjectiveAvailable`).
- **`run/`**: the staged run on top of Core. `run/types.ts` (`RunState`,
  its `Stage` union and `RunAt<T>`, `SeatRun` with its `ledger`,
  `RunAction`, `Catalog`), `run/stages/` (`registry.ts`'s `STAGES` and
  `applyRunAction`, the single run-level transition, plus one file per
  stage: muster, loadout, camp, draft, route, event), `run/lifecycle.ts`
  (`createRun`, `runStatus`, `dealCamp`, `settleCamp`), `run/plan.ts`
  (`RunPlan`, `campIndex`, `drawPlan`), `run/route.ts` (`CampSpec`,
  `firstCampSpec`, `routeOptions`), `run/vote.ts` (`tally`),
  `run/attempt.ts` (`attemptOf`, `withAttempt`), `run/abilities.ts`
  (`abilityStatus`, `useAbility`, `passWindow`), `run/targets.ts`
  (`TARGET_KINDS`, `resolveTargets`, `stepsFor`), `run/windows.ts`
  (`WINDOWS`, `currentWindow`, `gatedPendingSeatIds`), `run/usage.ts`
  (`remaining`, `poolBalance`, `liveSourceIds`), `run/compose.ts`
  (`rulesFor`, the rule layers), `run/run-rules.ts` (`RunHooks`,
  `HOOK_NAMES`), `run/toolkit.ts` (`ToolkitOp`, `applyToolkitOps`, the only
  mutation surface for abilities), `run/draft.ts`, `run/whisper.ts`,
  `run/balance.ts` (every tunable number), `run/rng.ts` (`STREAMS`,
  `seededIndex`) and `run/catalog.ts`'s `CATALOG` (`{ characters, items }`
  plus the flattened `sources` index). `content/events/` holds `EVENTS`.

**The run loop.** A run is a stored stage, and `applyRunAction` is the one
transition: it refuses an action type the stage does not accept
(`wrong_stage`), runs the stage's handler, then advances stage by stage
until the tag stops changing.

1. **Muster.** Each seat sends `pick-character` and `vote { choice }`
   ("short", "standard", "long", or null to abstain). A ballot may change
   until the vote resolves. The last missing input resolves it (majority,
   else a seeded coin flip recorded in `lastVote`), draws the plan and opens
   the loadout for camp 1 (the Jungle, fair weather).
2. **Loadout.** Each seat sends `ready`; the last one deals the camp.
3. **Camp.** Play as before. A decided camp settles unless a rescue is
   pending.
4. **Settle.** A failure costs supplies and reopens the loadout for the same
   camp spec with a fresh deal; 0 supplies ends the run. A clear pays
   `5 + min(3, unplayed tricks)` into the shared purse and deals every seat
   a private draft offer, or wins the run at the final camp.
5. **Draft.** Each seat with an offer sends `pick-draft`.
6. **Route.** Each seat votes over 2 or 3 options to the next camp.
7. **Event.** A stub with no effect yet. Each seat sends `ready`, then the
   next camp's loadout opens.

A disconnected seat's ballot is cast as an abstention by the worker's
auto-pass after the existing grace.

**Layering order** (`run/compose.ts`): **base, then per seat (seat order)
each live source's passive in `[character, ...kit]` order, then each live
effect's layer in `attempt.effects` order.**
Each layer's `RuleModifier` maps the previous layer's answer to its own, hook
by hook. The card-reading hooks `identityOf`, `isTrump` and `rankOf` fold
first, in that order (WR-03); every other hook folds over the base built
from them. A trick-scoped effect
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
| Length vote tie | `expedition-vote:length` |
| Route vote tie | `expedition-vote:route:camp{k}` (k = the next camp) |
| Route option count | `expedition-route:camp{k}:count` |
| Route option field | `expedition-route:camp{k}:reroll{r}:option{i}:{event\|mix}` |
| Draft, upgrade slot | `expedition-draft:camp{k}:seat{id}:upgrade` (k = the cleared camp) |
| Draft, item slots | `expedition-draft:camp{k}:seat{id}:items` |
| Attempt deal seed | `{seed}:camp{k}:attempt{A}` |
| Trick-count kind and N | `expedition-trickcount-{kind\|n}:camp{k}:attempt{A}` |
| Ability draws (`ctx.randomCards`, `ctx.randomIndex`) | `expedition-ability:camp{k}:attempt{A}:seat{id}:use{u}:draw{j}` |

`u` is the seat's ledger length before the use and `j` counts draws inside
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
     also give `effect(e, run)`, the `RuleModifier` that op switches on.
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
`effect` overrides `trickWinner` with `winnerExcluding(prev, plays, led, ...)`, so
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
2. A gated window needs a hold in `run/stages/camp.ts`'s `settleIfDecided`
   (rescue holds the settle) and is passed with `skip-window`.
   `gatedPendingSeatIds` already counts any gated window.
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
   `"ordered"` both pull from `objectiveDeckRemaining`, unless a win-card
   slot names a `fixed` target; anything else is assumed cardless). A genuinely new *shape* of slot (neither
   card-bearing nor a bare cardless flag) may need one more branch there —
   the existing four kinds needed none beyond that split, but this is not
   a promise that every future kind is literally zero extra lines in
   `camp.ts`.

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

## Dev mode

A sandbox for debugging: skip to any camp, edit any state, play a 3-5 seat
table alone.

**Enable.** Both halves must be on. The worker needs `DEV_MODE`: `npm run
dev` in `apps/worker` runs `wrangler dev --port 8787 --var DEV_MODE:1`, and
Playwright's worker command passes the same var. `wrangler.jsonc` never sets
it, so a deploy refuses every `dev` message with a `dev_result` saying how
to turn it on. The web app shows the panel when `NODE_ENV` is `development`
(`next dev`) or `NEXT_PUBLIC_DEV_MODE=1`.

**Use.** On a room page press backtick or click the small DEV button
(bottom left).
- Lobby: "Add bot" seats a bot (a seat nobody connects to). Two bots plus you
  is a legal Expedition table.
- Autoplay: pick who it plays for (bots, everyone but me, everyone) and when
  it stops (your decision, or the next camp to settle), with a step cap.
  Bots abstain from votes, so your ballot decides.
  "Bots act automatically" re-runs bot autoplay after every change.
- Shortcuts: jump to a camp of a chosen run length (arriving at its
  loadout or dealt), jump to the final camp, end the run won or lost, force
  the camp to clear or fail (through the real settle), set supplies, set the
  purse, set a seat's character or kit, give a source, move a card between
  hands, set an objective's owner.
- Reveal all hands: a plain-text dump of every hand, objective and trick.
- State: the whole `RunState` as JSON. Edit and Apply; the worker parses it
  with `ExpeditionRunStateSchema` and then `dev/check.ts` (card conservation,
  known ids, seat alignment), and answers with a readable error if either
  fails.
- Snapshots: named copies of the state in this browser's localStorage. One
  saved in another room loads into any room with the same seat count; its
  seat ids are renamed to the room's.

**Where it lives.** The room plumbing is game-agnostic: `GameAdapter.dev`
(`packages/rules/src/adapter.ts`), `apps/worker/src/dev-room.ts`, the `dev`
messages in `packages/schema/src/dev.ts`, and `apps/web/components/dev/
DevPanel.tsx`, which renders whatever shortcuts the game describes. The
Expedition layer is `dev/`: `shortcuts.ts` (the `DEV_SHORTCUTS` registry,
one small pure function over `RunState` each), `check.ts`, `autoplay.ts`
(`botMove`, the first priority move `applyRunAction` accepts, never a
whisper or an ability), `inspect.ts` and `hooks.ts`. When `RunState`
changes, update `ExpeditionRunStateSchema` (the worker's compile-time
assertion in `game-registration.ts` fails until you do), then `check.ts` and
whichever shortcuts touch the changed fields.

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
  `currentActorSeatId`, `currentWindow`, `runStatus`,
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
  draft stage's `yourOffer` is their own offer or `null`, never another seat's. Both
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
engine's only seam to the room layer. A new source or target kind
registered per the recipes above is leak-checked automatically by
`sources.contract.test.ts` and `targets.contract.test.ts`, which call the
real checker for every registered entry with zero test edits.
`adapter/catalog-display.ts` projects the catalogue for the client
(`SOURCE_DISPLAY`, `CHARACTER_DISPLAY`): names, text, window and limit
badges, never a function.

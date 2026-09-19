# Innovation Rules Engine — Architecture Research

**Researched:** 2026-09-19
**Scope:** How to architect a server-authoritative rules engine for Carl Chudyk's *Innovation* (base game) inside `packages/rules`, behind the existing `GameAdapter` seam, persisted as JSON in a Cloudflare Durable Object.
**Overall confidence:** HIGH on the architecture recommendation and on the survey of BGA and the C# port (their source code was read directly). MEDIUM on edition-difference details and exact card counts per edition. LOW where marked.

---

## TL;DR

1. **Use a generator-per-action engine with deterministic replay inside the current action.** Write the turn/dogma framework and every card effect as TypeScript generator functions (`function*`) that `yield` a *decision request* when a player has to choose. Generators cannot be serialized, so **do not persist the generator**. Persist instead:
   - the plain-JSON state at the **start of the current action** (`actionStart`)
   - the ordered list of **validated answers** given during that action (`answers[]`)
   - the current **pending decision** (a cache, so views don't need to replay)

   When an answer arrives, reload `actionStart`, re-run the action's generator, feed it the recorded answers plus the new one, and stop at the next decision or at the end of the action. This works because the base game is fully deterministic after the setup shuffle. It is the same idea as Temporal / Azure Durable Functions orchestration replay, scoped to one action so it stays cheap and a code change can only affect the action in progress.
2. **Author cards in a hybrid style.** Static card data (name, age, color, icon slots, dogma icon, effect text, demand or not) goes in a plain data table. Each effect body is a short TypeScript generator built on a library of high-level primitives (`chooseCards({from:"hand", highest:true, may:true})`, `draw(age)`, `meld`, `score`, `tuck`, `splay`, `transfer`, `executeNonDemands(card)`). BGA's `InteractionBuilder` has proven this shape across 500+ cards. Do not build a standalone DSL or grammar.
3. **Use one pending decision at a time, owned by exactly one seat, with the legal options computed and stored by the engine.** The one exception is the simultaneous initial meld during setup. No timeouts: the table waits, and every other seat sees "Waiting on X to choose …" plus a disconnected badge. The existing reconnect-token path already restores the chooser's view, options included.
4. **Treat hidden information as the #1 correctness risk, and extend the Hanabi leak checker's structural + multiset approach.** New for Innovation: per-seat *log* projection (a transfer from A's hand to B's hand is known to A and B, and everyone else sees only its age), decision options visible only to the chooser, and server-only replay fields (`actionStart`, `answers`, seed, deck order) that must never be projected.
5. **The adapter interface mostly fits.** Four things need to change: the Hanabi-specific `Variant` union, the closed Hanabi `AdapterError` union, the co-op-only `GameEndResult` (Innovation has winners), and the single hard-coded `activeGame` registration. `applyAction(state, actor, request)` already handles out-of-turn choosers, because the adapter, not the room, decides who may act.
6. **Rough size is 4-6× the Hanabi engine**, mostly the 105 card bodies and their tests. Suggested build order: vanilla game with no dogmas, then the dogma framework with about 8 representative cards, then three card batches by age, then soak and hardening.

---

## 1. Fit with the existing `GameAdapter` seam

Source: `packages/rules/src/adapter.ts`, `apps/worker/src/room-state.ts`, `apps/worker/src/game-registration.ts`, `packages/rules/src/hanabi/*`.

### What fits as-is

| Adapter member | Innovation fit |
|---|---|
| `createInitialState({seatIds, variant, seed})` | Good. Innovation's only randomness is the setup shuffle of the ten age decks and the drawing of the nine age achievements. BGA's engine calls `shuffle()` exactly once, at setup (`innovation.game.php:779`); no base card shuffles. The existing 128-bit `sfc32`/`cyrb128` shuffle in `shuffle.ts` and the server-secret seed can be reused unchanged. **HIGH** |
| `applyAction(state, actorSeatId, request: unknown)` | Good. Choices are just another kind of request (`{type:"decide", decisionId, pick}`). The room layer does **not** gate on turn order; `applyGameAction` hands every action to the adapter. That is exactly what lets a non-active seat answer a demand. The per-seat `lastAppliedActionId` dedup in `room-state.ts` also covers retried choices. |
| `toPlayerView(state, seatId)` | Good. It remains the only exit for state. Innovation needs richer per-seat redaction (see section 6), but the shape is the same. |
| Invariant #1 (never mutate the input) | Satisfied by cloning once at entry (`structuredClone`, a global and not a dependency) and running the generator against a mutable working copy. Writing Innovation in Hanabi's immutable-spread style would be far more painful given how many zones one effect touches. |
| Invariant #2 (never throws) | The driver must catch the internal `GameOver` sentinel (section 5) and any engine bug, and return `{ok:false}` or a finished state. |
| Zero runtime dependencies (FDN-02) | Nothing below needs a library. Generators, `structuredClone`, and the existing PRNG are enough. |

### What must change

| Change | Why | Suggested shape |
|---|---|---|
| **`Variant` is `"base" \| "rainbow" \| "black"` in the shared adapter file** (`adapter.ts:17`), and `RoomState.variant` inherits it | Innovation's options are different: edition (3rd or 4th, see section 9), possibly 2v2 teams at 4 players. | Make the adapter generic over `TOptions`, or pass `options: unknown` that the adapter validates, as it already does for `request`. Move each game's options schema into `@games/schema/games/<id>`. |
| **`AdapterError` is a closed union of Hanabi reasons** | Innovation adds `not_your_decision`, `stale_decision`, `illegal_choice`, `cannot_achieve`, and so on. | Make it `string` codes namespaced per game, or a generic `TError` parameter. `mapAdapterError` in the worker already maps errors, so only the type needs to widen. |
| **`GameEndResult = {score, reason, band?}`** is co-op-shaped | Innovation is competitive. It can end by achievement count, by drawing past age 10 (highest score wins, ties broken by achievements), or through a card win condition (for example A.I. or Bioengineering). | Widen additively to `{winners: string[]; reason: string; perSeat?: Record<string, {score:number; achievements:number}>}`. Keep `score`/`band` optional for Hanabi. |
| **`activeGame` is one hard-coded constant** (`game-registration.ts`) | Two games means the room must record which game it plays. | A registry keyed by `gameId`, stored in `RoomState`, chosen at room creation or in the lobby. The persisted `gameId` check already exists, so the rest of the room layer stays untouched. |
| **Seat-count limits** are implicit | Innovation plays 2-4. Hanabi plays 2-5. | Add `minSeats`/`maxSeats` to the adapter (a sixth member, which is a deliberate interface change), or put them in per-game registration metadata. |
| *(Optional)* `pendingSeats(state): string[]` | The room layer could use it for "your move" notifications and presence without parsing the game view. | Nice to have. The per-seat view can carry the same information. |

`checkGameEnd` itself fits. It is called after every `applyAction`, and the Innovation state records a finished result when the game ends mid-effect.

---

## 2. How existing implementations handle it

### 2.1 Board Game Arena — `micahstairs/bga-innovation` (PHP, open source) — **read directly, HIGH**

<https://github.com/micahstairs/bga-innovation> (actively maintained; last push 2026-03). It implements the base game, all expansions, and both the 3rd and 4th editions.

- **Framework = explicit state machine plus a persisted "nesting stack".** `states.inc.php` defines states `dogmaEffect → playerInvolvedTurn → interactionStep → preSelectionMove → selectionMove (activeplayer, action "choose") → interSelectionMove`, with "inter" game states between them. The continuation lives in SQL. Table `nested_card_execution` has one row per nesting level, with `card_id`, `launcher_id`, `current_player_id`, `current_effect_type` (demand, non-demand, compel, echo), `current_effect_number`, `step`, `step_max`, `post_execution_index`, `replace_may_with_must`, and two `auxiliary_value` ints. Extra tables (`auxiliary_value_table`, `indexed_auxiliary_value`, `action_scoped_auxiliary_value_table`) hold per-card scratch arrays (`dbmodel.sql:63-116`).
- **Cards = per-card classes with a declarative interaction builder and imperative hooks.** Example `Base/Card10.php` (Domestication): `getInteractionOptions()` returns `youMust()->meld()->lowest()->fromYourHand()`, and `afterInteraction()` calls `draw(1)`. Multi-step cards use `setMaxSteps(n)`, `isFirstInteraction()`, and `setAuxiliaryValue()`. For example, Gunpowder counts transfers in the aux value so the non-demand can check whether anything was transferred. Hooks include `initialExecution`, `handleCardChoice`, `handleColorChoice`, `handlePlayerChoice`, `handleSpecialChoice`, `afterInteraction`, and `atEndOfEffect` (`AbstractCard.php`, 1,970 lines, plus `InteractionBuilder.php`, 859 lines).
- **Pending choice representation.** The "interaction options" describe location from/to, owner, filters (`withIcon`, `lowest`, `highest`), count (`exactly(2)`), `can_pass` for "you may", and the player who chooses. The server computes the selectable set, and `interSelectionMove` auto-selects when only one card is selectable.
- **Game end mid-effect.** An `EndOfGame` exception is thrown from deep inside effect code and caught at the state boundaries (`innovation.game.php:41`, with about 7 catch sites).
- **Special achievements.** `checkForSpecialAchievements()` runs after state changes under 3rd-edition rules. Under 4th-edition rules it runs at the end of the action (`$is_end_of_action_check`). The 3rd-edition tie-break is to check the current player first, then clockwise (the code cites BGG thread 2710666).
- **Editions.** 15 base cards have separate `_3E`/`_4E` classes, and ten 4th-edition cards (`Card440`–`Card449`) are the new Age 11.
- **Testing.** `tests/Integration/Cards/Base/*` has per-card integration tests (build a table, meld the card under test, select cards, assert). `RandomGameTest.php` plays random games to completion under every edition and expansion mix, asserting invariants at each step ("no cards stuck in the revealed zone", "decks are valid").
- **Lesson.** The step and aux-value style is proven, but it is verbose and fragile. Every multi-step card manually encodes its program counter in `step` plus untyped integers. That is exactly the work a generator's implicit stack does for you.

### 2.2 C# port — `johnchampaign/innovation-csharp` (2026, port of Jeff Till's 2013 VB6) — **read directly, HIGH**

<https://github.com/johnchampaign/innovation-csharp>. Base game only. 151 handler classes (about 7.7K lines) plus about 3.7K lines of core and about 6.8K lines of tests.

- **Re-entrant handlers.** `bool Execute(GameState g, PlayerState target, DogmaContext ctx)`. To pause, a handler sets `ctx.PendingChoice` (typed `ChoiceRequest` subclasses: `SelectHandCard`, `SelectHandCardSubset`, `SelectScoreCard`, `SelectColor`, `YesNo`, `SelectStackOrder`, `SelectValue`), sets `ctx.Paused = true`, and returns. On resume the engine calls the handler again, which reads the filled-in answer. Multi-stage handlers keep "which stage am I in" in `ctx.HandlerState` (an untyped `object?`).
- **Nesting.** `DogmaContext.NestedFrames` is a stack of "execute card X's non-demand effects for player Y" frames, used by Robotics, Self Service, Computers, Software, and Satellites. Each frame has its own scratch state.
- **Explicit rules notes worth copying into our tests:**
  - Icon counts for demand/share eligibility are **snapshotted at activation** and frozen for the whole dogma.
  - Targets per effect level are computed once, at the start of that level.
  - The sharing bonus is one draw for the activator when any opponent "progressed" a shared non-demand.
  - In demand text, the "you" of "…! If you do, draw …" is the **target**, not the activator. Six handlers had this bug.
  - For shared effects that compare players (for example Democracy), compare against what earlier targets recorded during this dogma, not the final tally.
- **Serialization gap.** Its `GameStateCodec` "does not capture mid-dogma state. Round-trip safe only at turn boundaries." Their controllers are synchronous (blocking UI calls), so they never needed it. We do, because a Durable Object hibernates between every message. **This is the trap to avoid.**

### 2.3 `jrdek/innovation` (Python) — interpreter over a card DSL — **read directly, HIGH**

<https://github.com/jrdek/innovation>. All 105 base cards are written in a custom English-like DSL (`cards/base_game.cards`, parsed by a 513-line Lark grammar into an IR that is type-checked in `dogma_ir_typing.py`, 805 lines).

- Its design journal explains why the author interprets rather than compiling effects to functions: "PlayerAgents often need to make choices in the middle of an effect … By storing DogmaEffects as trees and traversing them live, the interpreter can query PlayerAgents live and sequentially."
- Choices are **synchronous callbacks** into agent objects, so there is no pause or serialize story.
- An interpreter over an AST *could* be made serializable, because the program counter becomes a path in the tree. But the DSL needed hacks (for example `# TODO: half grammatical`) and special ACTOR/PLAYER constructs for "if no cards were transferred due to this effect". **Takeaway:** a full DSL is expensive to design and still leaks one-off logic. A small typed primitive library plus TypeScript code gets most of the benefit.

### 2.4 innovation.isotropic.org (Doug Zongker) — closed source — **MEDIUM**

<https://innovation.isotropic.org/>, FAQ at <https://innovation.isotropic.org/faq/>. This is the long-running reference online implementation, and its source is not public. The FAQ is candid that "many cards have imprecise wording or multiple interpretations; developers made 'best guesses'", and that adding Figures required "extensive base game rewrites". Game logs from Isotropic are archived at <https://github.com/rspeer/scorepile>. They are **potentially useful as a regression oracle**: replay real games through our engine and compare results. That is unverified and would need a log parser. **LOW-MEDIUM**

### 2.5 Other open-source attempts — **surveyed, LOW value**

`mrobert09/Innovation` (Java, one class per card, `innovation/card/three/Alchemy.java` and so on, with a socket client/server). `joewledger/innovation` (Python, per-age card-effect tests). `jsparkes/innovation` (VB.NET, the Jeff Till lineage, plus F# and PureScript ports). None has a serializable mid-effect continuation. All confirm the same layout: per-card code plus a shared primitive library.

### 2.6 boardgame.io — the closest general framework — **HIGH (docs read)**

<https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/stages.md>. It handles interrupts with **stages**: `setActivePlayers({...})` puts arbitrary players into named stages with their own move sets, and `ctx.activePlayers` maps player to stage (`null` when only `currentPlayer` may act). This is serializable because it is flat data, but it has no notion of *where inside an effect* you are. You would still hand-encode the continuation in `G`, which is the BGA approach again. Worth borrowing: "active players map" as the public representation of who must act. Not worth adopting as a dependency, since the room/realtime layer already exists.

### 2.7 General patterns

| Pattern | Serializable? | Card-authoring ergonomics | Used by |
|---|---|---|---|
| **A. Explicit state machine + step counter + aux values** | Yes, natively | Poor: hand-written program counter per card | BGA, C# port (`HandlerState`) |
| **B. Interpreter over an effect DSL/AST** | Yes: PC is a tree path plus env | Good for simple cards, bad for weird ones; large up-front language design | jrdek (unserialized) |
| **C. Generator/coroutine per effect, kept live** | **No.** A paused JS generator's internal slots have no serialization form; `JSON.stringify` gives `{}` and `structuredClone` throws (<https://dev.to/grzott/i-built-generator-coroutines-for-my-game-engine-then-didnt-use-them-o3g>) | Excellent | Most hobby engines; fails on DO hibernation |
| **D. Generator + deterministic replay from a recorded input log** | Yes: persist inputs, not the coroutine | Excellent | Temporal workflows and Azure Durable Functions orchestrators (replay code against event history, with strict determinism rules); Team BGE's board game engine replays recorded actions on hot reload and notes that "replay playback can diverge if you change which decisions players are prompted with" (<https://team-bge.github.io/tutorials/01-getting-started.html>) |
| **E. Full event sourcing (seed + every input since game start)** | Yes | Same as D | Common for replays; replay cost grows over the game |

---

## 3. Recommended architecture

### 3.1 Choice: Pattern D, with the replay window scoped to one action

A turn is two actions. An action is draw, meld, achieve, or dogma, and only dogma, plus the "draw past age 10" end and special achievements, is complex. The recommendation is to write **the whole action**, from framework loops to card effects, as one generator tree:

```ts
// Pseudocode — the shape, not final names.
type Decision = { /* see section 4 */ };
type Answer = unknown; // validated against Decision.options BEFORE being recorded

function* runAction(g: Game, actor: SeatId, action: TopLevelAction): Gen<void> {
  switch (action.type) {
    case "draw":    drawForTurn(g, actor); break;                  // no decisions
    case "meld":    meldFromHand(g, actor, action.cardId); break;
    case "achieve": achieveAge(g, actor, action.age); break;
    case "dogma":   yield* runDogma(g, actor, action.cardId); break;
  }
  checkSpecialAchievements(g /* 4E: end-of-action check */);
}

function* runDogma(g: Game, launcher: SeatId, cardId: CardId): Gen<void> {
  const card = CARDS[g.cards[cardId].def];
  const counts = snapshotIconCounts(g, card.dogmaIcon);          // frozen for the whole dogma
  let sharedProgress = false;
  for (const [i, effect] of card.effects.entries()) {
    const targets = effect.demand
      ? opponentsWithFewer(g, launcher, counts)                   // clockwise from launcher's left
      : [...opponentsWithAtLeast(g, launcher, counts), launcher]; // launcher last
    for (const seat of targets) {
      const ctx = makeEffectCtx(g, { launcher, seat, cardId, effectIndex: i });
      const progressed = yield* effect.run(ctx);                  // card body — a generator
      if (!effect.demand && seat !== launcher && progressed) sharedProgress = true;
    }
  }
  if (sharedProgress) drawForTurn(g, launcher);                  // sharing bonus
}
```

**Persisted state (plain JSON, inside `RoomState.game`):**

```ts
type InnovationState = {
  engineVersion: number;          // bump when card code changes semantics
  options: { edition: "3e" | "4e"; teams: boolean };
  seatIds: string[];
  turn: { seat: SeatId; actionsLeft: 1 | 2; turnNumber: number };
  zones: Zones;                   // hands, boards (piles + splay), score piles, achievements, decks, revealed
  cards: Record<CardId, { def: CardDefId }>; // opaque minted ids -> static card
  claimedSpecials: Record<SpecialId, SeatId | null>;
  log: LogEntry[];                // each entry carries its own visibility (section 6)
  result: GameResult | null;

  // --- in-flight action (null between actions); SERVER-ONLY, never projected ---
  inFlight: null | {
    action: TopLevelAction;       // what started it
    actor: SeatId;
    actionStart: Omit<InnovationState, "inFlight">; // snapshot taken before the action began
    answers: RecordedAnswer[];    // [{decisionId, seat, kind, answer}] in order
    pending: Decision[];          // cache of what we're waiting on (usually length 1)
  };
};
```

**Driver (inside `applyAction`), called for a new top-level action or for an answer:**

1. Validate the request. For an answer, check that `request.decisionId === inFlight.pending[0].id`, that `actor === pending.seat`, and that the answer is in `pending.options`. Reject otherwise. The stale `decisionId` check protects against a double-click racing a replayed view.
2. Clone `actionStart`. For a new action, `actionStart` is a clone of the current state.
3. Create the generator `runAction(clone, actor, action)`. Step it. Each time it yields a `Decision`:
   - If `answers[k]` exists, **check that the recorded `kind`/`seat` match what was just yielded** (this detects divergence), then feed it back.
   - Otherwise feed the new answer if it is this step's; if not, stop. The state is now "waiting on this decision".
4. If the generator returns, the action is complete. Clear `inFlight`, decrement `actionsLeft`, advance the turn when it reaches 0, and log.
5. If a `GameOver` sentinel is thrown anywhere inside, set `result` and clear `inFlight`.
6. Return the new state. **Never throw**: catch everything, and treat an unexpected error as `{ok:false, error:"engine_error"}` with the input state unchanged.

**Why the replay window is one action, not the whole game:**

- **Cost is bounded.** One dogma action has at most a few dozen decisions, and replay is pure in-memory work (microseconds to low milliseconds). The Durable Object CPU limit is 30 s per request, identical on Free and Paid, and SQLite-backed storage allows 2 MB per key and value (<https://developers.cloudflare.com/durable-objects/platform/limits/>). Neither is under pressure. Full-game replay (Pattern E) would also fit, but it gets slower as the game grows and couples every in-flight game to the entire history of card code.
- **It limits the blast radius of a deploy.** If card code changes while a game sits mid-action, only that one action can diverge. The per-answer `kind`/`seat` check detects the divergence. The recovery is safe and simple: **restore `actionStart` and restart the action** (the player re-picks), with a log line like "the game was updated; this action was restarted". Nothing earlier in the game is at risk. This matches the project's existing reset-on-schema-mismatch philosophy (D-17), but at a much finer grain.
- **Nested execution is free.** Robotics, Computers, Software, Self Service, and Satellites "execute another card's non-demand effects". That is just `yield* runNonDemands(g, seat, otherCard, {share:false})`. No explicit frame stack is needed, because the JS call stack *is* the stack and replay rebuilds it.
- **Special achievements and game end mid-effect are ordinary control flow.** Primitives call `checkSpecialAchievements()` (3rd edition) and `checkWinByAchievements()`, which may `throw new GameOver(result)`. The driver catches it. This is the same shape as BGA's `EndOfGame` exception.

### 3.2 Determinism rules for engine code (enforce, don't just document)

Replay is only correct if re-running the same code on the same `actionStart` with the same answers produces the same yields. Rules:

- No `Math.random`, `Date`, `crypto`, or timers in `packages/rules`. Enforce with ESLint `no-restricted-globals`/`no-restricted-properties` on the package. The one legitimate source of randomness, the setup shuffle, happens in `createInitialState` from the seed. **Rules question to verify:** does any 3rd- or 4th-edition base card require a mid-game random pick (for example "choose a random card from a hand")? BGA's base cards do not call its RNG. If one is found, derive its randomness from `hash(seed, turnNumber, decisionIndex)` so replay stays deterministic.
- Card effects must hold **no state outside `g`** and generator locals. No module-level mutable variables.
- Keep state **JSON-pure**: no `Map`, `Set`, class instances, or `undefined` values. It crosses `structuredClone`, DO storage, and Zod.
- Iterate only over arrays or explicit seat order, never over "whatever order a record happens to be in". JS key order is deterministic, but depending on it hides bugs.
- A property test (section 8) asserts **replay equivalence**: at every step of random games, the live result equals the result rebuilt from `JSON.parse(JSON.stringify(state))`.

### 3.3 Typed generators in TypeScript

`Generator<Y, R, N>` has one `N` (the value `next()` accepts) for the whole generator, which is awkward when different decisions return different types. Use small helper generators that own the cast. The cast is safe because the driver validated the answer against `options` before feeding it:

```ts
type Gen<R> = Generator<Decision, R, Answer>;

function* chooseCards(ctx: Ctx, spec: CardChoiceSpec): Gen<CardId[]> {
  const options = legalCards(ctx.g, spec);                  // engine computes the legal set
  if (options.length === 0) return [];                       // nothing to choose → skip, no prompt
  if (!spec.may && options.length <= spec.min) return options; // forced → auto-resolve (BGA does this)
  const answer = yield makeDecision(ctx, { kind: "cards", options, ...spec });
  return answer as CardId[];                                 // validated by the driver pre-feed
}
```

Auto-resolving forced choices matters for pace: BGA's `interSelectionMove` does it, and it removes a large share of clicks. Two cautions:

1. **Tie-breaking "the highest card" when several share the top age is a real choice.** Offer it to the owner. Auto-resolve only when the legal set is exactly the required size.
2. An auto-resolved decision is never recorded as an answer, because it is recomputed on replay. That is deterministic.

### 3.4 Card effects: hybrid authoring

**Data (a generated or hand-typed table, one row per card and edition):**

```ts
type CardDef = {
  id: CardDefId;              // e.g. "archery" (stable, server-side only)
  name: string; age: 1|2|3|4|5|6|7|8|9|10|11; color: "blue"|"red"|"green"|"yellow"|"purple";
  icons: [Icon|"hex", Icon|"hex", Icon|"hex", Icon|"hex"]; // top-left, bottom-left, bottom-mid, bottom-right
  dogmaIcon: Icon;
  effects: { demand: boolean; text: string; run: EffectFn }[];
  editions: ("3e"|"4e")[];
};
type EffectFn = (ctx: EffectCtx) => Gen<boolean /* progressed? for sharing bonus */>;
```

**Bodies (short generators built on primitives). The examples use card texts as quoted in the BGA and jrdek sources:**

```ts
// Domestication: "Meld the lowest card in your hand. Draw a [1]."
function* (c) {
  const [card] = yield* chooseCards(c, { from: hand(c.you), lowest: true, count: 1 });
  if (card) meld(c, card);
  draw(c, c.you, 1);
  return true;
}

// Archery: "I DEMAND you draw a [1], then transfer the highest card in your hand to my hand!"
function* (c) {                                   // c.you = demand TARGET, c.me = launcher
  draw(c, c.you, 1);
  const [card] = yield* chooseCards(c, { from: hand(c.you), highest: true, count: 1 });
  if (card) transfer(c, card, hand(c.me));
  return card !== undefined;
}

// Education: "You may return the highest card from your score pile. If you do, draw a card of
// value two higher than the highest card remaining in your score pile."
function* (c) {
  const [card] = yield* chooseCards(c, { from: scorePile(c.you), highest: true, count: 1, may: true });
  if (!card) return false;
  returnCard(c, card);
  draw(c, c.you, maxAge(scorePile(c.you)) + 2);
  return true;
}

// Metalworking: "Draw and reveal a [1]. If it has a [castle], score it and repeat this dogma effect."
function* (c) {
  for (;;) {
    const card = drawAndReveal(c, c.you, 1);
    if (!hasIcon(card, "castle")) { keepRevealedInHand(c, card); return true; }
    score(c, card);
  }
}
```

Guidance:

- Primitives mirror BGA's `AbstractCard` helpers (`draw`, `drawAndScore`, `meld`, `tuck`, `score`, `transfer*`, `reveal`, `splay*`, `return`) and the C# `Mechanics` class ("always use these, never mutate piles directly"). Every zone change goes through one `moveCard(from, to, visibility)` function. That single choke point writes the log entry, updates the knowledge/visibility flags, and triggers the 3rd-edition special-achievement check.
- Share cross-effect memory ("if any card was transferred due to the demand", Gunpowder and Oars) through a typed per-dogma scratch object in `ctx.dogma`. That replaces BGA's untyped `auxiliary_value`.
- Around 70-80% of cards are one "choose then do" step. Those are 5-15 lines each. The rest (Democracy, Code of Laws, Mathematics-style "return, then draw higher", the nested-execution 10s, win-condition cards) are 20-60 lines.
- **Do not build a parser or grammar.** A primitive library of about 40 functions, a `ChoiceSpec` type, and TypeScript's type checker are the whole DSL.

---

## 4. The pending-decision model

```ts
type Decision = {
  id: number;                      // monotonic per game; answer must echo it (stale guard)
  seat: SeatId;                    // exactly one chooser
  kind: "cards" | "pile" | "color" | "player" | "yesno" | "value" | "order" | "initialMeld";
  // PUBLIC part — every seat may see this:
  context: { cardDef: CardDefId; effectIndex: number; launcher: SeatId; demand: boolean };
  promptKey: string;               // i18n key + params, e.g. "choose_card_from_hand_to_transfer"
  may: boolean;                    // "you may" → pass is legal
  min: number; max: number;
  // PRIVATE part — only the chooser's view:
  options: OptionRef[];            // card ids / colors / seat ids / values
};
```

- **Who chooses.** Exactly one seat per decision. In the base game, demands and shared effects run *sequentially* in seat order (clockwise from the launcher's left, launcher last), and each target finishes the whole effect before the next target starts. Do not parallelize demands to save time: later targets can depend on earlier results (C# port notes; BGA `playerInvolvedTurn` loop). **HIGH**
- **The one simultaneous decision is setup.** Every player picks one of their two dealt age-1 cards to meld; the alphabetically first melded card goes first (BGA state `turn0`, "Some players still have to choose a card to meld"). Model this as `pending: Decision[]` with "all must answer, any order", resolved when the last answer arrives. Do not let one player's pick be visible to others before all have chosen. Everything else uses `pending.length === 1`.
- **Legal options are computed by the engine and stored in the decision.** The client never computes legality. It may pre-check with the shared rules package for UX, exactly like Hanabi.
- **Answer message:** `{type: "decide", decisionId, pick: OptionRef[] | "pass"}`. It goes through `game_action` with the existing `actionId` dedup.
- **Timeouts and disconnects:**
  - No clock. A decision waits indefinitely. The Hanabi session model already guarantees that a refresh, a sleeping tab, or a dropped socket reconnects to the same seat. Because `pending` is persisted in state, the reconnected chooser's first view contains their prompt and options.
  - Other seats see "Waiting on **Alice** to choose a card to transfer (Archery demand)" plus Alice's existing `connected: false` badge.
  - *Later, optional:* a host-only "resolve for disconnected seat" that picks deterministically (pass if `may`, otherwise the first legal option). The server does this; no identities are exposed to the host.
- **Per-seat view of a decision:**
  - The chooser gets `{ youMustChoose: {...public, options, min, max, may} }`.
  - Everyone else gets `{ waitingOn: { seat, promptKey, context, may } }`, with **no options and no option count**. An option count is a leak: "Bob has 2 cards with a crown in hand".
- **Also show where we are.** `inFlight` context (current card, effect index, current target seat) is public and useful for the UI ("Resolving Archery — demand on Bob"). Project it from the pending decision's `context` plus a public progress summary, never from `answers`.

---

## 5. Special achievements, win checks, game end mid-effect

- **3rd edition (BGA `edition <= 3`).**
  - Special achievements (Monument, Empire, World, Wonder, Universe) are checked continuously, i.e. after every zone change. Call the check from inside the `moveCard`/`splay` choke points.
  - Ties go to the current player, then clockwise (BGA code citing <https://boardgamegeek.com/thread/2710666/simultaneous-special-achievements-tiebreaker>).
  - Win by achievement count (6 / 5 / 4 for 2 / 3 / 4 players) is checked immediately. **HIGH (BGA source + rules summary)**
- **4th edition.** Special achievements and the win-by-achievements check both move to **the end of each action** (BGA `usingFourthEditionRules()` / `$is_end_of_action_check`; 4E product notes: "Special Achievements are now Achieved at the end of an action; Win by Achievements is now checked at the end of each action"). That makes the engine simpler. **MEDIUM-HIGH**
- **Always immediate, in both editions:**
  - Drawing from above the top age ends the game (above 10 in 3E, above 11 in 4E). Highest score wins, ties go to most achievements. **MEDIUM on the exact 4E tie rule**
  - Card-text win conditions end the game immediately (for example A.I. and Bioengineering in 3E).
- **Mechanism.** `throw new GameOver({winners, reason})` from the primitive. The driver catches it, sets `state.result`, clears `inFlight`, and `checkGameEnd` reports it. Remaining effects and decisions are abandoned by design. The generator is simply never resumed.
- **Test explicitly:** a game ending on the *first* target of a shared effect, while the launcher still has effects to go.

---

## 6. Hidden information and what the leak checker must verify

### 6.1 Visibility by zone (base game)

| Zone | Owner sees | Others see | Notes |
|---|---|---|---|
| Hand | identity | count plus **age of each card** (card backs show age) | **HIGH** |
| Score pile | identity (you may look at your own) | count plus age of each card, total score | The score total is effectively public because ages are on the backs. **MEDIUM** that players may inspect their own score pile at will; BGA shows it. |
| Board piles | everything | top card; splay-visible icons; pile size | Can a player look through the covered cards of a pile? **LOW. Rules question.** BGA lets you browse stacks. Default to public, but confirm against the rulebook the group uses. |
| Standard achievements (1-9, and 10 in 4E) | age only | age only | Nobody knows the identity. Server-only. |
| Claimed achievements | age / special name | same | |
| Age decks | count | count | Order and identity are server-only. |
| Revealed | public while revealed | public | Transient. BGA's random-game test asserts nothing is left "stuck in revealed". |

### 6.2 What is new compared with Hanabi

1. **Opaque, per-game-minted card ids, as Hanabi already does.** A static `cardDefId` such as `"archery"` must never be sent for a card the viewer can't see, or the id alone is the leak. Keeping a stable opaque id as a card moves between hidden zones is acceptable: a physical player can follow a card back across the table too. It is required anyway for the UI's card-movement animation (`layoutId`).
2. **The log becomes per-seat.** Hanabi's history is "public facts only" (`history.ts`). That does not work here, because some facts are known to *two* players. Examples: Archery moves a card from Bob's hand to Alice's hand, so Alice and Bob know it and Carol sees "an age-2 card". A demand into the launcher's score pile is known to both of them. Give every `LogEntry` a `visibleTo: "all" | SeatId[]` for the identity part, with a public age-only fallback. Project it per seat.
3. **Decision options are private to the chooser** (section 4). No option counts appear in other seats' views.
4. **Server-only fields must never be projected:** `inFlight.actionStart` (a full unredacted snapshot, the single worst possible leak), `inFlight.answers` (which contains others' hidden picks), the seed, deck order, and achievement identities. The projection should be **allowlist-based**: build the view from scratch and never spread `state`.
5. **Choosing from a zone you can't see.** If a base card ever asks a player to pick from a zone they can't see, the options must be opaque handles carrying only the age. **Audit during card implementation**, because no such base card is currently known. Revealed-then-returned cards stay knowable to those who saw them. That is legitimately memorable, and the log records the reveal.

### 6.3 Leak-checker checks (extend `hanabi-leak-check.ts`'s structural + multiset approach)

For every seat's view, at every step of random games:

- **Structural.** Identity-bearing keys (`cardDef`, `name`, `color`, `icons`, `dogmaIcon`) must not be present (`in` operator, not truthiness) on any card object in:
  - opponents' hands and score piles
  - achievement piles
  - deck representations
  - log entries not visible to this seat
  - the non-chooser's waiting-on block
- **Multiset.** The multiset of card identities appearing anywhere in the view must be a sub-multiset of the identities this seat may legitimately see: own hand, own score pile, all boards, revealed cards, and log-visible identities. Innovation has no duplicate cards, so any identity appearing more than allowed, or at all when not allowed, is a leak.
- **Raw-string.** The seed must not appear. Nor may any `cardDefId` of a card currently in a hidden-from-viewer zone, unless it appears legitimately elsewhere, which cannot happen because cards are unique.
- **Forbidden keys** at any depth: `actionStart`, `answers`, `deck` order arrays, `seed`.
- **Decision privacy.** A non-chooser's view has no `options` key and no length-bearing proxy for it.

---

## 7. Persistence and runtime notes (Durable Object)

- Keep the room blob-per-key model. The state is estimated at roughly 10-25 KB of cards and zones, plus the `actionStart` snapshot of the same size, plus the log. That is comfortably under the 2 MB SQLite-backed key+value limit. **Cap or page the log.** A long 4-player game may run 150-300 actions and many more log lines, and the whole blob is rewritten on every message. For example, keep the last N entries in `state.log` and append older ones to a separate storage key or SQL table if a full replay viewer is ever wanted.
- Row writes: the Free plan allows 100K per day (`CLAUDE.md` sources). One write per message is negligible at friend-group scale.
- CPU: the DO allows 30 s per request (it no longer shares the fronting Worker's 10 ms Free-plan budget, per the limits page). Per-action replay is far below 1 ms to a few ms.
- Bump `ROOM_SCHEMA_VERSION` semantics: the existing D-17 reset-on-mismatch still applies to *shape* changes. Add `engineVersion` inside the game state for *behavior* changes, with the "restart the in-flight action" recovery from section 3.1.

---

## 8. Testing strategy

Mirror the Hanabi suite (`conservation`, `redaction`, `termination`, `discard-order` property tests, `test-support.ts`'s `enumerateLegalActions`), then add:

1. **Per-card example tests, one file per age batch, at least one test per effect.** Build a minimal state with a fixture builder (C# `Fresh()` / BGA `BaseCardIntegrationTest` pattern: "the first player has exactly one card on their board, the card under test"). Run the dogma, script the answers, assert on zones and log. Required cases per card:
   - the "nothing to do" path
   - the "may → pass" path
   - for demands: a target with fewer icons is affected, and one with equal icons is not
   - for shared effects: an opponent with ≥ icons shares, and the sharing bonus fires only on progress
2. **A `legalInputs(state, seat)` enumerator.** Every top-level action, plus every legal answer to the pending decision. This powers everything below.
3. **Replay equivalence (new and essential).** At every step of seeded random games, JSON round-trip the state, re-apply, and assert deep-equality with the live path. Also assert that re-running the in-flight action from `actionStart` with the recorded answers reproduces `pending` exactly. This is the test that keeps Pattern D honest.
4. **Card conservation.** Across all zones the multiset of card ids is always exactly the set created at setup: 105 in 3E, and the 4E count including age 11. No duplicates, nothing lost, `revealed` is empty between actions (BGA's check).
5. **Redaction / no hidden info.** Section 6.3's checker on every seat's view at every step, plus log projection.
6. **Termination.** Random games always end within a bound, via achievements or drawing past the top age. Innovation's natural age inflation guarantees termination under random play. Also guard against infinite loops inside an action, since some effects say "repeat": a per-action step budget that throws `engine_error` in tests.
7. **Decision hygiene.**
   - Every yielded decision has ≥ 1 option, or `may: true`.
   - A decision never belongs to a seat that is not a target of the current effect.
   - A stale `decisionId` is rejected.
   - Only the pending seat can answer; everyone else gets `not_your_decision`.
8. **Golden rules tests from the ports:**
   - icon counts are frozen at activation
   - "you" in the demand follow-up clause is the target
   - comparison effects use tallies recorded earlier in the same dogma (Democracy)
   - special-achievement tie order (3E)
   - the game ends mid-shared-effect
9. *(Stretch)* **Real-game oracle.** Parse Isotropic logs from `rspeer/scorepile` or BGA replays and replay them. Valuable for rules ambiguities, but parser effort is significant. **LOW priority**

---

## 9. Decisions the owner must make before building

1. **Edition: 3rd or 4th.** They differ in:
   - ~15 base card texts (BGA's `_3E`/`_4E` classes)
   - 10 extra Age-11 cards in 4E (BGA `Card440`–`449`)
   - timing of special achievements and the achievement win check (continuous vs end of action)
   - a 10th standard achievement in 4E

   Recommendation: **implement the edition the group physically owns and knows.** If there is no preference, 4E is the in-print edition, its rulebook is online (<https://www.asmadigames.com/rules/Inno4E_Base_Rulebook_Spreads.pdf>), and end-of-action checks are simpler. Structure `CardDef.editions` so the other edition can be added without touching the framework. **MEDIUM**
2. **Teams (4-player 2v2) in v1?** Suggest no, but keep `teams` in options.
3. **Board-pile visibility** (section 6.1): confirm with the rulebook.
4. **Card text and IP.** Card names and text belong to Asmadi Games. A private friends-only app is low risk. Avoid scanned card art, write original card rendering, and don't make the site publicly discoverable as an Innovation clone. **LOW (not legal advice)**

---

## 10. Sizing and phase breakdown

**Reference points:**
- Hanabi engine: about 1.8K lines of source and 3.9K lines of tests.
- C# port: about 3.7K lines of core, 7.7K of handlers, 6.8K of tests.
- BGA: 2.8K lines of card framework, ~5.9K lines across 125 base card classes covering both editions.

**Estimate for Innovation in this repo:** about 7-9K lines of source and 8-12K lines of tests, **roughly 4-6× Hanabi**. The UI is a separate and also large effort: splayed piles, icon counts, decision prompts.

| # | Phase | Contents | Relative effort |
|---|---|---|---|
| I0 | Adapter generalization | Generic options/variant; widened `AdapterError`; competitive `GameEndResult`; per-room `gameId` registry; `minSeats`/`maxSeats`. Hanabi keeps passing unchanged. | S |
| I1 | Vanilla Innovation | Card data table (all cards, no effect bodies); setup (shuffle, 9 achievements, deal 2, **simultaneous initial meld**, first-player single-action rule: 1 action for the first player, the first two in 4-player); draw (with the "draw up to next non-empty age" rule and the end past the top age); meld; achieve (score ≥ 5×age, top card ≥ age); splay data model; icon counting; per-seat projection; per-seat log; leak checker; conservation, termination, redaction properties. **Playable without dogma**, which gives the UI something real early. | M |
| I2 | Dogma framework + ~8 archetype cards | Generator driver, replay, `inFlight`, decisions, auto-resolve, stale guard; demand/share targeting with frozen counts; sharing bonus; special achievements (5); `GameOver` mid-effect; nested execution primitive; replay-equivalence property. Pick cards that cover every decision kind and control shape, e.g. Domestication (forced lowest), Archery (demand + transfer), Oars (demand + "if none transferred"), Philosophy (may + splay choice), Code of Laws (tuck + optional splay), Metalworking (repeat loop), Construction (demand + special achievement claim), Education ("draw two higher"). | L (highest risk) |
| I3 | Ages 1-3 | 15 + 10 + 10 = 35 cards, with per-card tests | M |
| I4 | Ages 4-6 | 30 cards | M |
| I5 | Ages 7-10 (+ 11 if 4E) | 40-50 cards, including nested execution (Computers, Robotics, Software, Self Service, Satellites) and win-condition cards | M-L |
| I6 | Soak and hardening | Long random-game soaks across 2/3/4 players; engine-version divergence recovery; log capping; rules-ambiguity audit against BGA behavior | S-M |

Card batches (I3-I5) can overlap with UI work once I2 is stable, because the view contract is fixed by then.

---

## 11. Top risks

1. **Hidden-info leak through a new channel**, most likely `actionStart`/`answers` accidentally spread into a view, per-seat log identities, or decision option counts. *Mitigation:* allowlist projection, forbidden-key walk, and the multiset leak check on every step of property runs. **Severity: high** (game-breaking, and silent).
2. **Replay nondeterminism** (a stray `Math.random`, module-level state, depending on object iteration order) corrupts in-flight actions on every message after hibernation. *Mitigation:* lint ban, replay-equivalence property, and the per-answer `kind`/`seat` divergence check with safe restart of the action.
3. **Rules-interpretation bugs across 105 idiosyncratic cards.** Both ports document recurring mistakes: demand "you", frozen icon counts, comparisons during sharing, "if you do". Isotropic admits "best guesses". *Mitigation:* golden rules tests, per-card tests covering the pass/empty/demand/share paths, BGA as the tie-breaker reference (its source is readable).
4. **Edition mixing.** Implementing some cards from 3E text and some from 4E, or 4E cards with 3E timing. *Mitigation:* decide the edition up front and cite the edition in every card file.
5. **Sheer effort.** A 4-6× engine plus a complex UI. *Mitigation:* the phase order ships a playable vanilla game (I1) and a working framework (I2) before committing to all 105 cards.
6. **Deploy during a live game.** This is contained to one in-flight action by the replay window design. It still needs the restart path tested.

---

## Sources

- BGA Innovation source (primary reference; read directly): <https://github.com/micahstairs/bga-innovation>. Files: `states.inc.php`, `dbmodel.sql` (`nested_card_execution`, aux tables), `innovation.game.php` (`EndOfGame`, `checkForSpecialAchievements`, edition branches, single `shuffle()`), `modules/Innovation/Cards/{AbstractCard,InteractionBuilder,ExecutionState}.php`, `modules/Innovation/Cards/Base/*`, `tests/Integration/{RandomGameTest,Cards/BaseCardIntegrationTest}.php`. **HIGH**
- C# port (read directly): <https://github.com/johnchampaign/innovation-csharp>. Files: `CLAUDE.md` (pause/resume idiom, rules pitfalls, codec limitation), `src/Innovation.Core/DogmaContext.cs` (frozen icon counts, nested frames). **HIGH**
- DSL/interpreter implementation (read directly): <https://github.com/jrdek/innovation>. Files: `design_journal.txt`, `grammars/deffect_grammar.lark`, `cards/base_game.cards`. **HIGH**
- Other surveyed repos: <https://github.com/mrobert09/Innovation>, <https://github.com/joewledger/innovation>, <https://github.com/jsparkes/innovation> (`concise-rules.txt` rules summary). **MEDIUM**
- Isotropic Innovation and its FAQ: <https://innovation.isotropic.org/>, <https://innovation.isotropic.org/faq/>. Game-log archive: <https://github.com/rspeer/scorepile>. **MEDIUM**
- boardgame.io stages docs: <https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/stages.md>. **HIGH**
- Generators are not serializable: <https://dev.to/grzott/i-built-generator-coroutines-for-my-game-engine-then-didnt-use-them-o3g>. **HIGH (language fact)**
- Replay-based engine precedent: Team BGE, <https://team-bge.github.io/tutorials/01-getting-started.html>. **MEDIUM**. Deterministic orchestration replay: Temporal workflow determinism constraints and Azure Durable Functions orchestrator code constraints (well-known patterns; docs not re-fetched this session). **MEDIUM**
- Cloudflare Durable Objects limits (30 s CPU per request on both plans; 2 MB key+value on SQLite-backed storage): <https://developers.cloudflare.com/durable-objects/platform/limits/> (fetched 2026-09-19). **HIGH**
- 4th-edition changes (Age 11, 10th standard achievement, end-of-action special achievements and win check): 4E rulebook <https://www.asmadigames.com/rules/Inno4E_Base_Rulebook_Spreads.pdf> (not fetched), product listing via search, BGG thread <https://boardgamegeek.com/thread/3549704> (403, not read), corroborated by BGA's edition branches. **MEDIUM**
- Special achievement tie-break (3E): <https://boardgamegeek.com/thread/2710666/simultaneous-special-achievements-tiebreaker> (cited in BGA source, not fetched). **MEDIUM**

# Pitfalls Research: v2.0 Expedition

**Domain:** Adding a roguelite co-op trick-taking game (Phaser pixel-art front end) plus a genuinely multi-game room layer to a live, real-money-free but reputationally-load-bearing Hanabi site.
**Researched:** 2026-09-22
**Confidence:** MEDIUM-HIGH (project-specific findings are HIGH confidence, grounded in `.planning/RETROSPECTIVE.md` and the approved spec; general Phaser/React and PRNG pitfalls are MEDIUM, WebSearch-verified against official docs/issue trackers)

## Critical Pitfalls

### Pitfall 1: Follow-suit logic mishandles the Sun/Moon as a "two-card suit"

**What goes wrong:**
The spec (§3 Tricks) requires: if the Sun or Moon is led, the holder of the *other* one must play it — they form a two-card suit for following purposes, distinct from Sun-beats-everything-as-trump logic. A naive `legalPlays` implementation treats "trump" and "suit" as the same concept and either (a) lets the Moon-holder play anything when Sun is led (wrong — must play Moon if held), or (b) forces Sun/Moon play when a *normal* suit is led (wrong — Sun/Moon can always be thrown off-suit). This is exactly the kind of asymmetric special case that's easy to get right in the one example the author tested and wrong in the permutation nobody tried by hand.

**Why it happens:**
Trick-taking engines conventionally model "trump" as a rank-above-all-suits flag, not as its own followable suit. Expedition's rule is deliberately unusual (jokers act as a real suit only when *led*, but as trump-that-beats-everything when played reactively), which doesn't fit that template without an explicit branch.

**How to avoid:**
Model `isTrump` and `ledSuit` as independent hook calls (per §6.1's hook table) rather than collapsing them. Write the property: "if Sun or Moon is led and the other is in a hand that still has it, `legalPlays` for that hand is exactly `{the other joker}`" and the inverse: "if a normal suit is led, Sun/Moon are always legal regardless of hand contents." Both should be `fast-check` properties run across all deck sizes (54/52/51/50/13/10/17/18-hand variants from removed-2s and Eclipse), not just examples.

**Warning signs:**
A hand-written unit test only covers "Sun led, Moon in another hand" — the mirror case (Moon led, Sun in another hand) and the "led joker's holder happens to also hold the other joker" case (trivially legal, no constraint) are the ones that slip.

**Phase to address:**
Rules core (phase 2, per spec §9 build order: "deck, tricks, camp state machine, objective kinds. Simulation tests").

---

### Pitfall 2: Trick winner logic double-counts trump precedence and off-suit discards

**What goes wrong:**
`trickWinner(trick)` must resolve: Sun beats Moon beats everything; otherwise highest card of the *led* suit wins — critically, a card of a non-led, non-trump suit thrown off never wins even if it outranks every played card numerically (e.g., an Ace of a suit nobody led). A common bug: sorting all played cards by rank and taking the max, which incorrectly lets an off-suit Ace beat a lower led-suit card.

**Why it happens:**
"Highest card wins" is the mental shortcut; the led-suit gate is a second condition that's easy to drop when refactoring or when adding Eclipse's no-trump mode (which removes the jokers but keeps the led-suit gate — a second implementation path that can silently diverge from the primary one instead of being the same code with an empty trump set).

**How to avoid:**
Implement trump comparison and led-suit-filtering as two composable steps: filter to (trumps present, else led-suit cards) → max by rank within that filtered set. Property test: "the winner is always a member of the played trick" and "the winner is the trump-suit card with highest trump-rank if any trump was played, else the highest led-suit card" — assert against a reference/oracle implementation of the rule text, not just "test passes." Also test Eclipse explicitly reuses the *same* trickWinner function with an empty/absent trump set (per §6.1's `isTrump` hook), rather than a special-cased branch.

**Warning signs:**
A boss-twist (Eclipse) unit test passing while the base-game equivalent property test is missing — indicates the two paths were hand-coded separately.

**Phase to address:**
Rules core (phase 2), verified again in run layer (phase 3) once Eclipse is implemented as a hook rather than a branch.

---

### Pitfall 3: Leader rotation ignores Machete's `nextLeader` override and reverts on replay

**What goes wrong:**
§3 says "the trick's winner leads the next trick, unless a rule hook says otherwise" and Machete (`commandeer`) lets a player lead the *next* trick instead of the winner. A bug class here: the override is applied for one trick but then the following trick reverts to "winner of trick N-1" instead of "winner of the Machete-affected trick," because leader state was computed from trick history instead of tracked as explicit mutable state advanced by `setNextLeader` (toolkit, §6.3). A second bug: a failed-and-replayed camp (§4.1) carries over stale leader state from the failed attempt instead of recomputing the Sun-holder/A♠ leader fresh for the new deal.

**Why it happens:**
"Winner leads next" is simple enough to compute on the fly from trick history, which works until a hook needs to override it — at that point, leader must become first-class mutable state, and it's easy to only fix the *next* trick's leader while leaving the "leader after that" derivation still reading trick history.

**How to avoid:**
Make `state.currentLeader` an explicit field advanced only via the `nextLeader` hook (default: winner of last trick; Machete: the gear-declared seat) — never re-derived by scanning trick history. On camp replay (§4.1), explicitly re-run `leaderFor(hands)` (the Sun/A♠ hook) as part of the fresh deal's initialization, and add a unit test that replays a failed camp and asserts leader is NOT inherited from the failed attempt.

**Warning signs:**
A gear-use test for Machete that only asserts "the next trick's leader is correct" without a third trick to confirm the override doesn't leak forward or the base rule doesn't leak backward.

**Phase to address:**
Rules core for the base rotation; run layer (phase 3) for Machete + replay interaction, since Machete is gear (catalogue, phase 3) and replay is a run concept (phase 3).

---

### Pitfall 4: Uneven-deck math for 4p/5p removal, and Eclipse's own separate removal table, drift out of sync

**What goes wrong:**
Base deck removal (§3): 3p keeps all 54 (18 each); 4p removes 2♣ 2♦ (52→52, 13 each — wait, spec says remove 2, 13 each = 52 cards, but that's only removing 2 cards from 54 giving 52; correct); 5p removes all four 2s (50, 10 each). Eclipse (§5.3) has an *entirely separate* removal table (jokers already gone, so 3p removes 2♣ for 51/17, 4p removes nothing for 52/13, 5p removes 2♣ 2♦ for 50/10). These two tables are easy to conflate — someone implementing `deckFor(playerCount)` generically and then trying to reuse it for Eclipse by "just also removing the jokers" gets the wrong counts, because Eclipse's card-removal counts are independently tuned to make the math divide evenly *without* jokers in play, not derived from the base table minus two.

**Why it happens:**
Both are "remove some 2s for even hands" rules that look like the same function with a parameter, but the actual removed-card sets and resulting hand sizes are independently specified per §3 and §5.3 and don't arithmetically compose.

**How to avoid:**
Treat `deckFor(playerCount)` as a hook (§6.1) with two concrete registered implementations — base and Eclipse — each with its own explicit table sourced verbatim from the spec, never derived from the other. Write a unit test per cell of both tables (6 total: 3 player counts × 2 rule sets) asserting exact deck size and exact hand size, plus a property test asserting `deckSize === playerCount * handSize` for every registered `deckFor` implementation and every player count 3-5.

**Warning signs:**
Only one player-count is tested per rule set (e.g., only 5p for Eclipse) — the 3p/4p cells, which have the least intuitive removal patterns (4p removes nothing under Eclipse, unlike every other cell), are exactly where a generic/derived implementation diverges from spec.

**Phase to address:**
Rules core (phase 2) for the base table; run layer (phase 3) for Eclipse's boss-twist table, with a cross-cutting property test that both satisfy `deckSize === playerCount * handSize`.

---

### Pitfall 5: Objective failure detection fires late (end-of-trick) instead of the instant it becomes impossible

**What goes wrong:**
§3 says the camp fails "the moment any objective becomes impossible... or any active failure check fires... Play stops at that moment." A naive implementation evaluates objective status only after each full trick resolves (since that's when `trickWinner` naturally runs), which is *usually* the same moment a `win-card` objective becomes impossible (the card was won by the wrong player) — but not always. `exactly-n` objectives can become mathematically impossible before the triggering trick even finishes, if remaining-tricks math already forecloses reaching N (per its own fail condition: "the holder exceeds N, or can no longer reach N with the tricks left"). Evaluating strictly "after trick N resolves" is actually the correct place for all four objective kinds as written (win-card and ordered fail exactly when a trick is won by the wrong player, no-tricks/exactly-n fail exactly when a trick's winner is decided) — so the more likely bug is the *opposite*: failing to re-check ALL unresolved objectives after every trick, not just the one whose card was just involved, meaning an `exactly-n` objective that silently became unreachable two tricks ago keeps the camp alive until its holder finally can't-possibly-reach-N is checked at all. It's also easy to only check objectives when a card in that specific trick "belongs" to one, and skip the exactly-n forecast check when no `win-card` objective was touched that trick.

**Why it happens:**
It's natural to write "does this trick complete an objective?" as a per-trick, per-objective-card lookup, which handles `win-card`/`ordered` correctly but leaves `no-tricks` and `exactly-n` — which must be evaluated for *every* holder on *every* trick regardless of which card was played — unchecked unless the evaluation loop explicitly iterates all objectives, not just "objectives touched by cards in this trick."

**How to avoid:**
Per §6.3/§8 ("Objective kinds are... `evaluate(camp, objective) → pending|done|failed`, evaluated by the core after every trick"), literally iterate every unresolved objective through its `evaluate` after every trick — never index by "which card triggered." Property test: construct random runs and assert that the camp-fail flag is set on the exact trick where an oracle re-implementation (hand-checked against spec text) says impossibility first occurred, not later. Specifically fuzz `exactly-n` with N values that become unreachable 1-2 tricks before the holder's final trick.

**Warning signs:**
An `exactly-n` unit test only covers "holder wins N+1 tricks" (the easy, late-detectable case) and never covers "holder can't mathematically reach N anymore because too few tricks remain" (the exact case the spec calls out and the one most likely to be missed by a per-card check).

**Phase to address:**
Rules core (phase 2), objective-kind catalogue tests explicitly per §8's "each objective kind's evaluation."

---

### Pitfall 6: Ordered objectives (`ordered`, camp 4/6) check card-vs-card order but not cross-holder interaction with `reassign`/`reroll` gear

**What goes wrong:**
An `ordered` objective fails when "its card is won out of order relative to other ordered objectives, or not in the last trick" for the "last" marker. This is a two-objective (or more) relational check, not a single-objective check — it requires comparing state across objectives, which the per-objective `evaluate(camp, objective)` signature (§6.3/§8) doesn't naturally expose unless the camp state (with all objectives and their resolution tricks) is passed in and used. Compounding this: Trail Map (`reassign`, swaps unresolved objectives between two players) and Compass (`reroll`, replaces a face-up not-yet-taken objective) can change *which* objective card exists mid-camp, and an `ordered` objective's "order" position must survive a `reroll`/`reassign` of a *different* objective in the same ordered set without losing its relative position.

**Why it happens:**
The per-objective-kind interface (`ObjectiveKindDef.evaluate(camp, objective)`) makes it tempting to implement `ordered` by looking only at its own card and marker, forgetting it needs the full camp's objective set to know what "other ordered objectives" resolved when.

**How to avoid:**
Ensure `evaluate(camp, objective)` receives the full camp state (all objectives, all resolved tricks in order) so `ordered` can look up sibling ordered objectives' resolution-trick-index and compare. Add a unit test combining `ordered` with Trail Map swapping one ordered objective to another player mid-camp, and one with Compass rerolling an objective that is NOT part of the ordered pair (should not disturb the pair's order), plus one rerolling one that IS part of the pair (spec doesn't explicitly forbid this — flag as an open design question if the engine allows rerolling an already-ordered objective).

**Warning signs:**
`ordered` objective tests only use a single ordered pair with no gear interaction — camp 4/6 explicitly combine ordered pairs with the full gear/boss system, so an isolated unit test gives false confidence.

**Phase to address:**
Run layer (phase 3), since it's where gear (reassign/reroll) and camp ramp (ordered pairs first appear camp 4) are both implemented — flag as needing a dedicated integration test, not just rules-core unit coverage.

---

### Pitfall 7: Replayed camps leak gear "used-this-camp" flags, capacity, or modifiers from the failed attempt

**What goes wrong:**
§4.1: a failed camp is replayed with a fresh deal and fresh objectives, costing 1 supply. §4.2: "each equipped piece of gear can be used once per camp." If "used this camp" is tracked as a flag on the gear/player object rather than scoped to the *camp attempt*, a player who used Spyglass in the failed attempt finds it already "used" and unusable in the replay — a silent, hard-to-notice bug because it fails safe (gear becomes unavailable, doesn't crash) and might not be caught by a test that only plays camps that succeed on the first try. Similarly, `addModifier` (toolkit, §6.3) modifiers attached mid-camp by activated gear (e.g., Camouflage's failure-check modifier) must NOT persist into the replay, and Energy Tonic's "+2 capacity while equipped" must be recomputed fresh (it's passive/always-on, so less at risk, but any capacity *cache* computed once per camp and not invalidated on replay has the same bug shape).

**Why it happens:**
"Once per camp" naturally gets implemented as a boolean on the gear instance, and "camp" is ambiguous between "camp number" (persists across replay attempts, since it's still camp 3) and "camp attempt" (resets on replay). The spec's intent is clearly attempt-scoped ("the camp is replayed... the only way forward is to clear it" implies a genuinely fresh try), but the state model doesn't obviously distinguish "camp N" from "camp N, attempt 2" unless that's built in explicitly.

**How to avoid:**
Model camp state as freshly constructed on both first attempt and replay — gear-used flags, active modifiers, and any camp-scoped counters (Whisper-used-this-camp too) live inside the ephemeral camp state, not on the persistent player/gear-ownership record (which only tracks *owned* gear and *equipped* loadout, both of which correctly persist across a replay). Write an explicit failed-then-replayed integration test: use every "once per camp" gear type in a failed attempt, fail the camp, assert all are usable again in the replay, and assert the Whisper is usable again too.

**Warning signs:**
No test exercises "camp fails, then succeeds on retry" for any gear-using scenario — most rules-engine tests probably default to camps succeeding on the modeled attempt, since failure is the less common target state to construct.

**Phase to address:**
Run layer (phase 3) — this is exactly the kind of state-reset bug the retrospective's lesson #2 (game-agnostic seams only proven by a second consumer) analog warns about: "camp-scoped" only gets proven correct by an attempt that actually replays.

---

### Pitfall 8: Draft offers are not deterministic/replayable from the seed, or leak across players

**What goes wrong:**
§6.5 states "every run replays deterministically from its seed and action log," and draft offers are explicitly one of the things drawn from the seeded RNG. Two distinct bugs are likely: (1) draft offers computed with `Math.random()` or a per-request fresh RNG instance instead of the carried seeded generator, breaking replay determinism and, worse, making the *same* offer-generation logic non-reproducible for property tests (fast-check needs determinism to shrink failures); (2) the "never offered gear they already own" rule (§4.2) implemented by filtering *after* drawing from the RNG stream in a way that consumes a different number of RNG draws per player depending on how much gear they already own, which silently desyncs each player's downstream RNG consumption relative to a re-simulation, breaking the "replay from seed + action log" guarantee even though each individual draft was locally correct.

**Why it happens:**
RNG-consuming code that includes a rejection/filter step (draw-until-valid, common for "no duplicates") is a classic source of hidden RNG-stream divergence — the same seed produces different total draws depending on incidental state (what's already owned), which is fine for a single-session RNG but breaks a design goal of being replayable purely from `(seed, action log)` unless the *action log* itself would deterministically reconstruct the same ownership state at replay time too (which it should, since actions are logged) — but this is exactly the kind of subtle correctness property that needs a property test, not intuition, to trust.

**How to avoid:**
Route every RNG consumption — draft offers, deals, objective deck shuffle, boss selection, Trained Monkey's random card pick — exclusively through the `ctx.rng` / carried `sfc32` generator in state, never `Math.random()` or a re-seeded fresh instance. Add a lint/grep-based structural test (in the spirit of v1.0's "single call site" enforcement, per RETROSPECTIVE's "structural invariants over conventions" pattern) that fails CI if `Math.random(` appears anywhere under `packages/rules/src/expedition/`. Add a property test: replaying the full action log against a fresh state constructed from the same seed produces bit-identical state at every step, across randomized runs with varied ownership (to stress the filter-consumes-variable-draws case).

**Warning signs:**
A draft-offer unit test passes with a fixed small deck of "gear not yet owned" but no test replays a full multi-camp run from seed and diffs it against a live simulation — determinism bugs are invisible until you actually try to replay.

**Phase to address:**
Run layer (phase 3) for RNG plumbing and the structural no-`Math.random` test; add the full-replay property test in phase 3 or as a dedicated addition to the phase 8 "property-based simulated runs" work called out in spec §8.

---

### Pitfall 9: Reveals (Whisper/Spyglass/Signal Flare) and camp-scoped log entries persist into views past their intended audience or past the camp/window they belong to

**What goes wrong:**
§6.4 is explicit: "A view never contains: another seat's cards except through a reveal addressed to the viewer... or other players' draft offers, or the RNG state." The likely bug is not that reveals are wired to the wrong audience initially (that's testable per-reveal), but that they *keep* being included in every subsequent view after their moment has passed — e.g., a Whisper from trick 2 is still present (and still rendered) in the view sent after trick 8, because reveal storage is an accumulating list on camp state that's never pruned or the projection includes "all reveals this camp" instead of "reveals still relevant." A second variant: Signal Flare ("your Whisper this camp is shown to everyone") changing a Whisper's *audience* after the fact is order-dependent — if Signal Flare is used in the same `between-tricks` window as a Whisper but the toolkit calls are applied out of the intended order, the broadened audience might not actually take effect, or might retroactively broaden a *different* Whisper than intended if there's ambiguity about "your Whisper this camp" when a player could theoretically whisper more than once (Signal Whistle) in the same camp.

**Why it happens:**
"Reveal with an audience" (§6.4) is a natural, correct primitive, but nothing in the spec says reveals expire — so the default engineering instinct (append to a log, view includes the log) doesn't obviously violate the letter of "a client never receives a card it is not entitled to see" (the audience list is still correct) but does violate the *spirit* of hidden information design: a card whispered privately to one teammate at trick 2 being permanently visible to that teammate for the rest of the camp (or worse, the rest of the run, if not scoped to camp) is a much bigger information leak than the single-moment glimpse the mechanic intends, even though it's not technically an audience violation. Whether this is a "bug" or "intended" is genuinely ambiguous in the spec and needs an explicit design decision, not just an implementation default.

**How to avoid:**
Treat this as a design question to resolve during phase 3/4 (run layer / wiring), not purely an engineering bug: decide explicitly whether reveals and their associated log entries persist for the rest of the camp (so a player can scroll back and see what was whispered to them) or are ephemeral (shown once, then gone even from the audience's own view). Whatever is decided, encode it as an explicit `revealExpiry` or `logRetention` concept in the toolkit rather than an implicit "whatever's still in the array." Extend the leak checker (§8, "extends the existing Hanabi leak-check pattern") to also assert reveals/log entries never appear in a *non-audience* seat's view at any point after they're created, including many trick-turns later — a leak checker that only checks the view immediately after a reveal is created will miss a bug where an audience-correct reveal from your own history is somehow later duplicated into a non-audience seat's view during, e.g., a gear-swap or reassign operation that copies more state than intended.

**Warning signs:**
The catalogue contract test (§8: "no view leak after `apply`") checks the view immediately following the gear's `apply`, but no test checks a view several turns *later* still respects audience for an older reveal — the retrospective's "stale locators after removals" lesson has a structural cousin here: state that should be pruned/scoped but isn't, discovered only much later in a session.

**Phase to address:**
Design decision at run layer (phase 3), enforced by leak-checker extension at wiring (phase 4) per spec §8's explicit call-out.

---

### Pitfall 10: Thick Fog's face-down objectives leak through the "all face-up objectives" default view rule

**What goes wrong:**
§6.4 defines the view rule as: "objectives (all face-up ones, or only its own under Thick Fog)." Thick Fog (`blind-orders`, §5.3) deals objectives face-down at random instead of picked, and each player sees only their own. If the view-building code has a single code path that defaults to "all objectives are visible" and only special-cases Thick Fog by hiding *other players'* objective assignments from the UI layer (client-side hiding) rather than never including them in the server's per-seat view payload in the first place, this is a structural per-seat-filtering violation of exactly the kind the project's constraints (`PROJECT.md`: "server-authoritative per-seat state filtering is mandatory... because it leaks the game") explicitly call out as the category of bug v1.0 built three leak-test layers to catch for Hanabi. Also easy to miss: under Thick Fog, does a player's *own* objective's order/kind still need obscuring if it references another player's soon-to-be-revealed identity, and do face-down objectives still get included in "removed cards are public" bookkeeping without revealing which specific card is whose objective?

**Why it happens:**
Thick Fog is a boss twist implemented as a `modifiers`/hook (§6.1: `objectiveAssignment(state)` hook), which correctly changes *how objectives are assigned*, but the view-projection code (§6.6 `toPlayerView`, described as built "from an explicit field list, never by copying state") is a separate code path that must independently consult the *current* objective-visibility rule rather than assuming "objectives are always public once picked" as it is for every other camp.

**How to avoid:**
Make objective visibility itself a hook-derived property read at view-construction time (e.g., `objectiveVisibility(state, seat)` returning which objectives that seat may see), not a hardcoded "objectives are public" assumption in `toPlayerView` with a Thick-Fog-specific carve-out bolted on. Add Thick Fog explicitly to the leak-checker's property-based simulated runs (§8) — since it's a boss twist, ensure the "every boss twist" clause in the simulated-run property test actually exercises the leak checker under Thick Fog specifically, not just that the run completes.

**Warning signs:**
The leak checker's fast-check property (§8) says "run every boss twist" but if Thick Fog's objective-hiding is implemented as a *client-side* conditional render rather than server omission, the leak checker (which presumably inspects the server-emitted view payload) would actually catch it correctly — so the real warning sign is if the leak checker is instead only checking *hand* cards (carried over from the Hanabi pattern) and not extended to check *objective* visibility, since objectives are a new category of hidden information Hanabi never had.

**Phase to address:**
Adapter/wiring (phase 4), explicit test coverage in the property-based simulated runs and leak checker (spec §8).

---

### Pitfall 11: Objective deck order and RNG state leak through a naive "send the objective deck for animation" convenience

**What goes wrong:**
§6.4 explicitly excludes "the play deck or objective deck order" and "the RNG state" from any view. A plausible implementation shortcut: to animate objectives being "flipped from a second... deck" in the Fireside/Camp scene, the client is sent the full remaining objective deck order so Phaser can pre-stage the flip animation, or the RNG's internal state is serialized into the room's persisted SQLite state and that same serialization path is reused to build the client view (copy-paste from state-persistence code into view-projection code) — both are exactly the "broadcasting a single shared state object" anti-pattern the project's `CLAUDE.md` explicitly names as the rejected default (`naive io.to(room).emit(state)`).

**Why it happens:**
Persisted state (for durability across refresh/disconnect, per the project's session-durability constraint) and the per-seat view are different concerns, but if `toPlayerView` is implemented by starting from a spread/clone of full state and *deleting* forbidden fields rather than *building* an explicit allowlist, any new field added to state later (like objective deck order, added for a Fireside animation feature) is leaked by default unless someone remembers to also blacklist it in the view function.

**How to avoid:**
The spec is explicit that `toPlayerView` must build "from an explicit field list, never by copying state" (§6.6) — this is already the intended design, so the pitfall is drift away from it under animation-feature pressure. Enforce with the same structural pattern v1.0 used ("one per-seat projection chokepoint," per RETROSPECTIVE): a source-scan test asserting `toPlayerView` never does `...state` spread of the raw state object, or a type-level allowlist (a dedicated `ExpeditionView` type that structurally cannot contain `deck`/`objectiveDeck`/`rngState` fields, so any accidental inclusion is a compile error, not a runtime leak).

**Warning signs:**
A Phaser animation ticket ("show objectives flying off the deck") that's solved by "just send the deck order" rather than "send a `deckSize: number` and let the client animate a generic flip without knowing what's under it."

**Phase to address:**
Adapter/wiring (phase 4) for the allowlist-view structural test; scenes (phase 6) for making sure the Fireside animation is built against the size-only view, not a request for more data.

---

### Pitfall 12: Concurrent between-tricks actions from multiple players race with the window's close (leader plays a card)

**What goes wrong:**
§4.4: the `between-tricks` window is open to "Anyone: Whisper and between-tricks gear" and "closes when the trick's leader plays a card." §4.4 also states "the server serialises actions in arrival order" — which correctly resolves ordering *among* between-tricks actions, but the specific race to get right is: player A is mid-way through a multi-step targeting flow for a piece of gear (e.g., Trained Monkey requires choosing a target player AND a card, per §6.2's declarative `targets` — a two-step client interaction) when the leader plays a card and the window closes server-side before player A's second step (the actual `use-gear` action) arrives. If the server only validates "is it currently between-tricks" at the moment the *first* UI step begins (client-side) rather than re-validating at the moment the actual action arrives, a stale intent could apply gear effects into the wrong window (mid-trick) or silently do nothing while the client believes it succeeded, leaving Phaser's local target-selection UI in a confusing lingering state.

**Why it happens:**
Turn-based/window-based card games often validate legality once, client-side, when a UI flow starts, and treat the eventual server round-trip as a formality — this works fine in a strictly single-actor turn structure (Hanabi: only the active player can act) but Expedition's `between-tricks` window is explicitly multi-actor ("anyone" may act), so two or more players can legitimately race, and the leader closing the window is itself a *player action* racing against other players' in-flight actions, not a server-driven timer.

**How to avoid:**
Validate every `use-gear`/`whisper` action against the *current* server-authoritative window state at the moment the action is *received* (per §6.6: "each is validated against the phase, the seat and the rule set; illegal requests return an error and change nothing") — never trust that the window was open when the client-side flow began. On the client, if a `use-gear` action is rejected because the window closed mid-flow, show a clear, non-punishing message ("too late — the trick started") and reset the targeting UI, rather than leaving it in limbo. Add a concurrency-specific test: two simulated players both attempt gear/Whisper actions in the same between-tricks window while a third submits the trick-opening card play, asserting exactly the actions that arrived (server-side) before the card play are applied and any arriving after are cleanly rejected — this is a good candidate for `fast-check` async property testing with randomized arrival ordering, similar to v1.0's "double-sent action applies exactly once even across a forced worker eviction" pattern.

**Warning signs:**
No test constructs literal concurrent/near-simultaneous actions from multiple seats in the same window — most rules-engine tests likely apply actions sequentially with the test author choosing the order, which never exercises "the order the real network delivers them in."

**Phase to address:**
Adapter/wiring (phase 4), since this is specifically about `applyAction` validation against server state at arrival time, not rules-core logic in isolation — worth an explicit concurrency test alongside the e2e "refresh mid-camp and resume" scenario spec §8 already calls for.

---

### Pitfall 13: Phaser mounts twice (or leaks a stale game instance) under React/Next.js dev Strict Mode and route transitions

**What goes wrong:**
React 18's Strict Mode double-invokes mount/unmount/mount in development to surface cleanup bugs — Phaser's `new Phaser.Game(config)` call inside a `useEffect` without a guard will construct two canvases, two input listeners, two game loops, doubling event handling and potentially causing visible double-rendering or WebGL context exhaustion, and — separately from Strict Mode — navigating away from and back to the Expedition room (client-side routing) without destroying the previous `Phaser.Game` instance leaks WebGL contexts and running RAF loops that never got torn down, since dev double-mount masks whether cleanup actually runs (per React's own issue tracker: cleanup from the first mount can be skipped entirely if closed-over state differs between mounts).

**Why it happens:**
Phaser was designed as a page-owning framework (own canvas, own game loop), not as a component library — bridging it into React's declarative mount/unmount lifecycle requires an explicit "construct once, destroy on real unmount, ignore the Strict Mode double-invoke" guard that generic Phaser tutorials don't cover, and this project's spec explicitly requires Phaser to be dynamically imported and mounted only for Expedition rooms (§7.1), meaning mount/unmount will happen repeatedly across the site's lifetime (every time a player navigates into/out of an Expedition room), unlike a typical Phaser game embedded once on a dedicated page.

**How to avoid:**
Guard game construction with a ref-based "already constructed" flag so Strict Mode's double-invoke in dev doesn't create two `Phaser.Game` instances; always call `game.destroy(true)` in the effect's cleanup function on real unmount (verified by testing actual navigation away from the room, not just dev-mode reload); avoid keeping any Phaser object references in React state (which would force re-renders/re-effects) — communicate via a stable event bridge (an `EventEmitter` or the project's existing store pattern) instead, so the effect's dependency array can stay empty and mount/destroy happens exactly once per real component lifecycle. [Phaser+React integration guide](https://generalistprogrammer.com/tutorials/phaser-react-integration-guide), [React Strict Mode double-invoke cleanup gap](https://github.com/facebook/react/issues/25614).

**Warning signs:**
Frame rate degrading or input events firing twice (e.g., a single click on a card registering as two plays) after navigating into an Expedition room a second time in the same session without a full page reload; browser devtools showing more than one active WebGL context.

**Phase to address:**
Phaser shell (phase 5) — this is exactly where the camp scene mounting pattern gets established; write the mount/unmount discipline once, correctly, before building scenes on top of it.

---

### Pitfall 14: Pixel art renders blurry due to default antialiasing, non-integer DPR scaling, or texture bleeding at zoom

**What goes wrong:**
Phaser's default renderer settings use bilinear (antialiased) texture filtering, which smooths/blurs pixel-art sprites when scaled up — the opposite of the crisp look the spec's art direction requires ("pixel art in Phaser, styled after rogerflores.dev"). Separately, on displays with non-integer `devicePixelRatio` (common on many external monitors and some Windows scaling settings, not just the well-known Retina case), pixel art can render with uneven pixel sizes — some visual pixels larger than others — because CSS pixels don't map cleanly to device pixels, producing a garbled rather than crisp look even with nearest-neighbor filtering correctly enabled.

**Why it happens:**
Phaser 3's defaults favor general-purpose game rendering (where antialiasing is usually desired for non-pixel-art sprites) rather than pixel-art-specific settings, so a project generated without explicitly setting `pixelArt: true` (which correctly configures `antialias: false`, `antialiasGL: false`, and `roundPixels: true` together) or scaling via a fractional zoom factor will look soft — noticeable only once real art (phase 7) replaces placeholder rectangles (phase 5), which is exactly when the retrospective's "green tests, rejected visuals" pattern (v1.0's seven board rejections) is likely to repeat, since nothing in an automated test catches "looks blurry."

**How to avoid:**
Set `pixelArt: true` in the Phaser game config from the start (phase 5, placeholder-art stage), not deferred to the art pass — verifying the rendering pipeline is crisp with placeholder rectangles is cheap and catches the config issue before real art is at stake. Use integer zoom/scale factors for the game canvas where possible. Explicitly screenshot-check the rendered canvas at a couple of representative device pixel ratios (1x, 1.5x, 2x) during the Phaser shell phase, before the art pass, as a smoke test — this is a case where "looks done but isn't" is invisible in a green Playwright suite and needs the same owner-visual-review discipline the retrospective calls out as essential for anything visual. [Phaser pixelArt config docs](https://docs.phaser.io/api-documentation/class/core-config), [Phaser DPR blur issue](https://github.com/phaserjs/phaser/issues/3198).

**Warning signs:**
Placeholder art phase (5) looking "fine" only because rectangles don't show sub-pixel blur the way sprite art with fine detail will — the bug is latent until phase 7's real pixel art is dropped in, at which point it becomes an owner-visible rejection rather than an early catch.

**Phase to address:**
Phaser shell (phase 5) — set `pixelArt: true` and verify scaling behavior before any real art exists, specifically to avoid discovering this during the owner-gated art pass (phase 7) the way v1.0 discovered visual issues only at review time.

---

### Pitfall 15: Canvas-based UI breaks Playwright locators and accessibility unless the test bridge and non-visual affordances are built alongside scenes, not after

**What goes wrong:**
A Phaser canvas is, from the DOM's perspective, a single opaque `<canvas>` element — there is nothing for Playwright's default DOM-based locators to click, and nothing for a screen reader to announce. The spec anticipates the testing half of this with `window.__expeditionTest` (§7.5), but two things are easy to under-scope: (1) building the test bridge as an afterthought once scenes already exist, rather than growing it alongside each scene (repeating the retrospective's "stale e2e locators after UI removals" pattern in a new form — a scene redesign that doesn't update the parallel test-bridge id list breaks e2e silently until someone runs the suite); (2) accessibility is not mentioned anywhere in spec §7 or §8 — a canvas-only game has no keyboard navigation, no screen-reader-announced game state, and no way for a low-vision player to zoom text, and since the project's audience is "friends on a voice call," this may be an accepted tradeoff, but it should be an explicit decision rather than a silent gap discovered late.

**Why it happens:**
Canvas rendering trades DOM accessibility and inspectability for rendering control — this is an inherent Phaser/canvas tradeoff, not a bug, but a project migrating from a DOM-based, naturally-testable and reasonably-accessible React board (Hanabi, v1.0) to a canvas-based one is taking on a scope of testing/accessibility infrastructure that didn't exist before and can be underestimated relative to the DOM-based baseline.

**How to avoid:**
Treat `window.__expeditionTest` as a living contract updated in the same commit as any scene change (mirroring the retrospective's explicit lesson: "update every consumer... in the same commit that changes a behaviour"). Decide explicitly, and record as a Key Decision, whether Expedition accepts reduced accessibility relative to Hanabi's DOM-based board (likely acceptable given the stated audience) or needs baseline affordances (e.g., an `aria-live` region announcing key state changes like "camp failed" even if the visual game itself isn't keyboard-navigable) — an explicit "out of scope, because X" beats a silent gap discovered by an accessibility audit or a player with a screen reader.

**Warning signs:**
A scene refactor (e.g., changing hand-fan layout) that doesn't touch `__expeditionTest`'s id list, caught only when the next Playwright run fails on a changed screen position or missing id — same failure shape as v1.0's three-or-more stale-locator incidents, just moved to canvas.

**Phase to address:**
Scenes (phase 6) for the living-contract discipline; explicitly decide and record the accessibility scope during Phaser shell (phase 5) before scenes multiply the surface area.

---

### Pitfall 16: The "multi-game rooms" generalization silently changes Hanabi's persisted state shape or wire schema, breaking already-created/in-flight Hanabi rooms

**What goes wrong:**
Sub-project 1 (spec §2, build order item 1) moves a single hard-coded `activeGame`, a Hanabi-only `VariantSchema`, and global `MIN_PLAYERS`/`MAX_PLAYERS` constants into a per-game registry. If this refactor changes the *shape* of persisted room state (SQLite-backed, per Durable Object) or the wire-message schema in a way that isn't backward compatible, any Hanabi room created before the deploy (or, worse, a room whose Durable Object is hibernated and rehydrates after the deploy) can fail to deserialize — directly violating the project's core value ("the game does not break, stall, or lose their seat") and the explicit architectural retrospective lesson #2 ("a `GameAdapter` seam is only proven by a second game... three Hanabi-specific wirings remain"). This is exactly the generalization the retrospective flags as risky, now actually being executed.

**Why it happens:**
Refactoring "the one game this was built for" into "one of several games" naturally wants to change field names (`variant` → `config`, keyed by game), restructure `GameEndResult` from Hanabi's `{score, reason, band?}` shape into something generic, and move `MIN_PLAYERS`/`MAX_PLAYERS` from global constants to per-game registry lookups — every one of these is a persisted-state or wire-schema shape change, and Cloudflare's `CLAUDE.md`-documented deploy discipline ("deploy the worker first whenever the wire schema changes, since both sides use strict zod validation") only covers *client/server* skew during a deploy window, not *old-persisted-state vs. new-code* skew for a room that already exists in SQLite storage from before the refactor.

**How to avoid:**
Per the spec's own success criterion for sub-project 1 ("Hanabi keeps working unchanged, with its full test suite passing"), extend that criterion explicitly to include: existing persisted Hanabi room state (real SQLite snapshots, or at minimum a fixture representing pre-refactor shape) deserializes correctly under the post-refactor schema. Where a genuine schema change is unavoidable (e.g., `VariantSchema` moving out of the shared schema into a per-game one), write an explicit migration/coercion path or a schema version field read at load time, rather than assuming an atomic worldwide deploy means every persisted room is simultaneously "new shape" the instant the new code deploys — a room whose Durable Object hasn't woken up since before the deploy still has old-shape data in storage when it next wakes. Test this with an actual pre-refactor room state fixture loaded against post-refactor code, not just "the Hanabi test suite passes" (which tests fresh-room creation, not old-room rehydration).

**Warning signs:**
"Hanabi's full test suite passes unchanged" (spec's stated bar) is a necessary but insufficient check — it validates newly created rooms under new code, not existing rooms created under old code being read by new code, since the test suite doesn't inherently include stale pre-refactor SQLite fixtures unless someone deliberately adds one.

**Phase to address:**
Multi-game rooms (phase 1, the very first phase per spec §9) — this is the single highest-leverage place to get this right, since every subsequent phase builds on the registry it establishes, and a mistake here risks the live Hanabi site directly (unlike every other pitfall in this document, which risks only the new, not-yet-live Expedition feature).

---

### Pitfall 17: The room layer's "game-agnostic" abstraction is shaped by Expedition's needs alone and quietly re-specializes to "Hanabi + Expedition," not truly generic

**What goes wrong:**
Retrospective lesson #2 explicitly warns: "a 'game-agnostic' seam is only proven by a second game... build the multi-game room layer first next time" — which this milestone is doing. But there's a second-order version of the same trap: designing the registry, config schema, and `GameEndResult` shape to accommodate exactly Hanabi's and Expedition's needs (e.g., a `GameEndResult` union of exactly `{score,reason,band?} | {outcome,campReached,suppliesLeft}` hardcoded as a two-member union, or seat-limit logic that assumes every game has a single numeric min/max range rather than, say, per-game-variant limits) produces something that *looks* generic (it's parametrized by `gameId`) but is structurally a two-case special-case in disguise, which the next game (not currently planned, but the pattern the project has now established twice) will again have to retrofit.

**Why it happens:**
It's very hard to design a truly open abstraction from exactly two concrete instances — genericity validated against N=2 examples reliably captures "what varies between these two specific things," not "what any future thing might need to vary." This is a known limitation of abstraction-by-example, not a mistake specific to this team.

**How to avoid:**
Treat this as a lower-priority, explicitly-accepted risk rather than something to over-engineer against — the project's own stack notes call out exactly this tradeoff pattern (generalize when a second consumer proves the seam, not speculatively for a third that doesn't exist yet). The actionable mitigation is narrower: keep the registry's per-game config, seat-limits, and `GameEndResult` shape declared as genuinely open (e.g., `GameEndResult` as `Record<string, unknown>` validated per-game by a per-game zod schema looked up from the registry, rather than a closed union type), so a third game doesn't require touching the shared schema file at all — satisfying the spec's own extensibility goal ("adding a new mechanic is a local change to one extension point," §1) applied one level up, to the room layer itself, not just to Expedition's content catalogues.

**Warning signs:**
Any place in the sub-project-1 implementation where code pattern-matches on `gameId === "hanabi"` or `gameId === "expedition"` outside the two games' own adapter files — mirrors the "Hanabi-shaped room layer" smell the retrospective already flagged once.

**Phase to address:**
Multi-game rooms (phase 1) — same phase as pitfall 16, lower severity (doesn't risk breaking the live site, just future extensibility), worth a design review checkpoint but not a blocking gate.

---

### Pitfall 18: Generated (PixelLab) and "free" pixel art packs carry licensing traps that only surface at review time, repeating v1.0's image-sourcing cycle

**What goes wrong:**
The retrospective explicitly documents this exact failure mode for v1.0: "owner-supplied stock previews carried watermarks, and a 'no people' photo still showed a person at its edge. Each needed a replacement cycle." Expedition's art pipeline (§7.4) uses two source types with distinct risk profiles: (1) PixelLab AI-generated assets, where the generation tool's own terms of service (not just the output image itself) govern commercial/redistributable use, and outputs can unpredictably include artifacts resembling copyrighted characters/styles from training data, especially for "camp mascot... a red panda" or jungle/boss-twist scenery that might visually converge on a recognizable existing game or franchise's assets if prompted loosely; (2) "verified CC0 or permissively licensed pixel packs," where "free" on an asset marketplace or itch.io frequently means "free to play with" but not "free to redistribute/relicense," or requires attribution the spec's `CREDITS.md` plan handles but a rushed integration might skip, or the actual license terms are buried and differ from the headline "free" label.

**Why it happens:**
Under deadline/scope pressure, art integration tends to treat "I found an asset that looks right" as the finish line, deferring the licensing check to "later" — exactly the pattern that produced multiple replacement cycles in v1.0 despite the project already having a stated policy (source only from verified licenses, per RETROSPECTIVE). AI-generated art adds a second, newer risk category (tool ToS plus potential training-data convergence) that v1.0 never had to deal with, since it only used photographs.

**How to avoid:**
Per spec §7.4, verify every asset's license *before* it's wired into a scene, not after — treat "the licence is verified and listed in CREDITS.md" as a precondition for merging an art asset, mirroring the exact discipline the retrospective recommends ("source images only from verified licences... look at every image before shipping it"), extended explicitly to cover PixelLab's own terms of service for generated output (read them once, record the conclusion as a decision, don't re-derive it per asset) and to flag any generated asset that looks suspiciously close to a known IP (the red panda mascot, jungle/temple scenery, boss-twist visuals inspired by "too close to The Crew" per the owner's own boss-twist note) for explicit owner sign-off before use, not just automatic inclusion. Keep `CREDITS.md` updated in the same commit as the asset addition (same "update every consumer in the same commit" discipline).

**Warning signs:**
An asset merged into a scene with its `CREDITS.md` entry added as a follow-up commit (or not at all) rather than atomically — the retrospective shows this exact drift ("paperwork drift... several status fields went stale") is a recurring pattern in this project, not a one-off.

**Phase to address:**
Art pass (phase 7), explicitly gated on owner review per spec §7 and §9 — but the licensing *verification step* itself should happen per-asset as it's sourced, not batched at the end of the phase, to avoid a last-minute replacement cycle blocking the whole phase's sign-off the way v1.0's image issues did.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|-----------------|
| Deriving trump/led-suit legality from a single combined "is this playable" function instead of separate composable hooks | Less code up front | Eclipse and future trump twists require re-deriving or duplicating logic; harder to property-test each rule in isolation | Never — the spec's own hook table (§6.1) already specifies the decomposition; use it |
| Storing "gear used this camp" as a flag on the persistent gear-ownership record instead of ephemeral camp state | Simpler data model, one less concept | Replayed camps inherit stale used-flags (pitfall 7) | Never |
| Building `toPlayerView` by spreading full state and deleting forbidden fields | Faster initial implementation, fewer fields to enumerate | Any new state field leaks by default; violates spec §6.6's explicit "never by copying state" requirement | Never — spec forbids this outright |
| Deferring the Phaser accessibility/keyboard-nav decision instead of recording it explicitly | Ships faster | Silent gap discovered by an actual low-vision player or a later audit, with no documented rationale for why it was skipped | Acceptable only if explicitly recorded as an accepted scope boundary (Key Decision), given the stated small-friend-group audience |
| Testing objective-kind `evaluate` functions only with camps that succeed | Fewer fixtures to build | Failure-timing bugs (pitfall 5) and replay-state-leak bugs (pitfall 7) both require a failing camp to even exercise the code path | Never for the failure-related objective kinds (`no-tricks`, `exactly-n`) — always acceptable to defer for kinds with no failure timing ambiguity |
| Skipping a pre-refactor-fixture rehydration test for sub-project 1 because "the Hanabi suite passes" | Saves writing one fixture-based test | Risks breaking real, already-created Hanabi rooms on deploy (pitfall 16) — the one pitfall in this document that touches the live product, not just new scope | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|--------------|----------------|-------------------|
| Phaser inside React/Next.js (`apps/web`) | Constructing `new Phaser.Game()` directly in a `useEffect` body without a mount-guard, causing double-construction under Strict Mode and leaks on route navigation | Ref-guarded singleton construction, explicit `game.destroy(true)` in cleanup, event-bridge communication instead of React state holding Phaser objects |
| PixelLab (AI art generation) | Treating a visually acceptable generated image as licence-clear by default | Read PixelLab's ToS once, record the conclusion; flag any output resembling known IP for explicit owner review before merging, same as any other asset |
| CC0/"free" pixel art packs | Treating "free" marketplace labeling as equivalent to CC0/public-domain without reading the actual licence terms | Verify and record the specific licence (not just "free") in `CREDITS.md` before the asset is wired into a scene |
| `packages/rules` seeded RNG (`sfc32`/`cyrb128`) shared between Hanabi and Expedition | Introducing a second, ad hoc RNG source (`Math.random()`, a fresh `new` generator) anywhere in Expedition's draft/deal/boss-selection code, breaking seed-replay determinism | Route every random draw through the single carried `ctx.rng`; add a structural grep-based test forbidding `Math.random(` under `packages/rules/src/expedition/` |
| Multi-game room registry (worker + shared schema) | Deploying a schema/shape change for sub-project 1 without verifying old, already-persisted Hanabi room state still deserializes | Test against a real or fixture pre-refactor SQLite/state snapshot, not just "new Hanabi rooms created post-refactor work" |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Sending full objective/play deck arrays to the client "for convenience" (animation staging) | Larger-than-necessary WebSocket payloads; incidental information leak (pitfall 11) as a side effect, not primarily a perf issue at this project's scale (one table, a handful of players) | Send only derived, minimal fields (`deckSize`, not deck contents); let Phaser animate generically | Not a real perf concern at this project's scale — flagged here because the leak risk is the actual cost, not throughput |
| Property-based simulated full-run tests (`fast-check`, §8) with high iteration counts across every boss twist × player count combination | CI test suite runtime creep as the catalogue (gear/objectives/bosses) grows each time a "one-file change" adds content | Keep default fast-check iteration counts modest for CI, with a separate slower/nightly higher-iteration run if deeper fuzzing is wanted; this is a genuine, non-hypothetical scale concern given the project's own extensibility goal of frequent catalogue additions | As the gear/objective/boss catalogue grows past a handful of entries, combinatorial simulated-run coverage grows with it |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Reveal/log audience computed correctly at creation but not re-verified as still audience-scoped in later views (pitfall 9) | A teammate's private Whisper becomes visible, weeks-of-development-later, to an unintended seat via an unrelated state-copy path (e.g., reassign/gear swap) | Extend the leak checker to assert audience correctness at every view snapshot throughout a simulated run, not just immediately after the reveal is created |
| `toPlayerView` built by spreading state and blacklisting fields (pitfall 11) | Any newly added state field (added for an unrelated feature, e.g. an animation) leaks by default | Explicit allowlist / structurally-typed view, enforced by a source-scan or type-level test mirroring v1.0's single-chokepoint pattern |
| Thick Fog objective visibility implemented as a client-side conditional instead of server-side omission (pitfall 10) | A face-down objective's identity is present in the wire payload and inspectable via devtools, defeating the entire mechanic — same class of bug the project's constraints explicitly call "an outright product failure" for hand identities | Server always omits non-visible objectives from the per-seat payload; never send-then-hide |
| Between-tricks action validated against window state only at client-side flow start, not at server-side arrival (pitfall 12) | Not primarily a security leak, but a correctness/fairness issue — a stale intent could apply an effect after its legal window closed | Validate at arrival time against current server state, always, per spec §6.6's own stated design |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Gear targeting flow silently fails (or applies unexpectedly) when the between-tricks window closes mid-flow (pitfall 12) | A player mid-way through choosing a Trained Monkey target sees no feedback, or the game appears to have "eaten" their click | Explicit, friendly rejection message + UI reset when a late action is rejected server-side |
| Blurry pixel art on non-integer-DPR displays not caught until the owner's visual review (pitfall 14) | Repeats v1.0's seven-round board rejection cycle, costing whole inserted phases | Set `pixelArt: true` and smoke-test rendering crispness during the Phaser shell phase (placeholder art), before the art pass makes it an expensive, owner-gated fix |
| A replayed camp silently resetting or not resetting gear/Whisper availability incorrectly (pitfall 7) | A player believes they "used up" their one Whisper for the camp when it should have refreshed on replay (or vice versa — an exploit if it wrongly refreshes gear that shouldn't) | Explicit failed-then-replayed integration test covering every "once per camp" resource |
| Ordered objectives interacting with Trail Map/Compass gear producing confusing or silently-wrong order semantics (pitfall 6) | Players lose trust in the game's fairness in a cooperative game whose core appeal is precise, legible information | Integration test combining ordered objectives with reassign/reroll gear explicitly, given camp 4/6 always combine them |

## "Looks Done But Isn't" Checklist

- [ ] **Follow-suit legality:** Often "works" for the one Sun/Moon-led example tested by hand — verify both Sun-led and Moon-led cases, plus the case where the led joker's holder also holds the other joker (no constraint).
- [ ] **Trick winner:** Often correct for tricks where trump was played — verify the no-trump-played, off-suit-discard case doesn't let a high off-suit card win, and that Eclipse reuses the same code path with an empty trump set rather than a parallel implementation.
- [ ] **Failed-then-replayed camp:** Often only tested for camps that succeed on the first modeled attempt — verify every "once per camp" gear/Whisper resets on replay, and leader/objective state doesn't leak from the failed attempt.
- [ ] **Draft-offer determinism:** Often works for a single draft in isolation — verify a full multi-camp run replays bit-identically from `(seed, action log)`, including the ownership-filtered draft-offer RNG-consumption edge case.
- [ ] **Reveal/log audience scoping:** Often correct immediately after creation — verify audience correctness persists (or is intentionally pruned) many turns later in the same camp, not just at creation time.
- [ ] **Thick Fog objective hiding:** Often "looks right" in the UI — verify server-side omission at the payload level, not client-side conditional rendering, via the leak checker.
- [ ] **Phaser mount/unmount:** Often looks fine on first load — verify navigating away and back into an Expedition room doesn't leak a second WebGL context or double-fire input.
- [ ] **Pixel art crispness:** Often looks acceptable with placeholder rectangles — verify with real sprite detail at multiple device pixel ratios before the owner-gated art review.
- [ ] **Multi-game room refactor:** "Hanabi's test suite passes unchanged" is necessary but insufficient — verify a pre-refactor persisted-room fixture still deserializes under the post-refactor schema.
- [ ] **Concurrent between-tricks actions:** Often only tested with sequential, author-chosen action ordering — verify near-simultaneous multi-seat actions racing a window close resolve per arrival order, not test-author order.
- [ ] **Asset licensing:** An asset "looking right" and being wired into a scene is often mistaken for done — verify `CREDITS.md` is updated atomically with the asset, license text actually read (not just the marketplace's "free" label), and any AI-generated asset checked for IP-convergence risk.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Follow-suit / trick-winner logic bug found late (pitfall 1, 2) | LOW-MEDIUM | Isolated in `packages/rules`, framework-free — fix is a pure-function patch plus new property test; no wire-schema or persisted-state impact since these are pure rules computations, not stored shapes |
| Replay state-leak (pitfall 7) found after some rooms have played failed camps | MEDIUM | Requires a state-shape fix (camp-scoped vs. persistent gear-used tracking) — likely needs a migration for any in-flight run's persisted state, similar cost class to pitfall 16 |
| Reveal/log persists past intended audience/window, found in production (pitfall 9) | MEDIUM-HIGH | This is a genuine information leak in a game whose entire premise is "table talk about hands is banned; everything... goes through the game" — trust repair cost is higher than the code fix cost; prioritize catching this pre-launch via the leak-checker extension, not post-hoc |
| Multi-game room refactor breaks a live pre-refactor Hanabi room (pitfall 16) | HIGH | Directly violates the project's core value for the one game already in players' hands; requires either a state migration script or, worst case, manually recreating affected rooms — strongly prefer prevention (fixture-based rehydration test) over any recovery path |
| Blurry pixel art discovered at owner review (pitfall 14) | LOW (if caught during Phaser shell) / MEDIUM (if caught during art pass, repeating v1.0's inserted-phase pattern) | Single config flag (`pixelArt: true`) plus a scaling-factor fix if caught early; a full owner-review cycle plus possible re-export of assets if caught late |
| Asset licensing issue found late (pitfall 18) | LOW-MEDIUM | Same as v1.0's documented pattern: source a replacement, update `CREDITS.md`, re-review — costly mainly in owner-review cycles, not engineering effort |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| 1. Follow-suit with two-card joker suit | Rules core (phase 2) | fast-check property across both Sun-led and Moon-led cases, all deck sizes |
| 2. Trick winner trump/led-suit precedence | Rules core (phase 2) | fast-check property against an oracle rule-text implementation; Eclipse reuses same code path |
| 3. Leader rotation + Machete + replay | Rules core (phase 2) / Run layer (phase 3) | Unit test: Machete override doesn't leak forward or backward; replay recomputes leader fresh |
| 4. Uneven-deck tables (base vs. Eclipse) drift | Rules core (phase 2) / Run layer (phase 3) | One unit test per table cell (6 total) + `deckSize === playerCount * handSize` property for every registered `deckFor` |
| 5. Objective failure detection timing | Rules core (phase 2) | Property test: camp-fail flag set on exact trick oracle-impossibility occurs, especially `exactly-n` forecast case |
| 6. Ordered objectives + reassign/reroll interaction | Run layer (phase 3) | Integration test: ordered pair + Trail Map/Compass mid-camp |
| 7. Replayed camp state leak (gear used, modifiers, leader) | Run layer (phase 3) | Integration test: fail then replay, all camp-scoped resources reset |
| 8. Draft-offer/RNG determinism | Run layer (phase 3) | Structural grep test forbidding `Math.random`; full-run replay-from-seed property test |
| 9. Reveal/log audience persistence past intended scope | Run layer (phase 3, design decision) / Wiring (phase 4, leak-checker extension) | Leak checker asserts audience correctness at every view snapshot, not just at reveal creation |
| 10. Thick Fog face-down objective leak | Wiring (phase 4) | Leak checker + simulated runs explicitly exercising Thick Fog boss twist |
| 11. Objective deck order / RNG state leak via view shortcut | Wiring (phase 4) / Scenes (phase 6) | Structural test: `toPlayerView` never spreads raw state; type-level view allowlist |
| 12. Concurrent between-tricks actions racing window close | Wiring (phase 4) | Concurrency test: multi-seat near-simultaneous actions vs. window-closing card play, arrival-order resolution |
| 13. Phaser double-mount / leak on route change | Phaser shell (phase 5) | Manual + automated check: navigate away/into room twice, no duplicate WebGL context or doubled input |
| 14. Pixel art blur (antialiasing, DPR) | Phaser shell (phase 5) | `pixelArt: true` set and screenshot-verified before art pass; re-verified at art pass |
| 15. Canvas test bridge / accessibility scope drift | Scenes (phase 6) / Phaser shell (phase 5, accessibility decision) | Test bridge updated in same commit as scene changes; accessibility scope explicitly recorded as a Key Decision |
| 16. Multi-game refactor breaks live Hanabi persisted state | Multi-game rooms (phase 1) | Pre-refactor state fixture rehydrates correctly under post-refactor schema, in addition to full Hanabi suite passing |
| 17. Room layer re-specializes to "Hanabi + Expedition" only | Multi-game rooms (phase 1) | Design review: no `gameId === "hanabi" \| "expedition"` branching outside each game's own adapter |
| 18. Asset licensing traps (PixelLab, "free" packs) | Art pass (phase 7) | `CREDITS.md` entry verified and committed atomically with each asset; PixelLab ToS conclusion recorded once |

## Sources

- `.planning/PROJECT.md` — project constraints, core value, key decisions log, v1.0 wiring gaps (HIGH confidence, primary source)
- `docs/superpowers/specs/2026-09-22-expedition-design.md` — owner-approved design spec, sole source of truth for all game-rule pitfalls (HIGH confidence, primary source)
- `.planning/RETROSPECTIVE.md` — v1.0 milestone retrospective; source for the visual-review-cycle, stale-locator, stale-dev-server, image-licensing, and game-agnostic-seam lessons applied here to the analogous v2.0 risks (HIGH confidence, primary source)
- [Phaser + React Integration Guide](https://generalistprogrammer.com/tutorials/phaser-react-integration-guide) — mount-guard and event-bridge pattern for embedding Phaser in React (MEDIUM confidence, single third-party tutorial, cross-checked against React's own issue tracker below)
- [React Strict Mode double-invoke cleanup gap, facebook/react#25614](https://github.com/facebook/react/issues/25614) — confirms cleanup from a first mount can be skipped entirely under Strict Mode if closed-over state differs between mounts (MEDIUM-HIGH confidence, official React issue tracker)
- [Phaser Core Config docs — `pixelArt` / `antialias` / `roundPixels`](https://docs.phaser.io/api-documentation/class/core-config) — confirms `pixelArt: true` sets `antialias: false`, `antialiasGL: false`, `roundPixels: true` together (HIGH confidence, official Phaser docs)
- [Phaser renderer resolution blurry on devicePixelRatio > 1, phaserjs/phaser#3198](https://github.com/phaserjs/phaser/issues/3198) — confirms non-integer DPR can cause uneven pixel sizing even with correct filtering (MEDIUM confidence, official Phaser GitHub issue, WebSearch-surfaced)
- General knowledge of trick-taking rules-engine bug patterns (trump-vs-led-suit conflation, RNG rejection-sampling stream divergence) — MEDIUM confidence, training-data-derived domain knowledge applied to this spec's specific mechanics, not independently verified against an external source; flagged as the category most warranting extra property-test scrutiny during implementation rather than trusted as fact

---
*Pitfalls research for: v2.0 Expedition (roguelite co-op trick-taking + multi-game room layer)*
*Researched: 2026-09-22*

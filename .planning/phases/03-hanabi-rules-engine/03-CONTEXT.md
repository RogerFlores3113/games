# Phase 3: Hanabi Rules Engine - Context

**Gathered:** 2026-09-15
**Status:** Ready for planning
**Mode:** `--auto --chain` — every gray area resolved to its recommended option without interactive questions. Review the decisions below; any can be overturned before or during planning.

<domain>
## Phase Boundary

This phase builds the **real Hanabi rules engine** as a pure, variant-parametrized, network-free package (`packages/rules`), tested in isolation with unit and property tests. It covers RULES-01…RULES-10, RULES-12…RULES-13, RULES-15…RULES-20, HIDE-05, and FDN-02.

**Explicitly not in this phase:**
- **No wiring into the worker.** `apps/worker` keeps calling the forehead-card toy through `game-registration.ts`; swapping in the Hanabi adapter is Phase 4's job, and the toy is deleted there, not here.
- **No UI.** RULES-11 (illegal actions visibly disabled) is Phase 6.
- **No variant end-to-end proving.** RULES-14 and UI-07 are Phase 7. The engine must be *parametrized* so Rainbow and Black need no restructuring, and its own tests must cover all three configurations, but enabling them as a product feature is Phase 7.
- **No reconnect/idempotency work.** RT-09 is Phase 4.

</domain>

<decisions>
## Implementation Decisions

### Engine shape and package layout
- **D-01:** The engine is a second `GameAdapter<HanabiState, HanabiAction>` implementation living beside the toy in `packages/rules`, under its own `hanabi/` subdirectory (deck, variant config, clue logic, turn application, endgame/scoring, projection). It keeps the package's **zero runtime dependencies** (FDN-02) and imports nothing from `@games/schema`, `apps/worker`, or `apps/web`.
- **D-02:** The forehead-card toy, its leak checker and its tests **stay** in this phase. Phase 4 deletes the toy. Phase 3 must not break it — the full suite stays green throughout.
- **D-03:** `packages/rules/src/adapter.ts`'s `GameAdapter` interface is **not reshaped**. If `AdapterError` needs more members for Hanabi's refusal reasons, widening that union is allowed; changing the five-member interface is not. The worker's existing `mapAdapterError` collapse to `bad_request` stays valid.

### Cards, hands and hidden state
- **D-04:** A card is `{ id, suit, rank }`. `id` is an **opaque minted id**, reusing `shuffle.ts`'s `mintCardId` — never a deck index or anything derivable from deck composition, exactly as Phase 2 D-04 required. Cards keep their id for life, so Phase 6's clue memory and animations have a stable key.
- **D-05:** A hand is an **ordered list of slots**; a drawn card goes to a defined end and remaining cards keep their order. Hanabi conventions are positional ("your newest card"), so slot order is part of the rules, not a UI detail.
- **D-06:** The engine stores, per card in hand, the **accumulated clue facts**: which suits/ranks it has been positively identified as, and which it has been ruled out as. This is engine state, not UI state — it is what UI-05 renders in Phase 6, and deriving it later from history would be a second source of truth.
- **D-07:** `toPlayerView` follows Phase 2's whitelist-construction rule verbatim (Phase 2 D-05): field-by-field literals, no spread/`delete`/`Object.assign`/omit, and a card in the viewer's own hand **structurally lacks `suit` and `rank`** — it carries its id and its clue facts only. Other seats' hands carry full identity. Public state (played stacks, discard pile, tokens, deck count) is identical for every seat.

### Variant parametrization
- **D-08:** A single `VariantConfig`, derived from the variant name, is the only source of suit count and deck composition (RULES-03). Nothing in the engine hardcodes 5 suits or a 50-card deck. Base = 5 suits; Rainbow = 6 with the sixth touched by every color clue; Black = 6 where the sixth holds one copy of each rank.
- **D-09:** **Clue-touch is a function of the variant config**, not a special case at each call site: "which cards does this clue touch" resolves through one predicate that the config parametrizes. Rainbow's every-color rule and the rule that no clue names "rainbow" as a color fall out of that predicate.
- **D-10:** Every rules test runs against **all three variants** where the rule is variant-sensitive (deck construction, clue touching, scoring ceiling). Phase 7 then only has to prove it end to end, not discover restructuring work.

### Actions, legality and hostile input
- **D-11:** Actions name a **card by id**, not by hand index: `{ type: "play", cardId }`, `{ type: "discard", cardId }`, `{ type: "clue", targetSeatId, clue: { type: "color" | "rank", value } }`. Ids remove any ambiguity about what the player meant when hands shift.
- **D-12:** HIDE-05 is enforced the way the toy does it: **exact-own-key guards** that reject any payload carrying an extra key, so a client can request an action but can never assert resulting state. A play/discard request naming a card **not in the actor's own hand** is rejected, which also stops a client from asserting knowledge of another seat's card.
- **D-13:** Illegal actions are rejected with **specific, typed reasons** (not your turn, no clue tokens, clue touches zero cards, discard at maximum clue tokens, card not in hand, game over). The engine is the authority; Phase 6's UI disables illegal actions on top of the same legality functions, so those checks are exported as **pure predicates**, not buried inside `applyAction`.

### Endgame, tokens and scoring
- **D-14:** The final round is an **explicit counter in state** (RULES-15), set when the deck empties, decremented per turn, with no draws during it (RULES-16). It is never inferred from deck size at render time.
- **D-15:** All three end conditions are handled (RULES-17): third fuse lost, all stacks complete, final round elapsed. A completed final stack ends the game immediately at the perfect score.
- **D-16:** Token rules: a clue costs one, a discard returns one, completing a stack with a 5 returns one **unless already at 8, where the bonus is forfeit** (RULES-13), and the count never leaves 0…8.
- **D-17:** Scoring returns the numeric score **and its descriptive band** (RULES-18) from the engine, not the UI, so Phase 6 renders a value it does not compute.

### Determinism, history and test strategy
- **D-18:** Shuffling reuses `shuffle.ts`'s seeded PRNG with a named stream (RULES-19). The seed stays **server-only** — it is already excluded from every view and must gain no field in any projection.
- **D-19:** Turn history is recorded from the first turn (RULES-20) and contains **public facts only**. A draw is recorded by card id with no identity, so replaying history can never reveal a card its holder should not see. No interface exposes history in v1.
- **D-20:** Property tests (fast-check) cover the invariants that are easy to state and easy to get subtly wrong: **token conservation** (clues always 0…8, fuses 0…3), **card conservation** (every card is in exactly one place — deck, a hand, a stack, or the discard), **redaction** (no seat's view contains its own cards' identities), and **termination** (a game driven by random legal actions always ends). Example-based tests carry the specific rules.
- **D-21:** The leak checker is **generalized before reuse** for Hanabi, closing code-review finding WR-03: Hanabi identities are numeric ranks (1–5) that legitimately collide with token counts and scores, so a raw-string scan is not sufficient. The Hanabi checker must compare **structurally and by typed identity** (own-hand entries lack `suit`/`rank` keys; no own card's `{suit, rank}` pair appears anywhere in the view), not by scanning for a bare number.
- **D-22:** The canary discipline from Phase 2 D-13 carries over: the Hanabi leak checker gets its own suite of deliberately leaky projections proving it fails. Per code-review finding WR-02, **any assertion loop guarded by a condition must also assert it ran at least once**, so a fixture change cannot silently empty a test.

### Claude's Discretion
- File/module split inside `packages/rules/src/hanabi/` and naming of exported types.
- Exact `HanabiState` field names and whether clue facts are stored as sets, bitmasks, or arrays.
- Score band thresholds and wording, following the standard published Hanabi bands.
- fast-check run counts and generator design.
- Whether legality predicates live in one module or beside each action.
- Whether `AdapterError` gains members or Hanabi refusals are carried in a payload alongside the existing union.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` § "Phase 3: Hanabi Rules Engine" — goal and the five success criteria.
- `.planning/REQUIREMENTS.md` — RULES-01…RULES-10, RULES-12…RULES-13, RULES-15…RULES-20, HIDE-05, FDN-02 are this phase's requirements. RULES-11 (Phase 6) and RULES-14 (Phase 7) are explicitly out.
- `.planning/PROJECT.md` § Context — "Rules surface for the chosen scope" states the deck composition, the Rainbow and Black rules, and names the end-game trigger and token economy as where engines most often get Hanabi wrong.

### Contracts this phase must honor
- `packages/rules/src/adapter.ts` — the `GameAdapter` interface and its three invariants (no mutation, hostile `request`, `toPlayerView` is the only exit).
- `packages/rules/src/forehead-card.ts` — the reference implementation of an adapter: exact-key request guard, whitelist-constructed views, fail-closed handling of an unseated viewer.
- `packages/rules/src/shuffle.ts` — seeded PRNG, Fisher-Yates, and opaque card-id minting, with its own header explaining why the state is 128-bit.
- `.planning/phases/02-per-seat-redaction-contract/02-CONTEXT.md` — D-04 (ids must not correlate with identity), D-05 (whitelist construction), D-11/D-12/D-13 (leak-test layering, collision-free fixtures, canaries). These carry forward unchanged.

### Known findings to resolve in this phase
- `.planning/phases/02-per-seat-redaction-contract/02-REVIEW.md` — WR-01 (PRNG internal-state recovery from observed output, relevant now that the real dealer depends on it), WR-02 (guarded assertion loop with no non-vacuousness check), WR-03 (leak checker blind to numerically re-encoded secrets — directly affects Hanabi's 1–5 ranks).

### Stack and testing
- `CLAUDE.md` § "Testing Approach for the Rules Engine" — Vitest for example-based tests, fast-check for the invariants, with the reasoning for why property testing is warranted here specifically.
- `CLAUDE.md` § "Shared Types Strategy" — `packages/rules` is framework-free, pure functions and plain objects only.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `shuffle.ts`: `seedToRngState`, `nextRandom`, `shuffleWithSeed`, `mintCardId` — the deterministic dealing primitives, already zero-dependency and pure. Independent named streams ("deck", "card-ids") already work.
- `forehead-card.ts`: the working shape of an adapter that holds secrets — copy its structure, not its rules.
- `forehead-card-leak-check.ts`: `checkSeatViewForLeaks` / `secretsForSeat` — the pattern to generalize per D-21.
- `adapter.test.ts`: an adapter conformance suite (non-mutation via snapshot diffing, purity file list) that a second adapter can be added to.
- Vitest `projects` layout with a `rules` project that runs with no network and no Worker runtime.

### Established Patterns
- Whitelist construction in projections; hidden entries omit fields rather than nulling them.
- Exact-own-key request guards as the boundary that makes state assertion impossible.
- Non-mutating transitions returning fresh state objects.
- Pure functions take `now`/`seed` as parameters rather than reading ambient state.
- Exact dependency version pins.

### Integration Points
- `packages/rules/src/index.ts` — the barrel the Hanabi exports get added to.
- `apps/worker/src/game-registration.ts` — the single registration point Phase 4 will repoint at the Hanabi adapter. Phase 3 does not touch it.
- `packages/schema/src/games/` — Phase 4 adds a `hanabi.ts` strict view schema alongside the toy's. Not this phase, but the engine's view type should be shaped so a strict schema can validate it (plain objects, no classes, no `undefined`-valued keys).

</code_context>

<specifics>
## Specific Ideas

- The two failure modes the roadmap calls out — a hidden-information leak and a game that never ends — are both **silent**. That is the argument for the conservation and termination properties in D-20 over more example tests.
- The engine should be written so Phase 6 can ask it "is this action legal?" without attempting it (D-13). A UI that disables illegal actions by trial-and-error against `applyAction` would be a smell.
- Clue facts (D-06) carry the full weight of the product's memory aid, because player-authored notes are explicitly out of scope. Both positive and negative information must accumulate.

</specifics>

<deferred>
## Deferred Ideas

- **Swapping the worker onto the Hanabi adapter and deleting the toy** — Phase 4, per the roadmap.
- **Strict Zod view schema for the Hanabi view** (`packages/schema/src/games/hanabi.ts`) — Phase 4, when the view crosses the wire.
- **Rainbow/Black enabled end to end** — Phase 7. The engine is parametrized and tested for all three here.
- **Turn-history UI, replay, clue log** — out of scope for v1 (QOL-01 is v2); history is recorded but never displayed.
- **Hardening the PRNG against internal-state recovery (WR-01)** — noted for this phase's research to size. If it turns out to need a different generator, that is an engine-local change while the engine is still network-free, which is the cheapest moment to make it.

</deferred>

---

*Phase: 03-hanabi-rules-engine*
*Context gathered: 2026-09-15*

# Phase 9: Expedition Rules Core - Research

**Researched:** 2026-09-23
**Domain:** Pure trick-taking rules engine (deck, follow-suit/trick-winner, objective evaluation, camp state machine) — no gear, bosses, run layer, adapter, or UI
**Confidence:** MEDIUM-HIGH — the core trick-taking mechanics are unambiguous in the spec; the objective-kind edge cases (especially `exactly-n` reachability and simultaneous ordered-card tricks) are genuinely underspecified and are flagged as open questions requiring owner confirmation, not filled in with invented rules.

<user_constraints>
## User Constraints (from design spec — no CONTEXT.md exists for this phase)

There is no `09-CONTEXT.md`; per the task instructions, `docs/superpowers/specs/2026-09-22-expedition-design.md` is the owner-approved design spec and is treated as locked user decisions for this phase, equivalent to a CONTEXT.md's `## Decisions`.

### Locked Decisions (spec §3, §6, §10 — Round rules and Engine architecture)
- Deck: 54 cards (A high–2, 4 suits, plus Sun and Moon jokers). 3p: all 54 (18 each). 4p: remove 2♣ 2♦ (52, 13 each). 5p: remove all four 2s (50, 10 each). Removed cards are public.
- Follow the led suit if you can; otherwise play anything, including Sun/Moon. Sun beats Moon beats highest card of led suit. Winner leads next trick (subject to a `nextLeader` hook — Machete, Phase 10).
- Sun and Moon form their own two-card suit for following: if one is led, whoever holds the other must play it.
- Sun holder is expedition leader (picks first objective, leads first trick); A♠ holder leads when Sun is out of play (relevant once Eclipse exists in Phase 10, but the `leaderFor` hook must be written generically now, per §6.1's hook table).
- Objectives flip from a second, separately shuffled deck of the same card identities as the play deck, minus removed cards and minus Sun/Moon. Leader takes first, then clockwise, one at a time, until all are taken.
- Base objective kind (`win-card`): win the trick containing card X.
- Objective kinds: `win-card`, `ordered` (①/②/…/"last"), `no-tricks`, `exactly-n` (§5.2 table, reproduced below).
- Camp succeeds when every objective is done; fails the instant any objective becomes impossible or a failure check fires. Play stops immediately.
- No undo, no auto-play of a queued card (XRULE-08). This applies to Phase 9's play-card action itself; Whisper/gear finality is Phase 10's concern.
- Engine architecture (§6): Core (pure functions: deck, legal plays, trick winner, camp state machine) → Rule hooks (composed base → boss twist → gear, each hook receiving the previous layer's answer) → Content catalogues. Phase 9 builds ONLY the Core layer and the hook *seams* it will be composed through later — it must NOT build gear/boss content, the toolkit, reveals, the run/draft/loadout layer, or the adapter/worker wiring (those are explicitly Phase 10 and Phase 11 per ROADMAP.md).
- Randomness: the existing seeded `sfc32`/`cyrb128` pair from `packages/rules/src/shuffle.ts`, reused unchanged, carried as a seed string (not RNG state) into `createInitialState`-style functions, matching Hanabi's `dealInitialHands` pattern.

### Claude's Discretion (nothing explicitly reserved to the user in the spec for this phase)
- Internal state shape for objectives (id, kind, cardId, order marker, N value, ownerSeatId) as long as it supports the hook table in §6.1 without rework.
- Exact function/module names inside `packages/rules/src/expedition/`, as long as they mirror the Hanabi package's naming conventions (`deck.ts`, `state.ts`, `legality.ts`, etc.) per the spec's "beside `hanabi/`" instruction.
- Whether trick/objective evaluation is a single pass or split across files — the spec does not mandate file boundaries below the three layers.

### Deferred Ideas (OUT OF SCOPE for Phase 9)
- Gear, the toolkit (`moveCard`, `reveal`, `addModifier`, etc.), reveals/Whisper, boss twists, the draft/loadout/run state machine, supplies, replay-on-fail — all Phase 10.
- `ExpeditionAdapter` (`GameAdapter` conformance), per-seat view/redaction, worker wiring, leak-checking across whole simulated runs (COMM-03/ENG-03) — Phase 11.
- Phaser rendering, card packs, interactables — Phase 12+.
- Eclipse's actual deck change (jokers removed) and other boss twists — Phase 10's `BossDef` catalogue. Phase 9 must design `deckFor`/`leaderFor` as hooks that CAN be overridden later, but must not implement Eclipse itself.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| XRULE-01 | 3–5 players dealt equal hands from correctly-sized 54/52/50-card deck, 2s removed per player count, removed cards public | See Standard Stack/Architecture: `deck.ts` mirrors Hanabi's `buildDeck`/`dealInitialHands` pattern, parametrized by player count instead of variant |
| XRULE-02 | Follow-suit; Sun/Moon win; highest of led suit otherwise; winner leads next | See Architecture Patterns: `legalPlays`/`trickWinner` hook design; Common Pitfalls 1–2 |
| XRULE-03 | Led joker forces the other joker's holder to play it | See Architecture Patterns Pattern 2 (joker-suit following); Common Pitfalls 2 |
| XRULE-04 | Sun holder is leader (picks first objective, leads first); A♠ fallback when Sun out of play | See Architecture Patterns Pattern 3 (`leaderFor` hook); Open Question 1 |
| XRULE-05 | Objectives flipped from a second deck, taken one at a time clockwise from the leader until all taken | See Architecture Patterns Pattern 4 (objective-pick core function) |
| XRULE-06 | Four objective kinds; status (pending/done/failed) always visible | See Architecture Patterns Pattern 5 (`ObjectiveKindDef.evaluate`); Don't Hand-Roll (status recomputation) |
| XRULE-07 | Camp succeeds when all objectives done; fails instantly on impossibility; play stops | See Common Pitfalls 3–5 (failure-timing edge cases); Open Questions 2–4 |
| XRULE-08 | No undo, no auto-play of a queued card | See Architecture Patterns: `applyAction`-shaped `playCard` core function returns a rejection, never queues |
</phase_requirements>

## Summary

Expedition's rules core is a pure, framework-free extension of the exact pattern `packages/rules/src/hanabi/` already establishes: a `deck.ts` (shuffle + deal, parametrized by a config), a `state.ts` (readonly state types + non-readonly view-shaped mirrors), a `legality.ts` (pure predicates an `applyAction`-equivalent calls), and property tests driven by the engine's own exported "enumerate legal actions" helpers (`test-support.ts` pattern) rather than a hand-rolled duplicate of the rules. Phase 9 only needs the **Core** layer from spec §6.1 — deck construction, legal-play/trick-winner logic (including the Sun/Moon joker suit), the leader computation, objective-pick sequencing, and the four objective kinds' `pending`/`done`/`failed` evaluation after every trick — plus the **seams** (`deckFor`, `leaderFor`, `isTrump`/`trickWinner`, `legalPlays`, `nextLeader`, `failureChecks`) that Phase 10's rule-hook composition will attach to. It must NOT build the hook composition mechanism itself, the toolkit, gear, bosses, the run/draft/loadout layer, or the adapter — those are Phase 10 and Phase 11 by ROADMAP.md's explicit phase boundaries.

The trick-taking mechanics (follow-suit, Sun/Moon as a two-card suit that forces a response, Sun-beats-Moon-beats-highest-led-suit-card) are unambiguous and directly analogous to The Crew's rocket-suit mechanic; they can be implemented and property-tested with high confidence. The genuinely hard part — and the one requiring the most careful design — is failure-timing for `exactly-n` (an objective must be flagged failed the instant it becomes mathematically unreachable, not merely when its holder exceeds N) and for `ordered` objectives when two order-marked cards could theoretically land in the same trick. Both are flagged as open questions the owner has not resolved in the spec; Phase 9's plan should either get an explicit ruling before implementation or make a documented, conservative assumption and flag it for the phase's discuss/plan-check gate.

**Primary recommendation:** Build `packages/rules/src/expedition/{deck,state,legality,trick,leader,objectives}.ts` mirroring Hanabi's file-per-concern structure exactly, reuse `shuffle.ts` unchanged, and write the four objective kinds as an internal `ObjectiveKindDef`-shaped registry from day one (even though the full catalogue/registry mechanism is Phase 10) so Phase 10 only has to plug gear modifiers in, not restructure objective evaluation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Deck construction (54/52/50, per player count) | API/Backend (`packages/rules`) | — | Pure computation library consumed by the future Durable Object; no I/O |
| Follow-suit legality / trick winner (incl. Sun/Moon) | API/Backend (`packages/rules`) | — | Must be server-authoritative once wired (Phase 11); pure function today |
| Leader computation (Sun/A♠ fallback) | API/Backend (`packages/rules`) | — | Same reasoning; also feeds objective-pick order |
| Objective-pick sequencing | API/Backend (`packages/rules`) | — | Pure turn-order function over seat list + leader index |
| Objective kind evaluation (win-card/ordered/no-tricks/exactly-n) | API/Backend (`packages/rules`) | — | Recomputed after every trick; no persistence or network concern yet |
| Camp success/failure detection | API/Backend (`packages/rules`) | — | Drives whether play stops; consumed later by the adapter's `checkGameEnd`-equivalent (Phase 11) |
| Per-seat view redaction of objective/card visibility | Deferred to Phase 11 | — | Phase 9 designs internal state so this is straightforward later, but does not implement `toPlayerView` itself (no adapter in Phase 9) |
| Rule-hook composition (base → boss → gear) | Deferred to Phase 10 | — | Phase 9 exposes the hook *signatures* as plain function parameters with sane defaults; Phase 10 builds the actual layering/composition mechanism |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.9.3 (repo-pinned, exact) | Language | Already the repo's exact pin (CLAUDE.md 5.7+ constraint); no change needed [VERIFIED: repo package.json] |
| Vitest | 4.1.11 (repo-pinned, exact) | Unit/property test runner | Already installed and used by every `packages/rules` test file [VERIFIED: repo package.json, `npm ls vitest`] |
| fast-check | 4.9.0 (repo-pinned, exact) | Property-based testing | Already installed; used identically by Hanabi's `*.property.test.ts` files [VERIFIED: repo package.json, `npm ls fast-check`] |

**No new packages are required for this phase.** `packages/rules` has zero runtime dependencies (FDN-02) and Expedition's core reuses `shuffle.ts` unchanged. `npm view fast-check version` returns `4.10.2` and `npm view vitest version` returns `5.0.1` as of this session — both newer than the repo's exact pins, but per the same precedent set in Phase 3's research ("Do not bump either for this phase" — a version bump is a cross-cutting change belonging to its own task), Phase 9 should NOT bump either. [VERIFIED: npm registry, queried this session]

### Supporting
None — this phase adds no new runtime or dev dependencies.

### Alternatives Considered
Not applicable — no library choice is being made in this phase; the constraint is "match the existing Hanabi engine's zero-dependency, hand-rolled pattern," which is already locked by `packages/rules`' FDN-02 rule and by the spec's own "zero runtime dependencies" instruction (§6).

**Installation:** None required.

## Package Legitimacy Audit

**Not applicable.** This phase installs no external packages. All tooling (TypeScript, Vitest, fast-check) is already installed and pinned in the repo root `package.json`, verified via `npm ls` above. No `slopcheck` run was needed since no new package names are being introduced.

## Architecture Patterns

### System Architecture Diagram

```
                 ┌─────────────────────────────────────────┐
                 │   packages/rules/src/expedition/         │
                 │   (pure, framework-free — Phase 9 scope) │
                 └─────────────────────────────────────────┘
 seatIds, seed,          │
 playerCount   ─────────▶│  deck.ts
                         │  buildDeck(playerCount) → 54/52/50 cards
                         │  dealInitialHands(seatIds, seed) → hands + removedCards
                         │
                         ▼
                 leader.ts
                 leaderFor(hands) → seatId
                 (Sun holder, else A♠ holder — hook seam for Eclipse, Phase 10)
                         │
                         ▼
                 objectives.ts
                 dealObjectiveDeck(playerCount, seed) → face-up objective cards
                 pickObjective(state, seatId, cardId) → assigns ownership,
                   advances clockwise from leader until all taken
                         │
                         ▼
            ┌────────────────────────────┐
            │   Per-trick loop (core.ts)  │
            │                              │
 play-card ─┼─▶ legality.ts               │
 request    │   canPlayCard(state, seat,   │
            │     cardId) → legal|reason   │
            │        │                     │
            │        ▼                     │
            │   trick.ts                   │
            │   isTrump / trickWinner      │
            │   (Sun beats Moon beats      │
            │    highest of led suit)      │
            │        │                     │
            │        ▼  (trick completes)  │
            │   objectives.ts              │
            │   evaluateObjectives(state)  │
            │   → pending | done | failed  │
            │   per objective, EVERY trick │
            │        │                     │
            │        ▼                     │
            │   camp.ts                    │
            │   checkCampOutcome(state)    │
            │   → in_progress | succeeded  │
            │     | failed                 │
            └────────────────────────────┘
                         │
                         ▼
        (Phase 10 attaches: boss-twist/gear hook layering,
         the toolkit, reveals, run/supplies/replay state machine)
        (Phase 11 attaches: GameAdapter conformance, toPlayerView,
         worker wiring, leak checks)
```

### Recommended Project Structure
```
packages/rules/src/expedition/
├── deck.ts            # buildDeck(playerCount), dealInitialHands — mirrors hanabi/deck.ts
├── state.ts            # ExpeditionState, Hand, Card, Objective, Trick types — mirrors hanabi/state.ts
├── leader.ts           # leaderFor(hands) — Sun/A♠ fallback hook seam
├── legality.ts         # canPlayCard, findOwnSlot — mirrors hanabi/legality.ts
├── trick.ts            # isTrump, trickWinner, ledSuitOf — the joker-suit rule
├── objectives.ts        # ObjectiveKindDef-shaped evaluators for the 4 kinds; pickObjective sequencing
├── camp.ts             # checkCampOutcome (pure, in_progress/succeeded/failed)
├── test-support.ts      # enumerateLegalPlays, currentActorSeatId — mirrors hanabi/test-support.ts
├── deck.test.ts
├── trick.property.test.ts
├── objectives.property.test.ts
├── leader.test.ts
└── camp.test.ts
```

### Pattern 1: Deck construction parametrized by player count, not by an enum
**What:** Unlike Hanabi's `VariantConfig` (which varies suit count/rank direction), Expedition's deck varies only by *which specific cards are removed* for a given player count. Model this as a pure function `removedCardsFor(playerCount: 3 | 4 | 5): CardIdentity[]` and `buildDeck(playerCount)` that filters a full 54-card identity list, exactly mirroring `hanabi/deck.ts`'s `buildDeck(config)` shape.
**When to use:** `createInitialState`-equivalent, and again by Phase 10's Eclipse boss twist (which further removes the jokers) — this is why `deckFor` must stay a hook-shaped pure function taking `playerCount` as its only required input, with no camp/boss state baked into its signature yet.
**Example:**
```typescript
// Source: pattern mirrors packages/rules/src/hanabi/deck.ts (existing, in this repo)
export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank = "2" | "3" | ... | "A";
export type CardIdentity =
  | { kind: "standard"; suit: Suit; rank: Rank }
  | { kind: "joker"; joker: "sun" | "moon" };

export function removedCardsFor(playerCount: 3 | 4 | 5): CardIdentity[] {
  if (playerCount === 3) return [];
  if (playerCount === 4) return [twoOf("clubs"), twoOf("diamonds")];
  return [twoOf("clubs"), twoOf("diamonds"), twoOf("hearts"), twoOf("spades")];
}
```

### Pattern 2: The Sun/Moon two-card "suit" for following purposes
**What:** Follow-suit legality is normally "must match the led card's regular suit if you hold one." When the led card is Sun or Moon, the "led suit" is the two-joker group: a player holding the OTHER joker must play it (forced), but a player holding neither joker may play anything (there is no third joker to "run out" of).
**When to use:** `legalPlays(state, seat)` hook — this is the one legality rule genuinely different from Hanabi's discard/clue legality and from ordinary trick-taking follow-suit.
**Example:**
```typescript
// Source: derived directly from spec §3 "Tricks" and §6.1 hook table (legalPlays)
function legalPlaysFor(hand: readonly CardIdentity[], ledCard: CardIdentity | null): CardIdentity[] {
  if (ledCard === null) return [...hand]; // leading the trick: anything is legal
  if (ledCard.kind === "joker") {
    const other: CardIdentity["joker"] = ledCard.joker === "sun" ? "moon" : "sun";
    const forced = hand.find((c) => c.kind === "joker" && c.joker === other);
    return forced ? [forced] : [...hand];
  }
  const followers = hand.filter((c) => c.kind === "standard" && c.suit === ledCard.suit);
  return followers.length > 0 ? followers : [...hand];
}
```
**Note:** this must be proven by fast-check across ALL deck sizes (54/52/50), per success criterion 2 — a naive implementation that only checks `hand.some(matchesLedSuit)` without special-casing jokers will silently permit an illegal off-suit play when a player holds the forced joker.

### Pattern 3: `leaderFor` as a standalone, overridable hook
**What:** `leaderFor(hands: readonly Hand[]): string` returns the Sun holder's seatId, or the A♠ holder's seatId if no hand contains the Sun (either because a future boss twist removed it, or — defensively — because of a malformed deal). This must be written generically now (never gated behind "if boss === eclipse") so Phase 10's Eclipse twist can literally reuse it unchanged once jokers are actually removed from the deck.
**When to use:** Once, at camp setup, to seed both `expeditionLeaderSeatId` (leads trick 1) and the objective-pick order (clockwise starting from the leader).
**Example:**
```typescript
// Source: spec §3 "Expedition leader" — "If the Sun is not in play ... the holder of A♠ is the leader"
export function leaderFor(hands: readonly Hand[]): string {
  const sunHolder = hands.find((h) => h.cards.some((c) => c.kind === "joker" && c.joker === "sun"));
  if (sunHolder) return sunHolder.seatId;
  const aceOfSpadesHolder = hands.find((h) =>
    h.cards.some((c) => c.kind === "standard" && c.suit === "spades" && c.rank === "A"),
  );
  if (aceOfSpadesHolder) return aceOfSpadesHolder.seatId;
  throw new Error("leaderFor: no Sun and no A♠ in any hand — deck is malformed");
}
```

### Pattern 4: Objective-pick as a pure turn-order function
**What:** `nextObjectivePicker(seatIds, leaderSeatId, alreadyPickedSeatIds)` — clockwise order starting at the leader, skipping nobody (every player takes exactly one at a time until all face-up objectives are taken; a camp's objective count from the ramp table, e.g. 2 at camp 1, need not divide evenly by player count — the spec does not say what happens when objectives run out before every player has picked one, or when there are more objectives than players requiring a second round. Flagged as Open Question 5).
**When to use:** Between deal and first trick, in the `objective-pick` timing window (§4.4) — Phase 9 only needs the pure sequencing function; the window/gear-interrupt mechanics belong to Phase 10.

### Pattern 5: `ObjectiveKindDef`-shaped evaluators, built now even though the full catalogue is Phase 10
**What:** Per spec §6.2, objective kinds are `ObjectiveKindDef { id, describe, evaluate(camp, objective) → "pending" | "done" | "failed" }`. Phase 9 should implement the four kinds' `evaluate` functions directly (not behind a registry — the registry/catalogue mechanism with id-based dispatch is arguably Phase 10 plumbing) so that Phase 10 can wrap them in the registry without touching their internals.
**Example:**
```typescript
// Source: spec §5.2 table, directly transcribed
type ObjectiveStatus = "pending" | "done" | "failed";

function evaluateWinCard(camp: CampState, objective: WinCardObjective): ObjectiveStatus {
  const trick = findTrickContaining(camp, objective.cardId);
  if (trick === undefined) return "pending"; // card not yet played
  return trick.winnerSeatId === objective.ownerSeatId ? "done" : "failed";
}

function evaluateNoTricks(camp: CampState, objective: NoTricksObjective): ObjectiveStatus {
  const tricksWon = countTricksWon(camp, objective.ownerSeatId);
  if (tricksWon > 0) return "failed";
  return campHasEnded(camp) ? "done" : "pending";
}

function evaluateExactlyN(camp: CampState, objective: ExactlyNObjective): ObjectiveStatus {
  const tricksWon = countTricksWon(camp, objective.ownerSeatId);
  const tricksRemaining = camp.totalTricks - camp.tricksPlayed;
  if (tricksWon > objective.n) return "failed";
  if (tricksWon + tricksRemaining < objective.n) return "failed"; // mathematically unreachable
  if (campHasEnded(camp)) return tricksWon === objective.n ? "done" : "failed";
  return "pending";
}
```

### Anti-Patterns to Avoid
- **Recomputing objective status only at camp end:** Success criterion 4 and XRULE-07 require detecting failure "the instant" it becomes impossible, mid-camp — not retroactively after the last trick. `evaluateObjectives` must be called after EVERY completed trick, and `checkCampOutcome` must short-circuit play the moment any objective returns `"failed"`.
- **Baking boss/gear special-casing into Core functions:** e.g. `if (bossId === "eclipse") { ... }` inside `deckFor`. The spec's whole hook-layering design (§6.1) exists specifically so Core never names a boss or gear id. Phase 9's `deckFor`/`leaderFor`/`trickWinner` must be pure functions of (playerCount / hands / trick), never of boss/gear state.
- **Treating "the holder" of a `win-card`/`ordered` objective as "whoever's hand physically contains that card identity":** per spec §3 and §5.2, the holder is the PLAYER WHO TOOK THE OBJECTIVE during objective-pick, not the player whose hand happens to contain the matching physical card. These are different people in the general case.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|--------------|
| Seeded shuffling / deterministic id minting | A new PRNG or id scheme for Expedition | Reuse `packages/rules/src/shuffle.ts`'s `shuffleWithSeed`/`mintCardId`/`seedToRngState` UNCHANGED, with new stream names (e.g. `"expedition-deck"`, `"expedition-objective-deck"`, `"expedition-card-ids"`) — exactly how `hanabi/deck.ts` derives its own stream names from the same shared module |
| Property-test driving of random legal games | A bespoke random-action generator per test file | One shared `test-support.ts` exporting `enumerateLegalPlays(state, seat)` / `currentActorSeatId(state)`, reused by every property test — mirrors Hanabi's `test-support.ts`, which the codebase's own conservation/termination property tests both import from rather than re-deriving legality |
| Card conservation checking | A new "every card is somewhere" checker | Mirror `conservation.property.test.ts`'s `locateAllCards`-style approach: after every step, assert every minted card id is in exactly one place (a hand, the played-trick pile, or the removed-cards list) |

**Key insight:** The Hanabi engine in this same repo already solved every one of these "don't hand-roll" problems for a structurally similar trick/turn-based card game. The highest-leverage move for Phase 9 is disciplined pattern-matching against `packages/rules/src/hanabi/*`, not fresh design.

## Common Pitfalls

### Pitfall 1: Off-suit legality check that ignores the joker suit
**What goes wrong:** A naive `legalPlays` that only checks "do I hold a card of the led card's `suit` property" will treat Sun/Moon as having no suit and always allow them to be played freely, missing the forced-response rule (XRULE-03).
**Why it happens:** Jokers don't fit the `{suit, rank}` shape cleanly; it's tempting to give them `suit: null` and let the normal follow-suit filter pass them through.
**How to avoid:** Model the led-card check as an explicit branch: `if (ledCard.kind === "joker") { ... }` before falling into the regular-suit filter, as in Pattern 2 above.
**Warning signs:** A property test that specifically constructs a hand containing the non-led joker plus other-suit cards, leads the other joker, and asserts `legalPlays` returns EXACTLY `[thatJoker]` — this is the single highest-value unit test in the whole phase.

### Pitfall 2: Trick winner computed by "highest card wins" without joker precedence
**What goes wrong:** If trick-winner logic sorts all played cards by a single numeric rank and jokers are assigned a rank higher than Ace, a hand-rolled comparator bug can make Moon beat Sun, or make a joker lose to an Ace if its rank value is set incorrectly relative to Ace's.
**Why it happens:** Reusing Hanabi's `Rank` type/comparison helpers (which have no joker concept at all) without a dedicated joker-precedence branch.
**How to avoid:** `trickWinner` should check joker presence FIRST (`if (anyCardIsSun) return sunPlayer; if (anyCardIsMoon) return moonPlayer;`), and only fall through to "highest rank of led suit" when neither joker was played.
**Warning signs:** Property test across all three deck sizes with `fc.constantFrom("sun","moon",...)` injected into a trick alongside high led-suit cards, asserting the joker's player always wins.

### Pitfall 3: `exactly-n` failure detected only after it's already been exceeded
**What goes wrong:** Evaluating `tricksWon > n` catches the "exceeded" case but misses the "can no longer reach n" case (e.g., N=3, 2 tricks remain, holder has only won 0 — mathematically cannot reach 3). Success criterion 4 explicitly calls this out as the harder, more valuable case to prove: "including an exactly-N objective becoming mathematically unreachable before its holder's final relevant trick — proven ... not just the late-detectable case."
**Why it happens:** The "exceeded" check is the obvious/first-written branch; the "unreachable" check requires tracking `tricksRemaining`, which isn't otherwise needed elsewhere in the engine.
**How to avoid:** Implement both branches from the start (see Pattern 5's `evaluateExactlyN`), and write the fast-check property specifically to assert the FIRST TRICK at which failure becomes true is the trick where reachability first breaks — not merely that failure is eventually detected by camp end.
**Warning signs:** A property test that only checks `finalStatus === "failed"` without asserting WHEN (which trick index) it flipped to failed is insufficient for this success criterion.

### Pitfall 4: Ordered-objective sequencing checked only at the end, not incrementally
**What goes wrong:** "Its card is won out of order relative to other ordered objectives" (§5.2) requires comparing WHEN each ordered objective's card was won (trick index), not just the final assignment. A naive implementation that waits until all ordered cards have been won and then sorts might miss that the camp should already have failed several tricks earlier.
**Why it happens:** It's simpler to write "check order once everything is resolved" than "check order incrementally as each one resolves."
**How to avoid:** Track each ordered objective's resolving trick index as it happens; the moment a LATER-marked objective (②) resolves before an EARLIER-marked one (①) has resolved, fail immediately — do not wait for ① to also resolve.
**Warning signs:** A property test where ②'s card is dealt to be played (and won by its holder) before ①'s card is even played — the camp must fail the instant ②'s trick completes, not wait for ①'s eventual trick.

### Pitfall 5: Play-card action silently "auto-completing" a trick or turn
**What goes wrong:** XRULE-08 requires no auto-play — a naive `playCard` that, say, auto-plays a player's only legal card for them (skipping their explicit action) rather than requiring the client to name the card.
**Why it happens:** When `legalPlays(state, seat)` returns exactly one option, it's tempting to "helpfully" apply it automatically.
**How to avoid:** `playCard(state, seat, cardId)` must always require an explicit `cardId` from the caller and validate it against `legalPlays`, exactly like Hanabi's `canPlay`/`findOwnSlot` pattern — even when only one card is legal, the caller must still name it.
**Warning signs:** Any code path that calls the trick-advance logic without first receiving an explicit action from a seat.

## Code Examples

### Deal + leader (mirrors `hanabi/deck.ts`'s `dealInitialHands` exactly)
```typescript
// Source: pattern from packages/rules/src/hanabi/deck.ts (this repo, existing code)
export function dealInitialHands(input: {
  playerCount: 3 | 4 | 5;
  seatIds: readonly string[];
  seed: string;
}): { hands: Hand[]; deck: CardIdentity[]; removedCards: CardIdentity[] } {
  const removedCards = removedCardsFor(input.playerCount);
  const fullDeck = buildFullDeck(); // 54 identities: 52 standard + Sun + Moon
  const playable = fullDeck.filter((c) => !removedCards.some((r) => identitiesEqual(r, c)));
  const shuffled = shuffleWithSeed(playable, input.seed, "expedition-deck");
  // deal round-robin, same pattern as Hanabi
  // ...
  return { hands, deck: [], removedCards };
}
```

### Property-test scaffold (mirrors `termination.property.test.ts` / `conservation.property.test.ts`)
```typescript
// Source: pattern from packages/rules/src/hanabi/termination.property.test.ts
import fc from "fast-check";
fc.assert(
  fc.property(
    fc.constantFrom(3, 4, 5),
    fc.stringMatching(/^[0-9a-f]{32}$/),
    fc.array(fc.nat({ max: 40 }), { minLength: 1, maxLength: 60 }),
    (playerCount, seed, actionIndexes) => {
      // deal, assign objectives deterministically from actionIndexes,
      // then drive tricks via enumerateLegalPlays(state, actorSeatId),
      // asserting: (1) trickWinner is always the Sun/Moon holder when
      // played, else highest of led suit; (2) objective status never
      // "un-fails" once failed; (3) camp outcome is non-null within a
      // hard trick-count bound (deck size / player count).
    },
  ),
  { numRuns: 200 },
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A | N/A | — | This is new game logic, not a migration; there is no "old approach" in this repo to supersede. |

**Deprecated/outdated:** Not applicable.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "The holder" of a `win-card`/`ordered` objective means the player who TOOK the objective card during objective-pick, not whoever's hand contains the matching physical card identity | Architecture Patterns Pattern 5, Anti-Patterns | If wrong, `evaluateWinCard`'s success condition is inverted — a HIGH-severity rules bug that would need every objective-evaluation test rewritten |
| A2 | `no-tricks`/`exactly-n` objectives are assigned to a specific player at objective-pick time the same way `win-card`/`ordered` are (i.e., all four kinds flow through the same face-up-card-taking mechanism), even though the spec never explicitly ties these two kinds to a flipped card identity | Architecture Patterns Pattern 4, Open Question 5 | If trick-count objectives are generated/assigned differently (e.g., auto-assigned rather than picked), the objective-pick sequencing function needs a second code path |
| A3 | An `ordered` objective's card being won in the wrong RELATIVE order (② before ①) fails the camp the instant the earlier-numbered violation is detected, not retroactively | Common Pitfalls 4 | If the intended rule is "check order only once all ordered objectives have resolved," failure would be detected too early, incorrectly ending a camp that should have continued |
| A4 | `exactly-n`'s "done" status is only assignable once the camp has ended (no more tricks), never mid-camp even if the count currently equals N | Architecture Patterns Pattern 5 | If exactly-n should show "done" as soon as count reaches N (and only fail if later exceeded), the visible per-objective status (XRULE-06) would flicker incorrectly between done/failed states |

## Open Questions

1. **What exactly triggers the A♠ leader fallback, mechanically, in Phase 9's scope?**
   - What we know: the spec says "If the Sun is not in play (see Eclipse)" — Eclipse (which removes jokers) is a Phase 10 boss twist, not built in Phase 9.
   - What's unclear: whether Phase 9 needs `leaderFor` to handle "Sun literally absent from any hand" as a real, testable code path now (e.g., via a directly-constructed test fixture with no Sun in any hand) or whether it's acceptable to write the function generically but only exercise the Sun-present path in this phase's own tests.
   - Recommendation: implement and unit-test BOTH branches now (Pattern 3's `leaderFor` already does this) — it costs almost nothing and de-risks Phase 10's Eclipse integration, matching the spec's own "hooks ... adding a new mechanic means adding a hook here" philosophy.

2. **What happens when two different ordered objectives' cards are played within the SAME trick?**
   - What we know: each ordered objective references a distinct card identity; a single trick contains at most one card per seated player, so it's structurally possible for ①'s card and ②'s card to both appear in the same trick if they're held by different players.
   - What's unclear: the spec's ordering rule ("its card is won out of order relative to other ordered objectives") doesn't say whether simultaneous resolution in one trick counts as a tie (both resolve "in order" since neither preceded the other) or as an automatic order violation (since neither strictly preceded the other).
   - Recommendation: flag for the phase's `/gsd:discuss-phase` or plan-check gate before implementation; a conservative default (treat same-trick resolution as satisfying order, since neither STRICTLY follows the other) is defensible but should be an explicit, documented decision, not a silent implementation choice.

3. **Does `exactly-n`'s "holder" ever change mid-camp (e.g., via a future Trail Map swap), and does Phase 9's data model need to anticipate that now?**
   - What we know: Phase 10 introduces Trail Map ("swaps all unresolved objectives between two players") and Compass (rerolls an objective, keeping its order marker).
   - What's unclear: whether Phase 9's `Objective` type should store `ownerSeatId` as a field that can be reassigned later (trivial either way in TypeScript) versus needing any special "tricks won so far, per-holder" bookkeeping that would need to be re-attributed on a holder swap.
   - Recommendation: store per-seat trick-won counts derived from trick history (not a running counter mutated per-objective), so a holder reassignment in Phase 10 naturally recomputes correctly without needing new fields — this is the same "derive, don't mutate a counter" principle Hanabi's `history`-driven `discardOrder`/score computation already uses.

4. **Do `no-tricks`/`exactly-n` objectives get a specific card identity at all, or are they "cardless" objectives layered onto the same face-up-taking mechanism?**
   - What we know: §5.2's table gives them no "card" column (unlike `win-card`/`ordered`); §4.3 just says camp 5 introduces "One trick-count objective (no tricks, or exactly N)" as an extra alongside the camp's other (presumably win-card) objectives.
   - What's unclear: how N is chosen (fixed per camp? random? owner-tuned in the balance table per §4.3's "all numbers live in one balance table in code and are expected to be tuned"?), and whether taking a trick-count objective still involves flipping/taking a face-up card from the objective deck the way `win-card` does.
   - Recommendation: treat N as a balance-table-tunable constant per camp (consistent with §4.3's explicit statement that all such numbers live in one balance table), and treat trick-count objectives as still using the same face-up-card-taking flow for consistency with XRULE-05's "objectives are taken one at a time" — but confirm with the owner before Phase 9 planning locks this in, since it affects the `Objective` union's shape.

5. **What happens if the objective deck runs out before every seated player has taken one, or if there are more objectives than players?**
   - What we know: XRULE-05 says objectives are taken "one at a time... until all are taken," and the camp ramp table (§4.3) shows objective counts (2, 3, 3, 4, 4, 5) that do not necessarily divide evenly by player count (3–5).
   - What's unclear: whether players can hold MORE THAN ONE objective (clockwise picking wraps around until the pool is exhausted), or whether some players simply hold zero objectives some camps.
   - Recommendation: implement clockwise wraparound (players can and do pick more than one objective when the pool exceeds the player count) as the natural reading of "one at a time... until all are taken" — this matches how card drafts of this shape conventionally work — but flag for owner confirmation since it affects `Objective.ownerSeatId` cardinality assumptions elsewhere in the engine.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (repo-pinned, exact) + fast-check 4.9.0 (repo-pinned, exact) |
| Config file | `/home/rflor/games/vitest.config.ts` (root-level, already covers `packages/rules`) |
| Quick run command | `npm test -- packages/rules/src/expedition` (or `npx vitest run packages/rules/src/expedition`) |
| Full suite command | `npm test` (repo root — runs all Vitest projects) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| XRULE-01 | Deck sized 54/52/50 per player count; removed cards public | unit | `npx vitest run packages/rules/src/expedition/deck.test.ts` | ❌ Wave 0 |
| XRULE-02 | Follow-suit legality + trick winner across all deck sizes | property | `npx vitest run packages/rules/src/expedition/trick.property.test.ts` | ❌ Wave 0 |
| XRULE-03 | Led joker forces the other joker's holder | unit + property | `npx vitest run packages/rules/src/expedition/trick.property.test.ts` | ❌ Wave 0 (same file as XRULE-02) |
| XRULE-04 | Sun holder leads/picks first; A♠ fallback | unit | `npx vitest run packages/rules/src/expedition/leader.test.ts` | ❌ Wave 0 |
| XRULE-05 | Objective-pick clockwise sequencing from leader | unit | `npx vitest run packages/rules/src/expedition/objectives.test.ts` | ❌ Wave 0 |
| XRULE-06 | Four objective kinds; status always computable | unit | `npx vitest run packages/rules/src/expedition/objectives.test.ts` | ❌ Wave 0 (same file) |
| XRULE-07 | Instant failure detection, incl. exactly-n unreachability | property | `npx vitest run packages/rules/src/expedition/objectives.property.test.ts` | ❌ Wave 0 |
| XRULE-08 | No undo / no auto-play (playCard requires explicit cardId) | unit | `npx vitest run packages/rules/src/expedition/legality.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run packages/rules/src/expedition` (quick, scoped to the new package subdirectory)
- **Per wave merge:** `npm test` (full repo suite — must stay green; Hanabi's suite must show zero diffs since Expedition is additive-only)
- **Phase gate:** Full suite green before `/gsd:verify-work`, plus `npm run typecheck` (root `tsc -b`, per MGR-07's project-references setup) since `packages/rules` is a composite project consumed by both `apps/web` and `apps/worker` typechecks

### Wave 0 Gaps
- [ ] `packages/rules/src/expedition/deck.test.ts` — covers XRULE-01
- [ ] `packages/rules/src/expedition/trick.property.test.ts` — covers XRULE-02, XRULE-03
- [ ] `packages/rules/src/expedition/leader.test.ts` — covers XRULE-04
- [ ] `packages/rules/src/expedition/objectives.test.ts` — covers XRULE-05, XRULE-06
- [ ] `packages/rules/src/expedition/objectives.property.test.ts` — covers XRULE-07 (including failure-timing precision)
- [ ] `packages/rules/src/expedition/legality.test.ts` — covers XRULE-08
- [ ] `packages/rules/src/expedition/test-support.ts` — shared `enumerateLegalPlays`/`currentActorSeatId` helpers (mirrors `hanabi/test-support.ts`), no dedicated test file needed (it's test infrastructure, exercised transitively)
- [ ] Framework install: none — Vitest/fast-check already present at the repo root

## Security Domain

> `security_enforcement` is absent from `.planning/config.json`; treated as enabled per the instructions, but this phase has no attack surface of its own to assess.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth surface in this phase — pure computation library, no network/adapter code |
| V3 Session Management | No | Same reasoning |
| V4 Access Control | No | Server-authoritative access control (who can act, per-seat filtering) is Phase 11's adapter/view concern; Phase 9 has no caller-facing boundary yet |
| V5 Input Validation | Partial | `playCard`/`pickObjective`-equivalent functions must validate `cardId`/`objectiveId` against the actor's own hand/turn exactly like Hanabi's `findOwnSlot`/`canPlay` pattern — this is legality validation, not network input validation (no `unknown`-typed wire boundary exists until Phase 11's adapter) |
| V6 Cryptography | No | Reuses `shuffle.ts`'s existing seeded PRNG unchanged; no new cryptographic surface |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A client-supplied action asserting a state the server didn't produce (e.g., "I played card X" when X isn't in my hand) | Tampering | `findOwnSlot`-equivalent lookup restricted to the ACTOR's own hand only, mirroring `hanabi/legality.ts`'s `findOwnSlot` — this is the load-bearing pattern that makes Phase 11's later adapter boundary safe, even though Phase 9 has no network boundary of its own yet |
| Card-identity leak through objective/trick state shape (e.g., a "pending" win-card objective's target card visible to everyone before it's played) | Information Disclosure | Not this phase's concern directly (no `toPlayerView` exists yet), but Phase 9's internal state SHOULD keep card identities as plain data reachable by any consumer — deliberately deferring redaction design to Phase 11, per the Architectural Responsibility Map above, rather than inventing a premature partial-redaction scheme now |

## Sources

### Primary (HIGH confidence)
- `docs/superpowers/specs/2026-09-22-expedition-design.md` — the owner-approved design spec (fetched via Read tool, this session) — the authoritative source for every rule cited above
- `packages/rules/src/hanabi/{deck,state,legality,adapter}.ts`, `hanabi-leak-check.ts`, `termination.property.test.ts`, `conservation.property.test.ts` — read directly this session; the concrete patterns Expedition's Core layer should mirror
- `packages/rules/src/shuffle.ts` — read directly this session; the PRNG to reuse unchanged
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` — read directly this session; phase boundary and requirement IDs
- `npm view fast-check version` / `npm view vitest version` — run directly this session (4.10.2 / 5.0.1 latest vs. repo's pinned 4.9.0 / 4.1.11)

### Secondary (MEDIUM confidence)
- None — this research relied entirely on the spec and the existing codebase; no external web research was needed since the domain (a game's own bespoke rules) has no external library or ecosystem question to verify.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, direct reuse of already-verified repo tooling
- Architecture: HIGH — directly mirrors an existing, tested, in-repo pattern (Hanabi engine) for every structural decision
- Objective-kind edge cases (exactly-n reachability timing, ordered-objective simultaneity): LOW-MEDIUM — the spec's rule TEXT is clear about outcomes but silent on several timing/assignment edge cases; flagged explicitly as Open Questions and Assumptions rather than resolved by invention
- Pitfalls: HIGH — derived directly from the spec's own success-criteria wording (which explicitly calls out the "late-detectable case" as the trap to avoid) and from structurally analogous bugs already fixed in the Hanabi engine's history (per STATE.md's decision log, e.g. RULES-15/16 final-round edge cases)

**Research date:** 2026-09-23
**Valid until:** No external dependency drift risk (zero new packages); the ambiguities in Open Questions 2–5 remain valid until the owner rules on them, independent of any date

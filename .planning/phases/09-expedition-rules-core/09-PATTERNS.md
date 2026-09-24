# Phase 9: Expedition Rules Core - Pattern Map

**Mapped:** 2026-09-23
**Files analyzed:** 11 (6 source + 5 test files planned for `packages/rules/src/expedition/`, per RESEARCH.md's "Recommended Project Structure" and Wave 0 Gaps)
**Analogs found:** 11 / 11 (all files have a strong, same-package analog — Expedition Core is an explicit structural mirror of Hanabi's Core layer)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `packages/rules/src/expedition/deck.ts` | model/utility (deck construction) | transform (pure, seeded) | `packages/rules/src/hanabi/deck.ts` | exact |
| `packages/rules/src/expedition/state.ts` | model (type vocabulary) | transform | `packages/rules/src/hanabi/state.ts` | exact |
| `packages/rules/src/expedition/leader.ts` | service (pure hook function) | transform | `packages/rules/src/hanabi/deck.ts` (no direct 1:1 file; closest is the leader-adjacent turn-order logic embedded in `deck.ts`/`legality.ts`'s `activeSeatId`) | role-match |
| `packages/rules/src/expedition/legality.ts` | service (legality predicates) | request-response (pure `Legality` returns) | `packages/rules/src/hanabi/legality.ts` | exact |
| `packages/rules/src/expedition/trick.ts` | service (trick resolution) | transform | `packages/rules/src/hanabi/legality.ts` (`cardsTouchedByClue` touch-resolution pattern) + `packages/rules/src/hanabi/endgame.ts` (fixed-order independent-check pattern) | role-match |
| `packages/rules/src/expedition/objectives.ts` | service (status evaluators + pick sequencing) | transform / CRUD (assign ownership) | `packages/rules/src/hanabi/endgame.ts` (status/end-condition evaluation) + `packages/rules/src/hanabi/history.ts` (derive-don't-mutate pattern) | role-match |
| `packages/rules/src/expedition/camp.ts` | service (outcome state machine) | transform | `packages/rules/src/hanabi/endgame.ts` | exact |
| `packages/rules/src/expedition/test-support.ts` | test utility | transform (enumeration) | `packages/rules/src/hanabi/test-support.ts` | exact |
| `packages/rules/src/expedition/deck.test.ts` | test | — | `packages/rules/src/hanabi/deck.test.ts` | exact |
| `packages/rules/src/expedition/trick.property.test.ts` | test (property) | — | `packages/rules/src/hanabi/conservation.property.test.ts` + `termination.property.test.ts` | exact |
| `packages/rules/src/expedition/objectives.property.test.ts` | test (property) | — | `packages/rules/src/hanabi/termination.property.test.ts` | exact |

No new files touch `apps/web` or `apps/worker` in this phase — Phase 9 is `packages/rules` only (adapter/worker wiring is explicitly Phase 11 per RESEARCH.md). No index/export barrel changes were found needed: `packages/rules/src/hanabi/` has no barrel `index.ts` of its own (each consumer imports specific files directly), so Expedition should follow the same no-barrel convention unless a later phase's adapter wiring requires one.

## Pattern Assignments

### `packages/rules/src/expedition/deck.ts` (model/utility, transform)

**Analog:** `packages/rules/src/hanabi/deck.ts` (101 lines, read in full)

**Imports pattern** (lines 25-27):
```typescript
import { mintCardId, seedToRngState, shuffleWithSeed } from "../shuffle";
import { RANKS, handSizeFor, type Rank, type Suit, type VariantConfig } from "./variant";
import type { Hand, HandSlot, HanabiCard } from "./state";
```
Expedition has no `variant.ts` equivalent (playerCount is the only axis, per RESEARCH.md Pattern 1) — replace the `VariantConfig` import with a plain `playerCount: 3 | 4 | 5` parameter and import `Card`/`Hand` types from the new `expedition/state.ts` instead.

**Core deck-build pattern** (lines 34-46, `buildDeck`):
```typescript
export function buildDeck(config: VariantConfig): UnmintedCard[] {
  const cards: UnmintedCard[] = [];
  for (const suit of config.suits) {
    const counts = config.rankCountsFor(suit);
    for (const rank of RANKS) {
      const count = counts[rank];
      for (let i = 0; i < count; i++) {
        cards.push({ suit, rank });
      }
    }
  }
  return cards;
}
```
Expedition's `buildFullDeck()` (54 identities: 52 standard + Sun + Moon) is unconditional (no config loop needed — the full deck is fixed); `removedCardsFor(playerCount)` filters it, per RESEARCH.md Pattern 1's `removedCardsFor` example. Model this as: `buildFullDeck()` (constant), then `buildDeck(playerCount) = buildFullDeck().filter(c => !removedCardsFor(playerCount).some(r => identitiesEqual(r, c)))`.

**Seeded shuffle + id-minting + round-robin deal pattern** (lines 63-101, `dealInitialHands`, copy near-verbatim):
```typescript
export function dealInitialHands(input: {
  config: VariantConfig;
  seatIds: readonly string[];
  seed: string;
}): { hands: Hand[]; deck: HanabiCard[] } {
  const { config, seatIds, seed } = input;

  const unminted = shuffleWithSeed(buildDeck(config), seed, "hanabi-deck");

  let idRng = seedToRngState(seed, "hanabi-card-ids");
  const takenIds = new Set<string>();
  const idCards: HanabiCard[] = [];
  for (const card of unminted) {
    const minted = mintCardId(idRng, takenIds);
    idRng = minted.rng;
    takenIds.add(minted.id);
    idCards.push({ id: minted.id, suit: card.suit, rank: card.rank });
  }

  const handSize = handSizeFor(seatIds.length);
  const perSeatSlots: HandSlot[][] = seatIds.map(() => []);
  let cardIndex = 0;
  for (let round = 0; round < handSize; round++) {
    for (let seatIndex = 0; seatIndex < seatIds.length; seatIndex++) {
      const card = idCards[cardIndex]!;
      cardIndex++;
      perSeatSlots[seatIndex]!.push({ card, facts: initialFacts(config) });
    }
  }

  const hands: Hand[] = seatIds.map((seatId, i) => ({
    seatId,
    slots: perSeatSlots[i]!,
  }));

  const deck = idCards.slice(cardIndex);

  return { hands, deck };
}
```
Use **new, distinct stream names** per RESEARCH.md's "Don't Hand-Roll" table: `"expedition-deck"` and `"expedition-card-ids"` (not `"hanabi-deck"`/`"hanabi-card-ids"` — different stream names on the same seed are how `shuffle.ts` guarantees independent, uncorrelated generators; reusing Hanabi's literal stream names would NOT be a collision bug per se, since seeds differ per room, but it breaks the "each game names its own streams" convention every call site in this repo follows). Expedition has no `ClueFacts` concept, so drop the `initialFacts`/`facts` field entirely — a `HandSlot` here is just `{ card: CardIdentity }` or hands can be plain `CardIdentity[]` arrays (simpler than Hanabi's per-slot fact tracking, since there is no clue system). RESEARCH.md's own worked example (`dealInitialHands`, "Code Examples" section) confirms this exact adaptation with `expedition-deck` as the stream name and a second `dealObjectiveDeck` following the identical shuffle pattern with a THIRD distinct stream name (e.g. `"expedition-objective-deck"`).

**Header-comment convention to preserve:** Hanabi's `deck.ts` opens with a substantial doc comment explaining WHY it reuses `shuffle.ts` unchanged and why no PRNG state is carried in `HanabiState`. Expedition's `deck.ts` should carry an equivalent short header noting the same "PRNG state is never carried in state; every id is minted up front" discipline, since RESEARCH.md's Common Pitfalls do not call this out but the underlying repo-wide security rationale (SEC domain, "no new cryptographic surface") depends on it.

---

### `packages/rules/src/expedition/state.ts` (model, transform)

**Analog:** `packages/rules/src/hanabi/state.ts` (153 lines, read in full)

**Type-vocabulary pattern** (lines 1-12, header + base card type):
```typescript
// Shared type vocabulary for the Hanabi engine (Plans 02-05 compile against
// these names — do not rename without updating those plans). Mirrors
// forehead-card.ts's type-block pattern: state types are readonly everywhere
// (immutability is structural, not just convention); view types are
// deliberately non-readonly plain Array/object literals so HanabiView stays
// assignable to Phase 4's z.infer type (same split forehead-card.ts uses,
// see forehead-card.ts:69-70).

export type HanabiCard = { readonly id: string; readonly suit: Suit; readonly rank: Rank };
```
Expedition should follow the identical **readonly-everywhere for state types** discipline (Phase 9 builds Core only — no view types yet, since `toPlayerView` is Phase 11; RESEARCH.md's Architectural Responsibility Map explicitly defers "Per-seat view redaction" to Phase 11). Do NOT build `ExpeditionView`/`*View` types in this phase — only the state types listed in RESEARCH.md's discretion note: `Objective { id, kind, cardId, order marker, N value, ownerSeatId }`, `Trick`, `CampState`, `Hand`.

**State-shape pattern** (lines 39-60, the top-level state object):
```typescript
export type HanabiState = {
  readonly variant: Variant;
  readonly seatIds: readonly string[];
  readonly turnIndex: number;
  readonly hands: readonly Hand[];
  readonly deck: readonly HanabiCard[];
  readonly stacks: readonly StackEntry[];
  readonly discard: readonly HanabiCard[];
  readonly discardOrder: readonly string[];
  readonly clueTokens: number;
  readonly fuses: number;
  readonly finalTurnsRemaining: number | null;
  readonly history: readonly HistoryEntry[];
};
```
Mirror this shape for `CampState`: `seatIds`, `hands` (or per-seat remaining cards), `playedTricks: readonly Trick[]` (Hanabi's analog to `discard`/`history` — RESEARCH.md's Assumption A3/Open Question 3 recommends deriving per-seat trick-won counts from trick history rather than a mutated counter, exactly matching this file's own `discardOrder`/history-driven-score comment at lines 27-33 and 47-55), `objectives: readonly Objective[]`, `leaderSeatId`, `currentTrick` (in-progress, not yet resolved). Do NOT add a `campOutcome` field mutated in place — compute it via `camp.ts`'s `checkCampOutcome(state)` the same way `HanabiState` never stores its own end-result and `checkHanabiGameEnd(state)` derives it fresh each call (see `endgame.ts` below).

**Action-union pattern** (lines 78-83):
```typescript
export type HanabiAction =
  | { readonly type: "play"; readonly cardId: string }
  | { readonly type: "discard"; readonly cardId: string }
  | { readonly type: "clue"; readonly targetSeatId: string; readonly clue: Clue }
  | { readonly type: "reorder"; readonly cardIds: readonly string[] }
  | { readonly type: "reorderDiscard"; readonly cardIds: readonly string[] };
```
Phase 9 needs only the play-card action shape (`{ type: "play-card"; cardId: string }`, per XRULE-08) — the full `ExpeditionAction` union (`pick-draft`, `set-loadout`, `use-gear`, etc., per spec §6.6) is Phase 10/11's adapter concern. Do not build the full union now; a minimal `{ type: "play-card"; cardId: string }` (and possibly `{ type: "pick-objective"; cardId: string }` for the objective-pick sequencing this phase DOES own) is sufficient.

---

### `packages/rules/src/expedition/legality.ts` (service, request-response)

**Analog:** `packages/rules/src/hanabi/legality.ts` (195 lines, read in full)

**`Legality` result type + guard-order pattern** (lines 22-39):
```typescript
export type Legality = { legal: true } | { legal: false; reason: AdapterError };

function isGameOver(state: HanabiState): boolean {
  return state.fuses >= MAX_FUSES || state.finalTurnsRemaining === 0;
}

export function activeSeatId(state: HanabiState): string {
  return state.seatIds[state.turnIndex] as string;
}

export function isActorsTurn(state: HanabiState, actorSeatId: string): boolean {
  return activeSeatId(state) === actorSeatId;
}
```
Copy this `Legality` type verbatim (structurally). Guard order convention: **turn check, then game-over check, then action-specific checks** — this exact order is called out in the file's own header comment as load-bearing for a conformance test suite ordering, so Expedition's `canPlayCard` should follow: turn check → camp-outcome-already-decided check → card-in-own-hand check → follow-suit legality check.

**Own-hand-only lookup pattern (XRULE-08's anti-cheat backbone)** (lines 44-53, `findOwnSlot`):
```typescript
export function findOwnSlot(
  state: HanabiState,
  seatId: string,
  cardId: string,
): HandSlot | null {
  const hand = state.hands.find((h) => h.seatId === seatId);
  if (hand === undefined) return null;
  const slot = hand.slots.find((s) => s.card.id === cardId);
  return slot ?? null;
}
```
This is the exact pattern RESEARCH.md's Security Domain section calls out as "the load-bearing pattern that makes Phase 11's later adapter boundary safe" — `canPlayCard` MUST resolve `cardId` through this same own-hand-only lookup, never a global card-id search across all hands.

**Full predicate composition pattern** (lines 74-81, `canPlay`, copy as the direct template for `canPlayCard`):
```typescript
export function canPlay(state: HanabiState, actorSeatId: string, cardId: string): Legality {
  if (!isActorsTurn(state, actorSeatId)) return { legal: false, reason: "not_your_turn" };
  if (isGameOver(state)) return { legal: false, reason: "game_over" };
  if (findOwnSlot(state, actorSeatId, cardId) === null) {
    return { legal: false, reason: "card_not_in_hand" };
  }
  return { legal: true };
}
```
`canPlayCard(state, actorSeatId, cardId)` should add one more branch after the `card_not_in_hand` check: `if (!legalPlaysFor(hand, ledCard).some(c => identitiesEqual(c, card))) return { legal: false, reason: "must_follow_suit" }` (or an Expedition-specific `AdapterError` literal — this phase has no `../adapter.ts` yet since the adapter is Phase 11; define a local, phase-scoped error-reason union in `legality.ts` itself, e.g. `type ExpeditionLegalityReason = "not_your_turn" | "camp_already_decided" | "card_not_in_hand" | "must_follow_suit"`, and widen/merge it into the real `AdapterError` only when Phase 11 builds the adapter).

**Shared touch-resolver discipline** (lines 12-16, header comment — apply the PRINCIPLE, not the code): Hanabi's `cardsTouchedByClue` is "the single shared touch resolver used by BOTH clue types... there is deliberately no per-clue-type pair of legality functions, because that split is exactly the asymmetry that lets a bug slip through for one type and not the other." Expedition's `legalPlaysFor` (RESEARCH.md Pattern 2) must be this same kind of single shared resolver, called by BOTH `canPlayCard` (legality.ts) and any future UI dimming logic — never re-derived in two places.

---

### `packages/rules/src/expedition/trick.ts` (service, transform)

**Analog:** RESEARCH.md's own Pattern 2 (legal-plays / joker-suit) and Pattern 3 (`leaderFor`) are the primary source (the spec authors already wrote near-final code); `packages/rules/src/hanabi/endgame.ts`'s fixed-independent-check-order discipline (lines 1-11) is the secondary analog for `trickWinner`'s joker-precedence-first structure.

**Joker-suit follow-suit pattern** (RESEARCH.md Architecture Patterns Pattern 2, lines 196-208 of RESEARCH.md — copy near-verbatim into `trick.ts` or `legality.ts`):
```typescript
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
**Pitfall to avoid (RESEARCH.md Pitfall 1):** do not give jokers `suit: null` and let them fall through the standard suit filter — this silently defeats the forced-response rule (XRULE-03). Branch on `ledCard.kind === "joker"` FIRST, exactly as above.

**Trick-winner joker-precedence-first pattern** (RESEARCH.md Pitfall 2, mirroring `endgame.ts`'s "check fixed conditions in a fixed order, never an else-if chain keyed off partial state" discipline from `endgame.ts` lines 1-11):
```typescript
// Pattern: check joker presence FIRST, fall through to highest-rank-of-led-suit
// only when neither joker was played (RESEARCH.md Pitfall 2).
function trickWinner(trick: PlayedCard[]): string {
  const sunPlay = trick.find((p) => p.card.kind === "joker" && p.card.joker === "sun");
  if (sunPlay) return sunPlay.seatId;
  const moonPlay = trick.find((p) => p.card.kind === "joker" && p.card.joker === "moon");
  if (moonPlay) return moonPlay.seatId;
  const ledSuit = (trick[0]!.card as { kind: "standard"; suit: Suit }).suit;
  const followers = trick.filter((p) => p.card.kind === "standard" && p.card.suit === ledSuit);
  return followers.reduce((best, p) => (rankValue(p.card.rank) > rankValue(best.card.rank) ? p : best)).seatId;
}
```

**`leaderFor` hook-seam pattern** (RESEARCH.md Pattern 3, lines 216-226 of RESEARCH.md — copy near-verbatim):
```typescript
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
Write this generically NOW (both branches unit-tested in this phase, per RESEARCH.md Open Question 1's recommendation) even though Eclipse (the only thing that removes the Sun) is Phase 10 — this is the hook-seam discipline the whole engine architecture depends on (RESEARCH.md Anti-Patterns: "Core never names a boss or gear id").

---

### `packages/rules/src/expedition/objectives.ts` (service, transform/CRUD)

**Analog:** `packages/rules/src/hanabi/endgame.ts` (71 lines, read in full) for the status-evaluation shape; `packages/rules/src/hanabi/history.ts` for the derive-don't-mutate principle (referenced, not read in full — RESEARCH.md Open Question 3 cites it directly).

**Status-evaluation-as-pure-function pattern** (mirrors `endgame.ts` lines 46-71, `checkHanabiGameEnd`):
```typescript
export function checkHanabiGameEnd(state: HanabiState): GameEndResult | null {
  const config = variantConfig(state.variant);
  const maxScore = maxScoreFor(config);
  const score = currentScore(state);
  const band = scoreBand(score, maxScore);

  if (state.fuses >= MAX_FUSES) {
    const reason: EndReason = "fuses_exhausted";
    return { score, reason, band };
  }
  if (score === maxScore) {
    const reason: EndReason = "all_stacks_complete";
    return { score, reason, band };
  }
  if (state.finalTurnsRemaining === 0) {
    const reason: EndReason = "final_round_elapsed";
    return { score, reason, band };
  }
  return null;
}
```
Each `ObjectiveKindDef.evaluate(camp, objective) → "pending" | "done" | "failed"` should be this same shape: a pure function recomputing status FRESH from `camp` state every call, never reading/writing a stored `status` field on the objective itself (mirrors `endgame.ts`'s "never chain conditions off partial prior state" discipline). RESEARCH.md's own Pattern 5 (lines 236-259) is the direct, spec-derived implementation — copy its four `evaluate*` functions verbatim as the starting point:
```typescript
function evaluateWinCard(camp: CampState, objective: WinCardObjective): ObjectiveStatus {
  const trick = findTrickContaining(camp, objective.cardId);
  if (trick === undefined) return "pending";
  return trick.winnerSeatId === objective.ownerSeatId ? "done" : "failed";
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
**Critical pitfall (RESEARCH.md Pitfall 3):** `evaluateExactlyN` MUST implement both the "exceeded" branch AND the "unreachable" branch from the start — a property test must assert WHICH TRICK INDEX failure first becomes true, not merely that it's eventually detected by camp end (this is explicitly the highest-value test in the objectives file).

**Derive-don't-mutate pattern for per-seat trick counts** (RESEARCH.md Open Question 3, citing this repo's own precedent): compute `countTricksWon(camp, seatId) = camp.playedTricks.filter(t => t.winnerSeatId === seatId).length` fresh from trick history every call — never a running counter field mutated per-trick. This is the same principle `history.ts`'s `discardOrder`/score computation already uses in Hanabi (state.ts lines 27-33's comment on `StackEntry.playedRanks` being derived, not a raw counter).

**Objective-pick sequencing (turn-order function, no direct Hanabi analog — build from spec text, RESEARCH.md Pattern 4):** `nextObjectivePicker(seatIds, leaderSeatId, alreadyPickedCount)` — clockwise starting at leader, with wraparound once the pool exceeds player count (RESEARCH.md's recommended reading of Open Question 5). Keep this as a small, pure, stateless function taking explicit arguments (no hidden state), matching every other Core function's signature style in both `deck.ts` and `legality.ts`.

**Ordered-objective incremental-check pattern (RESEARCH.md Pitfall 4):** track each `ordered` objective's RESOLVING TRICK INDEX as it happens (store it on the objective or derive it via `findTrickContaining` + trick index lookup), and fail the camp the instant a later-marked objective (②) resolves before an earlier-marked one (①) — do not wait for ① to also resolve. This has no Hanabi analog (Hanabi has no ordering constraint across game elements); build directly from the spec's §5.2 text and RESEARCH.md's Assumption A3.

---

### `packages/rules/src/expedition/camp.ts` (service, transform)

**Analog:** `packages/rules/src/hanabi/endgame.ts` (71 lines, full file is the template — see excerpt above under objectives.ts)

**Header-comment convention to preserve** (`endgame.ts` lines 1-11): document explicitly that `checkCampOutcome` checks ALL failure conditions (every objective's status) INDEPENDENTLY on every call, in a fixed order, and that a "succeeded" result requires EVERY objective to read `"done"` while a "failed" result requires ANY objective to read `"failed"` — never an else-if chain gated on partial state. This directly implements XRULE-07's "fails the moment any objective becomes impossible... play stops at that moment" and RESEARCH.md's Anti-Pattern warning ("Recomputing objective status only at camp end").

```typescript
export function checkCampOutcome(camp: CampState): "in_progress" | "succeeded" | "failed" {
  const statuses = camp.objectives.map((o) => evaluateObjective(camp, o));
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.every((s) => s === "done")) return "succeeded";
  return "in_progress";
}
```
Call this after EVERY completed trick (not just at deck exhaustion), per RESEARCH.md's Anti-Patterns section — this mirrors `checkHanabiGameEnd`'s own "called fresh, every time state changes" discipline (it's called once per property-test step in `conservation.property.test.ts`, never cached).

---

### `packages/rules/src/expedition/test-support.ts` (test utility, transform/enumeration)

**Analog:** `packages/rules/src/hanabi/test-support.ts` (140 lines, read in full)

**"Never re-derive rules locally" discipline (T-03-24 — the single most important pattern in this file)** (lines 1-12, header comment, copy the PRINCIPLE verbatim into Expedition's file header):
```typescript
// CONSTRAINT (T-03-24): enumerateLegalActions builds CANDIDATE actions and
// filters them through legality.ts's exported canPlay/canDiscard/canClue
// predicates ONLY. It never re-derives Hanabi's rules locally. A private
// re-implementation of legality here would make every property test that
// drives games through this helper self-confirming — it would prove the
// test's own copy of the rules is internally consistent, not that the real
// engine is correct.
```
`enumerateLegalPlays(state, seat)` MUST filter candidates through `legality.ts`'s exported `canPlayCard` ONLY — never re-implement follow-suit logic inside `test-support.ts`.

**Enumeration pattern** (lines 31-67, `enumerateLegalActions` — adapt the play-only subset):
```typescript
export function enumerateLegalActions(state: HanabiState): HanabiAction[] {
  const actorSeatId = activeSeatId(state);
  const actions: HanabiAction[] = [];
  const ownHand = state.hands.find((h) => h.seatId === actorSeatId);
  if (ownHand !== undefined) {
    for (const slot of ownHand.slots) {
      if (canPlay(state, actorSeatId, slot.card.id).legal) {
        actions.push({ type: "play", cardId: slot.card.id });
      }
      // ... other action types
    }
  }
  return actions;
}
```
Expedition's `enumerateLegalPlays(state, seat)` should follow this exact shape: iterate the seat's own hand, filter each candidate `cardId` through `canPlayCard`, return the surviving list.

**Card-location/conservation pattern** (lines 110-140, `locateAllCards` — the direct template for Expedition's card-conservation property tests):
```typescript
export function locateAllCards(state: HanabiState): Map<string, string> {
  const locations = new Map<string, string>();
  const record = (id: string, location: string): void => {
    const existing = locations.get(id);
    locations.set(id, existing === undefined ? location : `${existing}+${location}`);
  };
  for (const card of state.deck) record(card.id, "deck");
  for (const hand of state.hands) {
    for (const slot of hand.slots) record(slot.card.id, "hand");
  }
  for (const card of state.discard) record(card.id, "discard");
  // ...
  return locations;
}
```
Expedition's `locateAllCards(camp)` should record every card as exactly one of: `"hand"` (still in a seat's hand), `"trick"` (played into a completed or in-progress trick), or `"removed"` (per-player-count removed cards, or the objective deck's cards if tracked separately). The `"+"-joined collision marker` convention (a card recorded in two places signals a conservation bug without throwing mid-walk) should be copied verbatim — RESEARCH.md's "Don't Hand-Roll" table explicitly calls this out as the pattern to mirror for card conservation checking.

---

### Test files (`deck.test.ts`, `trick.property.test.ts`, `objectives.property.test.ts`)

**Analog:** `packages/rules/src/hanabi/conservation.property.test.ts` and `termination.property.test.ts` (excerpts read, ~80 lines each)

**fast-check scaffold convention** (conservation.property.test.ts lines 1-11, 47-65):
```typescript
fc.assert(
  fc.property(
    fc.constantFrom(...VARIANTS),
    fc.integer({ min: 2, max: 5 }),
    fc.stringMatching(/^[0-9a-f]{32}$/),
    fc.array(fc.nat({ max: 40 }), { minLength: 1, maxLength: 60 }),
    (variant, seatCount, seed, actionIndexes) => {
      const seatIds = Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
      let state = hanabiGame.createInitialState({ seatIds, config: variant, seed });
      // assert invariant after initial state AND after every step
    },
  ),
  { numRuns: 200 },
);
```
Use `fc.constantFrom(3, 4, 5)` in place of `fc.constantFrom(...VARIANTS)` (Expedition's axis is player count, not variant), the identical `fc.stringMatching(/^[0-9a-f]{32}$/)` seed generator (the installed fast-check 4.9.0 has no dedicated hex-string generator — this workaround is a fixed repo convention), and `numRuns: 200` as the standard sample size. RESEARCH.md's own "Code Examples" section provides a fully worked Expedition-specific scaffold using this exact convention — use it directly as the file skeleton for `trick.property.test.ts` and `objectives.property.test.ts`.

**Hard turn-bound termination-safety convention** (termination.property.test.ts lines 27-32):
```typescript
// A real game cannot exceed roughly (deck size + hand size) turns before the
// final round forces an end... The cap exists to fail the property loudly
// rather than hang CI if a bug makes the engine never satisfy checkHanabiGameEnd.
const MAX_SIMULATED_TURNS = 500;
```
`objectives.property.test.ts` (and any full-camp simulation test) should set an analogous `MAX_SIMULATED_TRICKS` bound (deck size / player count is a hard ceiling on trick count) and break the loop with a failing assertion rather than looping unbounded if `checkCampOutcome` never leaves `"in_progress"`.

---

## Shared Patterns

### Seeded PRNG reuse (deck shuffling, objective-deck shuffling)
**Source:** `packages/rules/src/shuffle.ts` (119 lines, read in full) — `shuffleWithSeed`, `seedToRngState`, `mintCardId`, `nextRandom`
**Apply to:** `deck.ts` (play-deck shuffle + objective-deck shuffle + card-id minting), and any future draft-offer/boss-selection randomness (explicitly out of scope for Phase 9, per RESEARCH.md's Deferred Ideas, but the SAME module is what Phase 10 will reuse — do not fork or reimplement any part of `shuffle.ts`).
```typescript
export function shuffleWithSeed<T>(items: readonly T[], seed: string, stream: string): T[] {
  const result = items.slice();
  let state = seedToRngState(seed, stream);
  for (let i = result.length - 1; i > 0; i--) {
    const { value, state: nextState } = nextRandom(state);
    state = nextState;
    const j = Math.floor((value / 4294967296) * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}
```
**Rule:** import `shuffle.ts` UNCHANGED (zero modifications) and use brand-new, Expedition-specific stream-name string literals (`"expedition-deck"`, `"expedition-objective-deck"`, `"expedition-card-ids"`) — never reuse Hanabi's stream-name literals, and never carry PRNG state inside `CampState`/`ExpeditionState` itself (every id/shuffle is minted up front, exactly matching `hanabi/deck.ts`'s header-comment rationale for why `HanabiState` carries zero PRNG state — "there is nothing a projection bug could leak, because there is nothing to leak").

### Own-hand-only card resolution (anti-cheat backbone)
**Source:** `packages/rules/src/hanabi/legality.ts` lines 44-53, `findOwnSlot`
**Apply to:** `legality.ts`'s `canPlayCard`/`findOwnSlot`-equivalent, and — per RESEARCH.md's Security Domain "Known Threat Patterns" table — this is explicitly named as "the load-bearing pattern that makes Phase 11's later adapter boundary safe, even though Phase 9 has no network boundary of its own yet." Every card-identifying action (`play-card`, `pick-objective`) must resolve its `cardId` argument through a lookup scoped to the ACTOR'S OWN hand/available-set only, never a global search.

### "Never re-derive rules in test helpers" (T-03-24)
**Source:** `packages/rules/src/hanabi/test-support.ts` lines 1-12
**Apply to:** `expedition/test-support.ts`'s `enumerateLegalPlays` — must filter through `legality.ts`'s exported predicates only, never maintain a parallel copy of follow-suit logic. This is the discipline that makes every property test in `trick.property.test.ts`/`objectives.property.test.ts` an actual test of the engine, not a test of the test helper's own (possibly buggy) rules copy.

### Fixed-order, independent status checks (never an else-if chain over partial state)
**Source:** `packages/rules/src/hanabi/endgame.ts` lines 1-11 (header comment) + lines 49-71 (`checkHanabiGameEnd`)
**Apply to:** `camp.ts`'s `checkCampOutcome` and `objectives.ts`'s per-kind `evaluate` functions — every status/outcome function must be a pure, statelessly-recomputed function of current state, called fresh every time (after every trick), never a cached/mutated field checked with `if/else if` gates keyed off which check ran last.

### Derive-don't-mutate for per-seat aggregate counts
**Source:** `packages/rules/src/hanabi/state.ts` lines 27-33 (comment on `StackEntry.playedRanks`) and `packages/rules/src/hanabi/history.ts` (cited in RESEARCH.md Open Question 3, not read in full this session — file is 55 lines)
**Apply to:** `objectives.ts`'s `countTricksWon(camp, seatId)` — always derive from `camp.playedTricks` history, never maintain a running per-seat counter field that a future Phase 10 holder-reassignment (Trail Map) would need to re-attribute manually.

## No Analog Found

None. Every planned file in `packages/rules/src/expedition/` has at least a role-match analog in `packages/rules/src/hanabi/` or a directly-spec-derived worked example in `09-RESEARCH.md` itself (the research already contains near-final code for the genuinely novel mechanics — the Sun/Moon joker suit, `leaderFor`, and the four objective evaluators — since these have no Hanabi equivalent to copy from).

## Metadata

**Analog search scope:** `packages/rules/src/hanabi/*.ts` (26 files, ~5,670 total lines) and `packages/rules/src/shuffle.ts` (119 lines) — the two directories named explicitly in this task's scope. No search was needed outside `packages/rules` since Phase 9 is scoped entirely to that package (RESEARCH.md's Architectural Responsibility Map confirms zero `apps/web`/`apps/worker` touch points this phase).
**Files scanned in full:** `deck.ts`, `state.ts`, `legality.ts`, `test-support.ts`, `shuffle.ts`, `endgame.ts` (6 files, full read)
**Files scanned by targeted excerpt:** `conservation.property.test.ts` (lines 1-80 of 217), `termination.property.test.ts` (lines 1-80 of 188), `actions.ts` (lines 1-60 and 235-275, 532-550 of 550)
**Files listed but not read (directory `ls`/`wc` only, sufficient context already gathered):** `actions.test.ts`, `adapter.ts`, `clue-facts.ts`/`.test.ts`, `discard-order.property.test.ts`, `hanabi-leak-check.ts`/`.test.ts`, `history.ts`/`.test.ts`, `nameable-colour.property.test.ts`, `projection.ts`/`.test.ts`, `redaction.property.test.ts`, `variant-matrix.test.ts`, `variant.test.ts`, `variant.ts`, `legality.test.ts`, `deck.test.ts`, `endgame.test.ts` — not needed for Phase 9's Core-layer scope (adapter, leak-check, redaction, and clue-fact patterns belong to Hanabi's clue system or Phase 11's adapter work, neither of which Phase 9 builds)
**Pattern extraction date:** 2026-09-23

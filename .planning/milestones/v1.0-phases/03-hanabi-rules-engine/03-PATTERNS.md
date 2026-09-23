# Phase 3: Hanabi Rules Engine - Pattern Map

**Mapped:** 2026-09-15
**Files analyzed:** 20 (10 new source modules + 10 co-located test files) under `packages/rules/src/hanabi/`, plus 2 modified files (`index.ts`, no change to `adapter.ts`)
**Analogs found:** 20 / 20 — this phase has no "no analog" files. Every planned Hanabi module maps to an existing, already-reviewed Phase 1/2 file in the same package.

This phase is unusual for pattern-mapping: there is no cross-directory hunting required. RESEARCH.md's own "Recommended Project Structure" is the file list, and CONTEXT.md/RESEARCH.md both explicitly name the analogs (`forehead-card.ts`, `shuffle.ts`, `forehead-card-leak-check.ts`, `adapter.test.ts`, `forehead-card.property.test.ts`). This document turns those citations into concrete, line-anchored excerpts.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/rules/src/hanabi/variant.ts` | config | transform | `packages/rules/src/forehead-card.ts` (`FOREHEAD_CARD_VALUES` const + type) | role-match |
| `packages/rules/src/hanabi/deck.ts` | utility | transform | `packages/rules/src/shuffle.ts` (`shuffleWithSeed`, `mintCardId`) + `forehead-card.ts`'s `createInitialState` deck-building block | exact |
| `packages/rules/src/hanabi/state.ts` | model | transform | `forehead-card.ts`'s type block (`ForeheadCardState`, `ForeheadCardAction`, `ForeheadCardView`) | exact |
| `packages/rules/src/hanabi/legality.ts` | service | request-response | `forehead-card.ts`'s inline legality checks inside `applyAction` (turn/deck guards) | role-match (toy inlines legality; Hanabi extracts it into pure predicates per D-13) |
| `packages/rules/src/hanabi/actions.ts` | service | CRUD (state transition) | `forehead-card.ts`'s `applyAction` + `isGuessRequest` | exact |
| `packages/rules/src/hanabi/endgame.ts` | service | transform | `forehead-card.ts`'s `checkGameEnd` | role-match (toy has one end condition; Hanabi has three, same shape) |
| `packages/rules/src/hanabi/projection.ts` | service | transform (redaction) | `forehead-card.ts`'s `toPlayerView` | exact |
| `packages/rules/src/hanabi/history.ts` | model | event-driven (append-only log) | `forehead-card.ts`'s `revealed` array + `RevealedCard` shape/append pattern | role-match |
| `packages/rules/src/hanabi/adapter.ts` | service (adapter composition) | request-response | `forehead-card.ts` (whole file, as the `GameAdapter` implementation) | exact |
| `packages/rules/src/hanabi/hanabi-leak-check.ts` | utility | transform | `packages/rules/src/forehead-card-leak-check.ts` | exact (explicitly named for generalization, D-21) |
| `packages/rules/src/hanabi/variant.test.ts` | test | — | `forehead-card.test.ts` (unit style) — not read in full; excerpt style inferred from `forehead-card.ts` doc comments and `adapter.test.ts` | role-match |
| `packages/rules/src/hanabi/deck.test.ts` | test | — | `shuffle.test.ts` (not read; same directory convention) | role-match |
| `packages/rules/src/hanabi/legality.test.ts` | test | — | `forehead-card.test.ts` | role-match |
| `packages/rules/src/hanabi/actions.test.ts` | test | — | `forehead-card.test.ts` | role-match |
| `packages/rules/src/hanabi/endgame.test.ts` | test | — | `forehead-card.test.ts` | role-match |
| `packages/rules/src/hanabi/projection.test.ts` | test | — | `forehead-card.test.ts` | role-match |
| `packages/rules/src/hanabi/history.test.ts` | test | — | `forehead-card.test.ts` | role-match |
| `packages/rules/src/hanabi/*.property.test.ts` (variant/legality/actions/endgame/projection as needed) | test | — | `forehead-card.property.test.ts` | exact |
| `packages/rules/src/hanabi/hanabi-leak-check.test.ts` | test | — | `forehead-card-leak-check.test.ts` | exact |
| `packages/rules/src/index.ts` (modified) | config (barrel) | — | itself (existing barrel export block) | exact |

**Not modified, but load-bearing for conformance:** `packages/rules/src/adapter.test.ts`'s `describeAdapterConformance` is called a second time with the Hanabi adapter — this is an addition of one line + a sample-actions array, not a new file, and not a rewrite of the conformance suite itself.

## Pattern Assignments

### `packages/rules/src/hanabi/variant.ts` (config, transform)

**Analog:** `packages/rules/src/forehead-card.ts` lines 24-43 (closed value set + derived type) and its file-header doc-comment convention (lines 1-19).

**Closed-set-plus-derived-type pattern** (`forehead-card.ts:24-43`):
```typescript
export const FOREHEAD_CARD_VALUES = [
  "Altair", "Sirius", /* ... */
] as const;

export type ForeheadCardValue = (typeof FOREHEAD_CARD_VALUES)[number];
```
Apply this exact shape to `Suit` and per-variant suit lists (`BASE_SUITS`, `RAINBOW_SUITS`, `BLACK_SUITS` as `as const` arrays, with `Suit = (typeof ALL_SUITS)[number]`), and to `rankCounts` as a `Readonly<Record<number, number>>` object literal (RESEARCH.md's own code example at line 306-307 already uses this literal-object style — copy it verbatim rather than inventing a new encoding).

**File-header comment convention** (`forehead-card.ts:1-19`, `shuffle.ts:1-16`): every rules-engine source file in this package opens with a comment block explaining (a) what the file is for, (b) which numbered decision/finding it satisfies, (c) why a specific implementation choice was made over an obvious alternative. `variant.ts` should open with a comment naming D-08/D-09 and pointing at RESEARCH.md's Pitfall 3 (Rainbow negative-clue inference) since that reasoning belongs beside the `colorCluesTouch` predicate it explains, not just in planning docs.

---

### `packages/rules/src/hanabi/deck.ts` (utility, transform)

**Analog:** `packages/rules/src/shuffle.ts` (whole file, reused not copied) + `forehead-card.ts` lines 106-126 (`createInitialState`'s deck-building block).

**Reuse, don't reimplement, shuffle/id minting** (`forehead-card.ts:106-126`):
```typescript
createInitialState({ seatIds, seed }) {
  const deck = shuffleWithSeed(FOREHEAD_CARD_VALUES, seed, "deck");
  let idRng = seedToRngState(seed, "card-ids");
  const takenIds = new Set<string>();
  const hands: { seatId: string; card: ForeheadCard }[] = [];
  for (let i = 0; i < seatIds.length; i++) {
    const minted = mintCardId(idRng, takenIds);
    idRng = minted.rng;
    takenIds.add(minted.id);
    hands.push({ seatId: seatIds[i]!, card: { id: minted.id, value: deck[i]! } });
  }
  return { /* ...state, idRng */ };
},
```
`deck.ts`'s `buildDeck(variant)` should build the full card-value list (suit × rank per `VariantConfig.rankCounts`), then call `shuffleWithSeed(deckValues, seed, "hanabi-deck")` and mint ids via a loop identical in shape to the one above, using `seedToRngState(seed, "hanabi-card-ids")` — new stream names, same functions, per D-18 and RESEARCH.md's "Don't Hand-Roll" table (row 1). Do not write a new PRNG or id scheme. Track `idRng` through state the same way `ForeheadCardState.idRng` does, since cards keep minting after the initial deal (draws during play).

---

### `packages/rules/src/hanabi/state.ts` (model, transform)

**Analog:** `packages/rules/src/forehead-card.ts` lines 45-79 (type definitions block).

**Type-block pattern** (`forehead-card.ts:45-79`):
```typescript
export type ForeheadCard = { readonly id: string; readonly value: ForeheadCardValue };
export type ForeheadCardState = {
  readonly seatIds: readonly string[];
  readonly turnIndex: number;
  readonly hands: readonly { readonly seatId: string; readonly card: ForeheadCard }[];
  readonly deck: readonly ForeheadCardValue[];
  readonly revealed: readonly RevealedCard[];
  readonly score: number;
  readonly idRng: RngState;
};
export type ForeheadCardAction = { type: "guess"; value: ForeheadCardValue };

// View types use plain mutable Array and non-readonly fields on purpose, so
// ForeheadCardView stays assignable to Plan 02's z.infer type.
export type ForeheadCardView = { /* ... */ };
```
Note the explicit split: **state types are `readonly` everywhere** (immutability is structural, not just convention), but **view types are deliberately non-readonly plain `Array`/object literals** — copy that split exactly for `HanabiState` vs `HanabiView`, and keep the same comment explaining why (future Zod `z.infer` assignability in Phase 4, per D-07's note that the view type should already be "plain objects, no classes, no `undefined`-valued keys").

---

### `packages/rules/src/hanabi/legality.ts` (service, request-response)

**Analog:** `packages/rules/src/forehead-card.ts` lines 128-138 (the inline guards at the top of `applyAction`), generalized into extracted pure predicates per D-13.

**Inline-guard pattern to extract** (`forehead-card.ts:128-138`):
```typescript
applyAction(state, actorSeatId, request) {
  if (!isGuessRequest(request)) {
    return { ok: false, error: "invalid_action" };
  }
  if (actorSeatId !== state.seatIds[state.turnIndex]) {
    return { ok: false, error: "not_your_turn" };
  }
  if (state.deck.length === 0) {
    return { ok: false, error: "game_over" };
  }
  /* ... */
}
```
The toy inlines these three checks because it only has one action type. D-13 requires Hanabi's equivalents (`isYourTurn`, `canPlay`, `canDiscard`, `canClue`, "clue touches ≥1 card") to be **exported as standalone pure predicates** — `(state, actorSeatId, action) => boolean` or `=> { legal: true } | { legal: false; reason: AdapterError }` — so Phase 6's UI can call them without calling `applyAction`. Keep the same guard *order and shape* (turn check before deck/game-over check before action-specific check) as the toy's, since `adapter.test.ts`'s conformance suite (see below) exercises rejection paths in this same order.

---

### `packages/rules/src/hanabi/actions.ts` (service, CRUD/state-transition)

**Analog:** `packages/rules/src/forehead-card.ts` lines 83-167 (`isGuessRequest` + `applyAction` body).

**Exact-own-key request guard** (`forehead-card.ts:87-94`, also given in RESEARCH.md lines 226-235 for a 2-key and 3-key shape):
```typescript
function isGuessRequest(request: unknown): request is ForeheadCardAction {
  if (typeof request !== "object" || request === null) return false;
  const keys = Object.keys(request);
  if (keys.length !== 2 || !keys.includes("type") || !keys.includes("value")) return false;
  const r = request as { type: unknown; value: unknown };
  if (r.type !== "guess") return false;
  return typeof r.value === "string" && VALUE_SET.has(r.value);
}
```
Write `isPlayRequest`, `isDiscardRequest`, `isClueRequest` in exactly this shape: `typeof/null` check, `Object.keys(request).length === N` exact-count check (never `>=`), then narrow field-by-field. RESEARCH.md's Code Examples section (lines 227-235, 320-335) already drafts `isPlayRequest`/`isClueRequest` in this idiom — use those drafts as the starting point, not the shape below since Hanabi's are card-id-keyed. This exact-key-count check is what makes HIDE-05's "reject a payload with an extra key" enforceable — a client adding `resultingScore: 999` to a play request fails the `keys.length !== 2` check before any field is even read.

**Non-mutating transition + fresh-state-object return** (`forehead-card.ts:128-167`):
```typescript
applyAction(state, actorSeatId, request) {
  if (!isGuessRequest(request)) return { ok: false, error: "invalid_action" };
  if (actorSeatId !== state.seatIds[state.turnIndex]) return { ok: false, error: "not_your_turn" };
  if (state.deck.length === 0) return { ok: false, error: "game_over" };

  const ownHandIndex = state.hands.findIndex((h) => h.seatId === actorSeatId);
  const ownHand = state.hands[ownHandIndex]!;
  /* ...compute derived values from state, never state.hands[i].card = ... */

  const hands = state.hands.map((h, i) => (i === ownHandIndex ? { seatId: h.seatId, card: newCard } : h));

  return {
    ok: true,
    state: {
      seatIds: state.seatIds,       // unchanged reference reused, not copied — fine, it's readonly
      turnIndex: (state.turnIndex + 1) % state.seatIds.length,
      hands,                          // new array from .map
      deck: state.deck.slice(1),      // new array from .slice
      revealed: [...state.revealed, revealedEntry],  // new array via spread-append
      score: state.score + (correct ? 1 : 0),
      idRng: minted.rng,
    },
  };
},
```
Every field of the returned state object is written as a **named literal**, never `{ ...state, hands }` shorthand — this is deliberate (matches the whitelist-construction discipline that D-07 requires for `toPlayerView`, applied here to state construction too, so an executor cannot accidentally carry forward a stale field by spreading). Follow the same style in `actions.ts`'s play/discard/clue branches: build the next `HanabiState` field-by-field, use `.map`/`.slice`/`[...arr, x]` for array updates, never mutate `state.hands[i]` or push onto `state.deck` in place. `adapter.test.ts`'s conformance suite snapshot-diffs the input `state` before and after every sample action specifically to catch a mutation regression here.

---

### `packages/rules/src/hanabi/endgame.ts` (service, transform)

**Analog:** `packages/rules/src/forehead-card.ts` lines 215-220 (`checkGameEnd`).

```typescript
checkGameEnd(state) {
  if (state.deck.length === 0) {
    return { score: state.score, reason: "deck_exhausted" };
  }
  return null;
},
```
`GameEndResult = { score: number; reason: string }` (from `adapter.ts:29`) is already the exact return shape D-17 needs (score + descriptive band can both live in `reason`, or `reason` can carry the band string while a documented convention communicates which). Follow the toy's single-`if`-chain-returning-`null`-by-default structure, but per RESEARCH.md Pitfall 4, check **all three end conditions independently on every call** (fuses lost, all stacks complete, final round elapsed) in a fixed priority order, not an `if/else if` chain gated on whether `finalTurnsRemaining` is set — document the order and non-mutual-exclusivity reasoning in a comment directly above the checks, mirroring how `shuffle.ts`'s header documents *why* a design choice was made (lines 5-12).

---

### `packages/rules/src/hanabi/projection.ts` (service, transform/redaction)

**Analog:** `packages/rules/src/forehead-card.ts` lines 169-213 (`toPlayerView`), this is the single most load-bearing pattern in the phase.

**Whitelist construction + fail-closed unseated viewer** (`forehead-card.ts:169-213`):
```typescript
toPlayerView(state, seatId): ForeheadCardView {
  const activeSeatId = state.seatIds[state.turnIndex] as string;
  const revealed = state.revealed.map((entry) => ({
    id: entry.id, seatId: entry.seatId, value: entry.value, correct: entry.correct,
  }));
  const ownHand = state.hands.find((h) => h.seatId === seatId);

  if (ownHand === undefined) {
    // Fails closed: an unknown/unseated viewer sees less, never more — every
    // hand (including seats that are not the viewer) renders hidden.
    const otherCards = state.hands.map((h) => ({
      seatId: h.seatId,
      card: { id: h.card.id, hidden: true as const },
    }));
    return {
      yourCard: { id: "unseated", hidden: true },
      otherCards, revealed, deckCount: state.deck.length,
      activeSeatId, isYourTurn: false, score: state.score,
    };
  }

  const otherCards = state.hands
    .filter((h) => h.seatId !== seatId)
    .map((h) => ({
      seatId: h.seatId,
      card: { id: h.card.id, hidden: false as const, value: h.card.value },
    }));

  return {
    yourCard: { id: ownHand.card.id, hidden: true },   // note: NO `value` key at all, not `value: undefined`
    otherCards, revealed, deckCount: state.deck.length,
    activeSeatId, isYourTurn: activeSeatId === seatId, score: state.score,
  };
},
```
Copy this three-part structure exactly for Hanabi's `toPlayerView`:
1. Compute public fields once (stacks, discard pile, tokens, deck count, turn index, `finalTurnsRemaining`) — these are identical for every seat, computed before the branch.
2. **Fail-closed branch** for an unseated/unknown viewer — every hand (including the viewer's own would-be hand) renders as fully hidden, exactly as `ownHand === undefined` does above. Do not skip this branch for Hanabi; a spectator or a stale reconnect token must never see more than the least-privileged seat.
3. **Own-hand branch**: build each own-hand card as `{ id, clueFacts }` — a literal that **structurally never mentions `suit`/`rank` keys**, not `{ id, suit: undefined, rank: undefined, clueFacts }`. This is D-07's "structurally lacks" requirement — the same discipline the toy's `yourCard: { id: ownHand.card.id, hidden: true }` demonstrates by simply never writing a `value:` key in that literal. Other seats' hands get full `{ id, suit, rank, clueFacts }` literals (the toy's `otherCards` branch, lines 197-202, is the same pattern with `value` included).

**No spread/delete/omit anywhere in this function** — enforced by the file-header comment convention at `forehead-card.ts:14-19`, which should be copied near-verbatim into `projection.ts`'s header, updated for Hanabi's own-hand-lacks-suit-and-rank shape (D-07) instead of the toy's own-card-lacks-value shape.

---

### `packages/rules/src/hanabi/history.ts` (model, event-driven append log)

**Analog:** `packages/rules/src/forehead-card.ts`'s `RevealedCard` type (line 47-52) and its append site (line 162: `revealed: [...state.revealed, revealedEntry]`).

```typescript
export type RevealedCard = {
  readonly id: string;
  readonly seatId: string;
  readonly value: ForeheadCardValue;
  readonly correct: boolean;
};
```
D-19 requires history entries to carry **public facts only** — a draw recorded by card id with no identity. Model `HistoryEntry` the same way `RevealedCard` models a public, already-resolved fact (the toy's `revealed` entries are recorded only *after* the guess resolves, never before — same principle: never log a fact before it's public). Append via `[...state.history, entry]`, matching the toy's spread-append at line 162, never `state.history.push(...)`.

---

### `packages/rules/src/hanabi/adapter.ts` (service, adapter composition)

**Analog:** `packages/rules/src/forehead-card.ts` (whole file structure) implementing `packages/rules/src/adapter.ts`'s `GameAdapter<TState, TAction>` interface (`adapter.ts:35-67`, unmodified per D-03).

```typescript
export const foreheadCardGame: GameAdapter<ForeheadCardState, ForeheadCardAction> = {
  id: "forehead-card",
  createInitialState({ seatIds, seed }) { /* ... */ },
  applyAction(state, actorSeatId, request) { /* ... */ },
  toPlayerView(state, seatId): ForeheadCardView { /* ... */ },
  checkGameEnd(state) { /* ... */ },
};
```
`hanabi/adapter.ts` composes the other modules (`deck.buildDeck`, `legality.*`, `actions.applyAction`-per-branch, `projection.toPlayerView`, `endgame.checkGameEnd`) behind this same five-member object literal, `id: "hanabi"`. Per D-03, the `GameAdapter` interface itself (`adapter.ts`) is **not modified** — if Hanabi's refusal reasons need more than `"not_your_turn" | "invalid_action" | "game_over"`, widen `AdapterError` in `adapter.ts` (allowed) rather than changing the interface's five members (not allowed).

---

### `packages/rules/src/hanabi/hanabi-leak-check.ts` (utility, transform)

**Analog:** `packages/rules/src/forehead-card-leak-check.ts` (whole file) — explicitly named for generalization by D-21/CONTEXT.md.

**Structural walk with `in`-operator (never truthiness)** (`forehead-card-leak-check.ts:38-65`):
```typescript
function walkStructural(subtree: unknown, secrets: SeatSecrets, reasons: Set<string>): void {
  if (Array.isArray(subtree)) {
    for (const item of subtree) walkStructural(item, secrets, reasons);
    return;
  }
  if (subtree === null || typeof subtree !== "object") return;
  const obj = subtree as Record<string, unknown>;

  if ("yourCard" in obj) {
    const yourCard = obj.yourCard;
    if (yourCard !== null && typeof yourCard === "object" && "value" in yourCard) {
      reasons.add("structural:yourCard-has-value");
    }
  }
  if (obj.hidden === true && "value" in obj) {
    reasons.add("structural:hidden-card-has-value");
  }
  if (secrets.ownCard !== null && obj.id === secrets.ownCard.id && "value" in obj) {
    reasons.add("structural:own-card-id-has-value");
  }
  for (const value of Object.values(obj)) walkStructural(value, secrets, reasons);
}
```
Per D-21, this must be generalized because Hanabi's `{suit, rank}` identity is numeric/short-string and can legitimately collide with token counts or scores — a raw string scan alone (as used for the toy's star names, which cannot collide with anything else) is insufficient. Keep the **recursive structural walk** (`in`-operator key-presence checks, not truthiness — the comment at lines 36-38 explains why: `JSON.stringify` drops `undefined`-valued keys, so a truthiness check would miss a wrongly-included-but-`undefined` field) but change the leak conditions to: (a) any object with an `in`-checked `suit` or `rank` key nested under a viewer's own hand entry, (b) any object elsewhere in the view whose `{suit, rank}` pair (both keys, `in`-checked, then value-compared) exactly matches one of the viewer's own cards' real `{suit, rank}`. Keep `secretsForSeat`'s shape (`forehead-card-leak-check.ts:21-31`) — `{ ownCard, forbiddenTokens }` — but change `ownCard` to carry `{ id, suit, rank }` instead of `{ id, value }`, and keep the raw-string `forbiddenTokens` scan (deck contents by suit/rank pair serialized, plus the seed) as a second, independent layer alongside the new structural/typed check, per RESEARCH.md D-21's "compare structurally and by typed identity... not by scanning for a bare number."

---

### `packages/rules/src/hanabi/*.property.test.ts` (test, D-20 invariants)

**Analog:** `packages/rules/src/forehead-card.property.test.ts` (whole file).

**fast-check property structure with a leak-check helper reused per-state** (`forehead-card.property.test.ts:12-47`):
```typescript
function assertNoLeaksForEveryState(state: ForeheadCardState, seed: string) {
  for (const seatId of state.seatIds) {
    const view = foreheadCardGame.toPlayerView(state, seatId);
    const secrets = secretsForSeat(state, seatId, seed);
    const reasons = checkSeatViewForLeaks({ view, serialized: JSON.stringify(view), secrets });
    expect(reasons).toEqual([]);
  }
}

describe("...", () => {
  it("holds over 200 random games (fast-check)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.stringMatching(/^[0-9a-f]{32}$/),
        fc.array(fc.nat({ max: 15 }), { maxLength: 20 }),
        (seatCount, seed, guessIndexes) => {
          const seatIds = Array.from({ length: seatCount }, (_, i) => `seat-${i}`);
          let state = foreheadCardGame.createInitialState({ seatIds, variant: "base", seed });
          assertNoLeaksForEveryState(state, seed);
          for (const index of guessIndexes) {
            if (foreheadCardGame.checkGameEnd(state) !== null) break;
            const active = state.seatIds[state.turnIndex]!;
            const result = foreheadCardGame.applyAction(state, active, { type: "guess", value: FOREHEAD_CARD_VALUES[index] });
            if (result.ok) state = result.state;
            assertNoLeaksForEveryState(state, seed);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
```
This is the template for D-20's four invariants (token conservation, card conservation, redaction, termination) — one `fc.property` per invariant, generating `(seatCount, seed, actionSequence-or-index-list)`, driving `applyAction` in a loop guarded by `checkGameEnd`, and asserting the invariant after **every** step, not just at the end (note `assertNoLeaksForEveryState` runs after initial state, after every applied action, AND is called even when `result.ok` is false — the loop doesn't skip the assertion on rejection). For the termination property specifically, use RESEARCH.md's own drafted example (RESEARCH.md lines 338-363, `MAX_SIMULATED_TURNS` bound returning `false` — i.e., a fast-check *test failure* — if exceeded, not a `console.warn` or soft skip).

**Non-vacuousness discipline (WR-02, D-22):** the toy's second test (`forehead-card.property.test.ts:49-71`) asserts `expect(guesses).toBe(11)` after a `while` loop — an explicit assertion that the loop body actually ran the expected number of times, not just that the final state looks right. Every Hanabi property/example test with a `for`/`while` loop guarded by `checkGameEnd(state) === null` must include an equivalent "this loop ran a nonzero/expected number of times" assertion, per D-22's closure of WR-02.

---

### `packages/rules/src/hanabi/hanabi-leak-check.test.ts` (test, canary suite)

**Analog:** `packages/rules/src/forehead-card-leak-check.test.ts` (whole file) — D-22's canary discipline, carried over verbatim in structure.

**Canary suite shape** (`forehead-card-leak-check.test.ts:24-93`): one `it(...)` per deliberately-leaky fixture, each asserting the checker's `reasons` array **contains** (not equals, except Canary H) the specific reason string the fixture is designed to trigger. Copy this file's canary list as a checklist and re-derive Hanabi-specific canaries for each: own-hand card carrying `suit`/`rank` directly; `suit`/`rank` as `null` (structural, still present as a key); `suit`/`rank` as `undefined` (present as a key pre-stringify, absent after `JSON.stringify` — proves the checker is structural, not string-based, exactly as Canary C does at lines 44-51); own card's identity appearing under a different own-hand slot (Canary D's "moved into otherCards" pattern, adapted to "moved into another own-hand-adjacent field"); deck/history leaking under an arbitrary debug key (Canaries F/G, unchanged in spirit — forbidden-token scan). Also copy the **clean-baseline test first** (`describe("...: clean baseline", ...)` at lines 12-22) — asserting the real `toPlayerView` output produces zero leak reasons — since a canary suite with only leaky fixtures and no clean-baseline check cannot itself catch a checker that is stuck always returning leak reasons.

---

## Shared Patterns

### GameAdapter contract (unmodified, D-03)
**Source:** `packages/rules/src/adapter.ts` (whole file, 67 lines)
**Apply to:** `hanabi/adapter.ts` only — this is the interface being implemented, not a pattern to copy into other files. Its three invariants (comment block, lines 5-11) are the acceptance criteria every other module in this phase serves: non-mutation (→ `actions.ts`), hostile-input handling (→ exact-key guards in `actions.ts`), `toPlayerView`-is-the-only-exit (→ `projection.ts`).

### Whitelist construction, no spread/delete/omit
**Source:** `packages/rules/src/forehead-card.ts` file header (lines 14-19) and `toPlayerView` body (lines 169-213)
**Apply to:** `projection.ts` (primary), and by extension `actions.ts`'s returned-state literals (secondary application of the same discipline to state construction, not just views).
```typescript
// D-05 whitelist-construction rule, enforced throughout this file: the
// spread operator in object literals, `delete`, `Object.assign`, any omit
// helper, and assigning null/undefined to a value key are all FORBIDDEN in
// `toPlayerView`. Every returned object is built field-by-field from named
// values so a hidden card structurally cannot carry a `value` key — not
// because it was stripped, but because the object literal never mentions it.
```

### Exact-own-key hostile-input guard
**Source:** `packages/rules/src/forehead-card.ts` lines 83-94
**Apply to:** `actions.ts`'s `isPlayRequest`/`isDiscardRequest`/`isClueRequest` (three guards, one per action shape; the clue guard nests a second exact-key check on the `clue` sub-object, per RESEARCH.md's drafted `isClueRequest` at lines 320-335).
```typescript
function isGuessRequest(request: unknown): request is ForeheadCardAction {
  if (typeof request !== "object" || request === null) return false;
  const keys = Object.keys(request);
  if (keys.length !== 2 || !keys.includes("type") || !keys.includes("value")) return false;
  const r = request as { type: unknown; value: unknown };
  if (r.type !== "guess") return false;
  return typeof r.value === "string" && VALUE_SET.has(r.value);
}
```

### Seeded PRNG / opaque id minting reuse (D-18)
**Source:** `packages/rules/src/shuffle.ts` (whole file, unmodified — imported, not forked)
**Apply to:** `deck.ts` (deck shuffle + card-id minting with new stream names `"hanabi-deck"`/`"hanabi-card-ids"`).
```typescript
export function seedToRngState(seed: string, stream: string): RngState { /* ... */ }
export function shuffleWithSeed<T>(items: readonly T[], seed: string, stream: string): T[] { /* ... */ }
export function mintCardId(rng: RngState, taken: ReadonlySet<string>): { id: string; rng: RngState } { /* ... */ }
```

### Adapter conformance suite reuse
**Source:** `packages/rules/src/adapter.test.ts` lines 14-83 (`describeAdapterConformance`)
**Apply to:** Add one call, `describeAdapterConformance("hanabi", hanabiGame, [sampleActions...])`, at the same call-site style as line 85 (`describeAdapterConformance("forehead-card", foreheadCardGame, [{ type: "guess", value: "Altair" }]);`). Do not rewrite or fork this function — it is explicitly documented (lines 9-13) as shared across Phase 2 and Phase 4(and, per this phase, Phase 3)'s adapters. Also extend the file's structural purity check (lines 95-113, the `forbidden` token / file list) to include the new `hanabi/*.ts` source files so FDN-02's zero-Node/zero-Worker-import guarantee covers Hanabi too.

### Barrel export convention
**Source:** `packages/rules/src/index.ts` (whole file, 29 lines)
**Apply to:** Add a Hanabi section mirroring the existing forehead-card block:
```typescript
export { checkSeatViewForLeaks, secretsForSeat } from "./forehead-card-leak-check";
export type { SeatSecrets } from "./forehead-card-leak-check";
```
i.e. add `export { hanabiGame } from "./hanabi/adapter";` plus `export type { HanabiState, HanabiAction, HanabiView, ... } from "./hanabi/state";` and `export { checkHanabiViewForLeaks, secretsForHanabiSeat } from "./hanabi/hanabi-leak-check";` (names illustrative — exact naming is Claude's Discretion per CONTEXT.md). Update the file's header comment (lines 1-5) to mention Hanabi now lives here too, since D-02 keeps the toy present through this phase (comment should describe both, not replace the toy's description).

## No Analog Found

None. Every file in RESEARCH.md's "Recommended Project Structure" and "Wave 0 Gaps" list has a direct, already-reviewed analog inside `packages/rules/src/` itself (Phase 1/2 output), which is exactly why RESEARCH.md's Architecture confidence is rated HIGH — this phase is additive within an established package convention, not a new one.

## Metadata

**Analog search scope:** `packages/rules/src/` only (10 existing files read in full; all ≤ 299 lines, single-Read-per-file, no re-reads).
**Files scanned:** 8 read directly (`adapter.ts`, `forehead-card.ts`, `shuffle.ts`, `forehead-card-leak-check.ts`, `forehead-card.property.test.ts`, `adapter.test.ts`, `index.ts`, `forehead-card-leak-check.test.ts`); 2 more (`forehead-card.test.ts`, `shuffle.test.ts`, `index.test.ts`) noted by line count via `wc -l` but not read in full since their patterns are already fully covered by the property/leak-check test files read and by CONTEXT.md/RESEARCH.md's explicit citations — planner should treat `forehead-card.test.ts` as the implicit analog for plain example-based `*.test.ts` files (unit style: `describe`/`it`/`expect`, no fast-check) if a closer look is needed during planning.
**Pattern extraction date:** 2026-09-15

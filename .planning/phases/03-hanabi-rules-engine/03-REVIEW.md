---
phase: 03-hanabi-rules-engine
reviewed: 2026-09-15T00:00:00Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - packages/rules/src/adapter.ts
  - packages/rules/src/adapter.test.ts
  - packages/rules/src/index.ts
  - packages/rules/src/hanabi/variant.ts
  - packages/rules/src/hanabi/variant.test.ts
  - packages/rules/src/hanabi/state.ts
  - packages/rules/src/hanabi/deck.ts
  - packages/rules/src/hanabi/deck.test.ts
  - packages/rules/src/hanabi/history.ts
  - packages/rules/src/hanabi/history.test.ts
  - packages/rules/src/hanabi/clue-facts.ts
  - packages/rules/src/hanabi/clue-facts.test.ts
  - packages/rules/src/hanabi/legality.ts
  - packages/rules/src/hanabi/legality.test.ts
  - packages/rules/src/hanabi/actions.ts
  - packages/rules/src/hanabi/actions.test.ts
  - packages/rules/src/hanabi/endgame.ts
  - packages/rules/src/hanabi/endgame.test.ts
  - packages/rules/src/hanabi/projection.ts
  - packages/rules/src/hanabi/projection.test.ts
  - packages/rules/src/hanabi/hanabi-leak-check.ts
  - packages/rules/src/hanabi/hanabi-leak-check.test.ts
  - packages/rules/src/hanabi/adapter.ts
  - packages/rules/src/hanabi/test-support.ts
  - packages/rules/src/hanabi/conservation.property.test.ts
  - packages/rules/src/hanabi/redaction.property.test.ts
  - packages/rules/src/hanabi/termination.property.test.ts
  - packages/rules/src/hanabi/variant-matrix.test.ts
findings:
  critical: 1
  warning: 1
  info: 0
  total: 2
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-09-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 28
**Status:** issues_found

## Summary

Read every listed source and test file for the Hanabi rules engine end to end,
with particular focus on the two failure classes named in the brief: token
economy / final-round / end-condition correctness, and the identity-leak
checker's recent widening.

Token economy, the final-round trigger, the three end conditions, and
variant parametrization (base/Rainbow/Black) all check out. I initially
suspected an off-by-one in the final round (`advanceTurn` sets
`finalTurnsRemaining = seatIds.length` on deck exhaustion, which looked like
it gives the drawer of the last card an extra bonus turn beyond the turn
that emptied the deck), but `actions.test.ts` and
`termination.property.test.ts` pin exactly this behavior down explicitly and
deliberately (`finalTurnsTaken === seatIds.length`), matching this project's
documented interpretation of the rule ("every player including the last
drawer gets exactly one more turn"). That is a real design decision, not a
bug — I traced it through and confirmed it's internally consistent and
tested, so I am not flagging it.

The property tests (conservation, redaction, termination, variant-matrix)
are well-built: they drive games exclusively through the engine's own
exported `canPlay`/`canDiscard`/`canClue`/`applyAction`, assert invariants
after every step (including rejected actions), and each carries an explicit
non-vacuousness assertion (`totalSteps`/`seatsChecked`/`variantsSwept`
`toBeGreaterThan(0)`). I did not find a property test that could pass
vacuously.

The one substantive finding is in the exact place the brief asked me to
scrutinize hardest: the phase 03-05 widening of the identity-count allowance
in `hanabi-leak-check.ts` to admit a played card appearing both in
discard/stacks and in its own history entry. That widening is correct for
misplays and discards, but it is applied unconditionally to **every** `play`
history entry, including successful ones — and a successfully played card
is never represented with a `rank` key anywhere else in the view (the
`stacks` view field carries only `{ suit, topRank }`, never `rank`). The
result is a real, provable off-by-one slack in the leak detector's allowed
count for every completed stack rank, which could mask exactly one extra
illegitimate reveal of that identity elsewhere in the view. See CR-01.

## Critical Issues

### CR-01: Leak-checker's history-based allowance widening over-counts successful plays, creating an exploitable blind spot in the identity leak check

> **RESOLVED 2026-09-16 in commit `65b6dd6`** (orchestrator, before Phase 3 was closed).
> The redundant per-rank `stacks` loop was deleted from `secretsForHanabiSeat`; the
> `history` loop alone now reproduces every legitimate occurrence exactly once.
> A regression test — "Canary I" in `hanabi-leak-check.test.ts` — drives the real
> projection to a successfully played card, asserts the clean view reports no leak,
> then injects one duplicate of that already-public identity and asserts it IS
> reported. Fault injection confirmed the canary is load-bearing: it fails when the
> deleted loop is reinstated and passes with the fix. Full suite green afterwards
> (425 tests). Independently found by the phase verifier as well — see
> `03-VERIFICATION.md` Finding 1.

**File:** `packages/rules/src/hanabi/hanabi-leak-check.ts:63-79`

**Issue:**

`secretsForHanabiSeat` builds the "allowed" identity multiset from three
sources: other hands, the discard pile, and (per the phase 03-05 fix) the
history log:

```ts
for (const card of state.discard) bump(card.suit, card.rank);
for (const stack of state.stacks) {
  for (let rank = 1; rank <= stack.topRank; rank++) bump(stack.suit, rank as Rank);
}
...
for (const entry of state.history) {
  if (entry.type === "play" || entry.type === "discard") {
    bump(entry.suit, entry.rank);
  }
}
```

The stack loop bumps once per completed rank in every stack (i.e., once for
every card that was ever *successfully* played), and the history loop
*also* bumps once for every `play`/`discard` history entry, regardless of
`success`. But the projected `HanabiView`'s `stacks` field
(`Array<{ suit: Suit; topRank: number }>`, see `state.ts:108`) never
carries a `rank` key — only `topRank`, a single number. `collectIdentityCounts`
only counts objects that carry **both** `suit` and `rank`
(`hanabi-leak-check.ts:139`), so a successfully played card's identity
appears **exactly once** in a real view: in its `history` entry. It never
appears a second time via `stacks`.

Concretely, for any suit/rank that has been successfully played (i.e. any
rank ≤ a stack's `topRank`):
- Stack loop bumps allowed by **+1** (line 65-66) — but this does not
  correspond to any actual occurrence in the view, since `stacks` carries
  no `rank` key.
- History loop bumps allowed by another **+1** (line 77-78) — this one
  correctly matches the one real occurrence (the `history` "play" entry).

So `allowedIdentityCounts[key]` ends up at **2** for that identity while the
real view only ever contains it **once**. `checkHanabiViewForLeaks` only
flags `count > allowed` (line 167), so a genuine bug that leaks **one
additional** copy of that exact identity somewhere else in the view (e.g. a
duplicate entry under `otherHands`, or an accidental future-deck-card
reveal that happens to collide with an already-played rank) would produce
`count === 2 === allowed`, and would **not** be flagged. This is a false
negative in the exact safety net (`redaction.property.test.ts`,
`hanabi-leak-check.test.ts`'s canary suite) that the phase's own
non-vacuousness discipline is trying to guarantee.

This is provably not merely theoretical slack: the stack loop was already
redundant with the history loop for *every* play/discard entry (the history
loop alone reproduces every legitimate occurrence exactly, since history is
append-only and covers every play/discard). The stack loop is the only
source of the unearned +1.

Note: the primary defense against a player seeing their *own* hidden card
(`walkStructural`'s `inYourHand`/`hidden===true`/own-id checks,
`hanabi-leak-check.ts:92-124`) is independent of this multiset and is not
weakened by this bug — key-presence detection still fires unconditionally.
This finding is about the secondary "excess reveal of an otherwise-public
identity" detector, which is the only check standing between a future bug
and a leaked identity that isn't structurally tagged as "your hand" (e.g. a
leaked future draw, or a duplicated `otherHands` entry).

**Fix:** Delete the redundant stack-rank loop; the history loop alone
already reproduces every legitimate occurrence exactly (1 for a successful
play, 2 for a misplay or discard, matching the discard-array bump plus the
history entry):

```ts
// DELETE this block — it double-counts every successfully played rank,
// since the view's `stacks` field never carries a `rank` key and the
// history loop below already accounts for the one real occurrence:
//
// for (const stack of state.stacks) {
//   for (let rank = 1; rank <= stack.topRank; rank++) bump(stack.suit, rank as Rank);
// }

for (const card of state.discard) bump(card.suit, card.rank);

for (const entry of state.history) {
  if (entry.type === "play" || entry.type === "discard") {
    bump(entry.suit, entry.rank);
  }
}
```

Add a regression test asserting that for a state with at least one
successfully completed stack rank, `allowedIdentityCounts[key]` equals
exactly the number of times that identity actually appears in
`JSON.stringify(toHanabiPlayerView(state, seatId))` — not one more.

## Warnings

### WR-01: The typed-multiset baseline is derived from the same live state it's checking, so it cannot catch a class of self-consistent duplication bugs

**File:** `packages/rules/src/hanabi/hanabi-leak-check.ts:42-84`

**Issue:** `secretsForHanabiSeat`'s "allowed" counts and
`toHanabiPlayerView`'s actual view content are both computed directly from
the same `HanabiState` object (specifically, both read `state.history`
verbatim). If a future engine bug caused a spurious duplicate history entry
to be appended (e.g., a double-append on some action-branch edge case), the
"allowed" count and the "actual" count in the view would inflate together
and by the same amount, since they're reading the exact same array. The
typed-multiset check can therefore only catch a leak that manufactures an
identity occurrence *outside* of what `secretsForHanabiSeat` already reads
from state (hands/discard/history) — it is structurally unable to catch a
leak that results from state itself carrying a bogus duplicate. This is an
inherent design limitation rather than a regression, and the primary
own-hand secrecy guarantee (structural key-presence check) is unaffected,
but it is worth documenting so a future engineer doesn't over-trust this
check as an independent oracle for "history/state integrity" — that job
belongs to the conservation property tests instead, and CR-01 shows the
allowance-widening approach is easy to get subtly wrong in this file.

**Fix:** No code change required beyond CR-01's fix. Recommend adding a
one-line comment above `secretsForHanabiSeat` noting this check's scope is
"no view exposes an identity beyond what state's own legitimate public
history already contains" and is not a substitute for the conservation
property tests, which independently verify state's own internal
consistency (card-location uniqueness) from a source that doesn't share
inputs with the leak checker.

---

_Reviewed: 2026-09-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

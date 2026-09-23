---
phase: 03-hanabi-rules-engine
verified: 2026-09-15T18:10:00Z
status: passed
score: 20/20 must-haves verified (with 1 documented WARNING, non-blocking)
overrides_applied: 0
---

# Phase 3: Hanabi Rules Engine Verification Report

**Phase Goal:** The actual game-rules risk (token economy, final-round trigger, variant-parametrized suit count) is burned down in a fast unit/property-test loop, with zero networking involved, before this logic is wired into the transport built in Phases 1-2.
**Verified:** 2026-09-15
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Correct hand sizes and deck for any configured variant; suit count always config-derived, never hardcoded | ✓ VERIFIED | `packages/rules/src/hanabi/variant.ts` is the sole file declaring `ALL_SUITS`/rank-count tables; `deck.ts:buildDeck` iterates `config.suits`/`config.rankCountsFor` with no literal suit/size names. `variant-matrix.test.ts` asserts base=5 suits/50 cards, rainbow=6/60, black=6/55 (confirms RULES-02/03 exactly). `handSizeFor()` gives 5 for ≤3 players, 4 otherwise, tested in `variant.test.ts`. |
| 2 | Full turn cycle plays/discards/clues correctly; illegal clues/discards rejected; misplay loses a fuse; 5-completion refunds a token unless at 8 | ✓ VERIFIED | `legality.ts` (`canPlay`/`canDiscard`/`canClue`/`cardsTouchedByClue`) and `actions.ts` (`applyPlay`/`applyDiscard`/`applyClue`) read directly — zero-touch clues rejected (`clue_touches_nothing`), 0-token clue rejected (`no_clue_tokens`), 8-token discard rejected (`discard_at_max_clues`), misplay appends to discard and increments `fuses`, 5-completion increments `clueTokens` only `if (card.rank === 5 && clueTokens < MAX_CLUE_TOKENS)`. Exercised by `actions.test.ts`, `legality.test.ts`, and the conservation property test across 200 random games × 3 variants. |
| 3 | Deck exhaustion triggers an explicit final round giving every player (including the last drawer) exactly one more turn, no further draws; all three end conditions score correctly | ✓ VERIFIED | `actions.ts:advanceTurn` sets `finalTurnsRemaining = seatIds.length` the instant `deck.length === 0`, decrements it every subsequent turn; `drawCard` refuses to draw once `finalTurnsRemainingBeforeThisTurn !== null`. `endgame.ts:checkHanabiGameEnd` independently checks fuses-exhausted, all-stacks-complete, then final-round-elapsed, in that fixed order, so a completed final stack still ends the game immediately even mid-final-round. Deterministically proven in `termination.property.test.ts`'s second test (drives a real 2-seat game to deck exhaustion, asserts `finalTurnsRemaining === seatIds.length`, then exactly `seatIds.length` further turns with no hand-size growth, ending `"final_round_elapsed"`). |
| 4 | Same-seed determinism; full turn history from turn 1, not yet displayed | ✓ VERIFIED | `deck.ts:dealInitialHands` reuses `shuffle.ts`'s seeded PRNG unchanged (`shuffleWithSeed`/`mintCardId`), proven deep-equal by `adapter.test.ts`'s `createInitialState is deterministic` conformance test (reused for both `forehead-card` and `hanabi`). `history.ts` records every play/discard/clue/draw from turn 1 via `appendHistory` (spread-only, never mutated); draw entries structurally carry only `cardId`, no `suit`/`rank`. No UI or wire schema references history yet (confirmed: `HanabiView` includes `history` but nothing outside `packages/rules` consumes it in this phase). |
| 5 | Engine rejects any request asserting resulting state; zero networking/storage deps, builds/tests in isolation | ✓ VERIFIED | Every request guard in `actions.ts` (`isPlayRequest`/`isDiscardRequest`/`isClueRequest`) uses an exact `keys.length !== N` check, rejecting any payload with an extra key before any field is read. `adapter.test.ts`'s hostile-payload property (`fc.jsonValue()`, 100 runs) proves `applyAction` never throws for arbitrary JSON. `packages/rules/package.json` has no `dependencies` key (`packages/rules purity` test asserts this); a second test scans all hanabi source files for `node:`/`fs`/`partyserver`/`cloudflare:` tokens and finds none. `npm test` (full 4-project suite) and per-package `tsc --noEmit` confirmed independently green in this verification run (424/424 tests, 43 files; tsc clean on apps/web, apps/worker, packages/rules, packages/schema). |

**Score:** 5/5 ROADMAP success criteria verified. All 20 requirement IDs (RULES-01…10,12,13,15…20, HIDE-05, FDN-02) traced to passing test evidence via `03-VALIDATION.md`'s per-task map; no orphaned requirements found in `.planning/REQUIREMENTS.md`'s Phase 3 rows.

### Non-Vacuousness / Property-Test Soundness (specifically requested checks)

- **Legal actions enumerated from exported predicates, not re-implemented:** Confirmed. `test-support.ts:enumerateLegalActions` calls `canPlay`/`canDiscard`/`canClue` from `legality.ts` directly — no private rules copy. Its own header states this explicitly as a hard constraint (T-03-24), and `conservation.property.test.ts` includes a dedicated test proving every enumerated action's matching predicate is legal.
- **Invariants asserted after every step, non-vacuousness asserted:** Confirmed in all four property files (`conservation`, `redaction`, `termination`, plus the deterministic final-round test) — each asserts a `totalSteps`/`seatsChecked`/`gamesEnded` counter `toBeGreaterThan(0)` after the fc.assert block, per D-22/WR-02.
- **Final-round mechanics give the last drawer a turn:** Confirmed by direct code read and by the deterministic test in `termination.property.test.ts` (not just a property — an explicit, seeded, hand-traced scenario asserting `finalTurnsRemaining === seatIds.length` at the exact instant of exhaustion, and exactly that many further turns).
- **Suit counts genuinely config-derived:** Confirmed — grepped for hardcoded `5`/`50`/suit-name literals outside `variant.ts`; none found. `RANKS` (1-5) is the only universal constant reused elsewhere (ranks are NOT variant-sensitive; only suit count/composition is, per RULES-03's own scope), which is correct and matches D-08.

### Required Artifacts

All artifacts declared across the five plans' `must_haves.artifacts` exist, are substantive (no stub bodies, no placeholder returns), and are wired:

| Artifact | Status | Details |
|----------|--------|---------|
| `packages/rules/src/hanabi/variant.ts` | ✓ VERIFIED | `variantConfig`, `handSizeFor`, `maxScoreFor` all present and used everywhere else |
| `packages/rules/src/hanabi/state.ts` | ✓ VERIFIED | Full type vocabulary, readonly state / non-readonly view split |
| `packages/rules/src/hanabi/deck.ts` | ✓ VERIFIED | `buildDeck`/`dealInitialHands`, reuses `shuffle.ts` unmodified |
| `packages/rules/src/hanabi/legality.ts` | ✓ VERIFIED | `canPlay`/`canDiscard`/`canClue`/`cardsTouchedByClue`, typed `Legality` union |
| `packages/rules/src/hanabi/clue-facts.ts` | ✓ VERIFIED | `applyClueToSlotFacts` filters candidates through variant predicates, never direct-assigns |
| `packages/rules/src/hanabi/history.ts` | ✓ VERIFIED | `appendHistory`, append-only, draw entries lack identity |
| `packages/rules/src/hanabi/actions.ts` | ✓ VERIFIED | `applyHanabiAction` + exact-key guards; delegates all legality to `legality.ts` |
| `packages/rules/src/hanabi/endgame.ts` | ✓ VERIFIED | `checkHanabiGameEnd`, `currentScore`, `scoreBand`, fixed evaluation order |
| `packages/rules/src/hanabi/projection.ts` | ✓ VERIFIED | `toHanabiPlayerView`, field-by-field whitelist, fail-closed for unseated viewer |
| `packages/rules/src/hanabi/hanabi-leak-check.ts` | ⚠️ VERIFIED WITH CAVEAT | See Finding 1 below — structurally sound, but excess-count detection has a documented blind spot |
| `packages/rules/src/hanabi/adapter.ts` | ✓ VERIFIED | `hanabiGame`, unmodified 5-member `GameAdapter`, delegates only |
| `packages/rules/src/hanabi/test-support.ts` | ✓ VERIFIED | `enumerateLegalActions`/`locateAllCards`, built from real predicates |
| Four property test files + variant matrix | ✓ VERIFIED | All present, all non-vacuous, all pass |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| `deck.ts` | `shuffle.ts` | `shuffleWithSeed`/`mintCardId` import | ✓ WIRED |
| `deck.ts` | `variant.ts` | `config.suits`/`config.rankCountsFor` | ✓ WIRED |
| `legality.ts` | `variant.ts` | `config.colorClueTouches`/`rankClueTouches` | ✓ WIRED |
| `actions.ts` | `legality.ts` | every refusal via `can(Play\|Discard\|Clue)` | ✓ WIRED |
| `actions.ts` | `clue-facts.ts` | `applyClueToSlotFacts` per slot | ✓ WIRED |
| `hanabi/adapter.ts` | `projection.ts` | `toPlayerView` delegates to `toHanabiPlayerView` | ✓ WIRED |
| `index.ts` | `hanabi/adapter.ts` | `export { hanabiGame }` | ✓ WIRED |
| `adapter.test.ts` | `hanabi/adapter.ts` | second `describeAdapterConformance("hanabi", ...)` call | ✓ WIRED |
| `redaction.property.test.ts` | `hanabi-leak-check.ts` | `checkHanabiViewForLeaks` reused from real projections | ✓ WIRED |
| `test-support.ts` | `legality.ts` | `enumerateLegalActions` built from `can*` predicates only | ✓ WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full 4-project suite green | `npm test` | 424/424 passed, 43 files | ✓ PASS |
| Type safety across all packages | `tsc --noEmit` in `apps/web`, `apps/worker`, `packages/rules`, `packages/schema` | clean, no errors, all four | ✓ PASS |
| Zero runtime deps in `packages/rules` | `cat packages/rules/package.json` | no `dependencies` key | ✓ PASS |
| Deck sizes match spec exactly | `variant-matrix.test.ts` | base 50, rainbow 60, black 55 | ✓ PASS |

### Requirements Coverage

All 20 requirement IDs for this phase (RULES-01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 12, 13, 15, 16, 17, 18, 19, 20, HIDE-05, FDN-02) are declared across the five plans' `requirements:` frontmatter and map 1:1 to passing tests per `03-VALIDATION.md`'s per-task table. REQUIREMENTS.md correctly lists them "Pending" (checkbox convention, not evidence of gap — confirmed per orchestrator note and cross-checked against actual code, which satisfies every one). No orphaned requirements found. RULES-11 (Phase 6) and RULES-14 (Phase 7) are correctly out of scope and not claimed by any Phase 3 plan.

### Anti-Patterns Found

None. Grepped all 24 `packages/rules/src/hanabi/*.ts` files for `TODO|FIXME|TBD|XXX|HACK|PLACEHOLDER|placeholder|not yet implemented|coming soon` — zero matches. No `return null`/`return {}`/hardcoded-empty stub patterns found in the reviewed production files (variant.ts, deck.ts, legality.ts, actions.ts, endgame.ts, projection.ts, hanabi-leak-check.ts, clue-facts.ts, history.ts, adapter.ts, test-support.ts).

### Finding 1 (WARNING, non-blocking): leak-checker excess-count detection has a one-occurrence blind spot for successfully-played cards

> **RESOLVED 2026-09-16 in commit `65b6dd6`** (orchestrator, before Phase 3 was closed).
> The recommended fix in this finding was applied: the redundant per-rank `stacks`
> bump was removed from `secretsForHanabiSeat`, leaving the `history` loop as the
> single source of the allowance. "Canary I" in `hanabi-leak-check.test.ts` now
> covers exactly the scenario reproduced below, and fault injection confirmed it
> fails against the old behavior and passes against the fix. The code review reached
> the same conclusion independently and rated it Critical — see `03-REVIEW.md` CR-01.
> This finding is recorded as-written for the audit trail; no follow-up work remains.

The orchestrator specifically asked this verification to check whether Plan 03-05's "fix" to the leak checker's identity-counting (closing a false positive around a played card's identity legitimately appearing in both the discard/stack and its history entry) weakened real leak detection. **It did, in one specific, reproducible case.**

`secretsForHanabiSeat` (`hanabi-leak-check.ts`) bumps a played/discarded card's `{suit,rank}` allowed-count **twice** for every successfully completed stack rank: once from the `stacks` loop (`for (let rank = 1; rank <= stack.topRank; rank++) bump(stack.suit, rank)`) and once from the `history` loop (`if (entry.type === "play" ...) bump(entry.suit, entry.rank)`). But the real `toHanabiPlayerView` output only ever exposes that identity **once** for a successfully-played card — the `stacks` view field is `{ suit, topRank }` with no per-card `rank` key, so the only place a completed stack's played-card identity appears in the actual view is its `history` "play" entry.

I verified this by driving a real game via the production `hanabiGame` adapter to a genuine successful play (via a throwaway test file, removed after verification), then injecting exactly one extra occurrence of that already-public identity into the view under a benign debug key. The generalized leak checker (`checkHanabiViewForLeaks`) reported **zero reasons** — the injected duplicate went undetected, because `allowedIdentityCounts` for that key was 2 (from the double bump) while the real+injected count was only 2 as well (1 legitimate + 1 injected), never exceeding the inflated allowance. A genuine third occurrence would be required to trip the check.

This is a real, demonstrated weakening of the typed excess-count detection layer, but it does **not** indicate an actual leak in the shipped engine, because:
- The primary defense — `projection.ts`'s field-by-field whitelist construction (D-07) — was independently read and confirmed sound: a viewer's own-hand card literal never mentions `suit`/`rank` at all, so there is nothing for the identity-count layer to catch in the normal code path.
- The structural checks in `hanabi-leak-check.ts` (own-hand-has-identity, hidden-card-has-identity, own-id-has-identity) are unaffected by this bug and remain fully sound — they would catch the far more common leak shape (a card appearing under `yourHand` or an unmasked `hidden: true` entry).
- No canary test or property test in the current suite exercises a post-play/post-discard state, so this blind spot exists un-triggered by the current suite (which is precisely how it went unnoticed).

**Recommendation (non-blocking for Phase 3, worth a follow-up task before this checker is relied on more heavily in Phase 4/6):** bump the allowed count once per distinct legitimate view field that repeats an identity, not once per source-state location — e.g. only bump from `history` entries (which are the sole field carrying the played/discarded card's `{suit,rank}` in the real view) and drop the redundant `stacks`-loop bump, or make the stack-derived bump conditional on whatever future view field might expose per-card stack identity.

This looks like an unintentional side effect of the false-positive fix, not a deliberate scope decision, so no override is suggested — it is recommended as a follow-up hardening task rather than a phase-blocking gap, since the actual redaction guarantee (the goal-level truth) is not currently violated by any code this phase shipped.

### Human Verification Required

None. This phase is a pure, network-free package with no UI and no runnable service surface — every claim in `03-VALIDATION.md` is automatable and was automated.

### Gaps Summary

No blocking gaps. All five ROADMAP success criteria and all 20 requirement IDs are backed by passing, non-vacuous, independently-re-run tests (424/424) and by direct reading of the production code paths that implement them. One non-blocking WARNING (Finding 1 above) is documented for follow-up: a narrow, demonstrated blind spot in the auxiliary leak-checker's excess-count detection for successfully-played cards, which does not currently correspond to an actual leak in the shipped engine (the enforcement mechanism, `projection.ts`, is independently verified sound by direct code inspection).

---

*Verified: 2026-09-15*
*Verifier: Claude (gsd-verifier)*

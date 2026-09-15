# Phase 3: Hanabi Rules Engine - Research

**Researched:** 2026-09-15
**Domain:** Cooperative card-game rules engine (pure TypeScript, network-free), property-based testing of game invariants
**Confidence:** HIGH on rules/deck/token mechanics (cross-verified against multiple primary sources); MEDIUM on score-band wording and PRNG risk sizing; HIGH on code patterns (directly extends Phase 1/2's proven, reviewed code)

## Summary

Phase 3 is a pure-logic phase: no new runtime dependencies, no new packages to install, no networking. Everything needed already exists in the repo (`fast-check` 4.9.0, `vitest` 4.1.11, both exact-pinned at the workspace root) or is training/verified Hanabi domain knowledge. The engineering risk is not "what library to use" — it is getting the rules exactly right (final-round semantics, the 8-clue-token discard/bonus-forfeit interaction, and Rainbow/Black deck composition) and reusing Phase 1/2's proven patterns (`GameAdapter`, whitelist `toPlayerView`, opaque `shuffle.ts` ids, the leak-checker family) without regressing any of them.

All CONTEXT.md decisions (D-01 through D-22) already encode the correct answers to the rules questions this research was asked to verify — the CONTEXT session got the rules right. This document's job is to independently confirm those decisions against primary sources (so the planner is not relying on the same unverified pass twice), flag the two places official sources genuinely need a project-specific choice (score bands above 25, PRNG residual risk), and give the planner concrete, checkable specifications for deck composition, clue-fact shape, the generalized leak checker, and property-test design.

**Primary recommendation:** Build `packages/rules/src/hanabi/` as a second `GameAdapter` beside `forehead-card.ts`, following its exact structural conventions (whitelist `toPlayerView`, exact-key request guards, non-mutating transitions, `shuffle.ts` reuse), parametrize deck/clue-touch through one `VariantConfig` object, and drive correctness primarily through the four fast-check invariants named in D-20 rather than a large example-test matrix.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Engine shape and package layout**
- D-01: Second `GameAdapter<HanabiState, HanabiAction>` in `packages/rules`, own `hanabi/` subdirectory (deck, variant config, clue logic, turn application, endgame/scoring, projection). Zero runtime dependencies (FDN-02); imports nothing from `@games/schema`, `apps/worker`, or `apps/web`.
- D-02: The forehead-card toy, its leak checker, and its tests **stay** in this phase (deleted in Phase 4). Full suite stays green throughout.
- D-03: `GameAdapter` interface is **not reshaped**. `AdapterError` union may widen; the five-member interface does not change.

**Cards, hands and hidden state**
- D-04: Card is `{ id, suit, rank }`. `id` is an opaque minted id via `shuffle.ts`'s `mintCardId`, never a deck index or anything derivable from deck composition. Stable for the card's life.
- D-05: Hand is an **ordered list of slots**; a drawn card goes to a defined end, remaining cards keep order. Slot order is rules, not UI.
- D-06: Engine stores, per card in hand, **accumulated clue facts** (positive identification + ruled-out suits/ranks). Engine state, not UI state, not derived later from history.
- D-07: `toPlayerView` follows Phase 2 D-05's whitelist-construction rule verbatim: field-by-field literals, no spread/`delete`/`Object.assign`/omit. A card in the viewer's own hand structurally lacks `suit`/`rank` — carries id + clue facts only. Other seats' hands carry full identity. Public state (stacks, discard, tokens, deck count) identical for every seat.

**Variant parametrization**
- D-08: A single `VariantConfig` is the only source of suit count and deck composition (RULES-03). Base = 5 suits; Rainbow = 6 (6th touched by every color clue); Black = 6 (6th holds one copy of each rank).
- D-09: Clue-touch is a function of the variant config — one predicate parametrized by config, not per-call-site special cases.
- D-10: Every rules test runs against **all three variants** where the rule is variant-sensitive.

**Actions, legality and hostile input**
- D-11: Actions name a card **by id**: `{ type: "play", cardId }`, `{ type: "discard", cardId }`, `{ type: "clue", targetSeatId, clue: { type: "color" | "rank", value } }`.
- D-12: HIDE-05 enforced via exact-own-key guards (toy's pattern). A play/discard naming a card not in the actor's own hand is rejected.
- D-13: Illegal actions rejected with **specific, typed reasons**. Legality checks are exported as **pure predicates**, separate from `applyAction`.

**Endgame, tokens and scoring**
- D-14: Final round is an **explicit counter in state**, set when the deck empties, decremented per turn, no draws during it. Never inferred from deck size at render time.
- D-15: All three end conditions handled: third fuse lost, all stacks complete, final round elapsed. A completed final stack ends the game **immediately** at the perfect score (even mid-final-round).
- D-16: Token rules: clue costs one, discard returns one, completing a stack with a 5 returns one **unless already at 8** (bonus forfeit). Count never leaves 0…8.
- D-17: Scoring returns numeric score **and its descriptive band** from the engine, not the UI.

**Determinism, history and test strategy**
- D-18: Shuffling reuses `shuffle.ts`'s seeded PRNG with a named stream. Seed stays server-only, excluded from every view.
- D-19: Turn history recorded from turn 1, **public facts only**. A draw is recorded by card id with **no identity** — history can never reveal a card its holder should not see.
- D-20: fast-check covers: token conservation (clues 0…8, fuses 0…3), card conservation (every card in exactly one place), redaction (no seat's view contains its own cards' identities), termination (random-legal-action-driven game always ends). Example tests carry specific rules.
- D-21: Leak checker **generalized** before reuse (closes WR-03): must compare structurally and by typed identity (own-hand entries lack `suit`/`rank` keys; no own card's `{suit, rank}` pair appears anywhere in the view), not by scanning for a bare number.
- D-22: Canary discipline carries over — Hanabi leak checker gets its own deliberately-leaky-projection suite. Any assertion loop guarded by a condition must also assert it ran at least once (closes WR-02).

### Claude's Discretion
- File/module split inside `packages/rules/src/hanabi/` and exported type naming.
- Exact `HanabiState` field names; whether clue facts are sets, bitmasks, or arrays.
- Score band thresholds and wording, following the standard published Hanabi bands.
- fast-check run counts and generator design.
- Whether legality predicates live in one module or beside each action.
- Whether `AdapterError` gains members or Hanabi refusals ride in a payload alongside the existing union.

### Deferred Ideas (OUT OF SCOPE)
- Swapping the worker onto the Hanabi adapter and deleting the toy — Phase 4.
- Strict Zod view schema for the Hanabi view (`packages/schema/src/games/hanabi.ts`) — Phase 4.
- Rainbow/Black enabled end to end as a product feature — Phase 7. (Engine is parametrized and tested for all three *here*.)
- Turn-history UI, replay, clue log — v2 (QOL-01); history recorded but never displayed in v1.
- Hardening the PRNG against internal-state recovery (WR-01) — sized in this research (see Common Pitfalls and Assumptions Log); this is the cheapest moment to change it if the decision is revisited, but D-18 already locks "reuse `shuffle.ts`."

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RULES-01 | Hand sizes: 5 for 2-3p, 4 for 4-5p | Confirmed against official rulebook and hanab.live docs (HIGH); no variant in scope alters hand size — see Standard Stack / Deck Composition |
| RULES-02 | Deck per variant: 3×1, 2×2/3/4, 1×5 per suit; Black = single copy per rank | Confirmed counts and totals for all three variants — see Deck Composition table |
| RULES-03 | Suit count derived from variant config, never hardcoded | D-08/D-09 pattern — see Architecture Patterns, `VariantConfig` design |
| RULES-04 | Play a card from hand on turn | See Code Examples: `applyAction` play branch |
| RULES-05 | Discard a card, regain a clue token | See Common Pitfalls (discard-at-8 is illegal, not no-op) |
| RULES-06 | Clue names exactly one color or rank to exactly one other player, spends a token | See Architecture Patterns: clue-touch predicate |
| RULES-07 | Clue indicates every matching card and no others | Same predicate; property test covers exhaustiveness (D-20 redaction/conservation adjacent) |
| RULES-08 | Clue touching zero cards is rejected | Confirmed universal official rule (HIGH) — see Common Pitfalls |
| RULES-09 | No clue at zero clue tokens | See legality predicates (D-13) |
| RULES-10 | No discard at 8 clue tokens | Confirmed: **illegal**, not a no-op — see Common Pitfalls |
| RULES-12 | Misplay loses a fuse, card to discard pile | See Code Examples |
| RULES-13 | Completing a stack with a 5 refunds a token unless at 8 (forfeit) | Confirmed official rule — see Common Pitfalls |
| RULES-15 | Final round: explicit counter, everyone including last-drawer gets one more turn | Confirmed against primary rulebook + hanab.live (HIGH) — see Summary point 1 |
| RULES-16 | No draws during final round | Same source |
| RULES-17 | Three end conditions, scored correctly | See End Conditions subsection |
| RULES-18 | Score + descriptive band | Score bands sourced with MEDIUM confidence, wording varies by publisher — see Score Bands subsection and Assumptions Log |
| RULES-19 | Deterministic seeded shuffle | `shuffle.ts` reuse, already proven in Phase 2 — see PRNG Hardening subsection |
| RULES-20 | Turn history from turn 1, public facts only | See Turn History Shape subsection |
| HIDE-05 | Reject action payloads that assert state | Reuses Phase 2's exact-own-key guard pattern (D-12) — see Code Examples |
| FDN-02 | Pure package, zero networking/storage deps, testable in isolation | Confirmed: no new dependencies needed this phase — see Package Legitimacy Audit |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Deck construction & shuffle | Rules engine (pure package) | — | Deterministic, seed-driven, no I/O — belongs entirely in `packages/rules` per FDN-02 |
| Turn/action legality (play, discard, clue) | Rules engine | — | Server-authoritative; must be callable as pure predicates so Phase 6 UI can query legality without side effects (D-13) |
| Clue-touch resolution (which cards a clue highlights) | Rules engine | — | Variant-parametrized pure function (D-09); no networking or rendering concern |
| Per-seat view projection (`toPlayerView`) | Rules engine | — | The adapter's only exit point; Phase 4 wires it to the wire chokepoint but computes nothing itself |
| Token/fuse bookkeeping | Rules engine | — | Pure state transitions |
| Final-round / end-condition detection | Rules engine | — | `checkGameEnd` is a pure function over state |
| Turn history recording | Rules engine | — | Recorded as state; no interface renders it in v1, but the *shape* must already be view-safe |
| Wire delivery of the projected view | (Phase 4) Backend/DO | — | Out of scope this phase — engine returns `unknown`, Phase 4 sends it |
| Strict Zod validation of the view | (Phase 4) Backend/DO | — | `packages/schema` adds `hanabi.ts` in Phase 4, not here |

## Standard Stack

### Core
No new runtime libraries. This phase adds zero dependencies to `packages/rules` (FDN-02 requires this).

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none — pure TypeScript) | — | Rules engine implementation | FDN-02 mandates zero runtime dependencies; Phase 1/2 already proved this is sufficient for a full adapter + shuffle + leak-check stack |

### Supporting (already installed, dev-only, exact-pinned at workspace root)
| Library | Version (installed) | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fast-check` | 4.9.0 `[VERIFIED: npm registry, exact match to package.json]` | Property-based invariant tests (D-20) | Token/card conservation, redaction, termination properties |
| `vitest` | 4.1.11 `[VERIFIED: npm registry, exact match to package.json]` | Test runner, `rules` project (network-free) | All example and property tests for `hanabi/` |

**Version verification:** `npm view fast-check version` returned `4.10.1` as latest; the repo's exact pin is `4.9.0`, already installed and working through Phase 1/2. `npm view vitest version` returned `5.0.1` latest; repo pins `4.1.11`. **Do not bump either for this phase** — upgrading test tooling is out of scope for a pure rules-engine phase and would touch the shared root `package.json` affecting all four Vitest projects. If a bump is ever wanted, it is a cross-cutting change belonging to its own task, not bundled into Phase 3.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fast-check's plain `fc.property` generators (arbitrary legal-action sequences) | fast-check's model-based/`fc.commands` API | `fc.commands` is the more "official" pattern for stateful systems, but it requires modeling a simplified shadow state that mirrors the SUT — extra machinery for a case where the four named invariants (D-20) are naturally expressed as plain properties over a real reducer. Recommend plain `fc.property` with a legal-action generator; reconsider `fc.commands` only if the test suite grows unwieldy. |
| Storing clue facts as boolean sets per suit/rank | Storing them as a bitmask (`number`) | A `Set<Suit>`/`Set<Rank>` (or plain array) is far more debuggable and directly serializable for Phase 6's later strict schema; bitmasks buy a marginal memory/perf win irrelevant at 2-5 seats and ~50 cards. Recommend sets/arrays (Claude's Discretion per CONTEXT). |

## Package Legitimacy Audit

**Not applicable this phase.** No new packages are installed. `packages/rules` remains zero-runtime-dependency (FDN-02), and the two dev tools used (`fast-check` 4.9.0, `vitest` 4.1.11) are already installed, exact-pinned, and were audited when introduced in Phase 1/2. No `slopcheck`/registry verification is needed because no `npm install` occurs in this phase's plan.

**Packages removed due to slopcheck [SLOP] verdict:** none (N/A — no installs)
**Packages flagged as suspicious [SUS]:** none (N/A — no installs)

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │   packages/rules/src/hanabi/ (Phase 3)   │
                    │                                           │
 seed, seatIds,     │  ┌─────────────┐    ┌──────────────────┐ │
 variant  ────────► │  │ deck.ts     │───►│ createInitialState│ │
                    │  │ (VariantCfg)│    │ (adapter method)  │ │
                    │  └─────────────┘    └────────┬──────────┘ │
                    │                               │            │
                    │                               ▼            │
 unknown request,   │                     ┌──────────────────┐  │
 actorSeatId ─────► │  ┌───────────────┐  │  HanabiState      │  │
                    │  │ legality.ts   │─►│  (hands, stacks,  │  │
                    │  │ (pure         │  │   tokens, fuses,  │  │
                    │  │  predicates)  │  │   finalRound?,    │  │
                    │  └───────┬───────┘  │   history, seed-  │  │
                    │          │          │   free)           │  │
                    │          ▼          └────────┬──────────┘  │
                    │  ┌───────────────┐            │             │
                    │  │ actions.ts    │◄───────────┘             │
                    │  │ (applyAction: │                          │
                    │  │  play/discard/│───► new HanabiState      │
                    │  │  clue)        │      (non-mutating)      │
                    │  └───────┬───────┘                          │
                    │          │                                  │
                    │          ▼                                  │
                    │  ┌───────────────┐   ┌───────────────────┐ │
                    │  │ endgame.ts    │   │ projection.ts      │ │
                    │  │ checkGameEnd  │   │ toPlayerView(state, │►─ unknown view (per seat)
                    │  │ (score+band)  │   │   seatId) whitelist │ │  (Phase 4 sends it — out
                    │  └───────────────┘   └───────────────────┘ │   of scope this phase)
                    └─────────────────────────────────────────────┘
                                     ▲
                                     │ reused, not modified
                    ┌────────────────┴────────────────┐
                    │ shuffle.ts (Phase 2): seedToRngState,│
                    │ shuffleWithSeed, mintCardId          │
                    └───────────────────────────────────────┘
```

Trace the primary use case: a `{type:"play", cardId}` request enters `applyAction` → `legality.ts` checks whose turn it is and whether `cardId` is in the actor's own hand → on success, `actions.ts` mutates a fresh `HanabiState` (fuse loss or stack advance, token refund logic) → `endgame.ts` is checked by the caller (Phase 4, not this phase) via `checkGameEnd` → `projection.ts`'s `toPlayerView` is the only function that ever turns `HanabiState` into something a client could receive.

### Recommended Project Structure
```
packages/rules/src/hanabi/
├── variant.ts           # VariantConfig type + BASE/RAINBOW/BLACK configs, suit list, clue-touch predicate
├── deck.ts              # buildDeck(variant), hand-size lookup
├── state.ts             # HanabiState, HanabiAction, HanabiCard, ClueFacts type definitions
├── legality.ts          # pure predicates: canPlay, canDiscard, canClue, isYourTurn, etc.
├── actions.ts           # applyAction implementation (play/discard/clue branches), token/fuse math
├── endgame.ts           # checkGameEnd: three end conditions, score + band
├── projection.ts        # toPlayerView: whitelist construction, own-hand redaction
├── history.ts           # turn-history entry shape + append helper
├── adapter.ts           # hanabiGame: GameAdapter<HanabiState, HanabiAction> — composes the above
├── hanabi-leak-check.ts # D-21 generalized leak checker (structural + typed-identity, not string-scan)
└── (co-located *.test.ts / *.property.test.ts per module, mirroring forehead-card's layout)
```

### Pattern 1: `VariantConfig` as the single source of suit/deck truth (D-08, D-09)
**What:** One object per variant carrying suit list, per-suit rank-count table, and the clue-touch predicate.
**When to use:** Every place that currently would hardcode "5 suits" or "a color clue touches cards of that exact suit."
**Example:**
```typescript
// Illustrative shape, not prescriptive of exact field names (Claude's Discretion)
export type Suit = "red" | "yellow" | "green" | "blue" | "white" | "rainbow" | "black";

export interface VariantConfig {
  readonly suits: readonly Suit[];               // 5 for base, 6 for rainbow/black
  readonly rankCounts: Readonly<Record<number, number>>; // {1:3, 2:2, 3:2, 4:2, 5:1}
  readonly perSuitCardCount: (suit: Suit) => number;      // 10 for normal/rainbow suits, 5 for black
  readonly colorCluesTouch: (suit: Suit, clueColor: string) => boolean;
  readonly rankCluesTouch: (suit: Suit, clueRank: number) => boolean; // always rank === clueRank
  readonly cluableColors: readonly string[];      // excludes "black"/"rainbow" as a nameable color (RULES-14, Phase 7-enabled but must not restructure)
}
```
Rainbow: `colorCluesTouch` returns true for the rainbow suit regardless of which color was named (every color clue touches it), and `cluableColors` never includes "rainbow" as a value. Black: `colorCluesTouch` behaves like any normal suit (only its own exact color, if it has one — see Deck Composition note below on whether Black is itself a colored suit or colorless); `perSuitCardCount` returns 5 instead of 10 and `rankCounts` for that suit is `{1:1,2:1,3:1,4:1,5:1}`.

### Pattern 2: Actions named by card id, resolved through the actor's own hand only (D-11, D-12, HIDE-05)
**What:** `applyAction` never trusts a hand index from the client; it looks up `cardId` inside the actor's own hand slots and rejects if absent.
**When to use:** Every mutating action (play, discard). Clue actions instead validate `targetSeatId !== actorSeatId` and that the clue touches ≥1 card in the target's hand.
**Example:**
```typescript
// Source: adapted from packages/rules/src/forehead-card.ts's isGuessRequest pattern
function isPlayRequest(request: unknown): request is { type: "play"; cardId: string } {
  if (typeof request !== "object" || request === null) return false;
  const keys = Object.keys(request);
  if (keys.length !== 2 || !keys.includes("type") || !keys.includes("cardId")) return false;
  const r = request as { type: unknown; cardId: unknown };
  return r.type === "play" && typeof r.cardId === "string";
}
```
This is the same exact-own-key discipline `forehead-card.ts`'s `isGuessRequest` already uses — reuse the pattern, not the code (Hanabi's request shapes differ).

### Pattern 3: Clue facts accumulate both positive and negative information (D-06)
**What:** Per card in a hand, track what has been *confirmed* and what has been *ruled out*, independently for suit and rank.
**When to use:** Every time a clue is given, every card in the target's hand gets an update — touched cards gain a positive fact (and, if the clue is a color clue, every *other* suit becomes ruled out for that card, unless Rainbow's every-color-touches rule makes that inference invalid — see Common Pitfalls), untouched cards gain a negative fact for the named color/rank.
**Recommended data shape:**
```typescript
export interface ClueFacts {
  // Positive: definitely one of these remaining suits, narrowed as clues land.
  // Starts as "all suits in the variant" and narrows via elimination.
  readonly possibleSuits: ReadonlySet<Suit>;
  readonly possibleRanks: ReadonlySet<number>;
  // Direct history of what was said about this card, for UI-05's "confirmed" vs "ruled out" split in Phase 6.
  readonly positiveClues: readonly { readonly type: "color" | "rank"; readonly value: Suit | number }[];
  readonly negativeClues: readonly { readonly type: "color" | "rank"; readonly value: Suit | number }[];
}
```
`possibleSuits`/`possibleRanks` are the *narrowed candidate set*, derived by intersecting: start with all suits/ranks, remove any suit/rank named by a negative clue (for rank clues, remove the ranks that would NOT match; for color clues, remove suits not matching), and — for a positive clue — intersect down to only the suits/ranks consistent with the clue. **Rainbow inference caveat (see Pitfall below):** a negative color clue (this card was *not* touched by a "red" clue) normally rules out the red suit for that card, but it does **not** rule out the rainbow suit only if rainbow cards are touched by *every* color — actually the reverse: since rainbow is touched by every color clue, a card **not** touched by a color clue can never be rainbow, so a negative color clue *does* rule out rainbow (stronger elimination than in base). Conversely, a positive color clue narrows to exactly one candidate for non-rainbow suits, but for a card confirmed by a color clue, it could be either that exact suit OR the rainbow suit (since rainbow also matches). This ambiguity is real, documented Hanabi behavior — the engine must preserve it (candidate set may contain 2 entries after a single color clue in Rainbow-enabled games), not collapse it prematurely. Encode this in `colorCluesTouch`/`possibleSuits`-derivation logic and cover it with a variant-specific property/example test (D-10).

### Anti-Patterns to Avoid
- **Hardcoding 5 suits or a 50-card deck anywhere:** Every place that needs suit count or deck size must read it from `VariantConfig`, per RULES-03/D-08. A single `SUITS.length` literal outside `variant.ts` is a smell.
- **Deriving the final-round counter from `deck.length === 0` at render/view time (D-14):** Store it as explicit state (`finalTurnsRemaining: number | null`) set exactly once, decremented once per turn, never recomputed from deck size — recomputing invites an off-by-one on the exact turn the deck empties.
- **Special-casing Rainbow/Black at each call site instead of through the `VariantConfig` predicate (D-09):** e.g. `if (variant === "rainbow" && suit === "rainbow") { ... }` scattered through `actions.ts`/`legality.ts` is exactly the restructuring Phase 7 is supposed to avoid needing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Deterministic shuffling / opaque card ids | A new PRNG or id scheme for Hanabi | Reuse `packages/rules/src/shuffle.ts` (`seedToRngState`, `shuffleWithSeed`, `mintCardId`) with a Hanabi-specific stream name (e.g. `"hanabi-deck"`, `"hanabi-card-ids"`) | Already built, reviewed, and proven correct in Phase 2; D-18 explicitly requires reuse. Building a second shuffle implementation would fork the exact 128-bit-state reasoning documented in `shuffle.ts`'s header. |
| Leak detection for own-hand identity | A brand-new from-scratch checker | Generalize `forehead-card-leak-check.ts`'s pattern (structural `in`-operator walking + typed-identity comparison), per D-21 | The existing checker's *architecture* (walk view, compare against `secretsForSeat`) is sound; only its detection method (string substring scan) needs generalizing for numeric ranks. Rewriting from scratch would lose the Phase 2 review's hard-won lessons (WR-02's non-vacuousness requirement, D-13's canary discipline). |
| Adapter conformance testing | A new conformance suite for the Hanabi adapter | Reuse `describeAdapterConformance` from `packages/rules/src/adapter.test.ts`, which is explicitly documented as reusable across Phase 2 and Phase 4(and by extension Phase 3) adapters | It already asserts non-mutation, purity, and hostile-input non-throwing generically over any `GameAdapter`. |

**Key insight:** This phase's "don't hand-roll" list is almost entirely about *not rebuilding infrastructure Phase 1/2 already built and proved*, not about avoiding third-party libraries (there are none to avoid — the package is dependency-free by design).

## Common Pitfalls

### Pitfall 1: Treating "discard at 8 clue tokens" as a no-op instead of illegal
**What goes wrong:** An engine that silently ignores a discard request at 8 tokens (rather than rejecting it with a typed reason) breaks RULES-10 and gives the UI (Phase 6) no signal to disable the button, and gives Phase 4's worker no `AdapterError` to map to a wire refusal.
**Why it happens:** "The bonus is forfeit at 8" (RULES-13, for playing a 5) is easy to conflate with "discarding at 8 is also just capped/forfeit" — they are different rules governing different actions.
**How to avoid:** `legality.ts`'s `canDiscard` predicate must return `false` at `clueTokens === 8`, and `applyAction`'s discard branch must return `{ ok: false, error: ... }`, never silently succeed with no token change.
**Warning signs:** A test that discards at 8 tokens and asserts `clueTokens` stays 8 (rather than asserting the action was *rejected*) would pass even with the no-op-instead-of-illegal bug — write the test to assert rejection explicitly.

### Pitfall 2: Zero-touch clues silently allowed for one clue type but not the other
**What goes wrong:** RULES-08 requires rejecting *any* clue (color or rank) that touches zero cards. It is easy to correctly reject a zero-touch color clue but forget the symmetric check for rank clues, or vice versa, especially once Rainbow's "touched by every color" rule is layered in (a color clue can never be zero-touch-for-rainbow-alone, but could still be zero-touch overall if no card in hand matches).
**How to avoid:** Implement one shared "does this clue touch ≥1 card" check inside the single clue-touch predicate (D-09), called identically for both clue types, and cover both types explicitly in D-10's per-variant test matrix.
**Warning signs:** Two near-duplicate legality functions (`canClueColor`/`canClueRank`) instead of one predicate parametrized by clue type.

### Pitfall 3: Rainbow negative-clue inference collapsing candidate sets incorrectly
**What goes wrong:** As detailed in Architecture Patterns Pattern 3, a positive color clue in a Rainbow-enabled game does **not** narrow a card's candidate suit down to exactly one — it must remain "this suit OR rainbow" since rainbow is also touched. An engine that assumes "a positive color clue = exactly one candidate suit" will produce wrong `possibleSuits` in the accumulated clue facts once Rainbow is enabled, which is a **silent** UI-05 correctness bug in Phase 6, not something `applyAction`'s legality checks would ever catch.
**Why it happens:** Base-game Hanabi's clue semantics are 1:1 (a color clue → exactly one candidate suit); this stops being true the moment a variant's clue-touch predicate is not injective.
**How to avoid:** Derive `possibleSuits` generically from the predicate (`possibleSuits = allSuits.filter(s => variant.colorCluesTouch(s, clue.value) === wasTouched)`), never by a hardcoded "assign exactly this suit" shortcut. Cover with a Rainbow-specific example test per D-10.
**Warning signs:** Code that does `card.suit = clue.value` or similarly treats a color clue as fully resolving identity.

### Pitfall 4: Final-round / all-stacks-complete race
**What goes wrong:** RULES-15/16/17 (D-14/D-15) require that completing all stacks ends the game **immediately**, even in the middle of an already-started final round, rather than waiting for `finalTurnsRemaining` to reach zero. An engine that only checks "did fuses hit 3" and "did `finalTurnsRemaining` hit 0" but not "are all stacks now complete" after every successful play will let extra dead turns happen after a perfect score is already achieved.
**How to avoid:** `checkGameEnd` must check all three conditions independently on every call, in a fixed priority order (fuses lost > all stacks complete > final round elapsed, or document whichever order is chosen), not as an either/or chain gated by whether a final round has started.
**Warning signs:** A test that only exercises "deck empties → final round → elapses → game ends" without ever completing all stacks mid-final-round.

### Pitfall 5: sfc32/128-bit-state PRNG output-recovery risk carrying into the real engine unexamined (WR-01)
**What goes wrong:** Phase 2's code review (WR-01) flagged that `shuffle.ts`'s header only defends against *seed brute-force*, not *internal-state recovery from observed raw PRNG outputs* — a real weakness class for small-state non-cryptographic PRNGs like sfc32. In the toy game this was low-stakes and the toy is deleted; in the real Hanabi engine, D-18 locks in reusing `shuffle.ts` unchanged, so this residual risk now applies to the shipped game, not just a throwaway toy.
**Why it happens:** The original 128-bit-state design decision was made to defend against one specific attack (seed brute-force) and the reuse decision (D-18) did not re-examine whether the *threat model* changed between "toy game, deleted next phase" and "real game, played by friends indefinitely."
**How to avoid — sizing the actual risk for this project's threat model:** The attacker model here is a cooperating friend on a voice call who could, in principle, inspect their own client's WebSocket traffic and see up to ~40 of the ~50 dealt/played cards over a full game (everyone else's hands plus the discard pile and played stacks — never their own hand, by construction). Recovering sfc32's 128-bit internal state from raw PRNG outputs is a nontrivial cryptanalytic exercise even with many observed outputs, and — critically — **card values are never emitted as raw PRNG outputs**: `shuffleWithSeed`'s Fisher-Yates swaps consume PRNG draws only to compute swap indices, and the *visible* effect (the resulting permutation) is a many-to-one, information-lossy function of the underlying PRNG stream, not the raw output itself. Recovering usable future predictions (e.g., "what is the next card in my own hand going to be, before it's dealt") from observed *shuffle results* rather than raw outputs is a substantially harder attack than the "raw output" framing in WR-01 suggests. Combined with the fact that this is a cooperative game among consenting friends (there is no adversarial incentive to "cheat" at Hanabi — doing so defeats the entire point of playing), this residual risk is **assessed as low-priority for this project** and recommended to be **explicitly accepted, not engineered around**, in this phase.
**Recommendation:** Keep `shuffle.ts` as-is (do not swap PRNGs). Add one sentence to the Hanabi engine's `deck.ts` header explicitly recording this decision: shuffle security is scoped against seed brute-force (128-bit state matches the 128-bit seed secret) and is *not* hardened against theoretical PRNG-state-recovery attacks, which is an accepted residual risk for a cooperative game with no adversarial incentive to exploit it. This closes WR-01 by documentation rather than by re-engineering, consistent with the review's option (a). **This is tagged `[ASSUMED]`** — the "no adversarial incentive" reasoning is a threat-model judgment call, not a verified fact, and should be confirmed by the project owner during planning/discuss-phase rather than silently accepted.
**Warning signs:** If this project's audience ever expands beyond a trusted friend group (e.g., public rooms), this assumption must be revisited before that expansion ships.

## Code Examples

### Deck construction, variant-parametrized (RULES-01, RULES-02, RULES-03)
```typescript
// Source: derived from official Hanabi rulebook (cdn.1j1ju.com/medias/b3/a9/0e-hanabi-rulebook.pdf)
// and Hanabi-Live/hanabi-live docs/variants.md, cross-verified 2026-09-15
const BASE_RANK_COUNTS: Readonly<Record<number, number>> = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 1 }; // 10 cards/suit
const BLACK_RANK_COUNTS: Readonly<Record<number, number>> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }; // 5 cards, single-copy suit

// Base: 5 suits x 10 = 50 cards. Max score 25.
// Rainbow: 6 suits (5 base + rainbow, itself a full 10-card suit) = 60 cards. Max score 30.
// Black: 6 suits (5 base + black, single-copy-per-rank) = 55 cards. Max score 30.
function handSize(playerCount: number): number {
  return playerCount <= 3 ? 5 : 4; // RULES-01, confirmed no box variant alters this
}
```

### Exact-own-key request guard, extended for Hanabi's three action shapes (HIDE-05, D-11, D-12)
```typescript
// Source: pattern from packages/rules/src/forehead-card.ts's isGuessRequest
function isClueRequest(
  request: unknown,
): request is { type: "clue"; targetSeatId: string; clue: { type: "color" | "rank"; value: string | number } } {
  if (typeof request !== "object" || request === null) return false;
  const keys = Object.keys(request);
  if (keys.length !== 3 || !keys.includes("type") || !keys.includes("targetSeatId") || !keys.includes("clue")) {
    return false;
  }
  const r = request as { type: unknown; targetSeatId: unknown; clue: unknown };
  if (r.type !== "clue" || typeof r.targetSeatId !== "string") return false;
  if (typeof r.clue !== "object" || r.clue === null) return false;
  const clueKeys = Object.keys(r.clue);
  if (clueKeys.length !== 2 || !clueKeys.includes("type") || !clueKeys.includes("value")) return false;
  const c = r.clue as { type: unknown; value: unknown };
  return (c.type === "color" && typeof c.value === "string") || (c.type === "rank" && typeof c.value === "number");
}
```

### fast-check termination property, bounded to avoid an infinite test loop (D-20)
```typescript
// Source: fast-check.dev/docs (plain fc.property pattern; model-based/fc.commands
// considered and not recommended here — see Alternatives Considered)
import fc from "fast-check";

const MAX_SIMULATED_TURNS = 500; // generous upper bound: a real game cannot exceed
// roughly (deck size + hand size) turns before the final round forces an end;
// this cap exists to fail the TEST loudly (not hang CI) if a bug makes the
// engine never satisfy checkGameEnd, per D-20's termination invariant.

it("a game driven by random legal actions always ends (termination)", () => {
  fc.assert(
    fc.property(fc.constantFrom("base", "rainbow", "black"), fc.string({ minLength: 1 }), (variant, seed) => {
      let state = hanabiGame.createInitialState({ seatIds: ["a", "b", "c"], variant, seed });
      for (let turn = 0; turn < MAX_SIMULATED_TURNS; turn++) {
        if (hanabiGame.checkGameEnd(state) !== null) return true; // terminated — property holds
        const legal = enumerateLegalActions(state); // test-only helper, not part of the adapter surface
        const action = legal[Math.floor(Math.random() * legal.length)]!;
        const result = hanabiGame.applyAction(state, currentActorSeatId(state), action);
        if (result.ok) state = result.state;
      }
      return false; // exceeded MAX_SIMULATED_TURNS without ending — property FAILS
    }),
  );
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — this is a stable, decades-old ruleset (Hanabi published 2010) with no "deprecated" mechanics to track | Physical box rules (this project's scope) vs. hanab.live's software conventions occasionally diverge on edge cases not relevant here (e.g. hanab.live's extended variant catalogue, empty-clue "stall" conventions as a social layer) | N/A | This project explicitly scopes to box rules only (PROJECT.md, REQUIREMENTS.md Out of Scope) — where hanab.live's *software implementation* differs from the physical rulebook only in optional convention layers (like empty-clue stalling) rather than the base ruleset, this research recommends the **physical rulebook's** stricter rule (RULES-08: zero-touch clues always illegal) since box variants only is the stated scope. No other divergence was found between the rulebook and hanab.live's documented base rules for final-round semantics, token economy, or deck composition. |

**Deprecated/outdated:** None identified — Hanabi's core rules have not changed since its 2010 publication; hanab.live's `docs/rules.md` and `docs/variants.md` describe the same base ruleset with optional variant extensions layered on top.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The sfc32/128-bit PRNG's residual output-recovery risk (WR-01) is acceptable for this project because there is no adversarial incentive in a cooperative friend-group game | Common Pitfalls, Pitfall 5 | If the audience ever expands beyond trusted friends, or if a "competitive speedrun" subculture emerges around this deployment, a technically sophisticated player could attempt to predict undealt cards; low likelihood, but the impact (defeats the entire point of a hidden-information co-op game) is high enough that the owner should explicitly sign off rather than have this decided implicitly by omission |
| A2 | Score-band thresholds/wording for Rainbow/Black's 30-point maximum should scale proportionally from the published 25-point base-game bands (since no single canonical published source defines bands for a 30-max game) | Score Bands (below), RULES-18 | If the owner has a specific preferred band table (e.g. from a specific rulebook edition or house rule), an unscaled/mismatched band could feel wrong at end-game — low severity (cosmetic), easy to adjust post-hoc since D-17 keeps this server-computed in one place |
| A3 | No box variant (Rainbow, Black) alters hand size (RULES-01's 5-for-2-3/4-for-4-5 rule) — confirmed by omission in every primary source consulted, not by an explicit "variants do not change hand size" statement | Code Examples, Deck Composition | If wrong, games would be dealt with an incorrect hand size in Rainbow/Black — high visibility (would be caught immediately in Phase 7 manual testing), low likelihood given how thoroughly documented this specific point is across independent sources |

## Deck Composition (verified detail)

| Variant | Suits | Cards per normal suit | Cards per special suit | Total deck | Max score |
|---------|-------|------------------------|--------------------------|------------|-----------|
| Base | 5 (red, yellow, green, blue, white — or purple depending on edition; color naming is cosmetic) | 10 (3×1, 2×2, 2×3, 2×4, 1×5) | — | 50 | 25 |
| Rainbow | 6 (5 base + rainbow) | 10 | Rainbow: 10 (full suit, same rank distribution as normal suits) `[CITED: hanabi-live/docs/variants.md]` | 60 | 30 |
| Black | 6 (5 base + black) | 10 | Black: 5 (single copy of each rank 1-5) `[CITED: hanabi-live/docs/variants.md, cross-checked officialgamerules.org]` | 55 | 30 |

**Confidence: HIGH.** This exactly matches PROJECT.md's own stated scope ("Rainbow adds a 6th suit whose cards are touched by clues of every color. Black adds a suit with a single copy of each rank") and CONTEXT.md's D-08, and is independently corroborated by hanab.live's documentation and multiple rulebook-derived sources.

## Score Bands (RULES-18)

Multiple sources broadly agree on the base-game (25-max) band shape, though exact cutoffs and wording vary slightly by source/edition:

| Score | Band (commonly cited wording) |
|-------|-------------------------------|
| 0 | "Oh no." / horrible |
| 1-5 | Horrible |
| 6-10 | Poor / mediocre |
| 11-15 | Honorable / decent |
| 16-20 | Excellent |
| 21-24 | Extraordinary / amazing |
| 25 | Legendary (perfect score) |

`[CITED: officialgamerules.org, gamerules.com — cross-referenced, MEDIUM confidence]` — exact wording differs slightly between these two secondary sources and no single canonical rulebook page was found stating a definitive band table verbatim in this session; treat the *shape* (roughly six bands, worst-to-legendary) as reliable and the *exact wording* as a discretionary choice, matching CONTEXT.md's explicit "Claude's Discretion: Score band thresholds and wording, following the standard published Hanabi bands."

**For Rainbow/Black (30-max):** No source defines bands for a 30-point game. **[ASSUMED — see Assumptions Log A2]:** scale the 25-point band boundaries proportionally (e.g., ×1.2) or extend the top band. This needs explicit confirmation from the project owner during planning, not silent acceptance.

## Open Questions

1. **Is Black itself a "colored" suit for color-clue purposes, or colorless (rank-clue-only)?**
   - What we know: PROJECT.md and CONTEXT.md describe Black only via its rank-copy rule ("a suit with a single copy of each rank"), not its color-clue behavior. The physical Hanabi box's Black expansion suit is black-colored and **is** nameable/cluable by a "black" color clue like any other suit (it is not colorless) — this matches standard published box-variant rules.
   - What's unclear: Whether the CONTEXT session's D-08 (silent on this point) intends Black to be a normal cluable color, or whether "one copy of each rank" was meant to also imply "rank-clue only" (a different, rarer variant sometimes called "Null" or similar in the extended hanab.live catalogue, explicitly out of scope per REQUIREMENTS.md).
   - Recommendation: Treat Black as a normal, color-cluable suit (its own distinct color, clueable like red/yellow/etc.), consistent with the physical box product and with REQUIREMENTS.md's explicit exclusion of hanab.live's "extended variant catalogue" (which is where colorless/rank-only suits like "Null" live). Confirm this reading with the project owner if there is any doubt — flag during planning.

2. **Priority order when multiple end conditions could apply on the same turn (Pitfall 4)**
   - What we know: D-15 requires "a completed final stack ends the game immediately at the perfect score," implying stack-completion is checked ahead of/alongside final-round-elapsed.
   - What's unclear: The exact tie-break if, hypothetically, the third fuse is lost on the exact same action that would have completed all stacks (impossible in practice — playing a card cannot simultaneously misplay and complete a stack — so this is a theoretical non-issue, but worth stating explicitly in the plan so `checkGameEnd`'s priority order is a deliberate choice, not an accident of code structure).
   - Recommendation: Document a fixed check order in `endgame.ts` (e.g., fuses-lost first, then all-stacks-complete, then final-round-elapsed) and note in a comment why the order does not actually matter functionally (the conditions are mutually exclusive by construction) but is fixed for determinism/readability.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.11 (already configured, `rules` project) |
| Config file | `vitest.config.ts` (repo root), `rules` project: `root: "packages/rules"`, `include: ["src/**/*.test.ts"]` |
| Quick run command | `npx vitest run --project rules` |
| Full suite command | `npm test` (runs all four Vitest projects: schema, rules, worker, web) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|-------------|
| RULES-01 | Hand size 5 (2-3p) / 4 (4-5p) | unit | `npx vitest run --project rules -t "hand size"` | ❌ Wave 0 |
| RULES-02 | Deck composition per variant | unit (parametrized over 3 variants, D-10) | `npx vitest run --project rules -t "deck composition"` | ❌ Wave 0 |
| RULES-03 | Suit count from config, never hardcoded | unit + structural (grep-style, mirroring `source-structure.test.ts`) | `npx vitest run --project rules -t "variant config"` | ❌ Wave 0 |
| RULES-04/05/06/07/08/09/10/12/13 | Full turn-cycle legality and token/fuse mechanics | unit (example-based, D-20's note that "example-based tests carry the specific rules") | `npx vitest run --project rules -t "applyAction"` | ❌ Wave 0 |
| RULES-15/16/17 | Final round, three end conditions | unit + property (termination, D-20) | `npx vitest run --project rules -t "endgame"` | ❌ Wave 0 |
| RULES-18 | Score + band | unit | `npx vitest run --project rules -t "scoring"` | ❌ Wave 0 |
| RULES-19 | Deterministic seeded shuffle | unit (two same-seed games produce deep-equal initial state, reusing `adapter.test.ts`'s `describeAdapterConformance`'s determinism check) | `npx vitest run --project rules -t "conformance"` | ✅ `packages/rules/src/adapter.test.ts` (reusable) |
| RULES-20 | Turn history from turn 1, no identity leak | unit + property (redaction, D-20) | `npx vitest run --project rules -t "history"` | ❌ Wave 0 |
| HIDE-05 | Reject state-asserting payloads | unit (hostile-input fuzz, reusing `adapter.test.ts`'s `fc.jsonValue()` hostile-payload property) | `npx vitest run --project rules -t "conformance"` | ✅ `packages/rules/src/adapter.test.ts` (reusable) |
| FDN-02 | Zero deps, isolated build/test | structural | `npm run typecheck && npx vitest run --project rules` with no network access required | ✅ proven by Phase 1/2's existing zero-dep `packages/rules` |
| D-20 conservation/redaction/termination | Token/card conservation, no-leak, always-terminates | property (fast-check) | `npx vitest run --project rules -t "property"` | ❌ Wave 0 |
| D-21 leak checker generalization | Structural + typed-identity detection | unit + canary (D-22) | `npx vitest run --project rules -t "leak"` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --project rules` (fast — no network, no worker, no web build)
- **Per wave merge:** `npm test` (full four-project suite — must stay green per D-02, since the forehead-card toy and its tests remain)
- **Phase gate:** Full suite green (`npm test`) plus `npm run typecheck` before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/rules/src/hanabi/variant.ts` + `variant.test.ts` — covers RULES-01, RULES-02, RULES-03
- [ ] `packages/rules/src/hanabi/deck.ts` + `deck.test.ts` — covers RULES-01, RULES-02
- [ ] `packages/rules/src/hanabi/legality.ts` + `legality.test.ts` — covers RULES-08, RULES-09, RULES-10, D-13
- [ ] `packages/rules/src/hanabi/actions.ts` + `actions.test.ts` — covers RULES-04, RULES-05, RULES-06, RULES-07, RULES-12, RULES-13
- [ ] `packages/rules/src/hanabi/endgame.ts` + `endgame.test.ts` — covers RULES-15, RULES-16, RULES-17, RULES-18
- [ ] `packages/rules/src/hanabi/projection.ts` + `projection.test.ts` — covers D-06, D-07, HIDE-05-adjacent redaction
- [ ] `packages/rules/src/hanabi/history.ts` + `history.test.ts` — covers RULES-20
- [ ] `packages/rules/src/hanabi/adapter.ts` + reuse of `describeAdapterConformance` — covers RULES-19, HIDE-05, FDN-02
- [ ] `packages/rules/src/hanabi/hanabi-leak-check.ts` + `hanabi-leak-check.test.ts` (with D-22 canaries) — covers D-21
- [ ] `packages/rules/src/hanabi/*.property.test.ts` — covers D-20's four named invariants
- Framework install: none needed — `fast-check` and `vitest` already installed and exact-pinned

*No test framework changes needed; only new test files inside the existing `rules` Vitest project.*

## Security Domain

> `security_enforcement` not found in `.planning/config.json` — treated as enabled (absent = enabled) per protocol default. Reviewed and scoped narrowly: this phase has no user input crossing a trust boundary in the traditional web-security sense (no HTTP endpoints, no auth, no persistence) — it is a pure in-memory rules engine. ASVS categories below are assessed against the one real trust boundary this phase does own: the `request: unknown` parameter to `applyAction`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Out of scope — no identity/session concept in this pure package; seat identity is Phase 1's concern |
| V3 Session Management | No | Same — sessions are Phase 1/4/5's concern |
| V4 Access Control | Partial — yes | "Actor can only name their own hand's card ids" (D-12) is an access-control rule enforced *inside* the engine, since the engine is the sole authority; pattern = exact-key request guard + own-hand lookup, no library needed (hand-rolled is correct here — this *is* the domain logic, not a generic auth concern) |
| V5 Input Validation | Yes | The engine's own exact-own-key runtime type guards (`isPlayRequest`/`isDiscardRequest`/`isClueRequest`), following `forehead-card.ts`'s established pattern — no external validation library needed since `packages/rules` is zero-dependency (Zod strict schemas are Phase 4's concern, applied at the wire boundary, not here) |
| V6 Cryptography | Partial | The seeded PRNG (`shuffle.ts`) is not cryptography in the ASVS sense (it is a deterministic-by-design gameplay mechanic, not a security control), but its residual risk is tracked — see Common Pitfalls Pitfall 5 / Assumptions Log A1 |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client submits an action payload with an extra key asserting resulting state (e.g. `{type:"play", cardId, resultingScore: 999}`) | Tampering | Exact-own-key request guards (D-12/HIDE-05) — any payload with an unexpected key is rejected outright, not merely ignored |
| Client requests a play/discard naming a card id from another seat's hand | Tampering / Elevation of Privilege | `applyAction` looks up `cardId` only within the actor's own hand slots; a match failure is rejected, never silently no-op'd |
| Own-hand identity leaking through a projection bug (e.g. a positive clue fact accidentally including the resolved `{suit, rank}` instead of just the narrowed candidate set) | Information Disclosure | D-07's whitelist-construction discipline + D-21's generalized structural/typed-identity leak checker, tested with D-22's deliberately-leaky canaries |
| A hostile/malformed `request` value causing `applyAction` to throw (crashing the room actor in Phase 4) | Denial of Service | `adapter.test.ts`'s existing `fc.jsonValue()` hostile-payload property test, reused for the Hanabi adapter, asserts `applyAction` never throws for any JSON value |

## Sources

### Primary (HIGH confidence)
- `packages/rules/src/adapter.ts`, `forehead-card.ts`, `shuffle.ts`, `forehead-card-leak-check.ts`, `adapter.test.ts`, `index.ts` — read directly, this session
- `vitest.config.ts`, root `package.json`, `packages/rules/package.json`, `packages/schema/package.json` — read directly, this session
- `.planning/phases/03-hanabi-rules-engine/03-CONTEXT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/phases/02-per-seat-redaction-contract/02-CONTEXT.md`, `02-REVIEW.md` — read directly, this session
- `npm view fast-check version` → `4.10.1` (repo pins `4.9.0`); `npm view zod version` → `4.6.5` (repo pins `4.5.4`, N/A for this phase); `npm view vitest version` → `5.0.1` (repo pins `4.1.11`) — run directly, this session

### Secondary (MEDIUM confidence)
- [Hanabi Rulebook PDF](https://cdn.1j1ju.com/medias/b3/a9/0e-hanabi-rulebook.pdf) — final-round semantics, token economy
- [Hanabi-Live/hanabi-live docs/rules.md](https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/rules.md) — zero-clue-touch illegality, discard-at-8 illegality, cross-verification of base rules
- [Hanabi-Live/hanabi-live docs/variants.md](https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/variants.md) — Rainbow (full 10-card suit, every-color-touch) and Black (5-card single-copy suit) deck composition, cross-verified against PROJECT.md's own description
- [officialgamerules.org Hanabi rules](https://officialgamerules.org/game-rules/hanabi-rules/), [gamerules.com Hanabi rules](https://gamerules.com/rules/hanabi/) — score band wording (varies by source, see Score Bands section)
- [fast-check.dev model-based testing docs](https://fast-check.dev/docs/advanced/model-based-testing/) — `fc.commands` API considered and not recommended for this phase's scope

### Tertiary (LOW confidence)
- None used as load-bearing claims — where sources disagreed (score-band exact wording, 30-max band scaling) this is flagged explicitly in Assumptions Log rather than stated as fact.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; existing exact-pinned tools confirmed via direct `npm view`
- Architecture: HIGH — directly extends Phase 1/2's reviewed, shipped patterns (`GameAdapter`, whitelist projection, shuffle reuse)
- Rules correctness (deck, final round, tokens): HIGH — cross-verified against primary rulebook and hanab.live docs, and matches PROJECT.md's own pre-existing description
- Score bands: MEDIUM — shape agreed across sources, exact wording/cutoffs vary; 30-max scaling is an explicit assumption (A2)
- PRNG risk sizing: MEDIUM — reasoned assessment, not a formal cryptanalytic proof; documented as an accepted-risk assumption (A1) for owner sign-off

**Research date:** 2026-09-15
**Valid until:** Hanabi's core ruleset is stable (decades old, unlikely to change) — treat rules findings as valid indefinitely. Re-verify library versions (fast-check, vitest) if this phase's planning is delayed more than ~30 days from this research date.

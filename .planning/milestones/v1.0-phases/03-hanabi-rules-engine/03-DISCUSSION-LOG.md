# Phase 3: Hanabi Rules Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-15
**Phase:** 03-hanabi-rules-engine
**Areas discussed:** Engine shape and package layout, Cards and hidden state, Variant parametrization, Actions and legality, Endgame and scoring, Determinism and test strategy

Invoked as `/gsd-discuss-phase 3 --auto --chain`.
`[--auto] Selected all gray areas: Engine shape and package layout, Cards and hidden state, Variant parametrization, Actions and legality, Endgame and scoring, Determinism and test strategy.`

---

## Engine shape and package layout

| Option | Description | Selected |
|--------|-------------|----------|
| Second adapter in `packages/rules/src/hanabi/`, toy left alone | Zero-dep package, toy deleted in Phase 4 per roadmap | ✓ |
| Replace the toy now | Would delete Phase 2's proven redaction fixture before Phase 4 wires the real engine | |
| New separate package | Extra workspace wiring for code that ships in the same package anyway | |

**User's choice:** [auto] Second adapter, toy untouched (recommended default)
**Notes:** `GameAdapter`'s five-member interface is not reshaped; `AdapterError` may widen.

---

## Cards and hidden state

| Option | Description | Selected |
|--------|-------------|----------|
| `{id, suit, rank}` with opaque minted ids, ordered hand slots, clue facts in engine state | Stable keys for Phase 6; positional conventions are rules, not UI; single source of truth for clue memory | ✓ |
| Index-addressed hands, no stored clue facts | Cheaper now; forces Phase 6 to derive clue memory from history as a second source of truth | |
| Ids derived from deck position | Rejected outright — a derivable id is a leak (Phase 2 D-04) | |

**User's choice:** [auto] Opaque ids + slots + stored clue facts (recommended default)
**Notes:** Own-hand cards project with id and clue facts only; `suit`/`rank` keys absent entirely.

---

## Variant parametrization

| Option | Description | Selected |
|--------|-------------|----------|
| One `VariantConfig` driving suit count, deck composition and a single clue-touch predicate; all three variants tested here | RULES-03 satisfied by construction; Phase 7 only proves, never restructures | ✓ |
| Parametrize deck only, special-case Rainbow at clue sites | Leaves per-call-site special cases — the exact thing Phase 7 is meant not to need | |
| Base only, generalize in Phase 7 | Contradicts the roadmap's stated reason for RULES-03 landing in Phase 3 | |

**User's choice:** [auto] Single config + one touch predicate (recommended default)

---

## Actions and legality

| Option | Description | Selected |
|--------|-------------|----------|
| Card-id addressed actions, exact-key guards, typed refusal reasons, legality exported as pure predicates | HIDE-05 enforced as in the toy; Phase 6 can disable illegal actions without trial-and-error | ✓ |
| Hand-index addressed actions | Ambiguous once hands shift after a draw | |
| Boolean legality only inside `applyAction` | UI would have to attempt actions to discover legality | |

**User's choice:** [auto] Card-id + exact-key guards + exported predicates (recommended default)
**Notes:** A play/discard naming a card outside the actor's own hand is rejected.

---

## Endgame and scoring

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit final-round counter in state, no draws during it, all three end conditions, score and band from the engine | RULES-15/16/17/18; the roadmap names the end trigger as the most commonly wrong part | ✓ |
| Infer the final round from deck size at render time | Implicit state — the silent failure mode this phase exists to prevent | |
| Score in engine, band in UI | Splits one rule across two layers | |

**User's choice:** [auto] Explicit counter + engine-side band (recommended default)
**Notes:** Completing the last stack ends the game immediately; the 5-bonus is forfeit at 8 clues.

---

## Determinism and test strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Seeded shuffle reused; public-only history; fast-check for token/card conservation, redaction and termination; leak checker generalized for numeric ranks; canaries with non-vacuousness guards | Closes review findings WR-02/WR-03; matches CLAUDE.md's stated rationale for property testing | ✓ |
| Example-based tests only | Misses conservation and termination invariants, which fail silently | |
| Reuse the toy's leak checker unchanged | Its raw-string scan cannot distinguish rank 3 from a token count of 3 (WR-03) | |

**User's choice:** [auto] Layered properties + generalized checker (recommended default)
**Notes:** Seed stays server-only and gains no field in any projection. WR-01 (PRNG state recovery) is flagged to research to size while the engine is still network-free.

---

## Claude's Discretion

- Module split and export names inside `hanabi/`
- `HanabiState` field names; clue facts as sets, bitmasks or arrays
- Score band thresholds and wording (standard published bands)
- fast-check run counts and generator design
- Whether legality predicates are centralized or co-located
- Whether `AdapterError` widens or Hanabi refusals ride alongside it

## Deferred Ideas

- Worker swap and toy deletion (Phase 4)
- Strict Zod view schema for the Hanabi view (Phase 4)
- Rainbow/Black proven end to end (Phase 7)
- Turn-history UI, replay, clue log (v2 — QOL-01)
- PRNG hardening against internal-state recovery (WR-01) — research to size in this phase

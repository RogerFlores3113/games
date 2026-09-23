---
phase: 04-wire-engine-into-room-actor
plan: 07
subsystem: testing
tags: [playwright, e2e, hanabi, realtime, reconnect]

requires:
  - phase: 04-wire-engine-into-room-actor
    provides: "The interim playable HanabiBoard with its data-testid contract (plan 04-06)"
provides:
  - "e2e/hanabi-realtime.spec.ts carrying the RT-01 and RT-03 browser-level proofs"
  - "start-game.spec.ts and in-progress-arrival.spec.ts repointed from the forehead-card toy to the real Hanabi board"
affects: ["04-08 (deletes the forehead-card toy now that no spec depends on it)"]

tech-stack:
  added: []
  patterns:
    - "RT-01 asserts against the PASSIVE browser context, never the acting one, and structurally forbids reload() in that test body"
    - "RT-03 proves seat continuity via the OTHER page's other-hand-{seatId} testid rather than a seatId the board never renders for the viewer's own seat"
    - "Clue-value selection in specs probes each rendered clue-value-* button until give-clue-button reports enabled, rather than assuming card identities the seeded deck keeps secret from the test"

key-files:
  created:
    - e2e/hanabi-realtime.spec.ts
  modified:
    - e2e/start-game.spec.ts
    - e2e/in-progress-arrival.spec.ts

key-decisions:
  - "start-game.spec.ts's action assertion switched from discard to play, because clue tokens start at 8/8 (max) and D-12 disables discard at max tokens — play has no such starting-state restriction"
  - "RT-01's discard fallback checks discard-button's enabled state first and falls back to play-button, since by the time the second action runs a clue has already been given and tokens may or may not still be at max"
  - "RT-03 reloads the page that just BECAME active (the clue's target), the strictest version of the proof: a seat reclaim failure on an active turn would be maximally visible as a stuck game, not just a stale view"
  - "requirements-completed intentionally left empty per orchestrator instruction — this plan proves RT-01/RT-03 in the browser but does not mark them complete in REQUIREMENTS.md"

patterns-established:
  - "Browser-level realtime proofs assert relative/structural change (a token count moved, a testid attribute is unchanged, a pile gained an entry) rather than absolute card identities, since the deck seed is server-secret"

requirements-completed: []

duration: 55min
completed: 2026-09-16
---

# Phase 4 Plan 07: Playwright Proofs for RT-01 and RT-03 Summary

**Two existing toy-driven Playwright specs now drive the real Hanabi board, and a new `hanabi-realtime.spec.ts` proves an action reaching a passive browser with no reload (RT-01) and a mid-game reload reclaiming the same seat with full state (RT-03).**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-16T03:02:00Z (approx.)
- **Completed:** 2026-09-16T03:57:11Z
- **Tasks:** 3
- **Files modified:** 3 (1 created, 2 modified)

## Accomplishments
- Repointed `start-game.spec.ts` and `in-progress-arrival.spec.ts` off the forehead-card toy's `own-card`/`guess-button-*`/`revealed-entry` testids onto the real `HanabiBoard`'s `own-hand`/`play-button`/`discard-button`/`discard-pile`/`played-stack-*` contract, while preserving the ROOM-06 gating/variant-lock coverage and the HIDE-01 browser-surface redaction check (now deriving expected card text from what the OTHER page renders, never a hardcoded identity)
- Built `e2e/hanabi-realtime.spec.ts` with the RT-01 proof: an action taken on the active browser context is asserted against the PASSIVE context's own rendered state (clue-tokens, turn-indicator, deck-count), with no `reload()` call anywhere in that test body, covering both a clue and a play/discard action
- Added the RT-03 proof to the same spec: after a clue changes the turn, the newly active page reloads mid-game and every captured value (own-hand slot count and full text, clue tokens, deck count, turn indicator) comes back identical, the other page's `other-hand-{seatId}` testid for that player is unchanged, and the refusal card is absent

## Task Commits

1. **Task 1: Repoint the existing specs from the toy to the Hanabi board** - `d78bb82` (test)
2. **Task 2: Prove RT-01 — an action appears on the other screen with no refresh** - `89b5743` (test)
3. **Task 3: Prove RT-03 — a mid-game refresh returns to the same seat with full state** - `ba5346c` (test)

## Files Created/Modified
- `e2e/hanabi-realtime.spec.ts` - New spec carrying both RT-01 (two-browser no-reload proof, covering a clue and a play/discard) and RT-03 (mid-game reload proving same-seat reattachment with full state) against the real board and the real worker
- `e2e/start-game.spec.ts` - Repointed off the forehead-card toy; keeps ROOM-06 gating/variant-lock assertions and the HIDE-01 redaction check, now against `own-hand`/`play-button`/`discard-button`/table testids
- `e2e/in-progress-arrival.spec.ts` - `own-card` references swapped to `own-hand`; refusal-card coverage otherwise unchanged

## Decisions Made
- Switched `start-game.spec.ts`'s action assertion from discard to play: the game starts with clue tokens at 8/8 (max), and D-12 disables discard at max tokens, so a discard action would have been a no-op assertion target
- `selectAClueValueThatTouchesSomething` (a local spec helper) probes each rendered `clue-value-*` button and checks `give-clue-button`'s enabled state rather than assuming which color/rank touches a card, since the deck seed is server-secret to the test per the plan's critical notes
- RT-03 identifies "same seat" via the OTHER page's `other-hand-{seatId}` testid rather than a `data-seat-id` on the reloading page's own board, since the board deliberately never renders the viewer's own seatId (own-hand shows only clue facts and position, per D-11/HIDE-01)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] start-game.spec.ts's discard assertion was a no-op at the starting token count**
- **Found during:** Task 1
- **Issue:** The plan's suggested "discard" action for the repointed table assertion is disabled at the game's starting 8/8 clue tokens per D-12 ("discard at max tokens"), so `discard-button` was never enabled and the test hung on `toBeEnabled()`.
- **Fix:** Switched the action to `play-button` (only disabled by turn ownership) and asserted structurally that either the discard pile gained an entry (misplay) or a played stack advanced, rather than assuming a specific outcome from the seeded deck.
- **Files modified:** `e2e/start-game.spec.ts`
- **Commit:** `d78bb82`

**2. [Rule 1 - Bug] A literal "reload()" substring in a comment tripped the RT-01 acceptance grep**
- **Found during:** Task 2
- **Issue:** An early draft's comment explaining the no-reload constraint contained the literal text `reload()`, which the acceptance criterion's `grep -c 'reload()'` check would have counted as 1, failing the criterion even though no actual `.reload()` call existed in the test body.
- **Fix:** Reworded the comment to describe the constraint without using the literal method-call substring.
- **Files modified:** `e2e/hanabi-realtime.spec.ts`
- **Commit:** `89b5743`

## Issues Encountered

None beyond the two auto-fixed items above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04-08 can now delete `ForeheadCardGame.tsx` and its remaining references — no e2e spec depends on the toy's testids anymore (`grep -c 'own-card\|guess-button\|revealed-entry\|revealed-list'` is 0 across `e2e/`).
- `npm test` (478 tests, 45 files) and `npx playwright test` (15 tests, full e2e suite) are both green.
- RT-01 and RT-03 are proven in the browser but deliberately NOT marked complete in `REQUIREMENTS.md` per this plan's orchestrator instructions; that bookkeeping is left to whichever plan owns the final requirements sign-off for phase 4.

---
*Phase: 04-wire-engine-into-room-actor*
*Completed: 2026-09-16*

## Self-Check: PASSED

All created/modified files verified present on disk (`e2e/hanabi-realtime.spec.ts`, `e2e/start-game.spec.ts`, `e2e/in-progress-arrival.spec.ts`); all three task commit hashes (`d78bb82`, `89b5743`, `ba5346c`) verified present in `git log`.

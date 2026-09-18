---
phase: 07-variant-support-rainbow-black
plan: 04
subsystem: e2e
tags: [hanabi, rainbow, black, e2e, playwright, rules-14, ui-07]

# Dependency graph
requires:
  - phase: 07-01
    provides: canClue's clue_color_not_nameable guard (server rejects a forged "rainbow"/"black" colour clue)
  - phase: 07-02
    provides: rainbow gradient art render tests, variant-matrix end-condition coverage
  - phase: 07-03
    provides: CluePopover row mode + row-aware e2e helpers (openTileCluePopover's colorRowButtons, count-guarded giveAnyLegalClue)
provides:
  - e2e/variant-rainbow.spec.ts — live proof of RULES-14 (colour row, ring semantics, no "Rainbow" option) and UI-07/D-11 (live gradient at three render sites)
  - e2e/start-game.spec.ts UI-10 parametrized over base/rainbow/black (D-17)
affects: []

tech-stack:
  added: []
  patterns:
    - "Zero-code D-18 mechanism: a bounded retry loop (up to 6 attempts) starts a fresh 3-seat Rainbow room and inspects the real DOM for a visible teammate rainbow tile, closing joiner contexts and retrying on a miss — no seed/deck override, no dev-only server code path"
    - "Suit-colour comparison via a throwaway DOM probe (style.color = var(--color-suit-x); read getComputedStyle().color) rather than a hand-copied hex/rgb table, reused for both the popover entry colour and the receiver's hint-ring boxShadow containment check"
    - "Gradient-fill resolvability proven generically (locate the first svg path, parse its url(#id) fill, resolve via document.getElementById, assert the target tag is linearGradient) — reused across the teammate tile, the compact discard tile, and the discard overlay"

key-files:
  created:
    - e2e/variant-rainbow.spec.ts
  modified:
    - e2e/start-game.spec.ts

key-decisions:
  - "D-18 mechanism: seat-retry (3 seats, up to 6 attempts, ~5e-6 failure rate per the plan's own odds), not a dev-only wrangler --var hook — zero production and zero dev-only code added, verified by grep against apps/worker/playwright.config.ts/wrangler.jsonc showing no diff"
  - "UI-10's inline 80-iteration play loop deleted; the test body now calls playUntilGameEnds (already extracted to e2e/helpers.ts in an earlier plan) so all three variant rows share one identical body per D-17's no-per-variant-branch rule"
  - "The Rainbow spec's two tests independently retry the D-18 start helper rather than sharing one game instance, since UI-07/D-11's test needs to advance turns and discard the rainbow card (destructive to the RULES-14 test's own ring assertions if shared)"

requirements-completed: [RULES-14, UI-07]

# Metrics
duration: ~50min
completed: 2026-09-18
---

# Phase 7 Plan 4: Rainbow/Black end-to-end proof (RULES-14, UI-07, D-17) Summary

**A live 3-seat Rainbow game (started via a zero-code retry loop, never a seed/deck override) proves the colour row, the ring semantics on the receiver's hand, the total absence of a "Rainbow" clue option, and the gradient art at three render sites; a single UI-10 test body now proves a complete game in base, Rainbow and Black each end with the correct score ceiling and stack count.**

## What Was Built

**Task 1 — `e2e/variant-rainbow.spec.ts` (new), D-18/D-11:**
- `startRainbowGameWithVisibleRainbowTile(hostPage, browser)`: starts a 3-seat Rainbow game (`startGameWithPlayers`), polls for the one page holding the turn, then scans every `other-hand-{seatId}` container on that page for a tile whose glyph is `rainbow`. On a miss it closes that attempt's joiner contexts and retries, up to 6 attempts, matching the plan's own odds (~0.13 miss per attempt, ~5e-6 total failure over 6 tries). No env var, no wrangler/playwright config change, no worker change — `git diff --name-only -- apps/worker playwright.config.ts apps/worker/wrangler.jsonc` is empty, and `grep -rniE "seed|DEV_FORCE|deck override"` matches only the header comment explaining the decision.
- Test **"RULES-14 / D-18"**: opens every teammate tile's popover on the active page and confirms none ever offers a "Rainbow" colour (`tile-clue-color-rainbow` count 0, no `menuitem` named `/rainbow/i`). Re-opens the rainbow tile's own popover and asserts the row's five entries appear in `red, yellow, green, blue, white` order, the singular `tile-clue-color` testid is absent, the rank button sits strictly below the row, each entry's computed `color` matches that suit's `--color-suit-*` token (resolved via a DOM probe, never a hand-copied hex), and the whole popover's bounding box stays inside 1280×720. Picks whichever nameable colour is actually present among the target's other visible tiles (falling back to red), clicks it, then polls the receiver's own hand: every card whose suit is `rainbow` or the chosen colour gets `data-hints="true"` and a `hint-color-ring` whose `boxShadow` contains the chosen colour's resolved rgb; every other card gets no ring at all. Also confirms the giver's own view of the rainbow tile shows the same ring in the same colour (D-09).
- Test **"UI-07 / D-11"**: confirms the rainbow tile's `svg path` fill is a `url(#...)` reference that resolves to a real `<linearGradient>`; advances turns (via `giveAnyLegalClueToAnyTeammate`, which also spends clue tokens so discard becomes legal) until the receiver holds the rainbow card and the turn; the receiver selects and discards it; the compact `discard-tile-{id}` and at least one `discard-overlay-card` (after opening the discard overlay) both resolve the same gradient-fill check.
- Ran green under `--repeat-each=2` (4/4) on the first attempt — no seat-retry miss observed in this run.

**Task 2 — `e2e/start-game.spec.ts` UI-10 parametrized (D-17):**
- Replaced the single base-only UI-10 test (which hardcoded its own 80-iteration play loop and a literal `/ 25 —` regex) with a `UI10_VARIANTS` table (`base`→25/5, `rainbow`→30/6, `black`→30/6) driving three `test()` calls with one identical body: `startGameWithPlayers(..., { variant })`, then `playUntilGameEnds` (the helper an earlier plan already extracted from this exact loop — no inline copy left in this file). Per page: end-overlay/heading/turn-indicator assertions unchanged; the final-score regex is built from the row's `maxScore`; `end-stack` count and `played-stack-` column count both assert against the row's `columns`; the parsed final score is asserted equal to the sum of every `end-stack`'s `data-top-rank`. No `variant === ...` branch anywhere in the body (`awk`-scoped grep count: 0).
- `startTwoPlayerGame` stayed imported (still used by two other tests in this file); `playUntilGameEnds` newly imported from `e2e/helpers.ts`.

## Task Commits

1. **Task 1: Rainbow gameplay e2e — colour row, ring semantics, no Rainbow option, live gradient (D-18, D-11)** - `afbf908` (test)
2. **Task 2: UI-10 full-game test parametrized over base, Rainbow and Black (D-17)** - `5e55b7f` (test)

## Deviations from Plan

None — plan executed as written. Both tasks' acceptance-criteria greps and Playwright runs passed on the first implementation attempt; no auto-fix (Rules 1-3) or architectural (Rule 4) deviation was needed.

## Verification

- `npx tsc -b apps/web packages/rules packages/schema apps/worker` — clean
- `grep -rniE "seed|DEV_FORCE|deck override" e2e/variant-rainbow.spec.ts` — matches only the header comment
- `git diff --name-only -- apps/worker playwright.config.ts apps/worker/wrangler.jsonc` — empty (no override mechanism added)
- `npx playwright test e2e/variant-rainbow.spec.ts --repeat-each=2` — 4/4 passed
- `grep -n "/ 25 —" e2e/start-game.spec.ts` — no matches (no hardcoded base max left in UI-10)
- `awk '/UI-10 \(/,/^  }\);/' e2e/start-game.spec.ts | grep -c "variant ==="` — 0
- `npx playwright test e2e/start-game.spec.ts --list -g "UI-10"` — lists exactly UI-10 (base), UI-10 (rainbow), UI-10 (black)
- `npx playwright test e2e/start-game.spec.ts -g "UI-10|UI-11|fixed geometry"` — 7/7 passed (after a full port-kill)
- `npx playwright test e2e/variant-rainbow.spec.ts e2e/start-game.spec.ts` (full files, both) — 12/12 passed
- `npx vitest run --project rules --project web --project schema --project worker` — 76 files, 967 tests passed (no regression from either e2e-only change, run for full-gate confidence)
- Dev servers restarted after the final Playwright run and confirmed listening: `next-server` on 3100, `workerd` on 8787

## Requirement Status

**RULES-14 and UI-07 marked complete in REQUIREMENTS.md** (`gsd-sdk query requirements.mark-complete RULES-14 UI-07`) — both now have a passing e2e proof through the real UI and server: RULES-14 via the colour-row/ring-semantics/no-"Rainbow"-option test, UI-07 via the live gradient test at three render sites. RULES-02, RULES-03 and ROOM-05 (also listed in this plan's frontmatter as requirements this plan proves end to end) were already marked complete in earlier phases (Phase 3, Phase 3, Phase 1 respectively) and are left as-is — this plan's UI-10 parametrization is their end-to-end e2e proof across variants, not their first completion.

## Known Stubs

None. No hardcoded empty value, placeholder text, or unwired data source was introduced by this plan — both tasks are test-only additions against already-shipped production code (07-01/07-02/07-03).

## Threat Flags

None. No new network endpoint, auth path, file access pattern, or schema change was introduced — this plan only adds/parametrizes Playwright tests against the existing public UI. The plan's own `T-07-02` threat (a deck/seed override reachable in production) was explicitly mitigated by choosing the zero-code seat-retry mechanism, verified above.

## Next Phase Readiness

- No blockers. This is the last plan in Phase 7 (5 of 5) — RULES-14 and UI-07 are now complete, joining RULES-02/RULES-03/ROOM-05 (already complete) as fully proven end to end for this phase's scope.
- Dev servers left running on 3100 (web) / 8787 (worker), confirmed listening after this plan's own final verification run.

---
*Phase: 07-variant-support-rainbow-black*
*Completed: 2026-09-18*

## Self-Check: PASSED

- FOUND: e2e/variant-rainbow.spec.ts
- FOUND: e2e/start-game.spec.ts
- FOUND commit afbf908 (Task 1)
- FOUND commit 5e55b7f (Task 2)

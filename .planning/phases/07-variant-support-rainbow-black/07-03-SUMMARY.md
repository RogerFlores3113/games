---
phase: 07-variant-support-rainbow-black
plan: 03
subsystem: web-ui, e2e
tags: [hanabi, clue-popover, rainbow, rules-14, playwright]

# Dependency graph
requires:
  - phase: 07-01
    provides: canClue's clue_color_not_nameable guard (server accepts every nameable-colour clue against a rainbow tile; this plan makes that reachable from the UI)
provides:
  - CluePopover row mode (colorRow prop) — a rainbow tile's popover shows a compact row of the five nameable colours instead of a disabled single button
  - TeammateCard variant-agnostic row-vs-button detection (cluableColorsForView(game).includes(card.suit))
  - Row-aware e2e helpers (openTileCluePopover's colorRowButtons, count-guarded giveAnyLegalClue/giveClueOfKind)
affects: [07-04]

tech-stack:
  added: []
  patterns:
    - "CluePopover's colour slot has two mutually exclusive render modes (colorRow: null | Suit[]) sharing one component, selected by the caller (TeammateCard), never by a suit-name literal"
    - "useLayoutEffect anchor-flip (center/start/end) measured against document.documentElement.clientWidth, row mode only — single-button mode never measures"
    - "e2e locators that can be legitimately absent on a given tile (colorButton vs colorRowButtons) are always count()-guarded before isEnabled()/click(), since Playwright's isEnabled() on a zero-match locator waits out its timeout and throws rather than resolving false"

key-files:
  created:
    - apps/web/lib/clue-popover-render.test.ts
  modified:
    - apps/web/components/hanabi/CluePopover.tsx
    - apps/web/components/hanabi/TeammateCard.tsx
    - e2e/helpers.ts
    - e2e/hanabi-table-polish.spec.ts
    - e2e/hanabi-realtime.spec.ts

key-decisions:
  - "Row mode uses flex-nowrap + width:max-content (not flex-wrap), matching the plan's explicit action text over the UI-SPEC's Claude's-discretion wrap suggestion — the mandatory anchor flip (useLayoutEffect) is the chosen overflow response instead of wrapping to a second line"
  - "colorDisabled for a rainbow tile is set to exactly rankDisabled (D-07) rather than a fresh per-colour disabledReasonFor call, since every nameable colour always touches a clicked rainbow tile by the engine's own rule"
  - "giveClueOfKind/giveAnyLegalClue/UI-02+UI-04's clue-send all count()-guard colorButton and colorRowButtons before isEnabled() — colorButton has zero matches on a rainbow tile and colorRowButtons has zero matches everywhere else, so an unguarded isEnabled() on the wrong one would hang and throw rather than resolve false"

requirements-completed: []  # RULES-14 stays open: the server half (07-01) and this plan's UI half both exist, but no e2e in this plan actually drives a Rainbow game through the real row (that lands in 07-04, D-18). Not marked complete here per this plan's own hard rule.

# Metrics
duration: ~40min
completed: 2026-09-18
---

# Phase 7 Plan 3: Rainbow tile colour row (RULES-14 UI half) Summary

**Made every legal Rainbow colour clue reachable from the UI: a rainbow tile's quick-clue popover now shows a compact row of the five nameable colours (instead of a permanently disabled single button), with a mandatory viewport-edge anchor flip and row-aware e2e helpers — zero change to any other tile's popover.**

## What Was Built

**Task 1 — `CluePopover` row mode + `TeammateCard` wiring, render-tested (D-05..D-08):**
- `CluePopover.tsx` gained a `colorRow: readonly Suit[] | null` prop. `null` renders the pre-existing single colour button byte-for-byte (proven identical in the render test's base-view assertion, including exact class/style string). A non-null array renders `data-testid="clue-color-row"` containing one `tile-clue-color-{suit}` button per entry, in `cluableColors` order, each styled with that suit's own `SUIT_VISUALS[suit].hueVar` and label — never bold, matching the existing rank button which stays below unchanged.
- Every row entry shares one `colorDisabled` boolean with the rank button (D-07) — no per-entry legality check, no disabled-reason text anywhere.
- Row mode adds a `useLayoutEffect` that measures the popover's own `getBoundingClientRect()` against `document.documentElement.clientWidth` after mount and flips the horizontal anchor (`center` -> `start`/`end`) so the wider row never clips the viewport near a hand edge. Single-button mode never measures anything and keeps its original centered anchor.
- `TeammateCard.tsx`'s `colorRow` is computed as `!card.hidden && !colorNameable ? cluableColorsForView(game) : null` — the existing `colorNameable` boolean (`cluableColorsForView(game).includes(card.suit)`) is the sole, variant-agnostic detection rule; no literal suit-name comparison exists anywhere in either file (confirmed by grep in the automated verify step).
- `apps/web/lib/clue-popover-render.test.ts` (new): renders `TeammateCard` directly via `renderToStaticMarkup` with the popover forced open and proves, per the plan's behavior list: exactly five ordered row entries for a rainbow card in Rainbow, no "Rainbow" text/option anywhere; a single unchanged button for a red card in Rainbow (D-06) and a black card in Black (D-08, labelled "Black"); byte-identical markup for a red card in base; and that all five row entries share the rank button's own enabled/disabled state across `isYourTurn`/`clueTokens` variations (D-07), with no disabled-reason text.

**Task 2 — Row-aware e2e helpers, geometry and popover regressions verified green (D-05 harness support):**
- Enumerated every `tile-clue-color`/`colorButton`/`openTileCluePopover`/`giveAnyLegalClue`/`giveClueOfKind` hit across `e2e/` (see Files Modified below for the full list); every hit was either updated here or confirmed unaffected (base-variant-only call sites that never reach a rainbow tile, e.g. the direct `getByTestId("tile-clue-color")` assertions inside the base-only "UAT gap 16" test).
- `e2e/helpers.ts`: `openTileCluePopover` now also returns `colorRowButtons` (`page.getByTestId("tile-clue-popover").locator('[data-testid^="tile-clue-color-"]')`); `giveAnyLegalClue` rewritten to `count()`-guard `colorButton`, then `colorRowButtons`, then `rankButton` before ever calling `isEnabled()` — a rainbow tile has zero matches for `colorButton` and a non-rainbow tile has zero matches for `colorRowButtons`, and Playwright's `isEnabled()` on a zero-match locator waits out its timeout and throws rather than resolving `false`. Both helpers' doc comments were rewritten to describe the row instead of the deleted pre-Phase-7 "falls back to rank on a disabled rainbow colour button" behaviour.
- `e2e/hanabi-table-polish.spec.ts`'s `giveClueOfKind` and `e2e/hanabi-realtime.spec.ts`'s UI-02+UI-04 clue-send both apply the same count-guarded colour-then-row-then-rank pattern, so both helpers stay correct for a future variant-parametrized caller even though every current caller in these two files uses `startTwoPlayerGame` (base variant only, so the row branch is currently unreachable in these specific tests).
- Regression set run after a full port-kill (3100/8787): `e2e/start-game.spec.ts -g "UI-11|fixed geometry"` (4/4 passed), `e2e/hanabi-table-polish.spec.ts -g "UAT gap 16|HINT-01|UAT gap 34|UAT gap 37"` (4/4 passed), `e2e/hanabi-realtime.spec.ts -g "RT-01|UI-02"` (4/4 passed) — 12/12 total, no geometry regression, no popover behaviour regression.

## Task Commits

1. **Task 1: Rainbow tile colour row in CluePopover and TeammateCard, with anchor flip and a render test** - `a00e21d` (feat)
2. **Task 2: Row-aware e2e helpers and every affected locator updated; geometry and popover e2e regressions green** - `bebf6b2` (test)

## Deviations from Plan

None — plan executed as written. Two implementation notes worth recording (not rule-triggered deviations, just fixture/assertion corrections made while proving the plan's own behavior spec):
- The render test's fixture needed the rendered card to also appear in `view.otherHands` (not just passed as the `card` prop), since `disabledReasonFor`'s clue branch derives touch count via `clueTouchCountForTarget(view, targetSeatId, clue)`, which reads `view.otherHands`, not the isolated `card` prop. Without this the very first row-mode test read every entry as disabled regardless of `isYourTurn`/`clueTokens`.
- Two of the render test's own assertions initially false-failed because Tailwind's own class names contain the literal substring "disabled" (`disabled:cursor-not-allowed`, etc.) — corrected to match the `disabled=` DOM attribute specifically (`/\sdisabled=/`) rather than a bare substring check.

## Verification

- `npx vitest run --project web -t "popover|own-hand"` — 4 files, 29 tests passed
- `npx vitest run --project web` — 39 files, 503 tests passed
- `npx tsc -b apps/web packages/rules packages/schema apps/worker` — clean (root `tsc -b` still fails on the pre-existing missing root `tsconfig.json`, logged in 07-01's SUMMARY and this phase's `deferred-items.md`, unrelated to this plan)
- `grep -nE "#[0-9A-Fa-f]{3,8}\b" apps/web/components/hanabi/CluePopover.tsx apps/web/components/hanabi/TeammateCard.tsx` — no matches
- `grep -nE "suit === \"rainbow\"|=== \"rainbow\""` on both files — no matches (one comment initially phrased as `card.suit === "rainbow"` prose was reworded to avoid a false-positive match on this exact acceptance grep, without changing its meaning)
- `grep -n "falling back to rank"` / `grep -n "non-nameable suit, e.g. Rainbow"` on `e2e/helpers.ts` — no matches (stale doc comments rewritten)
- Playwright (after port-kill): `start-game.spec.ts -g "UI-11|fixed geometry"` 4/4, `hanabi-table-polish.spec.ts -g "UAT gap 16|HINT-01|UAT gap 34|UAT gap 37"` 4/4, `hanabi-realtime.spec.ts -g "RT-01|UI-02"` 4/4 — all green

## Requirement Status (RULES-14)

**Not marked complete in REQUIREMENTS.md.** Per this plan's own hard rule, RULES-14 is only markable complete once verified end to end (server + real UI) — e.g. an e2e run that actually sends a colour clue from a rainbow tile's row in a live Rainbow game and confirms the server accepts it. This plan's Playwright regression set exercises only the base variant (every test here uses `startTwoPlayerGame`, which has no variant option); no test in this plan drives a Rainbow game through the real row. That end-to-end proof (D-18: click a rainbow tile, pick a row colour, assert the ring lands on the rainbow tile and every tile of that suit, and that no popover anywhere offers "Rainbow") is explicitly scoped to 07-04 per 07-CONTEXT.md's phase boundary. Task 1's render test proves the row exists and is correctly gated at the component level; Task 2's helpers make a Rainbow e2e possible; neither is the end-to-end proof itself.

## Next Phase Readiness

- No blockers for 07-04. `e2e/helpers.ts`'s `openTileCluePopover`/`giveAnyLegalClue` are now Rainbow-capable, ready for 07-04's D-17 (UI-10 parametrized over variants) and D-18 (a dedicated Rainbow e2e spec) to use directly.
- Dev servers: this plan's own Playwright runs left the servers it started running afterward (see below); confirmed still healthy post-run.

---
*Phase: 07-variant-support-rainbow-black*
*Completed: 2026-09-18*

## Self-Check: PASSED

- FOUND: apps/web/components/hanabi/CluePopover.tsx
- FOUND: apps/web/components/hanabi/TeammateCard.tsx
- FOUND: apps/web/lib/clue-popover-render.test.ts
- FOUND: e2e/helpers.ts
- FOUND: e2e/hanabi-table-polish.spec.ts
- FOUND: e2e/hanabi-realtime.spec.ts
- FOUND commit a00e21d (Task 1)
- FOUND commit bebf6b2 (Task 2)

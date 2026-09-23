---
phase: 06-game-interface
fixed_at: 2026-09-17T04:35:08Z
review_path: .planning/phases/06-game-interface/06-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 6: Code Review Fix Report

**Fixed at:** 2026-09-17T04:35:08Z
**Source review:** .planning/phases/06-game-interface/06-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 10 (CR-01, WR-01 to WR-09; Info findings out of scope)
- Fixed: 10
- Skipped: 0

**Gate after all fixes:**
- `npx tsc -b apps/web`: clean.
- `npm test`: 48 files, 566 tests passed.
- `npx playwright test` (run with E2E_WEB_PORT=3200 and E2E_WORKER_PORT=8887, because the owner's dev servers were using 3100 and 8787): 21 passed, 1 failed. The failure is "RT-04: a frozen, hidden tab", at the `reconnecting-banner` toHaveCount(0) assertion. It also failed 2 out of 2 runs on an untouched checkout of the base commit 67cf765, so these fixes did not cause it. On this machine it now fails every time, not just sometimes.

## Fixed Issues

### CR-01: Just-clued highlight gets stuck when any other update arrives within 2 seconds

**Files modified:** `apps/web/components/hanabi/HanabiBoard.tsx`, `e2e/hanabi-realtime.spec.ts`
**Commit:** 66d993e
**Applied fix:** The clear timer now lives in a ref. It is cleared only on unmount or when a new highlight starts, and it is no longer the `[game]` effect's cleanup. Added the e2e test "CR-01: ... another action lands inside the highlight window": the clue target discards a card that was not clued while the highlight is still showing, and the test requires the highlight to clear. The test failed against the old code (the highlight stayed on 1 card for the full 5s) and passes with the fix.
**Status:** fixed: requires human verification (logic/timing change)

### WR-01: Stack-complete flash has the same stuck-timer bug

**Files modified:** `apps/web/components/hanabi/Table.tsx`
**Commit:** 436861d
**Applied fix:** Same ref-held timer pattern as CR-01 for `flashingSuits`. No automated test was added, because forcing a stack to complete in e2e depends on the seeded deck.
**Status:** fixed: requires human verification (logic/timing change)

### WR-02: Turn indicator can say "Your turn" after the game has ended

**Files modified:** `apps/web/lib/hanabi-board-logic.ts`, `apps/web/lib/hanabi-board-logic.test.ts`, `apps/web/components/hanabi/HanabiBoard.tsx`, `e2e/start-game.spec.ts`
**Commit:** 8d13c04
**Applied fix:** `turnIndicatorText` takes a new `ended` argument (default false) and returns "Game over" when it is true. HanabiBoard passes `ended` in. Added a unit test, and UI-10 now checks that `turn-indicator` reads "Game over" on both pages.

### WR-03: Screen readers cannot read teammates' cards

**Files modified:** `apps/web/components/hanabi/Hand.tsx`, `apps/web/components/hanabi/TeammateCard.tsx`
**Commit:** f8e3e3f
**Applied fix:**
- The teammate card row is now a `role="group"` labelled "{label}'s cards". Clicking the row still selects the target, but the row is no longer a button.
- A separate small "Clue" button, labelled "Give {label} a clue" with `aria-pressed`, sits in the hand header for keyboard and screen-reader users.
- The rank span is no longer `aria-hidden`, so each card is announced as, e.g., "Red 3". Its textContent is unchanged.

UI-11 (5 players fit at 1280x720 with no scroll) still passes.
**Status:** fixed: requires human verification (the visual placement of the new header button needs a look)

### WR-04: A view that fails the schema shows "Loading game…" forever with no signal

**Files modified:** `apps/web/components/hanabi/HanabiBoard.tsx`
**Commit:** 2f12568
**Applied fix:**
- The `HanabiViewSchema.safeParse` result is memoized on `view.game`.
- A mismatch logs `console.error("HanabiView schema mismatch", issues)`.
- If `game` is present but fails the schema, the board shows a `role="alert"` message ("This game couldn't be displayed — try refreshing.", `data-testid="game-view-error"`) instead of the loading text.
- A null or undefined `game` still shows "Loading game…".

### WR-05: Clue preview state can go stale and override the selected clue

**Files modified:** `apps/web/components/hanabi/HanabiBoard.tsx`
**Commit:** 7e2ba6b
**Applied fix:** An effect clears `previewClue` whenever `clueTarget`, reconnecting/ended, or `game.isYourTurn` changes. The effect is placed before the early return so hook order stays stable.
**Status:** fixed: requires human verification (state logic)

### WR-06: The D-15 source-scan guard is easy to bypass and skips the real boundary

**Files modified:** `apps/web/lib/own-hand-source.test.ts`, `apps/web/lib/own-hand-render.test.ts` (new), `apps/web/lib/react-dom-server.d.ts` (new), `vitest.config.ts`
**Commit:** 0c4aaef
**Applied fix:**
- **Source scan:**
  - Now catches `?.suit`, spaced access, and bracket access (`["suit"]`).
  - Catches destructuring in OwnHandCard (tuned so a JSX `suit={...}` does not match).
  - Scans the `OwnHand` body in `Hand.tsx`: only `card.id` and `card.facts` may be read, facts must be passed as `facts={card.facts}`, and a `...card` spread or `card[` access is banned.
  - Tests are renamed to describe what they actually check.
- **Type checks:** the substring props check is replaced with compile-time checks that fail `tsc -b apps/web`. Neither the `OwnHandCard` nor the `CandidateStrip` props may have a field that has `suit` or `rank` keys, `CardFacts` has none, and `OwnHandCardProps` has no `card` key.
- **New render test:** `OwnHand` is rendered with `renderToStaticMarkup`. A hand of visible cards (suit/rank present) must produce byte-identical markup to the same cards with identity removed. A second check makes sure that comparison can fail.
- **Support changes:**
  - `vitest.config.ts` now compiles JSX for the web project (`oxc.jsx.runtime: "automatic"`).
  - A small `react-dom/server` declaration file was added, because the repo has no `@types/react-dom`.
- **Proof the guards can fail** (temporary changes, reverted, never committed):
  - With `Hand.tsx` changed to rebuild facts from `card.rank`, 3 tests failed: the OwnHand scan and 2 render tests.
  - Adding `card?: { suit: string }` to `OwnHandCardProps` made `tsc -b apps/web` fail on 2 type checks.

### WR-07: The e2e HIDE-01 check can never fail

**Files modified:** `e2e/start-game.spec.ts`
**Commit:** 0e13fa2
**Applied fix:** Removed the text-contains comparison and added two checks.
- **Wire check:** both pages record every WebSocket JSON frame from before their socket opens. Each `yourHand` card in every game frame must have `hidden === true` and no `suit` or `rank` key. At least one game frame must have been seen per page. A sanity check requires teammate cards in those same frames to carry `suit` and `rank`, which proves the recorder really sees identity keys when they are present.
- **DOM check:** before any clue, every own-hand slot on both pages must have `data-luminosity="unclued"`, no `confirmed-rank`, no `confirmed-suit`, no `positive-marks`, and every suit and rank pip at computed opacity 1.
- **Proof the DOM check can fail:** a temporary, uncommitted change to `Hand.tsx` passed `possibleRanks` narrowed to one value, simulating a rank leak. The test then failed at `confirmed-rank` toHaveCount(0); the old text check would have passed. A first attempt keyed on `card.hidden` did not leak, because the server always sends own cards hidden, so it proved nothing and was discarded.
- **Proof for the wire check:** by reasoning plus the teammate-card sanity check. Actually making the server leak would be blocked by the worker's strict schema gate before the frame is sent.

### WR-08: The RT-03 same-seat assertion is vacuous

**Files modified:** `e2e/hanabi-realtime.spec.ts`
**Commit:** 980aa8f
**Applied fix:** Before the reload, the test reads the reloading player's seatId from the untouched page, using `OTHER_HAND_SELECTOR`. After the reload it waits for three things:
- the reloaded page's own `seat-status-{thatSeat}` shows `data-connected="true"`, which fails outright if the reload took a different seat;
- the untouched page's `seat-status-{thatSeat}` shows connected;
- retrying assertions pass: exactly one other-hand container, with the same testid as before.

### WR-09: UI-10 loop can hang when the end overlay appears mid-iteration

**Files modified:** `e2e/start-game.spec.ts`
**Commit:** 211515c
**Applied fix:**
- The overlay is checked on both pages right before each click.
- Clicks go through a `tryClick` helper with a 2000ms timeout; when a click fails, the loop re-checks the overlay.
- The one-shot `isEnabled()` is replaced with a retrying `expect(...).toBeEnabled({ timeout: 2000 })` that is caught instead of thrown.

---

_Fixed: 2026-09-17T04:35:08Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

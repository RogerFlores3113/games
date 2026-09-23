---
phase: 06-game-interface
reviewed: 2026-09-17T04:17:18Z
depth: standard
files_reviewed: 24
files_reviewed_list:
  - apps/web/app/globals.css
  - apps/web/app/room/[code]/RoomClient.tsx
  - apps/web/components/ReconnectingBanner.tsx
  - apps/web/components/hanabi/CandidateStrip.tsx
  - apps/web/components/hanabi/CardActions.tsx
  - apps/web/components/hanabi/CluePicker.tsx
  - apps/web/components/hanabi/EndOverlay.tsx
  - apps/web/components/hanabi/HanabiBoard.tsx
  - apps/web/components/hanabi/Hand.tsx
  - apps/web/components/hanabi/OwnHandCard.tsx
  - apps/web/components/hanabi/SuitGlyph.tsx
  - apps/web/components/hanabi/Table.tsx
  - apps/web/components/hanabi/TeammateCard.tsx
  - apps/web/components/hanabi/luminosity-frame.ts
  - apps/web/lib/hanabi-board-logic.test.ts
  - apps/web/lib/hanabi-board-logic.ts
  - apps/web/lib/hanabi-visual-logic.test.ts
  - apps/web/lib/hanabi-visual-logic.ts
  - apps/web/lib/own-hand-source.test.ts
  - apps/web/lib/suit-visuals.test.ts
  - apps/web/lib/suit-visuals.ts
  - e2e/hanabi-realtime.spec.ts
  - e2e/helpers.ts
  - e2e/start-game.spec.ts
findings:
  critical: 1
  warning: 9
  info: 9
  total: 19
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-09-17T04:17:18Z
**Depth:** standard
**Files Reviewed:** 24
**Status:** issues_found

## Summary

I reviewed the Phase 6 game board: the orchestrator, the hand, card, table, clue and end components, the pure logic modules, the source-scan and unit tests, and the e2e specs.

**D-15 / HIDE-01 (own-hand identity): no rendering leak found.** I traced every value that reaches the DOM for an own-hand card:
- `OwnHand` passes only `card.facts`, `card.id` and the slot index.
- `OwnHandCard` and `CandidateStrip` render only from `candidateDisplayFor(facts)` and `luminosityStepFor(facts)`.
- `confirmedSuit` and `confirmedRank` come from `possibleSuits`/`possibleRanks` once each has narrowed to one entry.
- `positiveMarks` come from `positiveClues`.
- `data-glyph` is never set, because `exposeSuit` is never passed.
- The just-clued highlight uses public `touchedCardIds` from history.
- Card ids are opaque; the rules-side leak check covers `own-card-id-has-identity`.

The guards meant to keep this true are weaker than they claim, though (WR-06, WR-07).

The one BLOCKER is a timer/effect bug: the just-clued highlight can get stuck on the wrong cards. The warnings cover a similar stuck-flash bug, a wrong turn indicator after the game ends, accessibility gaps in teammate hands, a silent fallback when the view fails to parse, and weak or flaky tests.

## Critical Issues

### CR-01: Just-clued highlight gets stuck when any other update arrives within 2 seconds

**File:** `apps/web/components/hanabi/HanabiBoard.tsx:71-89`
**Issue:** The effect depends on `[game]`, and `game` is a new object on every server `state` frame. When a clue lands, the effect sets `justCluedIds` and schedules a 2000ms timer, with `clearTimeout` as its cleanup. If another frame arrives before the timer fires, React runs the cleanup first, which cancels the timer. That frame could be the next player's quick play or discard, a teammate's connect/disconnect flip, or any rebroadcast. The next effect run then takes one of two paths, and neither schedules a new clear:
- line 81 (`ids.length === 0` → `return`), when history grew with no clue; or
- line 88, when history length did not change.

`justCluedIds` then stays set until the next clue. `data-just-clued="true"` sticks and the `anim-clue-touch` overlay span stays mounted. Under `prefers-reduced-motion`, globals.css:146-149 draws a permanent static glow on those cards. That tells players the wrong cards were "just clued", in a game where clue information is the whole mechanic. Fast turns trigger this often, and the e2e test (hanabi-realtime.spec.ts:246) misses it because nothing happens during its 2s wait.
**Fix:** Separate "start a highlight" from "clear the highlight". Keep the timer out of the `[game]` effect's cleanup:
```tsx
const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
useEffect(() => () => { if (clearTimerRef.current) clearTimeout(clearTimerRef.current); }, []); // unmount only

useEffect(() => {
  const historyLength = game?.history.length ?? null;
  const prev = prevHistoryLengthRef.current;
  prevHistoryLengthRef.current = historyLength;
  if (prev === null || historyLength === null || !game || historyLength <= prev) return;
  const ids = touchedCardIdsFromLatestClue(game.history, prev);
  if (ids.length === 0) return;
  setJustCluedIds(new Set(ids));
  if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
  clearTimerRef.current = setTimeout(() => setJustCluedIds(new Set()), CLUE_HIGHLIGHT_MS);
}, [game]);
```
Add a unit or e2e case where a second action lands inside the highlight window.

## Warnings

### WR-01: Stack-complete flash has the same stuck-timer bug

**File:** `apps/web/components/hanabi/Table.tsx:24-39`
**Issue:** The effect depends on `[game.stacks]`, a new array on every frame. A frame within 600ms of the completing play cancels the timer. The next run returns early at line 32 (`completed.length === 0`), so `flashingSuits` never clears. `anim-stack-flash` stays on the stack. Under reduced motion (globals.css:151-154) that means a permanent `drop-shadow` filter, and a later remount would replay the animation.
**Fix:** Use the same pattern as CR-01: keep the timer in a ref cleared only on unmount or when a new flash starts, and don't return it as the `[game.stacks]` effect cleanup.

### WR-02: Turn indicator can say "Your turn" after the game has ended

**File:** `apps/web/components/hanabi/HanabiBoard.tsx:184-185`, `apps/web/lib/hanabi-board-logic.ts:96-107`
**Issue:** `isYourTurn` is masked with `!ended`, but `turnText` is `turnIndicatorText(game, ...)`, which reads the unmasked `game.isYourTurn`. `advanceTurn` (packages/rules/src/hanabi/actions.ts:127) moves `turnIndex` on the game-ending action too. So after game over, the next seat's indicator says "Your turn" (styled as not-your-turn, `data-your-turn="false"`) and everyone else sees "Waiting for X". Both are wrong for a finished game.
**Fix:** Pass `ended` in and short-circuit:
```ts
turnText={ended ? "Game over" : turnIndicatorText(game, view.seats, labelFor)}
```

### WR-03: Screen readers cannot read teammates' cards

**File:** `apps/web/components/hanabi/Hand.tsx:88-109`, `apps/web/components/hanabi/TeammateCard.tsx:61-68`
**Issue:** Two problems stack:
1. Every teammate card is inside a `<button aria-label="Give {label} a clue">`. A button's `aria-label` replaces its accessible name, and ARIA treats a button's children as presentational. The `sr-only` suit text and the candidate-strip `aria-label`s are therefore never announced.
2. Even outside the button, the rank span has `aria-hidden="true"` (TeammateCard.tsx:64), and `SuitGlyph` with `exposeSuit` but no `title` is also `aria-hidden`. The only accessible text is the suit label (e.g. "Red ") with no rank.

Teammates' cards are the main information in Hanabi, and assistive tech gets none of it.
**Fix:** Don't wrap the card row in the button. Render a separate "Give {label} a clue" button next to the row (or make the container a `role="group"` with its own label). Add the rank to the `sr-only` text: `` `${SUIT_VISUALS[card.suit].label} ${card.rank}` ``.

### WR-04: A view that fails the schema shows "Loading game…" forever with no signal

**File:** `apps/web/components/hanabi/HanabiBoard.tsx:42-44, 60, 113-128`
**Issue:** `isHanabiView` runs `HanabiViewSchema.safeParse` and throws away the error. If the worker and web deploys drift (e.g. a new field or variant enum value), every in-progress player sees a permanent "Loading game…" with nothing logged. It looks identical to a slow connection. This is the "blank page with no signal" failure that RoomClient.tsx:213-218 explicitly fixed for the connecting state.
**Fix:** Memoize the parse on `view.game` and surface failures:
```tsx
const parsed = useMemo(() => HanabiViewSchema.safeParse(view.game), [view.game]);
if (!parsed.success) console.error("HanabiView schema mismatch", parsed.error.issues);
```
When the view is not in the lobby state and parsing failed, render a visible error state ("This game couldn't be displayed — try refreshing") instead of the loading text.

### WR-05: Clue preview state can go stale and override the selected clue

**File:** `apps/web/components/hanabi/HanabiBoard.tsx:137-140`, `apps/web/components/hanabi/CluePicker.tsx:104-108, 124-128`
**Issue:** `activeClueValue = previewClue ?? clueValue`, and `previewClue` is cleared only by `onMouseLeave`, `onBlur` or a successful give. A value button can become `disabled` while hovered or focused: reconnecting, the turn passing, a target change that makes it zero-touch, or game end. Browsers do not reliably fire `blur`/`mouseleave` on an element that becomes disabled under the pointer or focus. `previewClue` then stays set and keeps previewing an old clue on teammates' cards, overriding the value the player actually picked.
**Fix:** Clear `previewClue` whenever `controlsDisabled`, `game.isYourTurn` or `clueTarget` changes:
```tsx
useEffect(() => { setPreviewClue(null); }, [clueTarget, controlsDisabled, game?.isYourTurn]);
```
Or ignore `previewClue` when `isValueDisabled(previewClue)` would be true.

### WR-06: The D-15 source-scan guard is easy to bypass and skips the real boundary

**File:** `apps/web/lib/own-hand-source.test.ts:112-131`
**Issue:**
- The regex `/\.(suit|rank)\b/` misses destructuring (`const { suit } = card`, a pattern CandidateStrip.tsx:37 already uses), bracket access (`card["suit"]`) and optional-chaining spacing variants.
- The "props type" check (lines 127-131) is a plain substring search: any comment or string containing `facts: CardFacts` passes it.
- `Hand.tsx`, the only place that holds the full card object and builds the `facts` prop, is not scanned at all. A regression like `facts={{ ...card.facts, possibleSuits: [card.suit] }}` in `OwnHand` passes every test here.
- The test names say "even in comments", but comments are stripped before scanning, so the names are misleading.
**Fix:**
- Add `Hand.tsx` (at least the `OwnHand` function body) to the scan.
- Also forbid `\bsuit\b\s*[,}]` in destructuring and `\[["'](suit|rank)["']\]`.
- Replace the substring prop check with a type-level test, e.g. `expectTypeOf<OwnHandCardProps>().not.toHaveProperty("card")`, plus a render test that feeds a visible card and asserts no `data-glyph` and no rank text beyond what the facts allow.
- Rename the tests to match what they do.

### WR-07: The e2e HIDE-01 check can never fail

**File:** `e2e/start-game.spec.ts:103-119`
**Issue:** A teammate card's `card-identity` textContent is `"Red 3"` (sr-only label plus rank). The own-hand region never renders a suit label as a text node: suit names only appear as SVG `aria-label`s, which are not textContent. So `expect(ownHandText).not.toContain("Red 3")` passes whether or not the own hand leaks, including if it rendered the real rank (it already renders "12345" rank pips). The test gives false confidence about the project's single most important invariant.
**Fix:** Compare structured signals instead of concatenated text. For each own-hand slot before any clue:
- assert no `[data-testid="confirmed-rank"]` and no `[data-testid="confirmed-suit"]`;
- assert every `rank-pips` child has opacity 1;
- assert `data-luminosity="unclued"`.

Also add a network-level check: intercept the WebSocket frame and assert `yourHand[*]` has no `suit`/`rank` keys.

### WR-08: The RT-03 same-seat assertion is vacuous

**File:** `e2e/hanabi-realtime.spec.ts:143-169`
**Issue:** `otherHandTestIdAfter` is read from `untouchedPage` straight after `reloadingPage.reload()`, before the reloaded page has even rejoined. The untouched page's DOM hasn't had a chance to change, so `toBe(otherHandTestIdBefore)` passes even if the reload took a new seat. The comment calls this the proof of seat identity.
**Fix:** First wait for the reloaded page's `own-hand` to show and for the untouched page's `seat-status-*` to reach `data-connected="true"`. Then use a retrying assertion:
```ts
await expect(untouchedPage.locator(OTHER_HAND_SELECTOR)).toHaveAttribute("data-testid", otherHandTestIdBefore!);
await expect(untouchedPage.locator(OTHER_HAND_SELECTOR)).toHaveCount(1);
```

### WR-09: UI-10 loop can hang when the end overlay appears mid-iteration

**File:** `e2e/start-game.spec.ts:195-227`
**Issue:** The overlay is checked (line 196) before `own-hand-slot-1` is clicked (line 206). If the game ends between the check and the click, e.g. the previous iteration's poll returned `!stillYourTurn` just before the end frame arrived, the fixed full-screen `end-overlay` blocks the click. Playwright then retries actionability until the 240s test timeout instead of breaking out. Separately, `isEnabled()` at line 207 does not retry right after a click, so iterations can be wasted.
**Fix:** Check `end-overlay` visibility just before the click and use a short click timeout (`click({ timeout: 2000 })` inside try/catch that re-checks the overlay). Replace `isEnabled()` with `await expect(playButton).toBeEnabled({ timeout: 2000 }).catch(() => ...)`.

## Info

### IN-01: Magic numbers where rules constants exist
**File:** `apps/web/components/hanabi/Table.tsx:61, 106`; `apps/web/components/hanabi/EndOverlay.tsx:75, 81, 83`; `apps/web/lib/hanabi-board-logic.ts:24`
**Issue:** `topRank === 5` and `{ length: 8 }` are hard-coded, and `MAX_CLUE_TOKENS = 8` is redefined locally even though `packages/rules` defines it (legality.ts). `hanabi-visual-logic.ts:104` deliberately avoids a literal 5, so this is also inconsistent.
**Fix:** Import `MAX_CLUE_TOKENS` from `@games/rules` (export it if needed) and use `RANKS[RANKS.length - 1]`.

### IN-02: Raw suit ids exposed as accessible text
**File:** `apps/web/components/hanabi/EndOverlay.tsx:88`; `apps/web/components/hanabi/Table.tsx:84, 172`
**Issue:** `title={stack.suit}` and `sr-only {stack.suit}` announce "red" or "black", while TeammateCard and CandidateStrip use `SUIT_VISUALS[suit].label`.
**Fix:** Use `SUIT_VISUALS[suit].label` everywhere.

### IN-03: Plural copy is wrong for 1
**File:** `apps/web/lib/hanabi-visual-logic.ts:195-200`; `apps/web/components/hanabi/Table.tsx:103, 125`
**Issue:** Produces "1 turns left", "1 cards left in deck", "1 clue tokens", "1 fuses left".
**Fix:** Add a small `plural(n, word)` helper (and update the e2e string assertions).

### IN-04: CluePicker duplicates the disable logic
**File:** `apps/web/components/hanabi/CluePicker.tsx:46-63`
**Issue:** `isValueDisabled` and `hasZeroTouchOption` re-implement the ended/reconnecting/turn/token checks from `disabledReasonFor`. `zeroTouchTarget` runs the same `find` twice. Two copies of the disable rules can drift apart.
**Fix:** Build them on `disabledReasonFor(game, { kind: "clue", targetSeatId: clueTarget, clue }, ctx) !== null`, and do the `find` once.

### IN-05: Teammate order assumes room seat order equals game turn order
**File:** `apps/web/components/hanabi/HanabiBoard.tsx:132-136`
**Issue:** `teammatesInTurnOrder` uses `view.seats` order. The engine's `seatIds` come from `state.seats` at start (room-state.ts:276), so the orders match today. Nothing enforces that, though, and the view doesn't expose `seatIds`.
**Fix:** Expose the turn order in `HanabiView` or document the invariant where seats can be reordered.

### IN-06: Double-click sends duplicate actions with different ids
**File:** `apps/web/components/hanabi/HanabiBoard.tsx:196-197`; `apps/web/app/room/[code]/RoomClient.tsx:253`
**Issue:** `selectedCardId` stays set until the server replies, and each click mints a new `nanoid`. Server-side dedup therefore can't collapse a double-click. The second action is rejected, and `room-store.ts:95-99` silently drops the error.
**Fix:** Keep an in-flight flag in `act()` that is cleared on the next `state` frame.

### IN-07: Dead code in the identity tripwire test
**File:** `apps/web/lib/hanabi-visual-logic.test.ts:230, 241`
**Issue:** `recordedKeys` is filled but never read, and the `__recordedKeys` cast is unused.
**Fix:** Remove them, or assert that the recorded keys are a subset of the allowed keys.

### IN-08: Non-retrying `isEnabled()` right after a click in the e2e helpers
**File:** `e2e/hanabi-realtime.spec.ts:35, 93`
**Issue:** The immediate reads can race React's re-render, and branch choice becomes non-deterministic (discard vs play).
**Fix:** Wait for `data-selected="true"` before reading the button state.

### IN-09: Room-closed screen shows no way forward
**File:** `apps/web/app/room/[code]/RoomClient.tsx:196-210`
**Issue:** The abandoned-room screen has no link back to "/", while EndOverlay offers "New game".
**Fix:** Add a "New game" link for consistency.

---

_Reviewed: 2026-09-17T04:17:18Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

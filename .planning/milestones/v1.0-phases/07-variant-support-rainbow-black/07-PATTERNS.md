# Phase 7: Variant Support (Rainbow, Black) - Pattern Map

**Mapped:** 2026-09-18
**Files analyzed:** 12 (all modifications to existing files — this phase adds no brand-new production module except possibly one e2e spec file)
**Analogs found:** 12 / 12 (every file to touch already exists; this phase is "extend in place," not "invent a new shape")

This phase creates almost no new files. Every "file to modify" already contains the pattern it must extend — so for most rows, the "analog" IS the file itself: the task is to extend an existing exhaustive switch / matrix / test list in the SAME style already used for the other two variants or reasons. One genuinely new file is anticipated (`e2e/variant-rainbow.spec.ts`), and its closest analog is the existing `e2e/start-game.spec.ts` UI-10 test body plus `startGameWithPlayers`.

## File Classification

| File to modify/create | Role | Data Flow | Closest Analog (self or sibling) | Match Quality |
|---|---|---|---|---|
| `packages/rules/src/hanabi/legality.ts` (`canClue`) | service (pure rules predicate) | request-response (legality check) | itself — `canDiscard`'s `discard_at_max_clues` guard (same file, lines 83-96) | exact |
| `packages/rules/src/adapter.ts` (`AdapterError` union) | model (closed type union) | transform | itself — existing 8-member union | exact |
| `packages/schema/src/messages.ts` (`ErrorDetailSchema`) | schema/config | request-response | itself — existing 9-member zod enum | exact |
| `apps/worker/src/room-state.ts` (`mapAdapterError`) | controller (exhaustive mapper) | request-response | itself — existing switch, `clue_touches_nothing` case | exact |
| `packages/rules/src/hanabi/actions.ts` (`isClueRequest` doc comment, no behavior change) | utility (guard) | transform | itself — doc comment near line 90-97 | exact |
| `packages/rules/src/hanabi/legality.test.ts` | test | unit | itself — `clue_touches_nothing` test (lines 137-163) and the `VARIANTS` sweep pattern | exact |
| `packages/rules/src/hanabi/variant-matrix.test.ts` | test | property/batch | itself — the `for (const variant of VARIANTS)` sweep (lines 47-116) | exact |
| `apps/web/components/hanabi/CluePopover.tsx` | component | request-response (click -> dispatch) | itself — the two-button (`tile-clue-color`/`tile-clue-rank`) layout | exact |
| `apps/web/components/hanabi/TeammateCard.tsx` | component | request-response | itself — `colorNameable`/`colorDisabled` computation (lines 93-106) | exact |
| `apps/web/lib/hanabi-board-logic.ts` (`cluableColorsForView`) | utility | transform | itself — already exports the exact function D-05 needs | exact |
| `e2e/helpers.ts` (`giveAnyLegalClue`, `openTileCluePopover`) | test helper | request-response (browser automation) | itself | exact |
| `e2e/variant-rainbow.spec.ts` (new) | test | e2e | `e2e/start-game.spec.ts`'s UI-10 test (lines 287-390) + `startGameWithPlayers` | role-match (new file, well-worn sibling shape) |
| `e2e/start-game.spec.ts` (parametrize UI-10 over variants) | test | e2e | itself — same file, `startGameWithPlayers`/`playUntilGameEnds` already accept `variant` | exact |
| `apps/worker/src/room-do.ts` / `wrangler.jsonc` (only if a dev-only deck/seed hook is added, D-18 discretion) | config/middleware | request-response | `SOCKET_STALE_MS`/`ZOMBIE_SWEEP_INTERVAL_MS` (`apps/worker/src/heartbeat.ts`, `room-do.ts` lines 89-93, `playwright.config.ts` line 76) | exact |

## Pattern Assignments

### `packages/rules/src/hanabi/legality.ts` — `canClue` (D-01/D-02)

**Analog:** itself, the existing guard-chain style used by every other `can*` predicate in this file.

**Core pattern to copy** (the guard-chain shape, `legality.ts:166-186`):
```typescript
export function canClue(
  state: HanabiState,
  actorSeatId: string,
  targetSeatId: string,
  clue: Clue,
): Legality {
  if (!isActorsTurn(state, actorSeatId)) return { legal: false, reason: "not_your_turn" };
  if (isGameOver(state)) return { legal: false, reason: "game_over" };
  if (state.clueTokens <= 0) return { legal: false, reason: "no_clue_tokens" };
  if (targetSeatId === actorSeatId || !state.seatIds.includes(targetSeatId)) {
    return { legal: false, reason: "clue_target_invalid" };
  }
  const targetHand = state.hands.find((h) => h.seatId === targetSeatId);
  if (targetHand === undefined) {
    return { legal: false, reason: "clue_target_invalid" };
  }
  const config = variantConfig(state.variant);
  const touched = cardsTouchedByClue(config, targetHand.slots, clue);
  if (touched.length === 0) return { legal: false, reason: "clue_touches_nothing" };
  return { legal: true };
}
```
D-01/D-02 insert a new `if` between the target-hand lookup and the touch check (per CONTEXT's "Claude's Discretion": anywhere before the touch check is fine), e.g.:
```typescript
  const config = variantConfig(state.variant);
  if (clue.type === "color" && !config.cluableColors.includes(clue.value)) {
    return { legal: false, reason: "clue_color_not_nameable" };
  }
  const touched = cardsTouchedByClue(config, targetHand.slots, clue);
```
`config.cluableColors` (already exported by `variant.ts:65`) is the single source — do not hardcode a suit list here.

**Type to extend** (`Legality`, line 25, unchanged shape — only the reason union widens downstream in `adapter.ts`).

---

### `packages/rules/src/adapter.ts` — `AdapterError` union (D-02)

**Analog:** itself, lines 22-30.
```typescript
export type AdapterError =
  | "not_your_turn"
  | "invalid_action"
  | "game_over"
  | "card_not_in_hand"
  | "no_clue_tokens"
  | "clue_touches_nothing"
  | "clue_target_invalid"
  | "discard_at_max_clues";
```
Add `| "clue_color_not_nameable"` (or D-11's final chosen name) as a new member of this closed union, in the same alphabetical-ish grouping style. This is a "closed union" pattern (per CONTEXT's "Established Patterns": adding a member breaks compilation everywhere until all sites are updated — that is intentional, not a bug to work around).

---

### `packages/schema/src/messages.ts` — `ErrorDetailSchema` (D-02)

**Analog:** itself, lines 147-157.
```typescript
export const ErrorDetailSchema = z.enum([
  "view_unavailable",
  "not_your_turn",
  "invalid_action",
  "game_over",
  "card_not_in_hand",
  "no_clue_tokens",
  "clue_touches_nothing",
  "clue_target_invalid",
  "discard_at_max_clues",
]);
```
Append the new reason string here too — the doc comment above (lines 139-146) explicitly states this enum "mirrors `AdapterError` 1:1 by name," so the string literal must match `adapter.ts` exactly, character for character.

---

### `apps/worker/src/room-state.ts` — `mapAdapterError` (D-02)

**Analog:** itself, lines 396-419 (the exhaustive switch already covering `clue_touches_nothing`).
```typescript
function mapAdapterError(error: AdapterError): ErrorDetail {
  switch (error) {
    case "not_your_turn":
      return "not_your_turn";
    ...
    case "clue_touches_nothing":
      return "clue_touches_nothing";
    case "clue_target_invalid":
      return "clue_target_invalid";
    case "discard_at_max_clues":
      return "discard_at_max_clues";
    default: {
      const exhaustiveCheck: never = error;
      throw new Error(`Unrecognized AdapterError: ${String(exhaustiveCheck)}`);
    }
  }
}
```
Add `case "clue_color_not_nameable": return "clue_color_not_nameable";` immediately alongside the other clue-rejection cases. The `never`-typed `default` is the safety net (per doc comment lines 393-395) — this is what makes the three-site threading a compile error until complete, which is the intended behavior, not something to suppress.

---

### `packages/rules/src/hanabi/actions.ts` — `isClueRequest` doc comment (D-03)

**Analog:** itself, lines 90-97. Current (to-be-corrected) text:
```typescript
/**
 * ... whether a color/rank value is actually
 * cluable in the active variant (e.g. "rainbow" is never nameable) is left
 * to `canClue`'s touch-check downstream — a clue naming a color the active
 * variant does not use touches zero cards and is rejected with
 * `clue_touches_nothing`, so this generic guard only needs to know the value
 * is A suit or A rank, not which variant is active (this guard has no state
 * parameter to consult). */
```
D-03 requires correcting the false claim (Rainbow's "rainbow" DOES touch cards, so it is NOT rejected by `clue_touches_nothing`) to point at the new `canClue` nameable-colour check instead. No behavior/signature change — comment-only edit in the same file.

---

### `packages/rules/src/hanabi/legality.test.ts` (D-04 regression)

**Analog:** itself. Two patterns to reuse:

1. **The `VARIANTS` sweep constant** (line 20): `const VARIANTS: Variant[] = ["base", "rainbow", "black"];` — already imported/used by other tests in this file (e.g. `cardsTouchedByClue` test, lines 165-179). Reuse this constant for the new "every color outside `cluableColors` is rejected, per variant" test rather than declaring a new local array.

2. **The `buildState` deterministic-hand-craft helper** (lines 22-45) and the `clue_touches_nothing` test's exact shape (lines 137-163) — copy this structure for the new "canClue rejects a non-nameable colour with `clue_color_not_nameable`, not `clue_touches_nothing`" test, per variant:
```typescript
it("canClue rejects a non-nameable colour with clue_color_not_nameable, not clue_touches_nothing", () => {
  const config = variantConfig("rainbow");
  const state = buildState("rainbow", ["a", "b"], "seed-X");
  expect(canClue(state, "a", "b", { type: "color", value: "rainbow" })).toEqual({
    legal: false,
    reason: "clue_color_not_nameable",
  });
});
```
D-04's property test ("no accepted clue anywhere ever carries a non-nameable colour value") is best added to `variant-matrix.test.ts` (see next section) or `test-support.ts`'s `enumerateLegalActions`, since that helper already restricts clue candidates to `config.cluableColors` (test-support.ts:51) — the property is really "assert this restriction is enforced by `canClue` itself, not just by the test harness's candidate generator."

---

### `packages/rules/src/hanabi/variant-matrix.test.ts` (D-04/D-16 extension)

**Analog:** itself — the existing per-variant `if (variant === "rainbow") {...}` / `if (variant === "black") {...}` blocks inside the single sweep loop (lines 86-110).
```typescript
if (variant === "rainbow") {
  expect(config.cluableColors.includes("rainbow")).toBe(false);
  expect(config.colorClueTouches("rainbow", "red")).toBe(true);
  expect(config.colorClueTouches("red", "red")).toBe(true);
  expect(config.colorClueTouches("blue", "red")).toBe(false);
}
```
Add a same-shape block (or extend this one) asserting `canClue(..., {type:"color", value:"rainbow"})` / `{value:"black"}` (in base/rainbow) is rejected with the new reason. For D-16 (each variant reaches each end condition), extend the existing full-game loop (lines 60-84) — it already asserts `score`/`maxScoreFor`/`scoreBand` agree once the game ends via the deterministic `enumerateLegalActions`/`currentActorSeatId` harness from `test-support.ts`; add sibling constructed-state cases (a hand-crafted near-complete `HanabiState` for the "perfect score" path, similar to `legality.test.ts`'s `buildState` + slot-override technique) rather than relying on the random full-game loop to happen to reach a perfect score.

**Non-vacuousness pattern** (line 113-115, reuse verbatim style): `expect(variantsSwept).toBe(3);` — any new sweep should carry the same "did this actually run 3 times" guard.

---

### `apps/web/components/hanabi/CluePopover.tsx` (D-05..D-07)

**Analog:** itself. Current two-button shape (full file, 77 lines) is the template for the rainbow tile's new colour row. Key excerpt, the colour button (lines 51-62):
```tsx
<button
  type="button"
  role="menuitem"
  data-testid="tile-clue-color"
  aria-label={`Give a ${suitVisual.label} clue`}
  disabled={colorDisabled}
  onClick={onGiveColor}
  className="cursor-pointer rounded px-[length:var(--space-xs)] py-[length:var(--space-xs)] text-[length:var(--text-label)] transition-colors hover:bg-[var(--color-bg)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
  style={{ color: suitVisual.hueVar, lineHeight: "var(--text-label--line-height)" }}
>
  {suitVisual.label}
</button>
```
D-05 replaces this SINGLE button, for a rainbow tile only, with a row of N such buttons (one per `cluableColorsForView(game)` entry), each styled identically (own `hueVar`, own `label`, same `data-testid` pattern e.g. `tile-clue-color-{suit}`) but sharing one disabled gate (D-07 — no per-entry disabling). The bold rank button below (lines 63-74) is unchanged and must stay exactly as is — D-05 changes only the colour slot.

The component's own doc comment (lines 15-31) documents the absolute-overlay/`data-clue-tile` contract this new row must not break — anchoring, `position: relative` wrapper, no `stopPropagation` (outside-click listener already allows clicks matched via `data-clue-tile`, see `HanabiBoard.tsx` excerpt below).

---

### `apps/web/components/hanabi/TeammateCard.tsx` (D-05..D-08)

**Analog:** itself, lines 83-106 — the `colorNameable`/`colorDisabled` computation this phase must change from "disable if not nameable" to "show a row if this suit is not itself nameable but IS the rainbow suit; otherwise show/disable a single button as today":
```typescript
const colorNameable = !card.hidden && cluableColorsForView(game).includes(card.suit);
const colorDisabled =
  card.hidden ||
  !colorNameable ||
  disabledReasonFor(game, { kind: "clue", targetSeatId: seatId, clue: { type: "color", value: card.suit } }, ctx) !==
    null;
```
The variant-agnostic detection rule CONTEXT specifies (code_context "Established Patterns") is to keep using `cluableColorsForView(game).includes(card.suit)` — i.e. "is this tile's own suit itself nameable" — as the boolean deciding single-button vs. row, NOT a literal `suit === "rainbow"` check. When `!colorNameable` (true only for rainbow tiles across all three variants, since Black's own suit IS nameable per `variant.ts` `BLACK_CONFIG.cluableColors`), render the colour row instead of a single (permanently disabled) button; every row entry shares one `disabledReasonFor(game, {kind:"clue", targetSeatId: seatId, clue:{type:"color", value: <row color>}}, ctx)` call — D-07 says it will always evaluate to the same shared gate (game/turn/tokens/reconnect) because a rainbow tile is touched by every colour, so a single shared boolean (not per-entry) is correct and matches the CONTEXT's explicit "no entry is ever individually disabled" instruction.

The `onGiveClue` wiring pattern to replicate per row entry (line 210-211):
```tsx
onGiveColor={() => onGiveClue({ type: "color", value: card.suit })}
```
becomes, per row entry, `onGiveClue({ type: "color", value: <that entry's suit> })` — an ordinary colour clue, exactly the shape `canClue`/`applyHanabiAction` already accept.

The doc comment at lines 88-92 ("`colorDisabled` adds one more real-world case... that case has no accompanying written reason either") documents TODAY's (pre-Phase-7) behavior and must be updated alongside the code change, per the canonical_refs note ("Its comment near line 89 documents today's disabled-rainbow behaviour").

---

### `apps/web/lib/hanabi-board-logic.ts` — `cluableColorsForView` (already correct, D-05 consumer)

**Analog:** itself, lines 132-137 — no change needed, this is the reusable asset:
```typescript
export function cluableColorsForView(view: HanabiView): readonly Suit[] {
  return variantConfig(view.variant).cluableColors;
}
```
`TeammateCard.tsx` and the new colour-row logic both read this function; no new helper file needed for "what colours can I offer."

---

### `apps/web/components/hanabi/HanabiBoard.tsx` — outside-click / `data-clue-tile` (unchanged, load-bearing constraint)

**Analog:** itself, lines 165-188:
```typescript
useEffect(() => {
  if (clueOpenCardId === null) return;
  function handlePointerDown(event: PointerEvent): void {
    const target = event.target as Element | null;
    if (target?.closest(`[data-clue-tile="${clueOpenCardId}"]`)) return;
    setClueOpenCardId(null);
  }
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") setClueOpenCardId(null);
  }
  window.addEventListener("pointerdown", handlePointerDown);
  window.addEventListener("keydown", handleKeyDown);
  return () => {
    window.removeEventListener("pointerdown", handlePointerDown);
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [clueOpenCardId]);
```
The rainbow colour row's buttons live INSIDE `TeammateCard.tsx`'s `<span data-clue-tile={card.id}>` wrapper (line 115 of that file), the same wrapper this effect already matches via `.closest()`. No change needed here as long as the new buttons are rendered inside that same wrapper — this is the hard constraint, not a file to edit.

---

### `e2e/helpers.ts` — `openTileCluePopover` / `giveAnyLegalClue` (D-18 dependency)

**Analog:** itself, lines 101-142.
```typescript
export async function openTileCluePopover(
  page: Page,
  targetSeatId: string,
  tileIndex = 0,
): Promise<{ colorButton: Locator; rankButton: Locator } | null> {
  const tile = page.locator(`[data-testid="other-hand-${targetSeatId}"] [data-testid^="other-hand-card-"]`).nth(tileIndex);
  await tile.click();
  const popover = page.getByTestId("tile-clue-popover");
  if ((await popover.count()) === 0) return null;
  return { colorButton: page.getByTestId("tile-clue-color"), rankButton: page.getByTestId("tile-clue-rank") };
}
```
This helper's return shape (`{colorButton, rankButton}`) assumes exactly ONE colour button (`getByTestId("tile-clue-color")`). Once D-05 lands, a rainbow tile's popover renders a ROW of colour buttons (plural testids, e.g. `tile-clue-color-{suit}`), so `openTileCluePopover` must be extended to also return something like `colorButtons: Locator` (a multi-match locator) for that case, while leaving the singular `colorButton` return intact for every non-rainbow tile (a `getByTestId("tile-clue-color")` singular locator will simply not match on a rainbow tile once its testid is per-suit — verify the new testids don't collide with the old singular one, or keep one row entry ALSO carrying the bare `tile-clue-color` testid as a compatibility alias if that's simpler).

`giveAnyLegalClue` (lines 123-142) already documents the exact gap this phase closes, in its own doc comment (lines 118-121): *"this tries every hand tile (in case an individual tile's colour is a non-nameable suit, e.g. Rainbow) and prefers a colour clue when available, falling back to rank."* Post-D-05, a rainbow tile's colour buttons become clickable too, so this fallback-to-rank-only behavior for rainbow tiles should be updated to also try the new row (canonical_refs explicitly flags this: *"falls back to the rank clue when a rainbow tile's colour button is disabled; update once D-05 lands"*).

---

### `e2e/start-game.spec.ts` — UI-10 full game test (D-17) and new Rainbow spec (D-18)

**Analog:** itself, lines 287-390 (UI-10) — the `startTwoPlayerGame`/manual play loop this test currently hardcodes to base's `/ 25` (line 382):
```typescript
await expect(page.getByTestId("final-score")).toHaveText(/^Final score: \d+ \/ 25 — .+$/);
```
D-17 parametrizes this over `{variant: "base", expected: 25}`, `{variant: "rainbow", expected: 30}`, `{variant: "black", expected: 30}` via `startGameWithPlayers(hostPage, browser, names, {variant})` (already accepts a `variant` option, `e2e/helpers.ts:219-248`) or `startTwoPlayerGame` if that gets a variant param added too — same test BODY, table-driven over the three numbers, per D-17's explicit "no per-variant branches beyond the expected-numbers table."

The **"UAT gap 1 fixed geometry" test** (lines 829-928+) is the closest analog for a NEW `e2e/variant-rainbow.spec.ts`'s "wait for a settled, agreed-upon board state across pages" pattern — its `BoardSnapshot`/`waitForSettledBoard` helpers (lines 852-928) are the load-bearing pattern for reliably reading board state (played-stack ranks, clue tokens, turn holder) from a live multiplayer game without racing server pushes; reuse this shape rather than re-inventing polling in the new Rainbow spec, since the Rainbow test also needs "wait until a specific player's turn AND a specific card fact is visible" style polling.

`playUntilGameEnds` (`e2e/helpers.ts:345-399`) is the direct analog/reusable asset for D-17's full-game loop — already variant-agnostic (drives via `own-hand-slot-1` + `play-button` regardless of variant), no changes needed there beyond what a variant's board renders.

---

### `apps/web/lib/suit-visuals.test.ts` / `SuitGlyph.tsx` (D-11, UI-07 verification)

**Analog:** itself — `suit-visuals.test.ts` already has the exact assertions D-11 asks for:
- "all seven are pairwise distinct" glyphPath check (lines 62-69) — already covers rainbow, no change needed, just confirm it stays green.
- The UAT gap 38 turn-vs-rainbow distance check (lines 144-166) is the direct analog/reusable pattern for any NEW "X is visually distinct from Y" check this phase might add — same `contrastRatio`/Euclidean-distance-in-RGB helpers, same >50-unit threshold.

**New assertion needed** (not yet present): "`SuitGlyph` renders a gradient `url(#…)` fill for rainbow" is a RENDER-level check, which `suit-visuals.test.ts` (pure-function-only, no DOM per the VALIDATION.md note "the web Vitest project has no DOM environment") cannot do. Per VALIDATION.md, this assertion belongs in `e2e/variant-rainbow.spec.ts` (Playwright), reading the live SVG's `<path style="fill: url(#...)">` — analog is `SuitGlyph.tsx`'s own render logic (lines 65-78), specifically the `style={{ fill: isRainbow ? \`url(#${gradientId})\` : visual.hueVar }}` line, which the e2e assertion should locate via a CSS/attribute selector on the rendered `<path>`.

---

### `apps/web/lib/own-hand-source.test.ts` (Regression guard, D-05 touches only teammate code)

**Analog:** itself, lines 1-35 — the exact file list this phase must NOT need to extend, since D-05 touches only `TeammateCard.tsx`/`CluePopover.tsx` (teammate-tile code), never `OwnHandCard.tsx`, `HintIndicator.tsx`, `NoteBox.tsx`, or `useHandDrag.ts`. If a new shared helper is introduced that both own-hand and teammate code import (unlikely for this phase's scope), it must be added to this file's scanned-path list (`OWN_HAND_CARD_PATH`, `HINT_INDICATOR_PATH`, `NOTE_BOX_PATH`, `USE_HAND_DRAG_PATH`) per its own stated purpose — otherwise no action needed, this is a guard to keep green, not a file to edit.

---

### Dev-only override mechanism (D-18 discretion, "no seed/deck override reachable in production")

**Analog:** `apps/worker/src/heartbeat.ts` lines 20-53 (`HeartbeatEnv`, `resolveOverride`, `resolveHeartbeatTiming`) + `apps/worker/src/room-do.ts` lines 82-93 (`Env` interface) + `playwright.config.ts` line 76 (`--var` injection at `wrangler dev` invocation time) + `apps/worker/wrangler.jsonc` (production config, which declares NO `vars` block at all — the override literally cannot exist in production because production's `wrangler.jsonc` never sets it, and `resolveOverride` falls back to the real constant whenever the env var is `undefined` or fails validation).

Copyable shape if a dev-only deck/seed hook is chosen for D-18:
```typescript
// wherever env vars are read (mirrors heartbeat.ts:20-26, 33-44)
export interface SomeDevEnv {
  DEV_FORCE_SEED?: string; // never set in production wrangler.jsonc
}
function resolveDevSeed(raw: string | undefined, fallback: string): string {
  if (raw === undefined || raw === "") return fallback;
  // validate shape strictly here, exactly like resolveOverride's numeric guard
  return raw;
}
```
and in `playwright.config.ts`, alongside the existing line:
```typescript
command: `npx wrangler dev --port ${WORKER_PORT} --var SOCKET_STALE_MS:${E2E_SOCKET_STALE_MS} --var ZOMBIE_SWEEP_INTERVAL_MS:${E2E_ZOMBIE_SWEEP_INTERVAL_MS}`,
```
add a third `--var` for the new dev-only key. `apps/worker/wrangler.jsonc` (production) must NOT gain a `vars` entry for it — the T-07-02 test (VALIDATION.md) should assert exactly this absence via `grep` of the production config, mirroring how `SOCKET_STALE_MS`/`ZOMBIE_SWEEP_INTERVAL_MS` are absent from `wrangler.jsonc` today (confirmed: `wrangler.jsonc` has no `vars` block at all).

**Given D-18 says "the mechanism is Claude's discretion, within the constraint,"** and the CONTEXT also offers a no-server-change alternative ("more seats plus retrying room creation until a rainbow tile is visible"), the retry-based e2e approach (start a 5-seat Rainbow game, inspect a teammate's hand via `teammateHandCardIds`-style helper — `e2e/helpers.ts:327` — and retry room creation if no rainbow tile appears in any visible teammate hand within N attempts) requires ZERO new production or dev-only code, and is the lower-risk option relative to standing up a new env var end to end. Flagging both as viable; the dev-var route has a stronger existing analog (above) if retry proves flaky.

## Shared Patterns

### Exhaustive closed unions with `never`-typed defaults
**Source:** `apps/worker/src/room-state.ts:396-419` (`mapAdapterError`), `packages/rules/src/hanabi/variant.ts:130-143` (`variantConfig`)
**Apply to:** `AdapterError`, `ErrorDetailSchema`, `mapAdapterError` — the new `clue_color_not_nameable` reason must appear in all three, and every switch's `default: { const exhaustiveCheck: never = ...; throw ... }` pattern is what makes a missed site a compile error, not a silent gap. Do not add a catch-all case anywhere in this chain.

### Variant parametrization via `VariantConfig`, never `suit === "rainbow"` branching
**Source:** `packages/rules/src/hanabi/variant.ts` (whole file, especially `cluableColors`/`colorClueTouches` per variant, lines 75-125), `apps/web/lib/hanabi-board-logic.ts:135-137` (`cluableColorsForView`)
**Apply to:** every file above — `canClue`'s new check reads `config.cluableColors`, `TeammateCard.tsx`'s row-vs-button decision reads `cluableColorsForView(game).includes(card.suit)`, never a literal suit string.

### Deterministic per-variant test sweeps
**Source:** `packages/rules/src/hanabi/variant-matrix.test.ts:17, 47-116` (`VARIANTS` array + single `for` loop with per-variant `if` blocks and a `variantsSwept` non-vacuousness counter), `packages/rules/src/hanabi/legality.test.ts:20` (same `VARIANTS` constant)
**Apply to:** any new regression/property test asserting a rule "for base, rainbow and black" — reuse this loop-plus-counter shape rather than three near-duplicate `it` blocks.

### Absolute-overlay popover anchored via shared `data-clue-tile` wrapper
**Source:** `apps/web/components/hanabi/TeammateCard.tsx:115` (wrapper) + `CluePopover.tsx` (renderer) + `HanabiBoard.tsx:165-188` (outside-click/Escape listener matched via `.closest('[data-clue-tile="..."]')`)
**Apply to:** the new rainbow colour row — it must render inside the existing wrapper span, using the existing listener, with no new ref plumbing.

### Dev-only wrangler `--var` overrides, absent from production config
**Source:** `apps/worker/src/heartbeat.ts:20-53`, `apps/worker/src/room-do.ts:82-93`, `playwright.config.ts:38-39, 76`, `apps/worker/wrangler.jsonc` (no `vars` block)
**Apply to:** D-18's mechanism, if a deck/seed hook is chosen over the seat-retry alternative.

## No Analog Found

None — every file this phase touches already has a direct, in-file precedent (itself, extended) except the one genuinely new e2e spec, which has strong sibling analogs in `e2e/start-game.spec.ts` and `e2e/helpers.ts` (listed above).

## Metadata

**Analog search scope:** `packages/rules/src/hanabi/`, `packages/rules/src/adapter.ts`, `packages/schema/src/messages.ts`, `apps/worker/src/{room-state,room-do,heartbeat,scheduler}.ts`, `apps/web/components/hanabi/`, `apps/web/lib/`, `e2e/`, `apps/worker/wrangler.jsonc`, `playwright.config.ts`
**Files scanned:** ~20 read in full or in targeted ranges (legality.ts, adapter.ts, messages.ts, room-state.ts ~70-line window, variant.ts, actions.ts excerpt, variant-matrix.test.ts, test-support.ts, legality.test.ts x2 windows, CluePopover.tsx, TeammateCard.tsx, hanabi-board-logic.ts, HanabiBoard.tsx excerpt, suit-visuals.ts excerpt + suit-visuals.test.ts, SuitGlyph.tsx, e2e/helpers.ts x2 windows, e2e/start-game.spec.ts x2 windows, own-hand-source.test.ts excerpt, heartbeat.ts excerpt, room-do.ts excerpt, wrangler.jsonc)
**Pattern extraction date:** 2026-09-18

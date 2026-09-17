# Phase 6: Game Interface - Pattern Map

**Mapped:** 2026-09-16
**Files analyzed:** 13 (8 new components, 1 new lib module, 2 extended lib/component files, 1 CSS extension, 2 e2e spec extensions)
**Analogs found:** 13 / 13 (all files have at least a role-match analog; this phase is a from-scratch visual build with no external prior art, so analogs are internal-only per RESEARCH.md)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/web/components/hanabi/HanabiBoard.tsx` (replaces current file) | component (orchestrator) | request-response (props in, `onAction` out) | `apps/web/components/HanabiBoard.tsx` (current, in place) | exact — same prop contract, same component being replaced |
| `apps/web/components/hanabi/Table.tsx` | component | transform (view → tableau markup) | `apps/web/components/HanabiBoard.tsx` (stacks/discard/tokens section, lines 183-250) | role-match |
| `apps/web/components/hanabi/Hand.tsx` | component | transform (per-seat card list → markup) | `apps/web/components/HanabiBoard.tsx` (other-hands section, lines 146-181) + `apps/web/components/SeatRow.tsx` (connection-status inline pattern) | role-match |
| `apps/web/components/hanabi/Card.tsx` | component | transform (card + facts → visual frame) | `apps/web/components/HanabiBoard.tsx` (own-hand-slot button, lines 260-308) | role-match |
| `apps/web/components/hanabi/SuitGlyph.tsx` | component (pure presentational) | transform (suit enum → SVG) | none in-repo (new visual system); pattern source is RESEARCH.md's Code Examples skeleton | no analog — see below |
| `apps/web/components/hanabi/CandidateStrip.tsx` | component | transform (facts → pip list) | `apps/web/components/HanabiBoard.tsx` (positiveClues/negativeClues rendering, lines 283-304) | role-match |
| `apps/web/components/hanabi/CluePicker.tsx` | component | event-driven (hover/focus/click → local state → `onAction`) | `apps/web/components/HanabiBoard.tsx` (clue-target/clue-value button grid, lines 340-416) | exact |
| `apps/web/components/hanabi/EndOverlay.tsx` | component | transform (ended view → modal markup) | `apps/web/components/RefusalCard.tsx` (centered card-on-scrim pattern) + `apps/web/components/HanabiBoard.tsx` (game-over section, lines 418-435) | role-match |
| `apps/web/lib/hanabi-visual-logic.ts` (new) | utility (pure derivation) | transform | `apps/web/lib/hanabi-board-logic.ts` (entire file — same "pure function over `HanabiView`/`ClueFactsView`" pattern) | exact |
| `apps/web/lib/hanabi-visual-logic.test.ts` (new) | test | transform | `apps/web/lib/hanabi-board-logic.test.ts` (entire file — `baseView()` fixture + `describe`/`it` per function) | exact |
| `apps/web/lib/hanabi-board-logic.ts` (extended: `clueTouchIdsForTarget`, `disabledReasonFor` if placed here instead) | utility (pure derivation) | transform | itself — extend in place, mirror `clueTouchCountForTarget`'s dispatch-through-`variantConfig` pattern (lines 24-39) | exact |
| `apps/web/app/globals.css` (extended: `--color-suit-*`, `--color-card-glow` tokens) | config | transform (design tokens) | itself — extend the existing `@theme` block (lines 20-73) | exact |
| `e2e/start-game.spec.ts` / `e2e/hanabi-realtime.spec.ts` (extended, not replaced) | test (e2e) | event-driven (WebSocket-driven UI assertions) | themselves — existing Playwright specs already assert the exact testids/copy this phase must preserve | exact |

## Pattern Assignments

### `apps/web/components/hanabi/HanabiBoard.tsx` (component, orchestrator)

**Analog:** `apps/web/components/HanabiBoard.tsx` (current file, full contents read)

**Prop contract to preserve exactly** (lines 27-34):
```typescript
export interface HanabiBoardProps {
  view: RoomView;
  onAction: (request: HanabiActionRequest) => void;
  reconnecting?: boolean;
}
```

**Wire-validation gate to preserve verbatim** (lines 36-41) — this is the WR-03 chokepoint, do not bypass it in the new component tree:
```typescript
function isHanabiView(game: unknown): game is HanabiView {
  return HanabiViewSchema.safeParse(game).success;
}
```

**Defense-in-depth act() wrapper to preserve** (lines 70-73):
```typescript
function act(request: HanabiActionRequest): void {
  if (reconnecting) return;
  onAction(request);
}
```

**Local state shape to keep** (lines 59-61): `selectedCardId`, `clueTarget`, `clueValue` — select-then-act state lives in the orchestrator and is threaded down to `Hand`/`CluePicker` as props, not duplicated in child components.

**Import path note:** `RoomClient.tsx` imports via `"../../../components/HanabiBoard"` (see `RoomClient.tsx` line 19). If the file moves to `components/hanabi/HanabiBoard.tsx`, update that one import line in the same change — it is the only external consumer (confirmed via `Bash` grep, only `RoomClient.tsx` and the lib/test files reference the board).

---

### `apps/web/components/hanabi/Table.tsx` (component, tableau)

**Analog:** `apps/web/components/HanabiBoard.tsx` lines 183-250 (stacks/discard/tokens block)

**Structure to carry forward (testids are load-bearing, D-24):**
```tsx
<div data-testid="discard-pile"> ... </div>
{game.stacks.map((stack) => (
  <div key={stack.suit} data-testid={`played-stack-${stack.suit}`}> ... </div>
))}
<p data-testid="clue-tokens">{game.clueTokens} clue tokens</p>
<p data-testid="fuse-tokens">{fusesRemainingForView(game)} fuses left</p>
<p data-testid="deck-count">{game.deckCount} cards left in deck</p>
```

**D-04 extension point (deck-count full-string swap, per UI-SPEC "Preserved Wire/Copy Contracts"):**
```typescript
const deckCountText =
  game.finalTurnsRemaining !== null
    ? `Final round — ${game.finalTurnsRemaining} turns left`
    : `${game.deckCount} cards left in deck`;
```

**Discard pile DOM shape — keep flat `<li>`-per-card** (UI-SPEC "Preserved Wire/Copy Contracts", resolves Open Question #2): the existing locator `'[data-testid="discard-pile"] li'` in `e2e/start-game.spec.ts` line 104/117 must keep matching; do not restructure into suit-grouped sub-lists.

**Derivations to call, never re-derive:**
```typescript
import { fusesRemainingForView } from "../../lib/hanabi-board-logic";
```

---

### `apps/web/components/hanabi/Hand.tsx` (component, per-seat hand)

**Analogs:**
1. `apps/web/components/HanabiBoard.tsx` lines 146-181 (other-hands rendering loop + `seatStatus` helper, lines 75-98)
2. `apps/web/components/SeatRow.tsx` (full file — connection-status dot + label markup to restyle inline, per UI-SPEC "Component Notes": *"`SeatRow.tsx` is not reused directly inside the game view... restyled inline into `Hand.tsx`'s per-seat header"*)

**Seat-status dot pattern to restyle (from `SeatRow.tsx` lines 59-73, functionally identical to `HanabiBoard.tsx`'s inline `seatStatus()`):**
```tsx
<span
  aria-hidden="true"
  className="inline-block h-2 w-2 rounded-full"
  style={{ backgroundColor: connected ? "var(--color-status-connected)" : "var(--color-status-disconnected)" }}
/>
<span style={{ color: "var(--color-text-muted)" }}>{connected ? "Connected" : "Disconnected"}</span>
```

**Testids to preserve exactly (D-03):** `seat-status-{seatId}`, `other-hand-{seatId}`, `other-hand-card-{id}`.

**Active-player ring (D-02, new this phase, UI-SPEC "Active-Player Indication" #1):**
```tsx
className={clsx(
  "rounded-md",
  isActiveSeat && "border-2",
)}
style={{
  ...(isActiveSeat
    ? { borderColor: "var(--color-accent)", boxShadow: "0 0 12px 0 rgba(245, 185, 66, 0.4)" }
    : {}),
}}
```

---

### `apps/web/components/hanabi/Card.tsx` (component, glyph + hue + luminosity frame)

**Analog:** `apps/web/components/HanabiBoard.tsx` own-hand-slot button (lines 260-308) for the select/testid/disabled pattern; `apps/web/components/Button.tsx` for the `clsx`-composed conditional-class convention and the `disabled:` Tailwind modifier style.

**Own-hand identity boundary — hard carry-forward (D-15), verbatim from the file's own header comment (lines 43-56):**
```
The one load-bearing rule this file must never violate: a card in the
viewer's own hand renders NO identity signal — no suit, no rank, no
colour derived from either, no placeholder glyph hinting at either.
```
Implementation consequence: `Card.tsx`'s own-hand variant must accept only `ClueFactsView` (no `suit`/`rank` fields) for its confirmed-info zone, per UI-SPEC "Own-hand card" §1 — this makes the leak a compile-time impossibility, matching D-23's existing test-pattern convention (see `hanabi-board-logic.test.ts`'s `baseView()` fixture, which already models `hidden: true` cards with only `facts`, no `suit`/`rank`, lines 20-21).

**Selection/testid pattern to reuse:**
```tsx
<button
  type="button"
  data-testid={`own-hand-slot-${slotNumber}`}
  disabled={reconnecting}
  onClick={() => setSelectedCardId(card.id)}
  className={clsx(base, selected && "ring-2 ring-[var(--color-accent)]")}
  style={{ minHeight: "var(--size-touch-min)", minWidth: "var(--size-touch-min)" }}
>
```

**Luminosity frame classes (from UI-SPEC "Luminosity System" table, to implement as a static lookup — never interpolated):**
```typescript
const LUMINOSITY_FRAME: Record<LuminosityStep, { border: string; boxShadow: string; filter?: string }> = {
  unclued: { border: "1px solid var(--color-border)", boxShadow: "none" },
  touched: { border: "2px solid var(--color-card-glow)", boxShadow: "0 0 8px 0 rgba(255, 217, 138, 0.35)" },
  known: {
    border: "2px solid var(--color-card-glow)",
    boxShadow: "0 0 16px 0 rgba(255, 217, 138, 0.65), 0 0 4px 0 rgba(255, 217, 138, 0.9)",
    filter: "brightness(1.08)",
  },
};
```

---

### `apps/web/components/hanabi/SuitGlyph.tsx` (component, pure presentational)

**No in-repo analog** — this is net-new original design work per RESEARCH.md ("no authoritative reference implementation found"). Use RESEARCH.md's Code Examples skeleton as the structural pattern (module shape, not final art):
```tsx
import type { Suit } from "@games/rules";

export interface SuitGlyphProps {
  suit: Suit;
  className?: string;
}

const GLYPHS: Record<Suit, (props: { className?: string }) => JSX.Element> = {
  red: (p) => <svg {...p} viewBox="0 0 24 24">{/* 5-point star */}</svg>,
  yellow: (p) => <svg {...p} viewBox="0 0 24 24">{/* triangle */}</svg>,
  green: (p) => <svg {...p} viewBox="0 0 24 24">{/* square */}</svg>,
  blue: (p) => <svg {...p} viewBox="0 0 24 24">{/* circle */}</svg>,
  white: (p) => <svg {...p} viewBox="0 0 24 24">{/* diamond */}</svg>,
  rainbow: (p) => <svg {...p} viewBox="0 0 24 24">{/* 8-point starburst, FLAT single-tone fill only */}</svg>,
  black: (p) => <svg {...p} viewBox="0 0 24 24">{/* notched hexagon */}</svg>,
};

export function SuitGlyph({ suit, className }: SuitGlyphProps) {
  const Glyph = GLYPHS[suit];
  return <Glyph className={className} />;
}
```

**Fill convention (anti-pattern to avoid, RESEARCH.md + UI-SPEC "Implementation constraint"):** suit-to-class mapping MUST be a static literal lookup, never a template-interpolated Tailwind class:
```typescript
// CORRECT — static literal object, JIT-scannable
const SUIT_FILL: Record<Suit, string> = {
  red: "fill-[var(--color-suit-red)]",
  yellow: "fill-[var(--color-suit-yellow)]",
  // ...
};
// WRONG — Tailwind v4 JIT cannot see this
// `fill-suit-${suit}`
```

---

### `apps/web/components/hanabi/CandidateStrip.tsx` (component, own-hand + teammate candidate pips)

**Analog:** `apps/web/components/HanabiBoard.tsx` lines 283-304 (current `positiveClues`/`negativeClues` text rendering — the thing this component replaces, per RESEARCH.md's "State of the Art" table).

**Old pattern being replaced (do not carry forward, shown for context only):**
```tsx
{card.facts.positiveClues.map((clue, i) => (
  <span key={`pos-${i}`}>Told: {clue.value}</span>
))}
{card.facts.negativeClues.map((clue, i) => (
  <span key={`neg-${i}`}>Told: not {clue.value}</span>
))}
```

**New pattern (derived via `candidateDisplayFor` in `hanabi-visual-logic.ts`, UI-SPEC "Own-hand card" §2):** iterate `ALL_SUITS`/`cluableColors` for the suit-pips row and `RANKS` for the rank-pips row, rendering each pip as present (`opacity: 1`) or struck (`opacity: 0.25` + diagonal overlay) based on membership in `facts.possibleSuits`/`facts.possibleRanks`. Import `RANKS` from `@games/rules` exactly as `HanabiBoard.tsx` already does (line 8: `import { RANKS } from "@games/rules";`).

---

### `apps/web/components/hanabi/CluePicker.tsx` (component, select-then-act + hover/focus preview)

**Analog:** `apps/web/components/HanabiBoard.tsx` lines 340-416 (clue-target buttons, color/rank value buttons, give-clue button, disabled captions) — this is an exact match, not just role-match; the interim board already implements the full select-then-act interaction this component formalizes.

**Button-grid pattern to carry forward verbatim:**
```tsx
<Button
  key={hand.seatId}
  variant={clueTarget === hand.seatId ? "primary" : "ghost"}
  data-testid={`clue-target-${hand.seatId}`}
  disabled={reconnecting}
  onClick={() => setClueTarget(hand.seatId)}
>
  {labelFor(hand.seatId)}
</Button>
```
```tsx
{cluableColors.map((color) => (
  <Button
    key={color}
    variant={clueValue?.type === "color" && clueValue.value === color ? "primary" : "ghost"}
    data-testid={`clue-value-${color}`}
    disabled={reconnecting}
    onClick={() => setClueValue({ type: "color", value: color })}
  >
    {color}
  </Button>
))}
```

**Disabled-reason captions to preserve verbatim (D-18, all three already exist in the interim board):**
```tsx
{!game.isYourTurn ? null : game.clueTokens <= 0 ? (
  <p>No clue tokens left</p>
) : (
  noTouchCaption && <p>{noTouchCaption}</p>
)}
```
```typescript
const noTouchCaption =
  clueTarget && clueValue && game.isYourTurn && game.clueTokens > 0 && giveClueDisabled
    ? `That clue wouldn't touch any of ${labelFor(clueTarget)}'s cards`
    : null;
```
Discard-at-8-tokens caption (also preserved verbatim, currently attached to the Discard button rather than the clue picker):
```tsx
{isDiscardDisabled(game) && game.isYourTurn && game.clueTokens >= 8 && (
  <p>Clue tokens are full — you can&apos;t discard</p>
)}
```

**New hover/focus preview (D-17) — extend `clueTouchCountForTarget`'s exact dispatch pattern** (`hanabi-board-logic.ts` lines 24-39) to return ids instead of a count:
```typescript
export function clueTouchIdsForTarget(view: HanabiView, targetSeatId: string, clue: Clue): string[] {
  const target = view.otherHands.find((hand) => hand.seatId === targetSeatId);
  if (!target) return [];
  const config = variantConfig(view.variant);
  return target.cards
    .filter((c) => !c.hidden)
    .filter((c) =>
      clue.type === "color" ? config.colorClueTouches(c.suit, clue.value) : config.rankClueTouches(c.rank, clue.value),
    )
    .map((c) => c.id);
}
```
Trigger via both `onMouseEnter`/`onMouseLeave` AND `onFocus`/`onBlur` on each clue-value `<button>` (D-19 — hover-only is forbidden; native `:focus-visible` styling already established in `Button.tsx` line 25).

---

### `apps/web/components/hanabi/EndOverlay.tsx` (component, end-of-game modal)

**Analogs:**
1. `apps/web/components/RefusalCard.tsx` (full file) — the "one centered card on a scrim" visual pattern UI-SPEC explicitly calls out to reuse ("matching Phase 1's `RefusalCard` visual weight... reused for consistency rather than invented fresh").
2. `apps/web/components/HanabiBoard.tsx` lines 418-435 (current game-over block) — the testids/copy to preserve.

**Card-on-scrim structure to reuse from `RefusalCard.tsx` (lines 29-38):**
```tsx
<div
  role="alert"
  className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-lg border-2 p-[length:var(--space-lg)] text-center"
  style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
>
```
For `EndOverlay`, wrap this card in a fixed-position scrim per UI-SPEC "End of Game": `position: fixed; inset: 0; background: rgba(11, 15, 26, 0.7)`.

**Testids/copy to preserve verbatim (D-03/D-24), from `HanabiBoard.tsx` lines 418-435:**
```tsx
<p data-testid="game-over-heading" className="font-semibold">Game over</p>
<p data-testid="final-score">Final score: {game.score} — {bandForView(game)}</p>
```

**New end-reason derivation (D-20) — `endReasonForView`, mirrors `packages/rules/src/hanabi/endgame.ts`'s fixed evaluation order (fuses → stacks → final-round), never re-deriving the thresholds independently (see "Don't Hand-Roll" in RESEARCH.md):**
```typescript
import { MAX_FUSES, maxScoreFor, variantConfig } from "@games/rules";
import type { HanabiView } from "@games/rules";

export type EndReason = "fuses_exhausted" | "all_stacks_complete" | "final_round_elapsed" | null;

export function endReasonForView(view: HanabiView): EndReason {
  if (view.fuses >= MAX_FUSES) return "fuses_exhausted";
  const maxScore = maxScoreFor(variantConfig(view.variant));
  if (view.score === maxScore) return "all_stacks_complete";
  if (view.finalTurnsRemaining === 0) return "final_round_elapsed";
  return null;
}
```

**"New game" button — reuse `Button` primary variant exactly as any other primary CTA in the app** (`Button.tsx` lines 21-41, `variant="primary"` default), linking to `/` via a plain `<a>`/Next `Link`, not a client action.

---

### `apps/web/lib/hanabi-visual-logic.ts` (new pure-logic module)

**Analog:** `apps/web/lib/hanabi-board-logic.ts` (entire file, 103 lines) — this is the exact structural pattern to replicate: file-header comment stating the module's scope boundary, functions that only accept `HanabiView`/`ClueFactsView`/plain arrays (never DOM types), and every threshold/rule dispatched through an `@games/rules` export rather than hardcoded.

**File-header boundary-comment convention to replicate** (from `hanabi-board-logic.ts` lines 4-17):
```typescript
/**
 * D-23 boundary: these functions are pure derivations over the redacted
 * HanabiView/ClueFactsView only — no DOM types, no suit/rank fields on the
 * own-hand path. If a function here needs a `suit` or `rank` field to do
 * its job on an own-hand card, stop — that is exactly the leak D-15 forbids.
 */
```

**Import-and-dispatch convention (never hardcode a threshold):**
```typescript
import { variantConfig, maxScoreFor, MAX_FUSES } from "@games/rules";
```

**Functions to add, one per D-23/UI-SPEC "Component Notes" list:** `luminosityStepFor`, `candidateDisplayFor`, `touchedCardIdsFromLatestClue`, `disabledReasonFor`, `endReasonForView` (shown above under `EndOverlay`).

**`luminosityStepFor` (D-08), exact source from RESEARCH.md Code Examples, verified against `ClueFactsView`'s actual shape (`possibleSuits`, `possibleRanks`, `positiveClues` confirmed present on the `baseView()` fixture in `hanabi-board-logic.test.ts` lines 20-21):**
```typescript
export type LuminosityStep = "unclued" | "touched" | "known";

export function luminosityStepFor(facts: ClueFactsView): LuminosityStep {
  const fullyKnown = facts.possibleSuits.length === 1 && facts.possibleRanks.length === 1;
  if (fullyKnown) return "known";
  if (facts.positiveClues.length > 0) return "touched";
  return "unclued";
}
```

**`touchedCardIdsFromLatestClue` (D-14) — reads the latest `history` clue entry:**
```typescript
export function touchedCardIdsFromLatestClue(history: HanabiView["history"]): string[] {
  const latest = history[history.length - 1];
  if (!latest || latest.type !== "clue") return [];
  return latest.touchedCardIds;
}
```
(Verify exact `HistoryEntryView` field/discriminant names against `packages/rules/src/hanabi/state.ts` at execution time — RESEARCH.md confirms `touchedCardIds` exists on clue entries but the plan should re-read `state.ts` directly before finalizing this signature, since it was not included in this session's excerpted reads.)

---

### `apps/web/lib/hanabi-visual-logic.test.ts` (new test file)

**Analog:** `apps/web/lib/hanabi-board-logic.test.ts` (entire file, 229 lines) — exact structural pattern: one shared `baseView(overrides)` fixture (lines 16-49) that constructs a minimal valid `HanabiView`, then `describe`/`it` blocks per exported function using `overrides` to isolate the one field under test.

**Fixture pattern to reuse verbatim (either import the existing fixture or copy its shape exactly — do not invent a second, divergent fixture):**
```typescript
function baseView(overrides: Partial<HanabiView> = {}): HanabiView {
  return {
    variant: "base",
    yourSeatId: "seat-a",
    yourHand: [{ id: "a1", hidden: true, facts: { possibleSuits: [], possibleRanks: [], positiveClues: [], negativeClues: [] } }],
    otherHands: [/* ... */],
    stacks: [], discard: [], clueTokens: 8, fuses: 0, deckCount: 30,
    finalTurnsRemaining: null, activeSeatId: "seat-a", isYourTurn: true, score: 0, history: [],
    ...overrides,
  };
}
```

**D-23's structural "never reads identity" test convention (from RESEARCH.md Code Examples, adapted from the existing `apps/worker` `source-structure.test.ts` pattern referenced in that file):** assert that the own-hand rendering helpers' TypeScript signatures accept only `ClueFactsView` (which structurally has no `suit`/`rank` fields), documenting the compile-time guarantee as an explicit test, matching this repo's established habit of writing a test whose job is to document an invariant rather than exercise runtime behavior.

---

## Shared Patterns

### Wire-schema validation gate (WR-03)
**Source:** `apps/web/components/HanabiBoard.tsx` lines 36-41
**Apply to:** `hanabi/HanabiBoard.tsx` (the orchestrator only — child components receive an already-validated `HanabiView`, never re-validate)
```typescript
function isHanabiView(game: unknown): game is HanabiView {
  return HanabiViewSchema.safeParse(game).success;
}
```

### Pure-derivation-in-lib, thin-component convention (D-23)
**Source:** `apps/web/lib/hanabi-board-logic.ts` (whole file) + its test file
**Apply to:** Every new visual derivation (`hanabi-visual-logic.ts`) and every component that consumes one — components call the lib function and render its output; they never re-implement a threshold or a variant-dispatch rule inline. This is the single most load-bearing convention for this phase per RESEARCH.md's "Don't Hand-Roll" table.

### `clsx` conditional class composition
**Source:** `apps/web/components/HanabiBoard.tsx` line 4 (`import clsx from "clsx"`), used at lines 271-274; also `apps/web/components/Button.tsx` lines 24-34; `apps/web/components/SeatRow.tsx` lines 29-32
**Apply to:** All new `components/hanabi/*` files — same import, same pattern of a base class string plus `&&`-gated conditional classes as trailing `clsx()` arguments.

### Inline `style` for CSS-variable-driven color/typography values
**Source:** Every component read this session uses `style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}` rather than a Tailwind arbitrary-value class for color roles (Tailwind classes ARE used for spacing/layout via `className`, e.g. `text-[length:var(--text-body)]` for font-size specifically).
**Apply to:** All new components — keep this established split: `className` for spacing/layout/font-size scale tokens, `style` for color/line-height CSS-variable values. Do not invent a third convention (e.g. CSS Modules).

### Native `<button>` + `Button.tsx`'s two-variant contract
**Source:** `apps/web/components/Button.tsx` (whole file, 42 lines)
**Apply to:** Every new interactive control (`CluePicker`'s clue-value/target buttons, `EndOverlay`'s "New game", any own-hand card acting as a button). Exactly two variants exist (`primary`/`ghost`) — UI-SPEC's Component Notes explicitly forbids adding a third. `minHeight`/`minWidth: var(--size-touch-min)` (44px) is already baked into `Button.tsx` line 35 — reuse the component rather than reimplementing the touch-target rule on raw `<button>` elements where a `Button` will do; where a raw `<button>` is unavoidable (e.g. a candidate pip that must also be individually stylable), copy the `minHeight`/`minWidth` style inline.

### `@theme` token extension discipline
**Source:** `apps/web/app/globals.css` lines 1-73 (header comment + existing `@theme` block)
**Apply to:** The new `--color-suit-*` and `--color-card-glow` tokens — append inside the existing `@theme { ... }` block, never redefine an existing token, never use a reserved namespace (`--spacing-*`, `--color-*` is fine since these ARE color tokens, but note the file's own documented `--space-*` vs `--spacing-*` incident) for a non-scale value.

### `data-testid` and copy preservation (D-03/D-24, RESEARCH.md Pitfall 4)
**Source:** `e2e/start-game.spec.ts` and `e2e/hanabi-realtime.spec.ts` (grepped this session for every asserted testid/copy string)
**Apply to:** Every new component that renders a testid the existing specs already assert. Full list, confirmed by direct grep of both spec files plus UI-SPEC's own "Preserved Wire/Copy Contracts" section: `seat-status-{seatId}`, `turn-indicator`, `other-hand-{seatId}`, `other-hand-card-{id}`, `played-stack-{suit}`, `discard-pile` (with `li` children), `clue-tokens`, `fuse-tokens`, `deck-count`, `own-hand`, `own-hand-slot-{n}`, `play-button`, `discard-button`, `clue-target-{seatId}`, `clue-value-{color|rank}`, `give-clue-button`, `game-over-heading`, `final-score`, `reconnecting-banner`. Exact copy strings: `"Your turn"`, `` `Waiting for ${name}` ``, `` `Waiting for ${name} — disconnected` ``, `` `${n} cards left in deck` `` (full-swapped to `` `Final round — ${n} turns left` `` when `finalTurnsRemaining !== null`, per D-04), `"Game over"`, `` `Final score: ${score} — ${band}` ``, `"No clue tokens left"`, `"Clue tokens are full — you can't discard"`, `` `That clue wouldn't touch any of ${name}'s cards` ``, `"Reconnecting…"`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/web/components/hanabi/SuitGlyph.tsx` | component | transform | Net-new original visual design (glyph silhouette set); no prior art in this codebase or, per RESEARCH.md's own search, any found external implementation combining always-on colorblind glyphs with a luminosity signal. Use RESEARCH.md's Code Examples skeleton (module shape only, not final shapes) and the UI-SPEC's glyph-per-suit table as the design source instead of a codebase analog. |

## Metadata

**Analog search scope:** `apps/web/components/`, `apps/web/lib/`, `apps/web/app/globals.css`, `e2e/*.spec.ts`, `packages/rules/src/hanabi/*.ts`, `packages/schema/src/games/hanabi.ts` (all read or grepped directly this session; no broader repo scan needed — RESEARCH.md had already narrowed the relevant file set).
**Files scanned:** 11 read in full (`HanabiBoard.tsx`, `hanabi-board-logic.ts`, `hanabi-board-logic.test.ts`, `SeatRow.tsx`, `Button.tsx`, `ReconnectingBanner.tsx`, `RefusalCard.tsx`, `globals.css`, `RoomClient.tsx` (partial), `06-CONTEXT.md`, `06-RESEARCH.md`, `06-UI-SPEC.md`) + 2 grepped (`e2e/start-game.spec.ts`, `e2e/hanabi-realtime.spec.ts`).
**Pattern extraction date:** 2026-09-16

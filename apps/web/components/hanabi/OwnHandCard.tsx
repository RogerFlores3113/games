import type { PointerEvent as ReactPointerEvent } from "react";
import type { CardFacts } from "../../lib/hanabi-visual-logic";
import { hintDisplayFor } from "../../lib/hanabi-hint-logic";
import { DEFAULT_TILE_COLOR_CSS } from "../../lib/tile-color-pref";
import { FireworkCardBack } from "./FireworkCard";
import { OwnHintIndicator } from "./HintIndicator";

export interface OwnHandCardProps {
  facts: CardFacts;
  slotNumber: number;
  selected: boolean;
  justClued: boolean;
  disabled: boolean;
  onSelect: () => void;
  /** D-15/D-20: pointer-drag visuals only — no card identity involved. */
  dragging: boolean;
  dragOffset: { x: number; y: number } | null;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  /** HINT-03/D-05: whether this card's hint overlay should currently render
   * (the "keep hints visible" toggle's derived per-card visibility). */
  hintsVisible: boolean;
  /** TILE-03/D-13: the viewer's personal tile-colour preference — a
   * `var(--color-*)`/`color-mix(...)` CSS value, never a raw hex literal.
   * Defaults to the slate preset so callers not yet wired to the picker
   * still compile and render the unchanged look. */
  tileColor?: string;
  /** DRAG-01/D-08: the drop-gap shift-aside offset (pixels, from
   * `shiftOffsetsForDrag`) applied to the slot wrapper — composed with, not
   * replacing, the drag-follow transform on the card itself below. Defaults
   * to 0 (no-op) for callers not mid-drag. */
  shiftOffsetPx?: number;
}

// UI-SPEC targets 72x100 for a 5-suit hand; widened here to 88x112 (06.1-03
// deviation, carried forward) so the marks zone above still fits Rainbow/
// Black's 6-suit candidate strip without wrapping.
// 06.1-09 deviation: further reduced 112 -> 100 (UI-11 fit regression once
// the 28px/20px marks-zone band was added above every own-hand card) — see
// that plan's SUMMARY.
// 06.2-02 deviation ledger: these two constants are now duplicated in
// apps/web/lib/layout-budget.ts (OWN_CARD_HEIGHT_PX) as the single named
// height source for later plans; this file's own CARD_WIDTH/CARD_HEIGHT
// stay local render constants, not re-imported, since layout-budget.ts's
// own comment defers that consolidation to whichever later plan first needs
// to import the value rather than just assert it.
// fix(06.2): exported so Hand.tsx can size the note-row above each card to
// match (UI-11) — an unconstrained `w-full` note input was inheriting the
// browser's ~200px default text-input width instead of the card's own 88px,
// which silently widened every own-hand slot and starved the controls row of
// the horizontal space it needed to sit beside the hand instead of wrapping
// under it.
export const CARD_WIDTH = 88;
const CARD_HEIGHT = 100;

const DEFAULT_TILE_COLOR = DEFAULT_TILE_COLOR_CSS;

/**
 * The one load-bearing rule this file must never violate: a card in the
 * viewer's own hand renders NO identity signal — no suit, no rank, no
 * colour derived from either, no placeholder glyph hinting at either. Its
 * only permitted content is the identical neutral card back (D-10, owner-
 * approved picture-frame art), its slot position, and its own hint overlay
 * (HINT-01/02, derived only from `facts.positiveClues` — never from a real,
 * still-hidden suit/rank). The server already guarantees the identity
 * fields are absent from a hidden card view; this component structurally
 * cannot reintroduce that signal, because it accepts only
 * `facts: CardFacts` — a type with no suit/rank fields — never the card
 * object itself (D-15). The automatic clue-mark pip band is gone (HINT-04)
 * — hints now render on the tile itself via `OwnHintIndicator`.
 *
 * UAT gap 7 (06.2-17): the tile-colour overlay span below is painted from
 * `tileColor`, a personal preference string, alone — never from `facts` or
 * any derived signal — so it carries no identity information either.
 */
export function OwnHandCard({
  facts,
  slotNumber,
  selected,
  justClued,
  disabled,
  onSelect,
  dragging,
  dragOffset,
  onPointerDown,
  hintsVisible,
  tileColor = DEFAULT_TILE_COLOR,
  shiftOffsetPx = 0,
}: OwnHandCardProps) {
  const hints = hintDisplayFor(facts);
  const hasHints = hintsVisible && (hints.colorHints.length > 0 || hints.numberHints.length > 0);

  // TILE-01/D-12: a tile is a raised, opaque object distinct from the board
  // beneath it — a downward drop-shadow. UAT gap 35: the Phase 6
  // luminosity frame this shadow used to compose with is deleted entirely
  // — a card's border/box-shadow is now a fixed, non-clue-driven constant;
  // the only clue-driven visual lives in `OwnHintIndicator` below.
  const tileBorder = "1px solid var(--color-border)";
  const tileShadow = "0 2px 4px var(--color-tile-shadow)";

  // D-20: while dragging, the card lifts (elevated shadow + slight scale)
  // and tracks the pointer via a translate transform; releasing outside a
  // drop zone animates back to the slot through the `drag-snap` transition
  // (D-15) rather than an instant jump. `pointer-events: none` on the
  // moving layer keeps hit-testing on the zones beneath it during the drag.
  const dragTransform =
    dragging && dragOffset
      ? `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(1.05)`
      : undefined;

  // DRAG-01/D-08: the shift-aside preview lives on a separate wrapper layer
  // from the drag-follow transform above — `.tile-shift` (globals.css) gives
  // it the same 150ms ease-out timing (and prefers-reduced-motion static
  // pairing) as the rest of this file's motion, composed with rather than
  // replacing the button's own dragTransform. A shift-in-flight wrapper adds
  // no flow height/width of its own (inline-block, sized to its button
  // child) — UI-11's zero-slack 1280x720 fit depends on that.
  return (
    <div
      className="tile-shift inline-block"
      style={{ transform: shiftOffsetPx !== 0 ? `translateX(${shiftOffsetPx}px)` : undefined }}
    >
    <button
      type="button"
      data-testid={`own-hand-slot-${slotNumber}`}
      data-selected={String(selected)}
      data-just-clued={String(justClued)}
      data-dragging={String(dragging)}
      data-hints={String(hasHints)}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      onPointerDown={onPointerDown}
      className={
        "relative inline-flex flex-col items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed" +
        (dragging ? " cursor-grabbing" : " cursor-grab") +
        (dragging ? "" : " drag-snap")
      }
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        minHeight: "var(--size-touch-min)",
        minWidth: "var(--size-touch-min)",
        backgroundColor: "var(--color-surface)",
        border: tileBorder,
        boxShadow: dragging ? "0 8px 24px 0 rgba(0, 0, 0, 0.5), " + tileShadow : tileShadow,
        outline: selected ? "2px solid var(--color-text)" : undefined,
        outlineOffset: selected ? "2px" : undefined,
        touchAction: "none",
        transform: dragTransform,
        zIndex: dragging ? 50 : undefined,
        pointerEvents: dragging ? "none" : undefined,
      }}
    >
      <span className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-md">
        <FireworkCardBack width={CARD_WIDTH} height={CARD_HEIGHT} />
      </span>

      {/* UAT gap 7 (06.2-17): testid deliberately does NOT start with
          "own-hand-slot-" — several existing selectors/helpers do a prefix
          match on that exact string (e.g. e2e's OWN_HAND_SLOT_SELECTOR) to
          find the slot's own card-back element; a testid starting with that
          prefix would silently double-match and corrupt those counts. */}
      <span
        aria-hidden="true"
        data-testid={`tile-color-overlay-own-hand-slot-${slotNumber}`}
        className="pointer-events-none absolute inset-0 rounded-md"
        style={{ backgroundColor: tileColor }}
      />

      <OwnHintIndicator
        facts={facts}
        visible={hintsVisible}
        width={CARD_WIDTH}
        height={CARD_HEIGHT}
        testId={`own-hand-slot-${slotNumber}-hints`}
      />

      <span
        className="relative z-10 rounded px-[length:var(--space-xs)] text-[length:var(--text-label)] font-semibold"
        style={{
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text-muted)",
          lineHeight: "var(--text-label--line-height)",
        }}
      >
        {`Slot ${slotNumber}`}
      </span>

      {justClued && (
        <span aria-hidden="true" className="anim-clue-touch pointer-events-none absolute inset-0 rounded-md" />
      )}
    </button>
    </div>
  );
}

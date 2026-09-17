import type { PointerEvent as ReactPointerEvent } from "react";
import type { CardFacts } from "../../lib/hanabi-visual-logic";
import { luminosityStepFor } from "../../lib/hanabi-visual-logic";
import { FireworkCardBack } from "./FireworkCard";
import { LUMINOSITY_FRAME } from "./luminosity-frame";

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
}

// UI-SPEC targets 72x100 for a 5-suit hand; widened here to 88x112 (06.1-03
// deviation, carried forward) so the marks zone above still fits Rainbow/
// Black's 6-suit candidate strip without wrapping.
// 06.1-09 deviation: further reduced 112 -> 100 (UI-11 fit regression once
// the 28px/20px marks-zone band was added above every own-hand card) — see
// this plan's SUMMARY.
const CARD_WIDTH = 88;
const CARD_HEIGHT = 100;

/**
 * The one load-bearing rule this file must never violate: a card in the
 * viewer's own hand renders NO identity signal — no suit, no rank, no
 * colour derived from either, no placeholder glyph hinting at either. Its
 * only permitted content is the identical neutral card back (D-10, owner-
 * approved picture-frame art) and its slot position. The server already
 * guarantees the identity fields are absent from a hidden card view; this
 * component structurally cannot reintroduce that signal, because it accepts
 * only `facts: CardFacts` — a type with no suit/rank fields — never the card
 * object itself (D-15). Clue marks (told suits/ranks, candidate pips) moved
 * to MarksZone (D-07) — this card body renders only the neutral back.
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
}: OwnHandCardProps) {
  const step = luminosityStepFor(facts);
  const frame = LUMINOSITY_FRAME[step];

  // D-20: while dragging, the card lifts (elevated shadow + slight scale)
  // and tracks the pointer via a translate transform; releasing outside a
  // drop zone animates back to the slot through the `drag-snap` transition
  // (D-15) rather than an instant jump. `pointer-events: none` on the
  // moving layer keeps hit-testing on the zones beneath it during the drag.
  const dragTransform =
    dragging && dragOffset
      ? `translate(${dragOffset.x}px, ${dragOffset.y}px) scale(1.05)`
      : undefined;

  return (
    <button
      type="button"
      data-testid={`own-hand-slot-${slotNumber}`}
      data-luminosity={step}
      data-selected={String(selected)}
      data-just-clued={String(justClued)}
      data-dragging={String(dragging)}
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
        border: frame.border,
        boxShadow: dragging
          ? "0 8px 24px 0 rgba(0, 0, 0, 0.5), " + frame.boxShadow
          : frame.boxShadow,
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

      {frame.backgroundFilter && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-md"
          style={{ filter: frame.backgroundFilter, backgroundColor: "var(--color-surface)" }}
        />
      )}

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
  );
}

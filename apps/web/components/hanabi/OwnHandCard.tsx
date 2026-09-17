import type { Variant } from "@games/rules";
import type { CardFacts } from "../../lib/hanabi-visual-logic";
import { candidateDisplayFor, luminosityStepFor } from "../../lib/hanabi-visual-logic";
import { CandidateStrip } from "./CandidateStrip";
import { LUMINOSITY_FRAME } from "./luminosity-frame";
import { SuitGlyph } from "./SuitGlyph";
import { SUIT_VISUALS } from "../../lib/suit-visuals";

export interface OwnHandCardProps {
  facts: CardFacts;
  slotNumber: number;
  variant: Variant;
  selected: boolean;
  justClued: boolean;
  disabled: boolean;
  onSelect: () => void;
}

// UI-SPEC targets 72x100 for a 5-suit hand; widened here to 88x112 (Task 2
// deviation, recorded in the plan's SUMMARY) so the own-hand candidate
// strip's suit-pips row still fits on one line for Rainbow/Black's 6-suit
// variants without wrapping.
const CARD_WIDTH = 88;
const CARD_HEIGHT = 112;
const CONFIRMED_GLYPH_SIZE = 28;

/**
 * The one load-bearing rule this file must never violate: a card in the
 * viewer's own hand renders NO identity signal — no suit, no rank, no
 * colour derived from either, no placeholder glyph hinting at either. Its
 * only permitted content is its accumulated clue facts and its slot
 * position. The server already guarantees the identity fields are absent
 * from a hidden card view; this component structurally cannot reintroduce
 * that signal, because it accepts only `facts: CardFacts` — a type with no
 * suit/rank fields — never the card object itself (D-15). The confirmed
 * glyph/numeral below are rendered only from `candidateDisplayFor`'s
 * length-1 narrowing of those same facts, never from an identity field.
 */
export function OwnHandCard({
  facts,
  slotNumber,
  variant,
  selected,
  justClued,
  disabled,
  onSelect,
}: OwnHandCardProps) {
  const step = luminosityStepFor(facts);
  const frame = LUMINOSITY_FRAME[step];
  const display = candidateDisplayFor(facts, variant);

  return (
    <button
      type="button"
      data-testid={`own-hand-slot-${slotNumber}`}
      data-luminosity={step}
      data-selected={String(selected)}
      data-just-clued={String(justClued)}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className="relative inline-flex flex-col items-center justify-start gap-[length:var(--space-xs)] rounded-md px-[length:var(--space-sm)] py-[length:var(--space-xs)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-not-allowed"
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        minHeight: "var(--size-touch-min)",
        minWidth: "var(--size-touch-min)",
        backgroundColor: "var(--color-surface)",
        border: frame.border,
        boxShadow: frame.boxShadow,
        outline: selected ? "2px solid var(--color-text)" : undefined,
        outlineOffset: selected ? "2px" : undefined,
      }}
    >
      {frame.backgroundFilter && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-md"
          style={{ filter: frame.backgroundFilter, backgroundColor: "var(--color-surface)" }}
        />
      )}

      <span
        className="relative z-10 text-[length:var(--text-label)] font-semibold"
        style={{ color: "var(--color-text-muted)", lineHeight: "var(--text-label--line-height)" }}
      >
        {`Slot ${slotNumber}`}
      </span>

      <span className="relative z-10 flex min-h-[28px] items-center justify-center gap-[length:var(--space-xs)]">
        {display.confirmedSuit === null && display.confirmedRank === null ? (
          <span
            aria-hidden="true"
            className="rounded"
            style={{
              width: CONFIRMED_GLYPH_SIZE,
              height: CONFIRMED_GLYPH_SIZE,
              border: "1px solid var(--color-border)",
            }}
          />
        ) : (
          <>
            {display.confirmedSuit !== null && (
              <span data-testid="confirmed-suit">
                <SuitGlyph
                  suit={display.confirmedSuit}
                  size={CONFIRMED_GLYPH_SIZE}
                  title={SUIT_VISUALS[display.confirmedSuit].label}
                />
              </span>
            )}
            {display.confirmedRank !== null && (
              <span
                data-testid="confirmed-rank"
                className="text-[length:var(--text-body)] font-semibold"
                style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
              >
                {display.confirmedRank}
              </span>
            )}
          </>
        )}
      </span>

      <span className="relative z-10">
        <CandidateStrip display={display} scale="own" />
      </span>

      {justClued && (
        <span aria-hidden="true" className="anim-clue-touch pointer-events-none absolute inset-0 rounded-md" />
      )}
    </button>
  );
}

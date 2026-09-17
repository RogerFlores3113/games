import type { HanabiCardView, Variant } from "@games/rules";
import { candidateDisplayFor, luminosityStepFor } from "../../lib/hanabi-visual-logic";
import { SUIT_VISUALS } from "../../lib/suit-visuals";
import { CandidateStrip } from "./CandidateStrip";
import { LUMINOSITY_FRAME } from "./luminosity-frame";
import { SuitGlyph } from "./SuitGlyph";

export interface TeammateCardProps {
  card: HanabiCardView;
  variant: Variant;
  preview: boolean;
  justClued: boolean;
}

// UI-SPEC targets 56x78 for a 5-suit hand; widened to 64x84 here (Task 1
// deviation, recorded in the plan's SUMMARY) so the teammate candidate
// strip's suit-pips row still fits on a single line for Rainbow/Black's
// 6-suit variants without wrapping — 4 teammates x 64px + 3 gaps still
// stays well inside the 1280px no-scroll target.
const CARD_WIDTH = 64;
const CARD_HEIGHT = 84;
const IDENTITY_GLYPH_SIZE = 20;

/**
 * D-09/D-13: a teammate's face-up card. The luminosity frame is derived from
 * the SAME `facts` the card's own holder would see about it (D-09), and the
 * identity glyph's hue/fill stays fully solid at every luminosity step
 * (D-10) — only the frame below (border/box-shadow/background layer) ever
 * carries the luminosity signal.
 */
export function TeammateCard({ card, variant, preview, justClued }: TeammateCardProps) {
  const step = luminosityStepFor(card.facts);
  const frame = LUMINOSITY_FRAME[step];
  const display = candidateDisplayFor(card.facts, variant);

  return (
    <span
      data-testid={`other-hand-card-${card.id}`}
      data-luminosity={step}
      data-preview={String(preview)}
      data-just-clued={String(justClued)}
      className="relative inline-flex flex-col items-center justify-center gap-[length:var(--space-xs)] rounded-md px-[length:var(--space-xs)] py-[length:var(--space-xs)]"
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: "var(--color-surface)",
        border: frame.border,
        boxShadow: frame.boxShadow,
      }}
    >
      {frame.backgroundFilter && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-md"
          style={{ filter: frame.backgroundFilter, backgroundColor: "var(--color-surface)" }}
        />
      )}

      {!card.hidden ? (
        <span data-testid="card-identity" className="relative z-10 flex flex-col items-center">
          <SuitGlyph suit={card.suit} size={IDENTITY_GLYPH_SIZE} exposeSuit />
          <span className="sr-only">{`${SUIT_VISUALS[card.suit].label} `}</span>
          {/* WR-03: the rank is part of the accessible name ("Red 3"). */}
          <span
            className="text-[length:var(--text-body)] font-semibold"
            style={{ color: "var(--color-text)", lineHeight: "var(--text-body--line-height)" }}
          >
            {card.rank}
          </span>
        </span>
      ) : (
        // An unseated viewer (spectator-shaped RoomView, no seat of their
        // own) gets a blank placeholder here in place of the identity glyph
        // — the candidate strip below still renders from `facts`, which is
        // present on both the hidden and visible card shapes.
        <span
          aria-hidden="true"
          className="relative z-10 flex items-center justify-center rounded"
          style={{
            width: IDENTITY_GLYPH_SIZE,
            height: IDENTITY_GLYPH_SIZE,
            border: "1px solid var(--color-border)",
          }}
        />
      )}

      <span className="relative z-10">
        <CandidateStrip display={display} scale="teammate" />
      </span>

      {preview && (
        <span
          aria-hidden="true"
          data-preview-ring="true"
          className="pointer-events-none absolute inset-0 rounded-md"
          style={{ boxShadow: "0 0 0 2px var(--color-text)" }}
        />
      )}

      {justClued && (
        <span aria-hidden="true" className="anim-clue-touch pointer-events-none absolute inset-0 rounded-md" />
      )}
    </span>
  );
}

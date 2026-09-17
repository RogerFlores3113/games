import type { HanabiCardView } from "@games/rules";
import { luminosityStepFor } from "../../lib/hanabi-visual-logic";
import { SUIT_VISUALS } from "../../lib/suit-visuals";
import { FireworkCardBack, FireworkCardFace } from "./FireworkCard";
import { LUMINOSITY_FRAME } from "./luminosity-frame";

export interface TeammateCardProps {
  card: HanabiCardView;
  preview: boolean;
  justClued: boolean;
}

// UI-SPEC targets 56x78 for a 5-suit hand; widened to 64x84 here (06.1-03
// deviation, carried forward) so the marks zone above still fits Rainbow/
// Black's 6-suit candidate strip without wrapping.
// 06.1-09 deviation: further reduced 84 -> 78 (UI-11 fit regression once the
// 28px marks-zone band was added above every teammate card) — see this
// plan's SUMMARY.
const CARD_WIDTH = 64;
const CARD_HEIGHT = 78;

/**
 * D-08/D-09/D-12/D-13: a teammate's face-up card renders the owner-approved
 * firework burst face (burst count is the only rank signal — no corner
 * numeral, per 06.1-07's owner override) via `FireworkCardFace`. The
 * luminosity frame is derived from the SAME `facts` the card's own holder
 * would see about it (D-09), and the burst art's hue stays fully solid at
 * every luminosity step (D-10) — only the frame below (border/box-shadow/
 * background layer) ever carries the luminosity signal. Clue marks (told
 * suits/ranks, candidate pips) moved to MarksZone (D-07) — this card body
 * renders only the face/back art.
 */
export function TeammateCard({ card, preview, justClued }: TeammateCardProps) {
  const step = luminosityStepFor(card.facts);
  const frame = LUMINOSITY_FRAME[step];

  return (
    <span
      data-testid={`other-hand-card-${card.id}`}
      data-luminosity={step}
      data-preview={String(preview)}
      data-just-clued={String(justClued)}
      className="relative inline-flex flex-col items-center justify-center rounded-md"
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
        <span data-testid="card-identity" className="relative z-10">
          <FireworkCardFace suit={card.suit} rank={card.rank} width={CARD_WIDTH} height={CARD_HEIGHT} exposeSuit />
          {/* WR-03: the rank is part of the accessible name ("Red 3") —
              FireworkCardFace's exposeSuit-gated title/aria-label already
              covers this; this sr-only span is redundant-but-explicit
              accessible text preserved from the prior identity markup. */}
          <span className="sr-only">{`${SUIT_VISUALS[card.suit].label} ${card.rank}`}</span>
        </span>
      ) : (
        // An unseated viewer (spectator-shaped RoomView, no seat of their
        // own) gets the neutral card back here in place of the burst face.
        <span className="relative z-10">
          <FireworkCardBack width={CARD_WIDTH} height={CARD_HEIGHT} />
        </span>
      )}

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

import type { Suit } from "@games/rules";
import { burstLayoutForRank, CARD_BACK_ART, SUIT_VISUALS } from "../../lib/suit-visuals";
import { SuitGlyph } from "./SuitGlyph";

export interface FireworkCardFaceProps {
  suit: Suit;
  rank: 1 | 2 | 3 | 4 | 5;
  width: number;
  height: number;
  /**
   * D-15/HIDE-01: emits `data-glyph={suit}` on the wrapper only. Defaults to
   * false — own-hand rendering code must never pass this for a card whose
   * identity the viewer is not supposed to know (same contract as
   * SuitGlyph's `exposeSuit`).
   *
   * Owner override (06.1-07 Task 3, "peel th enumber of the 64x84 cards as
   * well"): rank now reads from burst count ONLY — there is no visible
   * corner numeral at any size (48x64 or 64x84/88x112). This prop still
   * gates a `title`/`aria-label` of "{Suit} {rank}" on the wrapper, using the
   * exact same identity-leak gate as `data-glyph`: an own-hand card the
   * viewer isn't supposed to identify never gets the label, so screen
   * readers/e2e selectors can read rank+suit only where the visual identity
   * was already exposed.
   */
  exposeSuit?: boolean;
  /**
   * D-09 (owner-revised 06.1-07 Task 3): rank is shown as burst COUNT (one
   * burst per rank) only. At the smallest sizes a caller may pass `false` to
   * fall back to a single burst (suit symbol) with no count signal — rank is
   * still available via the accessible label when `exposeSuit` is true.
   */
  showBurstCount?: boolean;
}

/**
 * D-09, D-11: a face-up card's burst art. `burstLayoutForRank` drives how
 * many bursts render and where — burst count is the ONLY visible rank signal
 * (no corner numeral, per owner review). Inner `SuitGlyph` instances never
 * receive `exposeSuit` — only the wrapper here carries the identity marker,
 * so a consumer scanning for `[data-glyph]` gets exactly one match per card
 * regardless of rank.
 */
export function FireworkCardFace({
  suit,
  rank,
  width,
  height,
  exposeSuit = false,
  showBurstCount = true,
}: FireworkCardFaceProps) {
  const layout = showBurstCount ? burstLayoutForRank(rank) : [{ cx: 0.5, cy: 0.5, scale: 1 }];
  const minDimension = Math.min(width, height);
  const accessibleLabel = exposeSuit ? `${SUIT_VISUALS[suit].label} ${rank}` : undefined;

  return (
    <span
      data-glyph={exposeSuit ? suit : undefined}
      role={accessibleLabel ? "img" : undefined}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className="relative inline-block overflow-hidden rounded-md"
      style={{ width, height, backgroundColor: "var(--color-surface)" }}
    >
      {layout.map((placement, index) => {
        const burstSize = minDimension * placement.scale;
        return (
          <span
            key={index}
            aria-hidden="true"
            className="absolute"
            style={{
              left: placement.cx * width - burstSize / 2,
              top: placement.cy * height - burstSize / 2,
            }}
          >
            <SuitGlyph suit={suit} size={burstSize} />
          </span>
        );
      })}
    </span>
  );
}

export interface FireworkCardBackProps {
  width: number;
  height: number;
}

/**
 * D-10: a single neutral card back — no suit/rank/facts props at all
 * (structural guarantee: this component cannot leak identity because it
 * receives none). Markup is deterministic/byte-identical across renders.
 */
export function FireworkCardBack({ width, height }: FireworkCardBackProps) {
  return (
    <span
      className="relative inline-block overflow-hidden rounded-md"
      style={{ width, height, backgroundColor: "transparent" }}
    >
      <svg viewBox={CARD_BACK_ART.viewBox} width={width} height={height} focusable="false" aria-hidden="true">
        {CARD_BACK_ART.layers.map((layer, index) => (
          <path key={index} d={layer.d} fill={layer.fillVar} opacity={layer.opacity} fillRule={layer.fillRule} />
        ))}
      </svg>
    </span>
  );
}

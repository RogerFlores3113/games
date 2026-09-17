import type { Suit } from "@games/rules";
import { burstLayoutForRank, CARD_BACK_ART } from "../../lib/suit-visuals";
import { SuitGlyph } from "./SuitGlyph";

export type NumeralSize = "body" | "label";

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
   */
  exposeSuit?: boolean;
  /**
   * D-09: rank is normally shown as burst COUNT (one burst per rank) plus a
   * small corner numeral. At the smallest sizes a caller may pass `false`
   * to fall back to a single burst (suit symbol) plus the numeral only.
   */
  showBurstCount?: boolean;
  numeralSize?: NumeralSize;
}

/**
 * D-09, D-11: a face-up card's burst art. `burstLayoutForRank` drives how
 * many bursts render and where; the corner numeral is the fast read. Inner
 * `SuitGlyph` instances never receive `exposeSuit` — only the wrapper here
 * carries the identity marker, so a consumer scanning for `[data-glyph]`
 * gets exactly one match per card regardless of rank.
 */
export function FireworkCardFace({
  suit,
  rank,
  width,
  height,
  exposeSuit = false,
  showBurstCount = true,
  numeralSize = "body",
}: FireworkCardFaceProps) {
  const layout = showBurstCount ? burstLayoutForRank(rank) : [{ cx: 0.5, cy: 0.5, scale: 1 }];
  const minDimension = Math.min(width, height);
  const numeralTextVar = numeralSize === "body" ? "var(--text-body)" : "var(--text-label)";
  const numeralLineHeightVar =
    numeralSize === "body" ? "var(--text-body--line-height)" : "var(--text-label--line-height)";

  return (
    <span
      data-glyph={exposeSuit ? suit : undefined}
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

      <span
        aria-hidden="true"
        className="absolute left-[length:var(--space-xs)] top-[length:var(--space-xs)] font-semibold"
        style={{
          color: "var(--color-text)",
          fontSize: numeralTextVar,
          lineHeight: numeralLineHeightVar,
        }}
      >
        {rank}
      </span>
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
      style={{ width, height, backgroundColor: "var(--color-surface)" }}
    >
      <svg viewBox={CARD_BACK_ART.viewBox} width={width} height={height} focusable="false" aria-hidden="true">
        {CARD_BACK_ART.layers.map((layer, index) => (
          <path key={index} d={layer.d} fill={layer.fillVar} opacity={layer.opacity} />
        ))}
      </svg>
    </span>
  );
}

import type { Suit } from "@games/rules";
import { SUIT_VISUALS } from "../../lib/suit-visuals";

export interface SuitGlyphProps {
  suit: Suit;
  size: number;
  className?: string;
  title?: string;
  /**
   * D-15/HIDE-01: emits a `data-glyph={suit}` attribute for test/debug
   * observability. Defaults to false — own-hand rendering code must never
   * pass this, since it would put suit identity into the DOM for a card
   * whose identity the viewer is not supposed to know.
   */
  exposeSuit?: boolean;
}

/**
 * Renders one of the seven suits as a text-free inline SVG in its constant
 * hue (D-10 — fill alpha is always fully solid; luminosity is a separate
 * signal carried elsewhere, never by this component). No SVG text-bearing
 * child elements are ever emitted, so Playwright textContent comparisons
 * across regions never pick up suit identity from this component.
 */
export function SuitGlyph({ suit, size, className, title, exposeSuit = false }: SuitGlyphProps) {
  const visual = SUIT_VISUALS[suit];

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      focusable="false"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : "true"}
      data-glyph={exposeSuit ? suit : undefined}
    >
      <path d={visual.glyphPath} fillRule={visual.fillRule} style={{ fill: visual.hueVar }} />
    </svg>
  );
}

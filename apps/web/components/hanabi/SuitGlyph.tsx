import { useId } from "react";
import type { Suit } from "@games/rules";
import { SUIT_VISUALS } from "../../lib/suit-visuals";

/**
 * Owner override (06.1-07 Task 3, replacing D-08's original "Rainbow is
 * always a flat single-tone fill" rule): Rainbow's burst is painted with a
 * real multicolour gradient built only from the existing `--color-suit-*`
 * tokens already in globals.css (red -> yellow -> green -> blue -> the
 * rainbow token's own light-purple as the violet-ish final stop) — no new
 * hex literals are introduced, keeping D-11's "no hex outside globals.css"
 * rule intact. The silhouette (20-spike flat burst) is unchanged, so Rainbow
 * still reads as its own distinct shape in the grayscale section.
 */
const RAINBOW_GRADIENT_STOPS: ReadonlyArray<{ offset: string; colorVar: string }> = [
  { offset: "0%", colorVar: "var(--color-suit-red)" },
  { offset: "25%", colorVar: "var(--color-suit-yellow)" },
  { offset: "50%", colorVar: "var(--color-suit-green)" },
  { offset: "75%", colorVar: "var(--color-suit-blue)" },
  { offset: "100%", colorVar: "var(--color-suit-rainbow)" },
];

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
  const isRainbow = suit === "rainbow";
  // React's useId is stable per component instance and unique across the
  // whole tree, so many SuitGlyph instances (e.g. five rainbow bursts on one
  // rank-5 card, or many cards on a table) never collide on the gradient's
  // DOM id even though every instance shares the same visual definition.
  const gradientId = useId();

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
      {isRainbow ? (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            {RAINBOW_GRADIENT_STOPS.map((stop) => (
              <stop key={stop.offset} offset={stop.offset} stopColor={stop.colorVar} />
            ))}
          </linearGradient>
        </defs>
      ) : null}
      <path
        d={visual.glyphPath}
        fillRule={visual.fillRule}
        style={{ fill: isRainbow ? `url(#${gradientId})` : visual.hueVar }}
      />
    </svg>
  );
}

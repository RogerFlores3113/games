// The always-on suit identity system (UI-06). This module is the ONLY place
// glyph silhouettes and hue tokens are defined — SuitGlyph.tsx (and any
// future consumer) reads from SUIT_VISUALS rather than hardcoding a shape or
// a color per suit.
//
// D-06: all seven suits (including Rainbow and Black, not enabled until
// Phase 7) are defined now so exhaustiveness is provable today; only their
// *tests* (Rainbow/Black gameplay) land in Phase 7, not their designs.
//
// D-07: glyphs are hand-authored inline SVG path data (no icon font, no
// third-party icon package, no new dependency) — see SuitGlyph.tsx for the
// component that renders these paths.
//
// D-10: hue (hueVar) never varies with luminosity step — luminosity is
// carried separately via --color-card-glow and opacity/box-shadow, never by
// swapping a suit's hue token.
//
// hueVar values are static literal `var(--color-suit-*)` strings (never
// template-interpolated) so Tailwind v4's JIT scanner and any consumer can
// treat them as plain CSS custom-property references.
import type { Suit } from "@games/rules";

export interface SuitVisual {
  label: string;
  hueVar: string;
  glyphPath: string;
}

export const SUIT_VISUALS: Readonly<Record<Suit, SuitVisual>> = {
  red: {
    label: "Red",
    hueVar: "var(--color-suit-red)",
    // 5-point star, outer radius 10 / inner radius 4.5, point-up.
    glyphPath:
      "M12 2 L14.645 8.36 L21.511 8.91 L16.28 13.39 L17.878 20.09 L12 16.5 L6.122 20.09 L7.72 13.39 L2.489 8.91 L9.355 8.36 Z",
  },
  yellow: {
    label: "Yellow",
    hueVar: "var(--color-suit-yellow)",
    // Upward-pointing triangle.
    glyphPath: "M12 3 L21 21 L3 21 Z",
  },
  green: {
    label: "Green",
    hueVar: "var(--color-suit-green)",
    // Square inset to ~18px on a 24x24 viewBox.
    glyphPath: "M3 3 H21 V21 H3 Z",
  },
  blue: {
    label: "Blue",
    hueVar: "var(--color-suit-blue)",
    // Circle, radius 9, expressed as two arcs on a single path.
    glyphPath: "M3 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 Z",
  },
  white: {
    label: "White",
    hueVar: "var(--color-suit-white)",
    // Diamond.
    glyphPath: "M12 2 L22 12 L12 22 L2 12 Z",
  },
  rainbow: {
    label: "Rainbow",
    hueVar: "var(--color-suit-rainbow)",
    // Flat single-tone 8-point starburst: 16 vertices, outer radius 11 /
    // inner radius 3 — deliberately more and thinner points than the red
    // star (10 vertices, outer 10 / inner 4.5) so the two never read alike.
    glyphPath:
      "M12 1 L13.148 9.228 L19.778 4.222 L14.772 10.852 L23 12 L14.772 13.148 L19.778 19.778 L13.148 14.772 L12 23 L10.852 14.772 L4.222 19.778 L9.228 13.148 L1 12 L9.228 10.852 L4.222 4.222 L10.852 9.228 Z",
  },
  black: {
    label: "Black",
    hueVar: "var(--color-suit-black)",
    // Hexagon with a V notch cut into the top edge.
    glyphPath: "M21 12 L16.5 19.794 L7.5 19.794 L3 12 L7.5 4.206 L12 8 L16.5 4.206 Z",
  },
};

export function suitVisual(suit: Suit): SuitVisual {
  return SUIT_VISUALS[suit];
}

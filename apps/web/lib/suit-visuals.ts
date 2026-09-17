// The always-on suit identity system (UI-06), reworked for Phase 6.1 (D-08)
// into original firework-burst silhouettes. This module is the ONLY place
// burst silhouettes, rank layouts, and card-back art are defined —
// SuitGlyph.tsx / FireworkCard.tsx (and any future consumer) read from
// SUIT_VISUALS / burstLayoutForRank / CARD_BACK_ART rather than hardcoding a
// shape or a color per suit.
//
// D-08: each of the 7 suits has an original firework-burst silhouette,
// pairwise distinct with colour ignored (the `silhouette` descriptor below
// captures that colour-independent shape contract). Rainbow's SILHOUETTE
// (spike count/shape below) stays single-tone-describable and grayscale-
// distinct on its own; per owner override during the 06.1-07 art review
// ("I'd like if rainbow was actually rainbow as well"), the *rendered fill*
// is no longer a flat single tone — SuitGlyph.tsx paints Rainbow's path with
// a multicolour gradient built from the existing suit hue tokens. hueVar
// below remains the single literal fallback/base token (used as the
// gradient's final stop), so this module's shape/token contract is
// unaffected; only SuitGlyph's fill decision changed.
// D-09: rank is shown as burst COUNT (burstLayoutForRank) plus a small
// corner numeral (FireworkCard.tsx owns the numeral).
// D-10: CARD_BACK_ART is a single neutral card-back motif, identical for
// every card, carrying zero suit/rank identity.
// D-11: all art is hand-authored inline SVG path data, coloured only via
// `var(--color-suit-*)` / `@theme` tokens — no hex outside globals.css.
//
// D-06 (carried forward): all seven suits (including Rainbow and Black, not
// enabled until Phase 7) are defined now so exhaustiveness is provable
// today; only their *tests* (Rainbow/Black gameplay) land in Phase 7.
//
// hueVar values are static literal `var(--color-suit-*)` strings (never
// template-interpolated) so Tailwind v4's JIT scanner and any consumer can
// treat them as plain CSS custom-property references.
import type { Suit } from "@games/rules";

export interface SuitSilhouette {
  /** Number of primary spikes/points in the burst (colour-ignored shape signal). */
  spikes: number;
  /** How many concentric rings the burst is built from. */
  rings: 0 | 1 | 2;
  /** Whether the burst has a cut-out (evenodd) hole at its center. */
  hollow: boolean;
}

export interface SuitVisual {
  label: string;
  hueVar: string;
  glyphPath: string;
  fillRule: "nonzero" | "evenodd";
  silhouette: SuitSilhouette;
}

export interface BurstPlacement {
  cx: number;
  cy: number;
  scale: number;
}

export interface CardBackLayer {
  d: string;
  fillVar: string;
  opacity: number;
}

export interface CardBackArt {
  viewBox: string;
  layers: readonly CardBackLayer[];
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Pure helper: builds a star-polygon path string alternating outer/inner
 * vertices around (cx, cy). `outerR` may be a single radius (uniform spikes)
 * or an array of radii cycled across the outer vertices (asymmetric spikes,
 * e.g. blue's 4-long/4-short cross-star). Reproducible and deterministic —
 * the resulting strings are frozen into SUIT_VISUALS below, never
 * recomputed at render time.
 */
function starBurstPath(
  spikeCount: number,
  outerR: number | readonly number[],
  innerR: number,
  rotationDeg = 0,
  cx = 12,
  cy = 12,
): string {
  const totalVertices = spikeCount * 2;
  const step = 360 / totalVertices;
  const outerArr = Array.isArray(outerR) ? outerR : null;
  const segments: string[] = [];
  for (let i = 0; i < totalVertices; i++) {
    const angle = -90 + rotationDeg + i * step;
    const isOuter = i % 2 === 0;
    const r = isOuter ? (outerArr ? outerArr[(i / 2) % outerArr.length]! : (outerR as number)) : innerR;
    const { x, y } = polarPoint(cx, cy, r, angle);
    segments.push(`${i === 0 ? "M" : "L"} ${round(x)} ${round(y)}`);
  }
  return `${segments.join(" ")} Z`;
}

/** Pure helper: a circle expressed as a two-arc path, used as an evenodd hole. */
function circlePath(r: number, cx = 12, cy = 12): string {
  return `M ${round(cx + r)} ${round(cy)} A ${r} ${r} 0 1 0 ${round(cx - r)} ${round(cy)} A ${r} ${r} 0 1 0 ${round(cx + r)} ${round(cy)} Z`;
}

/**
 * Pure helper: a hollow ring burst — an outer star silhouette with a
 * circular hole cut from its center via the evenodd fill rule (green's
 * "willow-trail" ring, black's double-ring uses two of these).
 */
function ringBurstPath(
  spikeCount: number,
  outerR: number,
  innerR: number,
  holeR: number,
  rotationDeg = 0,
): string {
  return `${starBurstPath(spikeCount, outerR, innerR, rotationDeg)} ${circlePath(holeR)}`;
}

export const SUIT_VISUALS: Readonly<Record<Suit, SuitVisual>> = {
  red: {
    label: "Red",
    hueVar: "var(--color-suit-red)",
    // Radiating 12-spike uniform chrysanthemum burst.
    glyphPath: starBurstPath(12, 10.5, 4.5, 0),
    fillRule: "nonzero",
    silhouette: { spikes: 12, rings: 0, hollow: false },
  },
  yellow: {
    label: "Yellow",
    hueVar: "var(--color-suit-yellow)",
    // Dense round-petal burst: more, fatter petals (inner radius closer to
    // outer than red's) so the silhouette reads distinctly in grayscale.
    glyphPath: starBurstPath(16, 9.5, 7, 11.25),
    fillRule: "nonzero",
    silhouette: { spikes: 16, rings: 0, hollow: false },
  },
  green: {
    label: "Green",
    hueVar: "var(--color-suit-green)",
    // Hollow ring of short trailing spikes (evenodd hole) — a donut-like
    // outline, structurally distinct from red/yellow's solid radial fills.
    glyphPath: ringBurstPath(10, 10, 8, 5, 0),
    fillRule: "evenodd",
    silhouette: { spikes: 10, rings: 1, hollow: true },
  },
  blue: {
    label: "Blue",
    hueVar: "var(--color-suit-blue)",
    // 4 long + 4 short asymmetric cross-star (alternating outer radii).
    glyphPath: starBurstPath(8, [11, 7], 3, 0),
    fillRule: "nonzero",
    silhouette: { spikes: 8, rings: 0, hollow: false },
  },
  white: {
    label: "White",
    hueVar: "var(--color-suit-white)",
    // Sparse, wide-angle "sparkler" burst: fewer, longer, thinner spikes.
    glyphPath: starBurstPath(6, 11, 2, 15),
    fillRule: "nonzero",
    silhouette: { spikes: 6, rings: 0, hollow: false },
  },
  rainbow: {
    label: "Rainbow",
    hueVar: "var(--color-suit-rainbow)",
    // Largest burst silhouette, many thin rays — deliberately more/thinner
    // points than every other suit so its SILHOUETTE never reads alike in
    // grayscale. Owner override (06.1-07 Task 3): the *fill* is rendered as
    // an actual multicolour rainbow gradient by SuitGlyph.tsx, not the flat
    // single tone originally proposed in D-08/UI-SPEC — hueVar here is kept
    // as the gradient's final stop / non-SVG fallback.
    glyphPath: starBurstPath(20, 11.5, 3, 0),
    fillRule: "nonzero",
    silhouette: { spikes: 20, rings: 0, hollow: false },
  },
  black: {
    label: "Black",
    hueVar: "var(--color-suit-black)",
    // Compact double ring of short spikes (two concentric hollow rings).
    // "Blackness" is name/shape only — rendered light silver via the hue
    // token, never literal darkness (carried forward from Phase 6).
    glyphPath: `${ringBurstPath(8, 9, 7.2, 6, 0)} ${ringBurstPath(8, 5, 3.8, 2.5, 22.5)}`,
    fillRule: "evenodd",
    silhouette: { spikes: 8, rings: 2, hollow: true },
  },
};

export function suitVisual(suit: Suit): SuitVisual {
  return SUIT_VISUALS[suit];
}

/**
 * D-09: box-game-style burst arrangements per rank, in unit (0..1) card
 * coordinates — callers scale/position against their own card box.
 */
const BURST_LAYOUTS: Readonly<Record<1 | 2 | 3 | 4 | 5, readonly BurstPlacement[]>> = {
  1: [{ cx: 0.5, cy: 0.5, scale: 1 }],
  2: [
    { cx: 0.28, cy: 0.28, scale: 0.55 },
    { cx: 0.72, cy: 0.72, scale: 0.55 },
  ],
  3: [
    { cx: 0.22, cy: 0.22, scale: 0.45 },
    { cx: 0.5, cy: 0.5, scale: 0.45 },
    { cx: 0.78, cy: 0.78, scale: 0.45 },
  ],
  4: [
    { cx: 0.26, cy: 0.26, scale: 0.4 },
    { cx: 0.74, cy: 0.26, scale: 0.4 },
    { cx: 0.26, cy: 0.74, scale: 0.4 },
    { cx: 0.74, cy: 0.74, scale: 0.4 },
  ],
  // Owner review (06.1-07 Task 3): center burst enlarged ~1.5x (0.35 -> 0.525)
  // per the owner's explicit request; the four corner bursts are nudged
  // outward (0.24/0.76 -> 0.22/0.78) so they stay clear of the larger center
  // burst instead of clipping into it.
  5: [
    { cx: 0.22, cy: 0.22, scale: 0.35 },
    { cx: 0.78, cy: 0.22, scale: 0.35 },
    { cx: 0.5, cy: 0.5, scale: 0.525 },
    { cx: 0.22, cy: 0.78, scale: 0.35 },
    { cx: 0.78, cy: 0.78, scale: 0.35 },
  ],
};

export function burstLayoutForRank(rank: 1 | 2 | 3 | 4 | 5): readonly BurstPlacement[] {
  return BURST_LAYOUTS[rank];
}

/**
 * D-10: single neutral card-back motif (unlit shell / night silhouette),
 * identical for every own-hand card regardless of true identity — zero
 * suit/rank signal. Coloured exclusively via existing @theme tokens.
 */
export const CARD_BACK_ART: CardBackArt = {
  viewBox: "0 0 24 32",
  layers: [
    { d: "M0 0H24V32H0Z", fillVar: "var(--color-border)", opacity: 1 },
    { d: "M1 1H23V31H1Z", fillVar: "var(--color-surface)", opacity: 1 },
    // Faint unlit-shell emblem (a diamond) — pure decoration, no identity.
    { d: "M12 10 L17 16 L12 22 L7 16 Z", fillVar: "var(--color-text-muted)", opacity: 0.35 },
    // Soft top glow arc — night-motif garnish only.
    { d: "M4 7 A9 6 0 0 1 20 7 L18 8 A7 4.5 0 0 0 6 8 Z", fillVar: "var(--color-card-glow)", opacity: 0.15 },
  ],
};

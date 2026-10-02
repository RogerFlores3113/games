/**
 * The single canvas hex palette (UI-SPEC "Color: Canvas world"). Every
 * Phaser scene under `apps/web/components/expedition/phaser/**` draws with
 * colours from here — never a hand-typed hex literal at a draw call site.
 *
 * Canvas code cannot read CSS custom properties, so values that carry the
 * same meaning as an HTML-side token (`turn`, `destructive`,
 * `statusConnected`, `statusDisconnected`, `text`, `rain`) are DELIBERATE,
 * DOCUMENTED duplicates of `apps/web/app/globals.css`'s `@theme` values —
 * the same "duplicate across a runtime boundary, on purpose" precedent
 * `packages/rules/src/expedition/adapter.ts` already uses for its locally
 * duplicated `Variant` type. `palette.test.ts` reads globals.css directly
 * and asserts these mirrored values stay byte-identical to it.
 *
 * `jungle`, `stump`, `letterbox`, `plate`, `plateEdge`, `moss`, `bark` and
 * `textDim` are world-only — they have no HTML-side
 * equivalent (the site has no jungle/camp theme outside this canvas).
 *
 * No leaf here may ever equal globals.css's `--color-accent` value: the
 * canvas never draws the CTA gold — that meaning stays exclusively in
 * the HTML settings modal (UI-SPEC accent rule).
 */

export const PALETTE = {
  // World-only (UI-SPEC), no HTML-side equivalent.
  jungle: "#0F2318",
  stump: "#4A3420",
  letterbox: "#060D08",
  plate: "#0A1610", // dark HUD plate behind text
  plateEdge: "#2C4A36",
  moss: "#2E5A3A",
  bark: "#6B4A2B",
  textDim: "#A7B0A9",

  // Mirrored from globals.css — keep byte-identical, see palette.test.ts.
  turn: "#9B65F7", // --color-turn
  destructive: "#F0453D", // --color-destructive
  statusConnected: "#34D399", // --color-status-connected
  statusDisconnected: "#6B7280", // --color-status-disconnected
  text: "#F4F6FB", // --color-text
  rain: "#6FA8FF", // --color-suit-blue (D-15 Monsoon rain reuses this hue)

  // Card art — this phase's own choices (D-13 placeholder tier).
  cardFace: "#E8DEC5", // light parchment
  cardBack: "#1B4332", // deep green, distinct from `jungle`
  cardEdge: "#2A1F14", // dark wood-toned edge

  suitBigIndex: {
    spades: "#1A1A1A", // near-black
    hearts: "#D93B3B", // red
    diamonds: "#3B6EA5", // blue
    clubs: "#3F8F5C", // green
  },
  suitClassic: {
    black: "#1A1A1A",
    red: "#D93B3B",
  },

  sun: "#E8792E", // warm orange, deliberately NOT --color-accent's gold
  moon: "#C9CDD6", // pale silver
  done: "#4CAF6D", // green, completed-objective marker
} as const;

/** Parses a "#rrggbb" string into Phaser's `0xrrggbb` integer form. */
export function toPhaserColor(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

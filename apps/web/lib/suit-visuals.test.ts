// SuitGlyph visuals — D-05/D-06/D-07/D-10 machine verification.
//
// This test file owns a small, self-contained WCAG contrast helper (relative
// luminance + contrast ratio) so the check can run against hex values parsed
// directly out of apps/web/app/globals.css, rather than trusting a
// hand-copied constant to stay in sync with the real @theme block.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_SUITS } from "@games/rules";
import { burstLayoutForRank, CARD_BACK_ART, SUIT_VISUALS } from "./suit-visuals";

const GLOBALS_CSS_PATH = fileURLToPath(new URL("../app/globals.css", import.meta.url));
const globalsCss = readFileSync(GLOBALS_CSS_PATH, "utf-8");

function srgbChannelToLinear(channel8bit: number): number {
  const c = channel8bit / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA);
  const lumB = relativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

function extractThemeBlock(css: string): string {
  const match = css.match(/@theme\s*{([\s\S]*?)\n}/);
  if (!match || !match[1]) throw new Error("No @theme block found in globals.css");
  return match[1];
}

function tokenHex(themeBlock: string, tokenName: string): string {
  const re = new RegExp(`--${tokenName}:\\s*(#[0-9A-Fa-f]{3,8})`);
  const match = themeBlock.match(re);
  if (!match || !match[1]) throw new Error(`Token --${tokenName} not found in @theme block`);
  return match[1];
}

function countOccurrences(css: string, tokenName: string): number {
  const re = new RegExp(`--${tokenName}:`, "g");
  return (css.match(re) ?? []).length;
}

describe("suit-visuals", () => {
  it("SUIT_VISUALS is exhaustively keyed by every Suit, and only those suits", () => {
    const suitKeys = Object.keys(SUIT_VISUALS).sort();
    const allSuits = [...ALL_SUITS].sort();
    expect(suitKeys).toEqual(allSuits);
  });

  it("every glyphPath is a non-empty string and all seven are pairwise distinct", () => {
    const paths = ALL_SUITS.map((suit) => SUIT_VISUALS[suit].glyphPath);
    for (const path of paths) {
      expect(typeof path).toBe("string");
      expect(path.length).toBeGreaterThan(0);
    }
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("every hueVar is a static var(--color-suit-*) literal, all distinct, with capitalized labels", () => {
    const hueVars = ALL_SUITS.map((suit) => SUIT_VISUALS[suit].hueVar);
    for (const hueVar of hueVars) {
      expect(hueVar).toMatch(/^var\(--color-suit-[a-z]+\)$/);
    }
    expect(new Set(hueVars).size).toBe(hueVars.length);

    for (const suit of ALL_SUITS) {
      const expectedLabel = suit.charAt(0).toUpperCase() + suit.slice(1);
      expect(SUIT_VISUALS[suit].label).toBe(expectedLabel);
    }
  });

  it("globals.css defines each --color-suit-<suit> token exactly once inside @theme", () => {
    const themeBlock = extractThemeBlock(globalsCss);
    for (const suit of ALL_SUITS) {
      const re = new RegExp(`--color-suit-${suit}:\\s*#[0-9A-Fa-f]{3,8}`);
      const matches = themeBlock.match(new RegExp(re, "g")) ?? [];
      expect(matches.length).toBe(1);
    }
  });

  it("every suit hue passes WCAG AA (>=4.5:1) against --color-bg and --color-surface", () => {
    const themeBlock = extractThemeBlock(globalsCss);
    const bgHex = tokenHex(themeBlock, "color-bg");
    const surfaceHex = tokenHex(themeBlock, "color-surface");

    for (const suit of ALL_SUITS) {
      const suitHex = tokenHex(themeBlock, `color-suit-${suit}`);
      expect(contrastRatio(suitHex, bgHex)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(suitHex, surfaceHex)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("--color-card-glow is defined once in @theme, and no pre-existing token is redefined", () => {
    expect(countOccurrences(globalsCss, "color-card-glow")).toBe(1);

    const preExistingTokens = [
      "color-bg",
      "color-surface",
      "color-accent",
      "color-destructive",
      "color-text",
      "color-text-muted",
      "color-border",
      "color-status-connected",
      "color-status-disconnected",
      "size-touch-min",
    ];
    for (const token of preExistingTokens) {
      expect(countOccurrences(globalsCss, token)).toBe(1);
    }
  });

  it("every suit has a silhouette descriptor, and all seven are pairwise distinct (colour-ignored)", () => {
    const tuples = ALL_SUITS.map((suit) => {
      const { spikes, rings, hollow } = SUIT_VISUALS[suit].silhouette;
      return `${spikes}:${rings}:${hollow}`;
    });
    for (const suit of ALL_SUITS) {
      const s = SUIT_VISUALS[suit].silhouette;
      expect(typeof s.spikes).toBe("number");
      expect(s.spikes).toBeGreaterThan(0);
      expect([0, 1, 2]).toContain(s.rings);
      expect(typeof s.hollow).toBe("boolean");
    }
    expect(new Set(tuples).size).toBe(tuples.length);
  });

  it("rainbow's visual has no gradient/multicolour field: hueVar is the single literal token", () => {
    expect(SUIT_VISUALS.rainbow.hueVar).toBe("var(--color-suit-rainbow)");
  });

  it("UAT gap 38: --color-turn passes WCAG AA (>=4.5:1) against --color-bg and --color-surface, and is clearly distinct from --color-suit-rainbow", () => {
    const themeBlock = extractThemeBlock(globalsCss);
    const bgHex = tokenHex(themeBlock, "color-bg");
    const surfaceHex = tokenHex(themeBlock, "color-surface");
    const turnHex = tokenHex(themeBlock, "color-turn");
    const rainbowHex = tokenHex(themeBlock, "color-suit-rainbow");

    expect(contrastRatio(turnHex, bgHex)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(turnHex, surfaceHex)).toBeGreaterThanOrEqual(4.5);

    // Never the same colour, and never close enough to be confused with the
    // Rainbow suit hue at a glance — a Euclidean distance in 8-bit RGB space
    // comfortably above the ~30-unit "clearly different colour" threshold.
    expect(turnHex.toLowerCase()).not.toBe(rainbowHex.toLowerCase());
    function channel(hex: string, offset: number): number {
      return parseInt(hex.slice(offset, offset + 2), 16);
    }
    const dr = channel(turnHex, 1) - channel(rainbowHex, 1);
    const dg = channel(turnHex, 3) - channel(rainbowHex, 3);
    const db = channel(turnHex, 5) - channel(rainbowHex, 5);
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    expect(distance).toBeGreaterThan(50);
  });

  it("UAT gap 32 follow-up: --color-clue-number passes WCAG AA (>=4.5:1) against --color-bg and --color-surface, and is clearly distinct from every colour it could be confused with", () => {
    const themeBlock = extractThemeBlock(globalsCss);
    const bgHex = tokenHex(themeBlock, "color-bg");
    const surfaceHex = tokenHex(themeBlock, "color-surface");
    const numberHex = tokenHex(themeBlock, "color-clue-number");

    expect(contrastRatio(numberHex, bgHex)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(numberHex, surfaceHex)).toBeGreaterThanOrEqual(4.5);

    // Never close enough to be confused, at a glance, with: the suit-red
    // coral (a number clue's pulse sits right next to a red-clued tile's own
    // ring sometimes), the pale-lavender Rainbow hue, the turn indicator's
    // violet (--color-turn — already spoken for, HANABI-38), or
    // --color-suit-white (the owner's specific worry: "white overlaps with
    // the white firework's color pulse"). Same ~50-unit Euclidean-distance
    // "clearly different colour" bar --color-turn's own gap-38 test uses.
    const confusableWith: Record<string, string> = {
      "color-suit-red": tokenHex(themeBlock, "color-suit-red"),
      "color-suit-rainbow": tokenHex(themeBlock, "color-suit-rainbow"),
      "color-turn": tokenHex(themeBlock, "color-turn"),
      "color-suit-white": tokenHex(themeBlock, "color-suit-white"),
    };
    function channel(hex: string, offset: number): number {
      return parseInt(hex.slice(offset, offset + 2), 16);
    }
    for (const [name, hex] of Object.entries(confusableWith)) {
      expect(numberHex.toLowerCase(), `--color-clue-number must not equal --${name}`).not.toBe(hex.toLowerCase());
      const dr = channel(numberHex, 1) - channel(hex, 1);
      const dg = channel(numberHex, 3) - channel(hex, 3);
      const db = channel(numberHex, 5) - channel(hex, 5);
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      expect(distance, `--color-clue-number vs --${name}`).toBeGreaterThan(50);
    }
  });

  it("every fillRule is a valid SVG fill-rule value", () => {
    for (const suit of ALL_SUITS) {
      expect(["nonzero", "evenodd"]).toContain(SUIT_VISUALS[suit].fillRule);
    }
  });

  it("burstLayoutForRank returns exactly r entries with in-bounds, non-duplicate placements", () => {
    for (const rank of [1, 2, 3, 4, 5] as const) {
      const layout = burstLayoutForRank(rank);
      expect(layout.length).toBe(rank);
      const seen = new Set<string>();
      for (const placement of layout) {
        expect(placement.cx).toBeGreaterThanOrEqual(0);
        expect(placement.cx).toBeLessThanOrEqual(1);
        expect(placement.cy).toBeGreaterThanOrEqual(0);
        expect(placement.cy).toBeLessThanOrEqual(1);
        expect(placement.scale).toBeGreaterThan(0);
        expect(placement.scale).toBeLessThanOrEqual(1);
        const key = `${placement.cx}:${placement.cy}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it("CARD_BACK_ART contains only token var(...) colour references, no hex, no suit hue", () => {
    expect(CARD_BACK_ART.layers.length).toBeGreaterThan(0);
    for (const layer of CARD_BACK_ART.layers) {
      expect(layer.fillVar).toMatch(/^var\(--/);
      expect(layer.fillVar).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
      expect(layer.fillVar).not.toMatch(/--color-suit-/);
    }
  });
});

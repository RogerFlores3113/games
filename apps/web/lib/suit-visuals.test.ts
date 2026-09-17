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
import { SUIT_VISUALS } from "./suit-visuals";

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

describe("SuitGlyph visuals", () => {
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
});

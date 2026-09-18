// Background asset (ART-02/D-14, TILE-01/D-11 reversal — 06.2 UAT gaps 2
// and 9) — machine verification that every sourced background WebP and its
// credit record satisfy the plan's must-haves, and that .table-backdrop and
// .board-surface in globals.css wire the scrim + image correctly with no
// stray hex literal outside @theme and no leftover generated-texture layers.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CREDITS_PATH = fileURLToPath(
  new URL("../public/backgrounds/CREDITS.md", import.meta.url),
);
const GLOBALS_CSS_PATH = fileURLToPath(new URL("../app/globals.css", import.meta.url));

const BACKGROUND_ASSETS = [
  {
    name: "wood-tile.webp",
    path: fileURLToPath(new URL("../public/backgrounds/wood-tile.webp", import.meta.url)),
  },
  {
    name: "city-fireworks.webp",
    path: fileURLToPath(new URL("../public/backgrounds/city-fireworks.webp", import.meta.url)),
  },
] as const;

describe("background-asset", () => {
  for (const asset of BACKGROUND_ASSETS) {
    it(`${asset.name} exists, has WEBP magic bytes, and is <= 300000 bytes`, () => {
      const buffer = readFileSync(asset.path);
      expect(buffer.length).toBeGreaterThan(0);
      expect(buffer.length).toBeLessThanOrEqual(300000);
      // RIFF....WEBP magic bytes.
      expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
      expect(buffer.toString("ascii", 8, 12)).toBe("WEBP");
    });
  }

  it("CREDITS.md has a Source URL / Author / License / License URL record for each background asset", () => {
    const credits = readFileSync(CREDITS_PATH, "utf-8");
    for (const asset of BACKGROUND_ASSETS) {
      expect(credits).toContain(`## ${asset.name}`);
    }
    const sourceUrlCount = (credits.match(/^Source URL: https:\/\/\S+/gm) ?? []).length;
    const authorCount = (credits.match(/^Author: \S+/gm) ?? []).length;
    const licenseCount = (credits.match(/^License: \S+/gm) ?? []).length;
    const licenseUrlCount = (credits.match(/^License URL: https:\/\/\S+/gm) ?? []).length;
    expect(sourceUrlCount).toBeGreaterThanOrEqual(3);
    expect(authorCount).toBeGreaterThanOrEqual(3);
    expect(licenseCount).toBeGreaterThanOrEqual(3);
    expect(licenseUrlCount).toBeGreaterThanOrEqual(3);
  });

  it("globals.css defines .table-backdrop with the 75% scrim, the city-fireworks image url, cover sizing, and fixed attachment", () => {
    const css = readFileSync(GLOBALS_CSS_PATH, "utf-8");
    const match = css.match(/\.table-backdrop\s*{([\s\S]*?)}/);
    expect(match).not.toBeNull();
    const rule = match![1]!;
    expect(rule).toMatch(/rgba\(11,\s*15,\s*26,\s*0\.75\)/);
    expect(rule).toMatch(/url\(["']\/backgrounds\/city-fireworks\.webp["']\)/);
    expect(rule).toMatch(/background-size:\s*cover/);
    expect(rule).toMatch(/background-attachment:\s*fixed/);
    // No hex literal inside the rule itself.
    expect(rule).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
  });

  it("globals.css defines .board-surface as the wood tile repeated in a grid, with no generated-texture layers", () => {
    const css = readFileSync(GLOBALS_CSS_PATH, "utf-8");
    const match = css.match(/\.board-surface\s*{([\s\S]*?)}/);
    expect(match).not.toBeNull();
    const rule = match![1]!;
    expect(rule).toMatch(/url\(["']\/backgrounds\/wood-tile\.webp["']\)/);
    // TILE-02: a small texture repeated in a grid, not one stretched photo.
    expect(rule).toMatch(/background-repeat:[^;]*repeat/);
    expect(rule).not.toMatch(/background-size:\s*cover\s*;/);
    expect(rule).not.toMatch(/repeating-linear-gradient/);
    expect(rule).not.toMatch(/background-blend-mode/);
    // No hex literal inside the rule itself.
    expect(rule).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
  });

  it("globals.css has no hex literal outside the @theme block (carry-forward rule)", () => {
    const css = readFileSync(GLOBALS_CSS_PATH, "utf-8");
    const themeMatch = css.match(/@theme\s*{[\s\S]*?\n}/);
    expect(themeMatch).not.toBeNull();
    const outsideTheme = css.replace(themeMatch![0], "");
    expect(outsideTheme).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
  });

  it("city-night.webp is no longer referenced in globals.css", () => {
    const css = readFileSync(GLOBALS_CSS_PATH, "utf-8");
    expect(css).not.toMatch(/city-night/);
  });
});

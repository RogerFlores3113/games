// Background asset (ART-02/D-14) — machine verification that the city-at-
// night WebP and its credit record satisfy the plan's must-haves, and that
// .table-backdrop in globals.css wires the scrim + image correctly with no
// stray hex literal outside @theme.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BACKGROUND_WEBP_PATH = fileURLToPath(
  new URL("../public/backgrounds/city-night.webp", import.meta.url),
);
const CREDITS_PATH = fileURLToPath(
  new URL("../public/backgrounds/CREDITS.md", import.meta.url),
);
const GLOBALS_CSS_PATH = fileURLToPath(new URL("../app/globals.css", import.meta.url));

describe("background-asset", () => {
  it("city-night.webp exists, has WEBP magic bytes, and is <= 300000 bytes", () => {
    const buffer = readFileSync(BACKGROUND_WEBP_PATH);
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.length).toBeLessThanOrEqual(300000);
    // RIFF....WEBP magic bytes.
    expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buffer.toString("ascii", 8, 12)).toBe("WEBP");
  });

  it("CREDITS.md has non-empty Source URL / Author / License / License URL lines", () => {
    const credits = readFileSync(CREDITS_PATH, "utf-8");
    expect(credits).toMatch(/^Source URL: https:\/\/\S+/m);
    expect(credits).toMatch(/^Author: \S+/m);
    expect(credits).toMatch(/^License: \S+/m);
    expect(credits).toMatch(/^License URL: https:\/\/\S+/m);
  });

  it("globals.css defines .table-backdrop with the 75% scrim, the image url, cover sizing, and fixed attachment", () => {
    const css = readFileSync(GLOBALS_CSS_PATH, "utf-8");
    const match = css.match(/\.table-backdrop\s*{([\s\S]*?)}/);
    expect(match).not.toBeNull();
    const rule = match![1]!;
    expect(rule).toMatch(/rgba\(11,\s*15,\s*26,\s*0\.75\)/);
    expect(rule).toMatch(/url\(["']\/backgrounds\/city-night\.webp["']\)/);
    expect(rule).toMatch(/background-size:\s*cover/);
    expect(rule).toMatch(/background-attachment:\s*fixed/);
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
});

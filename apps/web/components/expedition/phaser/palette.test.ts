import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PALETTE, toPhaserColor } from "./palette";

const GLOBALS_CSS_PATH = fileURLToPath(new URL("../../../app/globals.css", import.meta.url));
const globalsCss = readFileSync(GLOBALS_CSS_PATH, "utf-8");

/** Reads `--color-{name}: #XXXXXX;` out of globals.css. Throws if the token
 * isn't found, so a renamed CSS token fails loudly rather than silently. */
function cssColorToken(name: string): string {
  const match = globalsCss.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`));
  if (!match) throw new Error(`--color-${name} not found in globals.css`);
  return match[1]!.toLowerCase();
}

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function collectLeaves(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectLeaves(v, out);
  }
  return out;
}

describe("palette mirrors globals.css", () => {
  it.each([
    ["turn", PALETTE.turn],
    ["destructive", PALETTE.destructive],
    ["status-connected", PALETTE.statusConnected],
    ["status-disconnected", PALETTE.statusDisconnected],
    ["text", PALETTE.text],
    ["suit-blue", PALETTE.rain],
  ])("PALETTE mirror of --color-%s matches globals.css", (cssName, paletteValue) => {
    expect(paletteValue.toLowerCase()).toBe(cssColorToken(cssName));
  });

  it("world-only tokens have their fixed values", () => {
    expect(PALETTE.jungle).toBe("#0F2318");
    expect(PALETTE.stump).toBe("#4A3420");
    expect(PALETTE.letterbox).toBe("#060D08");
  });

  it("every palette leaf matches the 6-digit hex pattern", () => {
    for (const leaf of collectLeaves(PALETTE)) {
      expect(leaf).toMatch(HEX_PATTERN);
    }
  });

  it("suitBigIndex's four colours are pairwise distinct", () => {
    const values = Object.values(PALETTE.suitBigIndex);
    expect(new Set(values.map((v) => v.toLowerCase())).size).toBe(values.length);
  });

  it("suitClassic has exactly black and red", () => {
    expect(Object.keys(PALETTE.suitClassic).sort()).toEqual(["black", "red"]);
  });

  it("no palette leaf equals globals.css --color-accent (canvas never draws the CTA gold)", () => {
    const accent = cssColorToken("accent");
    for (const leaf of collectLeaves(PALETTE)) {
      expect(leaf.toLowerCase()).not.toBe(accent);
    }
  });

  it("toPhaserColor converts a hex string to Phaser's 0x-int form", () => {
    expect(toPhaserColor("#9B65F7")).toBe(0x9b65f7);
    expect(toPhaserColor("#000000")).toBe(0);
  });
});

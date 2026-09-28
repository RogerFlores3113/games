import { describe, expect, it } from "vitest";
import { GLYPHS_5X7, KNOWN_GLYPH_CHARS, truncateLabel } from "./glyphs-5x7";

const GLYPH_ROW_RE = /^[#.]{5}$/;

describe("GLYPHS_5X7", () => {
  it("has an entry for every char code 32..126 plus '…'", () => {
    for (const ch of KNOWN_GLYPH_CHARS) {
      expect(GLYPHS_5X7[ch], `missing glyph for ${JSON.stringify(ch)}`).toBeDefined();
    }
  });

  it("has an entry for '?' (also covered by the 32..126 range at code 63)", () => {
    expect(GLYPHS_5X7["?"]).toBeDefined();
  });

  it("every entry is exactly 7 rows of 5 chars matching /^[#.]{5}$/", () => {
    for (const [ch, rows] of Object.entries(GLYPHS_5X7)) {
      expect(rows.length, `${JSON.stringify(ch)} row count`).toBe(7);
      for (const row of rows) {
        expect(row, `${JSON.stringify(ch)} row ${JSON.stringify(row)}`).toMatch(GLYPH_ROW_RE);
      }
    }
  });

  it("space glyph is all '.'", () => {
    for (const row of GLYPHS_5X7[" "]!) {
      expect(row).toBe(".....");
    }
  });

  it("'A' and 'a' differ", () => {
    expect(GLYPHS_5X7.A).not.toEqual(GLYPHS_5X7.a);
  });

  it("digits 0-9 are pairwise distinct", () => {
    const digits = "0123456789".split("");
    for (let i = 0; i < digits.length; i++) {
      for (let j = i + 1; j < digits.length; j++) {
        expect(GLYPHS_5X7[digits[i]!]).not.toEqual(GLYPHS_5X7[digits[j]!]);
      }
    }
  });
});

describe("truncateLabel", () => {
  it("returns the string unchanged when it already fits", () => {
    expect(truncateLabel("Bianca", 10)).toBe("Bianca");
  });

  it("truncates to maxChars with a trailing ellipsis", () => {
    const result = truncateLabel("Maximiliano", 8);
    expect(result).toBe("Maximil…");
    expect(result.length).toBe(8);
  });

  it("maps a char outside the table to '?'", () => {
    expect(truncateLabel("é", 10)).toBe("?");
  });
});

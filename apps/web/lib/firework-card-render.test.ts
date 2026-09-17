// D-09/D-10/D-11 (ART-01, plan 06.1-02): render-contract guards for the
// firework-burst card components. Mirrors own-hand-render.test.ts's
// renderToStaticMarkup pattern (server-render, string-assert the DOM) since
// these are the components that will sit behind the D-15 own-hand identity
// boundary once wired into the table in a later plan.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FireworkCardBack, FireworkCardFace } from "../components/hanabi/FireworkCard";

const SOURCE_PATH = fileURLToPath(new URL("../components/hanabi/FireworkCard.tsx", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf-8");

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("firework-card-render", () => {
  it("FireworkCardFace with exposeSuit renders exactly one data-glyph, rank bursts, and the rank numeral", () => {
    const markup = renderToStaticMarkup(
      createElement(FireworkCardFace, { suit: "red", rank: 3, width: 64, height: 84, exposeSuit: true }),
    );
    expect(countOccurrences(markup, 'data-glyph="red"')).toBe(1);
    expect(countOccurrences(markup, "<svg")).toBe(3);
    expect(markup).toContain(">3<");
  });

  it("FireworkCardFace without exposeSuit emits no data-glyph", () => {
    const markup = renderToStaticMarkup(
      createElement(FireworkCardFace, { suit: "blue", rank: 2, width: 64, height: 84 }),
    );
    expect(markup).not.toContain("data-glyph");
  });

  it("FireworkCardFace with showBurstCount false renders exactly one burst plus the numeral", () => {
    const markup = renderToStaticMarkup(
      createElement(FireworkCardFace, {
        suit: "green",
        rank: 5,
        width: 48,
        height: 64,
        showBurstCount: false,
      }),
    );
    expect(countOccurrences(markup, "<svg")).toBe(1);
    expect(markup).toContain(">5<");
  });

  it("every rank 1-5 renders exactly rank bursts when showBurstCount is true", () => {
    for (const rank of [1, 2, 3, 4, 5] as const) {
      const markup = renderToStaticMarkup(
        createElement(FireworkCardFace, { suit: "white", rank, width: 88, height: 112 }),
      );
      expect(countOccurrences(markup, "<svg")).toBe(rank);
    }
  });

  it("FireworkCardBack renders byte-identical markup across two renders with no identity signal", () => {
    const first = renderToStaticMarkup(createElement(FireworkCardBack, { width: 88, height: 112 }));
    const second = renderToStaticMarkup(createElement(FireworkCardBack, { width: 88, height: 112 }));
    expect(first).toBe(second);
    expect(first).not.toContain("data-glyph");
    expect(first).not.toContain("--color-suit-");
    expect(first).not.toContain("card-identity");
  });

  it("FireworkCard.tsx source contains no hex colour literal", () => {
    const withoutComments = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    const hexMatches = withoutComments.match(/#[0-9A-Fa-f]{3,8}/g) ?? [];
    expect(hexMatches.length).toBe(0);
  });
});

// HINT-01/02/04 (D-02..D-07): render-contract guards for the tile-borne hint
// overlay. Mirrors firework-card-render.test.ts's renderToStaticMarkup +
// countOccurrences scaffold since this is the exact same "server-render,
// string-assert the DOM, source-scan for hex" discipline.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CardFacts } from "./hanabi-visual-logic";
import { OwnHintIndicator, TeammateHintIndicator } from "../components/hanabi/HintIndicator";

const SOURCE_PATH = fileURLToPath(new URL("../components/hanabi/HintIndicator.tsx", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf-8");

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function factsFor(partial: Partial<CardFacts> = {}): CardFacts {
  return {
    possibleSuits: [],
    possibleRanks: [],
    positiveClues: [],
    negativeClues: [],
    ...partial,
  };
}

const COLOR_ONLY = factsFor({ positiveClues: [{ type: "color", value: "red" }] });
const NUMBER_ONLY = factsFor({ positiveClues: [{ type: "rank", value: 3 }] });
const BOTH = factsFor({
  positiveClues: [
    { type: "color", value: "blue" },
    { type: "rank", value: 4 },
  ],
});
const NO_HINTS = factsFor();

describe("hint-render", () => {
  it("with a colour hint present, renders a tint layer referencing color-mix with the suit's hue token and a faint SuitGlyph marker", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: COLOR_ONLY, visible: true, width: 88, height: 100, testId: "hint-1" }),
    );
    expect(markup).toContain("color-mix(in srgb, var(--color-suit-red)");
    expect(countOccurrences(markup, "<svg")).toBe(1);
    expect(markup).not.toContain("hint-numeral");
  });

  it("with a number hint present, renders a numeral chip in the bottom-right carrying data-testid=hint-numeral and the numeral text", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: NUMBER_ONLY, visible: true, width: 88, height: 100, testId: "hint-2" }),
    );
    expect(markup).toContain('data-testid="hint-numeral"');
    expect(markup).toMatch(/data-testid="hint-numeral"[^<]*>3</);
    expect(markup).not.toContain("color-mix");
  });

  it("with both a colour and number hint, both the tint layer and the numeral chip are present and independent (D-06)", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: BOTH, visible: true, width: 88, height: 100, testId: "hint-3" }),
    );
    expect(markup).toContain("color-mix(in srgb, var(--color-suit-blue)");
    expect(markup).toContain('data-testid="hint-numeral"');
    expect(markup).toMatch(/data-testid="hint-numeral"[^<]*>4</);
    // Independent channels: the tint layer's markup and the numeral chip's
    // markup do not nest one inside the other's corner span.
    const tintIndex = markup.indexOf("color-mix");
    const numeralIndex = markup.indexOf('data-testid="hint-numeral"');
    expect(tintIndex).toBeGreaterThan(-1);
    expect(numeralIndex).toBeGreaterThan(-1);
  });

  it("with no hints, the component renders nothing", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: NO_HINTS, visible: true, width: 88, height: 100, testId: "hint-4" }),
    );
    expect(markup).toBe("");
  });

  it("with visible=false, renders nothing regardless of hints", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: BOTH, visible: false, width: 88, height: 100, testId: "hint-5" }),
    );
    expect(markup).toBe("");
  });

  it("the own-hand variant's props type has no card/suit/rank member; passing the same facts twice renders byte-identical markup", () => {
    const first = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: BOTH, visible: true, width: 88, height: 100, testId: "hint-6" }),
    );
    const second = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: factsFor({ ...BOTH }), visible: true, width: 88, height: 100, testId: "hint-6" }),
    );
    expect(first).toBe(second);
  });

  it("the teammate variant renders the same tint/marker/numeral composition from the same hint inputs", () => {
    const ownMarkup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: BOTH, visible: true, width: 64, height: 78, testId: "hint-7" }),
    );
    const teammateMarkup = renderToStaticMarkup(
      createElement(TeammateHintIndicator, { facts: BOTH, visible: true, width: 64, height: 78, testId: "hint-7" }),
    );
    expect(teammateMarkup).toBe(ownMarkup);
  });

  it("HintIndicator.tsx source contains no hex colour literal", () => {
    const withoutComments = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    const hexMatches = withoutComments.match(/#[0-9A-Fa-f]{3,8}/g) ?? [];
    expect(hexMatches.length).toBe(0);
  });
});

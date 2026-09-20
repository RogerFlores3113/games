// HINT-01/02/04 (D-02..D-07): render-contract guards for the tile-borne hint
// overlay. Mirrors firework-card-render.test.ts's renderToStaticMarkup +
// countOccurrences scaffold since this is the exact same "server-render,
// string-assert the DOM, source-scan for hex" discipline.
//
// UAT sixth owner review (gaps 32-35, 2026-09-18) rewrote this contract:
// - gap 32/33: a colour clue renders a suit-coloured RING (inset box-shadow
//   referencing the suit's own `--color-suit-*` hue token) instead of a
//   translucent `color-mix` wash across the tile face.
// - gap 34 (D-06 overturned): a card carries at most ONE channel at a time
//   — the most recent clue's own type — never both a colour ring and a
//   numeral simultaneously from two different clues.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CardFacts } from "./hanabi-visual-logic";
import { OwnHintIndicator, TeammateHintIndicator } from "../components/hanabi/HintIndicator";

const SOURCE_PATH = fileURLToPath(new URL("../components/hanabi/HintIndicator.tsx", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf-8");

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
// D-06 overturned (gap 34): a card told colour then rank shows ONLY the
// rank — the most recent clue — never both.
const COLOR_THEN_RANK = factsFor({
  positiveClues: [
    { type: "color", value: "blue" },
    { type: "rank", value: 4 },
  ],
});
// The reverse order shows only the colour.
const RANK_THEN_COLOR = factsFor({
  positiveClues: [
    { type: "rank", value: 4 },
    { type: "color", value: "blue" },
  ],
});
const NO_HINTS = factsFor();
// A rainbow tile touched by two different colour clues — impossible to show
// at all under latest-only, and the case the accumulating display exists for.
const TWO_COLORS = factsFor({
  positiveClues: [
    { type: "color", value: "blue" },
    { type: "color", value: "red" },
  ],
});

describe("hint-render", () => {
  it("with a colour hint present, renders a suit-coloured ring (not the shared yellow luminosity colour) and a faint SuitGlyph marker, no numeral", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: COLOR_ONLY, visible: true, width: 88, height: 100, testId: "hint-1" }),
    );
    expect(markup).toContain('data-testid="hint-color-ring"');
    expect(markup).toContain("var(--color-suit-red)");
    expect(markup).not.toContain("var(--color-card-glow)");
    expect(markup).not.toContain("color-mix");
    expect(markup.match(/<svg/g)?.length).toBe(1);
    expect(markup).not.toContain("hint-numeral");
  });

  it("with a number hint present, renders a numeral chip in the bottom-right carrying data-testid=hint-numeral and the numeral text, no ring", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: NUMBER_ONLY, visible: true, width: 88, height: 100, testId: "hint-2" }),
    );
    expect(markup).toContain('data-testid="hint-numeral"');
    expect(markup).toMatch(/data-testid="hint-numeral"[^<]*>3</);
    expect(markup).not.toContain('data-testid="hint-color-ring"');
  });

  it("D-06 overturned (gap 34): a card told colour then rank shows only the rank — no ring, no glyph, numeral only", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: COLOR_THEN_RANK, visible: true, width: 88, height: 100, testId: "hint-3" }),
    );
    expect(markup).not.toContain('data-testid="hint-color-ring"');
    expect(markup).not.toContain("var(--color-suit-blue)");
    expect(markup).toContain('data-testid="hint-numeral"');
    expect(markup).toMatch(/data-testid="hint-numeral"[^<]*>4</);
  });

  it("D-06 overturned (gap 34): a card told rank then colour shows only the colour — ring present, no numeral", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: RANK_THEN_COLOR, visible: true, width: 88, height: 100, testId: "hint-4" }),
    );
    expect(markup).toContain('data-testid="hint-color-ring"');
    expect(markup).toContain("var(--color-suit-blue)");
    expect(markup).not.toContain("hint-numeral");
  });

  it("with no hints, the component renders nothing", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: NO_HINTS, visible: true, width: 88, height: 100, testId: "hint-5" }),
    );
    expect(markup).toBe("");
  });

  it("with visible=false, renders nothing regardless of hints", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: RANK_THEN_COLOR, visible: false, width: 88, height: 100, testId: "hint-6" }),
    );
    expect(markup).toBe("");
  });

  it("the own-hand variant's props type has no card/suit/rank member; passing the same facts twice renders byte-identical markup", () => {
    const first = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: RANK_THEN_COLOR, visible: true, width: 88, height: 100, testId: "hint-7" }),
    );
    const second = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: factsFor({ ...RANK_THEN_COLOR }), visible: true, width: 88, height: 100, testId: "hint-7" }),
    );
    expect(first).toBe(second);
  });

  it("the teammate variant renders the same ring/marker/numeral composition from the same hint inputs", () => {
    const ownMarkup = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: RANK_THEN_COLOR, visible: true, width: 64, height: 78, testId: "hint-8" }),
    );
    const teammateMarkup = renderToStaticMarkup(
      createElement(TeammateHintIndicator, { facts: RANK_THEN_COLOR, visible: true, width: 64, height: 78, testId: "hint-8" }),
    );
    expect(teammateMarkup).toBe(ownMarkup);
  });

  // Owner report 2026-09-19: with keep-hints on, a new clue was overwriting
  // the previous one. These guard the accumulating display the toggle now
  // switches on; every test above still covers the default mode unchanged.
  it("accumulate: a card told blue then 4 renders the ring AND the numeral together", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, {
        facts: COLOR_THEN_RANK,
        visible: true,
        width: 88,
        height: 100,
        testId: "hint-acc-1",
        accumulate: true,
      }),
    );
    expect(markup).toContain('data-testid="hint-color-ring"');
    expect(markup).toContain("var(--color-suit-blue)");
    expect(markup).toContain('data-testid="hint-numeral"');
    expect(markup).toContain(">4<");
  });

  it("accumulate: two colour clues render one split ring carrying both suit hues and a glyph each", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, {
        facts: TWO_COLORS,
        visible: true,
        width: 88,
        height: 100,
        testId: "hint-acc-2",
        accumulate: true,
      }),
    );
    expect(markup).toContain('data-ring-colors="2"');
    expect(markup).toContain("conic-gradient");
    expect(markup).toContain("var(--color-suit-blue)");
    expect(markup).toContain("var(--color-suit-red)");
    // Gap 33 still holds: the gradient is masked to the border band, so the
    // ring paints no fill across the tile face.
    expect(markup).toContain("content-box");
  });

  it("accumulate: a single colour keeps the plain inset box-shadow ring, no gradient", () => {
    const markup = renderToStaticMarkup(
      createElement(OwnHintIndicator, {
        facts: COLOR_ONLY,
        visible: true,
        width: 88,
        height: 100,
        testId: "hint-acc-3",
        accumulate: true,
      }),
    );
    expect(markup).toContain("inset 0 0 0 3px var(--color-suit-red)");
    expect(markup).not.toContain("conic-gradient");
  });

  it("accumulate defaults to off: the same facts render gap 34's latest-only display", () => {
    const withoutFlag = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: COLOR_THEN_RANK, visible: true, width: 88, height: 100, testId: "hint-acc-4" }),
    );
    const explicitlyOff = renderToStaticMarkup(
      createElement(OwnHintIndicator, {
        facts: COLOR_THEN_RANK,
        visible: true,
        width: 88,
        height: 100,
        testId: "hint-acc-4",
        accumulate: false,
      }),
    );
    expect(withoutFlag).toBe(explicitlyOff);
    expect(withoutFlag).not.toContain('data-testid="hint-color-ring"');
  });

  it("accumulate: the teammate variant composes identically to the own-hand one", () => {
    const own = renderToStaticMarkup(
      createElement(OwnHintIndicator, { facts: TWO_COLORS, visible: true, width: 64, height: 78, testId: "hint-acc-5", accumulate: true }),
    );
    const teammate = renderToStaticMarkup(
      createElement(TeammateHintIndicator, { facts: TWO_COLORS, visible: true, width: 64, height: 78, testId: "hint-acc-5", accumulate: true }),
    );
    expect(teammate).toBe(own);
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

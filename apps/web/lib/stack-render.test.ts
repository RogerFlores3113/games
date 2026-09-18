// BOARD-05 (plan 06.2-15, UAT gap 3): render-contract guards for the
// fixed five-slot suit-column PlayedStack, replacing the deleted
// horizontal-fan contract. Mirrors firework-card-render.test.ts's
// renderToStaticMarkup + string-assertion pattern.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Suit } from "@games/rules";
import { PlayedStack } from "../components/hanabi/PlayedStack";
import { MAX_RANK, playGridHeightPx } from "./layout-budget";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function renderStack(topRank: 0 | 1 | 2 | 3 | 4 | 5, suit: Suit = "red") {
  return renderToStaticMarkup(createElement(PlayedStack, { stack: { suit, topRank } }));
}

describe("stack-render: PlayedStack", () => {
  it("renders MAX_RANK slots (filled or empty) at topRank 0, 3 and 5", () => {
    for (const topRank of [0, 3, 5] as const) {
      const markup = renderStack(topRank, "red");
      const filledCount = countOccurrences(markup, 'data-filled="true"');
      const emptyCount = countOccurrences(markup, 'data-filled="false"');
      expect(filledCount + emptyCount).toBe(MAX_RANK);
      expect(filledCount).toBe(topRank);
      expect(emptyCount).toBe(MAX_RANK - topRank);
    }
  });

  it("a stack with topRank 3 renders three filled FireworkCardFace slots, ranks 1, 2 and 3, each with its own testid", () => {
    const markup = renderStack(3, "red");
    expect(markup).toContain('data-testid="played-stack-red-card-1"');
    expect(markup).toContain('data-testid="played-stack-red-card-2"');
    expect(markup).toContain('data-testid="played-stack-red-card-3"');
    expect(markup).toContain('data-testid="played-slot-red-4"');
    expect(markup).toContain('data-testid="played-slot-red-5"');
  });

  it("a complete stack (topRank 5) renders five filled cards and keeps data-complete=true", () => {
    const markup = renderStack(5, "blue");
    for (const rank of [1, 2, 3, 4, 5]) {
      expect(markup).toContain(`data-testid="played-stack-blue-card-${rank}"`);
    }
    expect(markup).toContain('data-complete="true"');
  });

  it("an empty stack (topRank 0) renders five empty slots and no filled card testids", () => {
    const markup = renderStack(0, "green");
    expect(markup).not.toContain('data-testid="played-stack-green-card-');
    for (const rank of [1, 2, 3, 4, 5]) {
      expect(markup).toContain(`data-testid="played-slot-green-${rank}"`);
    }
  });

  it("the container keeps data-testid=played-stack-{suit} and data-top-rank equal to the stack's topRank", () => {
    const markup = renderStack(2, "yellow");
    expect(markup).toContain('data-testid="played-stack-yellow"');
    expect(markup).toContain('data-top-rank="2"');
  });

  it("the root's inline style string is identical at topRank 0 and topRank 5", () => {
    const zero = renderStack(0, "white");
    const five = renderStack(5, "white");
    const styleOf = (markup: string) => markup.match(/data-testid="played-stack-white"[^>]*style="([^"]*)"/)?.[1];
    expect(styleOf(zero)).toBeDefined();
    expect(styleOf(zero)).toBe(styleOf(five));
  });

  it("the column's reserved grid height (playGridHeightPx) is included in the root's inline height at every topRank", () => {
    for (const topRank of [0, 3, 5] as const) {
      const markup = renderStack(topRank, "red");
      const heightMatch = markup.match(/height:(\d+)px/);
      expect(heightMatch).not.toBeNull();
      expect(Number(heightMatch?.[1])).toBeGreaterThanOrEqual(playGridHeightPx());
    }
  });

  it("exactly one data-glyph occurrence exists per column at topRank 0, 3 and 5", () => {
    for (const topRank of [0, 3, 5] as const) {
      const markup = renderStack(topRank, "red");
      expect(countOccurrences(markup, 'data-glyph="red"')).toBe(1);
    }
  });

  it("filled slots do not carry exposeSuit (no data-glyph on the card face itself, only on the column header)", () => {
    const markup = renderStack(3, "rainbow");
    // The single data-glyph is the header's SuitGlyph; card faces render
    // without exposeSuit per the glyph-count invariant.
    expect(countOccurrences(markup, "data-glyph")).toBe(1);
  });

  it("applies the anim-stack-flash class when flashing", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayedStack, { stack: { suit: "red", topRank: 1 }, flashing: true }),
    );
    expect(markup).toContain("anim-stack-flash");
  });
});

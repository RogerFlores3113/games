// BOARD-05 (plan 06.2-05): render-contract guards for the fanned played
// stack. Mirrors firework-card-render.test.ts's renderToStaticMarkup +
// string-assertion pattern.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayedStack } from "../components/hanabi/PlayedStack";
import { FAN_PEEK_PX, PLAYED_CARD_HEIGHT_PX, fannedStackWidth } from "./layout-budget";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("stack-render: PlayedStack", () => {
  it("a stack with topRank 3 renders three FireworkCardFace cards, ranks 1, 2 and 3, each with its own testid", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayedStack, { stack: { suit: "red", topRank: 3 } }),
    );
    expect(markup).toContain('data-testid="played-stack-red-card-1"');
    expect(markup).toContain('data-testid="played-stack-red-card-2"');
    expect(markup).toContain('data-testid="played-stack-red-card-3"');
    expect(countOccurrences(markup, 'data-glyph="red"')).toBe(3);
  });

  it("a complete stack (topRank 5) renders five cards and keeps data-complete=true plus the completed-stack glow", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayedStack, { stack: { suit: "blue", topRank: 5 } }),
    );
    for (const rank of [1, 2, 3, 4, 5]) {
      expect(markup).toContain(`data-testid="played-stack-blue-card-${rank}"`);
    }
    expect(markup).toContain('data-complete="true"');
    expect(markup).toContain("var(--color-card-glow)");
  });

  it("an empty stack (topRank 0) renders the existing faint SuitGlyph placeholder and no card faces", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayedStack, { stack: { suit: "green", topRank: 0 } }),
    );
    expect(markup).not.toContain("played-stack-green-card-");
    expect(markup).toContain('data-glyph="green"');
    expect(markup).toContain("opacity:0.35");
  });

  it("the container keeps data-testid=played-stack-{suit} and data-top-rank equal to the stack's topRank", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayedStack, { stack: { suit: "yellow", topRank: 2 } }),
    );
    expect(markup).toContain('data-testid="played-stack-yellow"');
    expect(markup).toContain('data-top-rank="2"');
  });

  it("the container's height equals PLAYED_CARD_HEIGHT_PX and its width equals fannedStackWidth(cardCount), regardless of card count", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayedStack, { stack: { suit: "white", topRank: 3 } }),
    );
    expect(markup).toContain(`height:${PLAYED_CARD_HEIGHT_PX}px`);
    expect(markup).toContain(`width:${fannedStackWidth(3)}px`);
  });

  it("each additional card is offset horizontally by FAN_PEEK_PX and layered above the previous one", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayedStack, { stack: { suit: "rainbow", topRank: 3 } }),
    );
    expect(markup).toContain('data-testid="played-stack-rainbow-card-1" class="absolute" style="left:0;z-index:1"');
    expect(markup).toContain(`style="left:${FAN_PEEK_PX}px;z-index:2"`);
    expect(markup).toContain(`style="left:${FAN_PEEK_PX * 2}px;z-index:3"`);
  });

  it("applies the anim-stack-flash class when flashing", () => {
    const markup = renderToStaticMarkup(
      createElement(PlayedStack, { stack: { suit: "red", topRank: 1 }, flashing: true }),
    );
    expect(markup).toContain("anim-stack-flash");
  });
});

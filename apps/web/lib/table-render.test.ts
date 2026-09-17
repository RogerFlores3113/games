// BOARD-01..05/TILE-02/DISC-01 (plan 06.2-07): render-contract guards for the
// reworked two-column tableau. Mirrors firework-card-render.test.ts's
// renderToStaticMarkup + string-assertion pattern.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HanabiView } from "@games/rules";
import { Table } from "../components/hanabi/Table";

const BASE_GAME: HanabiView = {
  variant: "base",
  yourSeatId: "seat-1",
  yourHand: [],
  otherHands: [],
  stacks: [
    { suit: "red", topRank: 3 },
    { suit: "yellow", topRank: 0 },
    { suit: "green", topRank: 5 },
    { suit: "blue", topRank: 0 },
    { suit: "white", topRank: 1 },
  ],
  discard: [
    { id: "d1", suit: "red", rank: 1 },
    { id: "d2", suit: "blue", rank: 2 },
  ],
  discardOrder: ["d1", "d2"],
  clueTokens: 5,
  fuses: 1,
  deckCount: 32,
  finalTurnsRemaining: null,
  activeSeatId: "seat-1",
  isYourTurn: true,
  score: 9,
  history: [],
};

const ALL_TESTIDS = [
  "tableau",
  "play-zone",
  "played-stack-red",
  "played-stack-yellow",
  "played-stack-green",
  "played-stack-blue",
  "played-stack-white",
  "clue-tokens",
  "fuse-tokens",
  "deck-count",
  "discard-pile",
  "discard-toggle",
];

function render(game: HanabiView, dropStatus?: Parameters<typeof Table>[0]["dropStatus"]) {
  return renderToStaticMarkup(createElement(Table, { game, dropStatus: dropStatus ?? null }));
}

describe("table-render: board skeleton (Task 1)", () => {
  it("carries the board-surface class on the tableau", () => {
    const markup = render(BASE_GAME);
    expect(markup).toMatch(/data-testid="tableau"[^>]*class="[^"]*board-surface/);
  });

  it("renders both area labels", () => {
    const markup = render(BASE_GAME);
    expect(markup).toContain(">Play<");
    expect(markup).toContain(">Discard<");
  });

  it("renders every testid a representative mid-game view needs", () => {
    const markup = render(BASE_GAME);
    for (const testid of ALL_TESTIDS) {
      expect(markup).toContain(`data-testid="${testid}"`);
    }
  });

  it("emits drop-reason-play and drop-reason-discard when the drop status disables the zone with a reason", () => {
    const markup = render(BASE_GAME, {
      play: { enabled: false, reason: "Not your turn" },
      discard: { enabled: false, reason: "Not your turn" },
      hovered: "none",
    });
    expect(markup).toContain('data-testid="drop-reason-play"');
    expect(markup).toContain('data-testid="drop-reason-discard"');
  });

  it("keeps deck-count's data-final-round attribute in sync with finalTurnsRemaining", () => {
    const finalRound: HanabiView = { ...BASE_GAME, finalTurnsRemaining: 3 };
    const markup = render(finalRound);
    expect(markup).toContain('data-final-round="true"');
  });
});

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("table-render: TokenColumn, PlayedStack and deck counter (Task 2)", () => {
  it("renders exactly the given clue and fuse token counts, plus both text counts", () => {
    const game: HanabiView = { ...BASE_GAME, clueTokens: 5, fuses: 1 };
    const markup = render(game);
    expect(countOccurrences(markup, 'data-testid="clue-token"')).toBe(5);
    // fuses: 1 used of 3 max => 2 remaining
    expect(countOccurrences(markup, 'data-testid="fuse-token"')).toBe(2);
    expect(markup).toContain("5 clues left");
    expect(markup).toContain("2 fuses left");
  });

  it("renders the deck counter between the Play and Discard areas in document order", () => {
    const markup = render(BASE_GAME);
    const playIndex = markup.indexOf('data-testid="play-zone"');
    const deckIndex = markup.indexOf('data-testid="deck-count"');
    const discardIndex = markup.indexOf('data-testid="discard-pile"');
    expect(playIndex).toBeGreaterThan(-1);
    expect(deckIndex).toBeGreaterThan(playIndex);
    expect(discardIndex).toBeGreaterThan(deckIndex);
  });

  it("a stack at rank 3 renders three card faces via PlayedStack", () => {
    const markup = render(BASE_GAME);
    expect(markup).toContain('data-testid="played-stack-red-card-1"');
    expect(markup).toContain('data-testid="played-stack-red-card-2"');
    expect(markup).toContain('data-testid="played-stack-red-card-3"');
  });

  it("no longer renders the old dot-token rows", () => {
    const markup = render(BASE_GAME);
    expect(markup).not.toContain("h-2 w-2 rounded-full");
  });
});

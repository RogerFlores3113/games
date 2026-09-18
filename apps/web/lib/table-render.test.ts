// BOARD-01..05/TILE-02/DISC-01 (plan 06.2-07): render-contract guards for the
// reworked two-column tableau. Mirrors firework-card-render.test.ts's
// renderToStaticMarkup + string-assertion pattern.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MAX_FUSES, type HanabiView } from "@games/rules";
import { Table } from "../components/hanabi/Table";
import { PLAY_AREA_WIDTH_PX } from "./layout-budget";

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

/** Returns the element's inline `style` attribute value, or `null` if React
 * omitted the attribute entirely (it does this for an empty style object,
 * e.g. an un-highlighted drop zone) — `null` is itself a valid, comparable
 * "no inline style" state for the identical-at-every-content-level checks
 * below. */
function styleFor(markup: string, testid: string): string | null {
  const match = markup.match(new RegExp(`data-testid="${testid}"[^>]*?style="([^"]*)"`));
  return match?.[1] ?? null;
}

const FULL_BOARD: HanabiView = {
  ...BASE_GAME,
  stacks: [
    { suit: "red", topRank: 5 },
    { suit: "yellow", topRank: 5 },
    { suit: "green", topRank: 5 },
    { suit: "blue", topRank: 5 },
    { suit: "white", topRank: 5 },
  ],
  discard: Array.from({ length: 30 }, (_, i) => {
    const suits = ["red", "yellow", "green", "blue", "white"] as const;
    return {
      id: `full-d${i}`,
      suit: suits[i % suits.length]!,
      rank: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    };
  }),
  discardOrder: Array.from({ length: 30 }, (_, i) => `full-d${i}`),
  clueTokens: 0,
  fuses: MAX_FUSES,
};

const SIX_SUIT_GAME: HanabiView = {
  ...BASE_GAME,
  stacks: [
    { suit: "red", topRank: 0 },
    { suit: "yellow", topRank: 0 },
    { suit: "green", topRank: 0 },
    { suit: "blue", topRank: 0 },
    { suit: "white", topRank: 0 },
    { suit: "black", topRank: 0 },
  ],
};

describe("table-render: fixed board regions (06.2-16)", () => {
  it("the tableau's inline style is identical between an empty game and a full board", () => {
    const emptyGame: HanabiView = { ...BASE_GAME, stacks: BASE_GAME.stacks.map((s) => ({ ...s, topRank: 0 })), discard: [], discardOrder: [] };
    const emptyMarkup = render(emptyGame);
    const fullMarkup = render(FULL_BOARD);
    expect(styleFor(emptyMarkup, "tableau")).toBe(styleFor(fullMarkup, "tableau"));
  });

  it("discard-pile's inline style is identical at 0 and 30 discards", () => {
    const emptyGame: HanabiView = { ...BASE_GAME, discard: [], discardOrder: [] };
    const emptyMarkup = render(emptyGame);
    const fullMarkup = render(FULL_BOARD);
    expect(styleFor(emptyMarkup, "discard-pile")).toBe(styleFor(fullMarkup, "discard-pile"));
  });

  it("the Play region's inline width is PLAY_AREA_WIDTH_PX at 5 and at 6 suits", () => {
    const fiveSuitMarkup = render(BASE_GAME);
    const sixSuitMarkup = render(SIX_SUIT_GAME);
    expect(fiveSuitMarkup).toContain('data-testid="play-zone"');
    const fivePlayRegionStyle = fiveSuitMarkup.match(/style="width:(\d+)px;height:\d+px[^"]*"/);
    const sixPlayRegionStyle = sixSuitMarkup.match(/style="width:(\d+)px;height:\d+px[^"]*"/);
    expect(fivePlayRegionStyle?.[1]).toBe(String(PLAY_AREA_WIDTH_PX));
    expect(sixPlayRegionStyle?.[1]).toBe(String(PLAY_AREA_WIDTH_PX));
  });

  it("every testid from the drag/e2e interface contract is present on a full board", () => {
    const markup = render(FULL_BOARD);
    for (const testid of ALL_TESTIDS) {
      expect(markup).toContain(`data-testid="${testid}"`);
    }
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

describe("table-render: discard order and empty state (Task 3)", () => {
  it("renders discard tiles in discardOrder's exact sequence, not discard's insertion order", () => {
    const game: HanabiView = {
      ...BASE_GAME,
      discard: [
        { id: "d1", suit: "red", rank: 1 },
        { id: "d2", suit: "blue", rank: 2 },
        { id: "d3", suit: "green", rank: 3 },
      ],
      discardOrder: ["d3", "d1", "d2"],
    };
    const markup = render(game);
    const i3 = markup.indexOf('data-testid="discard-tile-d3"');
    const i1 = markup.indexOf('data-testid="discard-tile-d1"');
    const i2 = markup.indexOf('data-testid="discard-tile-d2"');
    expect(i3).toBeGreaterThan(-1);
    expect(i1).toBeGreaterThan(i3);
    expect(i2).toBeGreaterThan(i1);
  });

  it("skips a discardOrder id with no matching discard entry, and appends a discard entry missing from discardOrder", () => {
    const game: HanabiView = {
      ...BASE_GAME,
      discard: [
        { id: "d1", suit: "red", rank: 1 },
        { id: "d2", suit: "blue", rank: 2 },
      ],
      discardOrder: ["d1", "unknown-id"],
    };
    const markup = render(game);
    expect(markup).toContain('data-testid="discard-tile-d1"');
    expect(markup).toContain('data-testid="discard-tile-d2"');
    expect(markup).not.toContain("discard-tile-unknown-id");
  });

  it("renders the empty-state copy when discard is empty", () => {
    const game: HanabiView = { ...BASE_GAME, discard: [], discardOrder: [] };
    const markup = render(game);
    expect(markup).toContain("No tiles discarded yet");
  });
});

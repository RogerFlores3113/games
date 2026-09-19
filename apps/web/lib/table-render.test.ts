// BOARD-01..05/TILE-02/DISC-01 (plan 06.2-07): render-contract guards for the
// reworked two-column tableau. Mirrors firework-card-render.test.ts's
// renderToStaticMarkup + string-assertion pattern.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MAX_FUSES, type HanabiView } from "@games/rules";
import { Table } from "../components/hanabi/Table";
import {
  DISCARD_AREA_HEIGHT_PX,
  DISCARD_AREA_WIDTH_PX,
  PLAY_AREA_WIDTH_PX,
  TURN_SIGN_HEIGHT_PX,
  TURN_SIGN_WIDTH_PX,
} from "./layout-budget";

const BASE_GAME: HanabiView = {
  variant: "base",
  yourSeatId: "seat-1",
  yourHand: [],
  otherHands: [],
  stacks: [
    { suit: "red", playedRanks: [1, 2, 3] },
    { suit: "yellow", playedRanks: [] },
    { suit: "green", playedRanks: [1, 2, 3, 4, 5] },
    { suit: "blue", playedRanks: [] },
    { suit: "white", playedRanks: [1] },
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
  "discard-group-by-suit",
  "turn-sign",
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

  // UAT gap 18 regression: the owner reported "the 'X card left in deck'
  // doesn't change." Diagnosis (e2e-proven live against the real worker,
  // across 2/4/5-player games, drag AND button-click actions, a mid-game
  // reload, and rapid-fire turns with no settling delay) found the wire
  // value, projection, and this render site all correct — `deckCountText`
  // reads `game.deckCount` directly with no memoization or stale capture
  // anywhere in the chain. This is the permanent, deterministic guard the
  // task asked for: it fails immediately (no live server needed) the moment
  // this render site stops reflecting `deckCount`, e.g. a future edit that
  // hoists `deckCountText(game)` into a `useMemo` with incomplete deps, or
  // that swaps `game.deckCount` for a locally-held snapshot.
  //
  // UAT gap 21 (third owner review): the deck counter's on-screen text
  // changed from "{n} cards left in deck" to "{n} x [card back]" — this
  // guard is updated to the new format, still reading `game.deckCount`
  // directly so a regression is still caught immediately.
  it("UAT gap 18/21: deck-count's text tracks a changing deckCount prop, rendered as '{n} x'", () => {
    const full = render(BASE_GAME);
    const drawnDown = render({ ...BASE_GAME, deckCount: BASE_GAME.deckCount - 7 });
    expect(full).toContain(`${BASE_GAME.deckCount} x`);
    expect(drawnDown).toContain(`${BASE_GAME.deckCount - 7} x`);
    expect(full).not.toEqual(drawnDown);
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
    { suit: "red", playedRanks: [1, 2, 3, 4, 5] },
    { suit: "yellow", playedRanks: [1, 2, 3, 4, 5] },
    { suit: "green", playedRanks: [1, 2, 3, 4, 5] },
    { suit: "blue", playedRanks: [1, 2, 3, 4, 5] },
    { suit: "white", playedRanks: [1, 2, 3, 4, 5] },
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
    { suit: "red", playedRanks: [] },
    { suit: "yellow", playedRanks: [] },
    { suit: "green", playedRanks: [] },
    { suit: "blue", playedRanks: [] },
    { suit: "white", playedRanks: [] },
    { suit: "black", playedRanks: [] },
  ],
};

/** Gap closure 07-06 (owner gap 1): the Black variant's 7-suit worst case
 * (five colours + Rainbow + Black), stacks in variant order. */
const SEVEN_SUIT_GAME: HanabiView = {
  ...BASE_GAME,
  variant: "black",
  stacks: [
    { suit: "red", playedRanks: [] },
    { suit: "yellow", playedRanks: [] },
    { suit: "green", playedRanks: [] },
    { suit: "blue", playedRanks: [] },
    { suit: "white", playedRanks: [] },
    { suit: "rainbow", playedRanks: [] },
    { suit: "black", playedRanks: [] },
  ],
};

describe("table-render: fixed board regions (06.2-16)", () => {
  it("the tableau's inline style is identical between an empty game and a full board", () => {
    const emptyGame: HanabiView = { ...BASE_GAME, stacks: BASE_GAME.stacks.map((s) => ({ ...s, playedRanks: [] })), discard: [], discardOrder: [] };
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

  it("the Play region's inline width is PLAY_AREA_WIDTH_PX at 5, 6 and 7 suits", () => {
    const fiveSuitMarkup = render(BASE_GAME);
    const sixSuitMarkup = render(SIX_SUIT_GAME);
    const sevenSuitMarkup = render(SEVEN_SUIT_GAME);
    expect(fiveSuitMarkup).toContain('data-testid="play-zone"');
    const fivePlayRegionStyle = fiveSuitMarkup.match(/style="width:(\d+)px;height:\d+px[^"]*"/);
    const sixPlayRegionStyle = sixSuitMarkup.match(/style="width:(\d+)px;height:\d+px[^"]*"/);
    const sevenPlayRegionStyle = sevenSuitMarkup.match(/style="width:(\d+)px;height:\d+px[^"]*"/);
    expect(fivePlayRegionStyle?.[1]).toBe(String(PLAY_AREA_WIDTH_PX));
    expect(sixPlayRegionStyle?.[1]).toBe(String(PLAY_AREA_WIDTH_PX));
    expect(sevenPlayRegionStyle?.[1]).toBe(String(PLAY_AREA_WIDTH_PX));
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

  // UAT gap 24 (fourth owner review): "remove the 'No tiles discarded
  // yet'" — the copy survives for screen readers/tests only, marked
  // sr-only so nothing renders visibly on screen.
  it("renders the empty-state copy sr-only (not visible) when discard is empty", () => {
    const game: HanabiView = { ...BASE_GAME, discard: [], discardOrder: [] };
    const markup = render(game);
    expect(markup).toContain("No tiles discarded yet");
    expect(markup).toContain('class="sr-only">No tiles discarded yet');
  });
});

describe("table-render: group-by-suit control (06.2-18, UAT gap 10)", () => {
  function renderWithGroupHandler(game: HanabiView, onGroupDiscardBySuit?: () => void) {
    return renderToStaticMarkup(
      createElement(Table, { game, dropStatus: null, onGroupDiscardBySuit }),
    );
  }

  it("renders with its testid and aria-label", () => {
    const markup = renderWithGroupHandler(BASE_GAME, () => {});
    expect(markup).toContain('data-testid="discard-group-by-suit"');
    expect(markup).toContain('aria-label="Group discard by suit"');
  });

  it("is disabled with an empty pile and with a single tile", () => {
    const emptyGame: HanabiView = { ...BASE_GAME, discard: [], discardOrder: [] };
    const emptyMarkup = renderWithGroupHandler(emptyGame, () => {});
    expect(emptyMarkup).toMatch(/data-testid="discard-group-by-suit"[^>]*disabled=""/);

    const oneGame: HanabiView = {
      ...BASE_GAME,
      discard: [{ id: "d1", suit: "red", rank: 1 }],
      discardOrder: ["d1"],
    };
    const oneMarkup = renderWithGroupHandler(oneGame, () => {});
    expect(oneMarkup).toMatch(/data-testid="discard-group-by-suit"[^>]*disabled=""/);
  });

  it("is enabled with three tiles and a handler present", () => {
    const threeGame: HanabiView = {
      ...BASE_GAME,
      discard: [
        { id: "d1", suit: "red", rank: 1 },
        { id: "d2", suit: "blue", rank: 2 },
        { id: "d3", suit: "green", rank: 3 },
      ],
      discardOrder: ["d1", "d2", "d3"],
    };
    const markup = renderWithGroupHandler(threeGame, () => {});
    const buttonMatch = markup.match(/<button[^>]*data-testid="discard-group-by-suit"[^>]*>/);
    expect(buttonMatch?.[0]).not.toMatch(/\sdisabled=""/);
  });

  it("is disabled when the handler is absent, even with three tiles", () => {
    const threeGame: HanabiView = {
      ...BASE_GAME,
      discard: [
        { id: "d1", suit: "red", rank: 1 },
        { id: "d2", suit: "blue", rank: 2 },
        { id: "d3", suit: "green", rank: 3 },
      ],
      discardOrder: ["d1", "d2", "d3"],
    };
    const markup = renderWithGroupHandler(threeGame, undefined);
    expect(markup).toMatch(/data-testid="discard-group-by-suit"[^>]*disabled=""/);
  });

  it("does not change discard-pile's inline style (the 06.2-16 fixed-geometry invariant still holds)", () => {
    const withoutHandler = styleFor(render(BASE_GAME), "discard-pile");
    const withHandler = styleFor(renderWithGroupHandler(BASE_GAME, () => {}), "discard-pile");
    expect(withHandler).toBe(withoutHandler);
  });
});

describe("UAT gap 37/38: the turn sign below the discard/token area", () => {
  function renderWithTurnSign(turnSignText: string, isYourTurn: boolean) {
    return renderToStaticMarkup(
      createElement(Table, { game: BASE_GAME, dropStatus: null, turnSignText, isYourTurn }),
    );
  }

  it("renders the given turn-sign text as a polite live region", () => {
    const markup = renderWithTurnSign("Bianca's turn", false);
    expect(markup).toContain('data-testid="turn-sign"');
    expect(markup).toMatch(/data-testid="turn-sign"[^>]*aria-live="polite"/);
    expect(markup).toContain(">Bianca&#x27;s turn<");
  });

  it("renders an empty (but still present) live region once the game has ended", () => {
    const markup = renderWithTurnSign("", false);
    expect(markup).toMatch(/data-testid="turn-sign"[^>]*aria-live="polite"[^>]*><\/div>/);
  });

  it("colours 'Your turn!' with --color-turn (gap 38), not the muted default", () => {
    const markup = renderWithTurnSign("Your turn!", true);
    const style = styleFor(markup, "turn-sign");
    expect(style).toContain("var(--color-turn)");
  });

  it("colours a teammate's turn with the muted default, not --color-turn", () => {
    const markup = renderWithTurnSign("Bianca's turn", false);
    const style = styleFor(markup, "turn-sign");
    expect(style).toContain("var(--color-text-muted)");
    expect(style).not.toContain("var(--color-turn)");
  });

  it("defaults to an empty turn sign when the prop is omitted (pre-existing render calls keep working)", () => {
    const markup = renderToStaticMarkup(createElement(Table, { game: BASE_GAME, dropStatus: null }));
    expect(markup).toMatch(/data-testid="turn-sign"[^>]*><\/div>/);
  });
});

describe("gap closure 07-12 (owner gap 4): the turn sign and Discard swapped reservations", () => {
  it("turn-sign's inline style reserves TURN_SIGN_WIDTH_PX/HEIGHT_PX — the old compact-Discard box's own size", () => {
    const style = styleFor(render(BASE_GAME), "turn-sign");
    expect(style).toContain(`width:${TURN_SIGN_WIDTH_PX}px`);
    expect(style).toContain(`height:${TURN_SIGN_HEIGHT_PX}px`);
  });

  it("discard-pile's bordered ancestor reserves DISCARD_AREA_WIDTH_PX/HEIGHT_PX — the large lower area the turn sign vacated", () => {
    const markup = render(BASE_GAME);
    const boxStyleMatch = markup.match(
      /<div class="relative flex flex-col[^"]*"\s+style="width:(\d+)px;height:(\d+)px[^"]*"[^>]*>\s*<div class="flex items-center justify-between/,
    );
    expect(boxStyleMatch?.[1]).toBe(String(DISCARD_AREA_WIDTH_PX));
    expect(boxStyleMatch?.[2]).toBe(String(DISCARD_AREA_HEIGHT_PX));
  });

  it("turn-sign renders before discard-pile in document order (top row, above the large lower Discard area)", () => {
    const markup = render(BASE_GAME);
    const turnSignIndex = markup.indexOf('data-testid="turn-sign"');
    const discardIndex = markup.indexOf('data-testid="discard-pile"');
    expect(turnSignIndex).toBeGreaterThan(-1);
    expect(discardIndex).toBeGreaterThan(turnSignIndex);
  });
});

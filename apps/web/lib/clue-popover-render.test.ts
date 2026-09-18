// D-05..D-08 (Phase 7 07-03, owner-confirmed 2026-09-18): render proof that a
// rainbow tile's quick-clue popover shows exactly the five nameable colours
// as a row (never a "Rainbow" option, never a single disabled button), while
// every other tile (base, Black, a non-rainbow Rainbow-variant card) keeps
// today's single colour button unchanged.
//
// Fixture shape copied locally from own-hand-render.test.ts's baseView (do
// not import across test files, per that file's own comment).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HanabiCardView, HanabiView } from "@games/rules";
import { TeammateCard } from "../components/hanabi/TeammateCard";

function baseView(overrides: Partial<HanabiView> = {}): HanabiView {
  return {
    variant: "base",
    yourSeatId: "seat-me",
    yourHand: [],
    otherHands: [{ seatId: "seat-2", cards: [] }],
    stacks: [],
    discard: [],
    discardOrder: [],
    clueTokens: 8,
    fuses: 0,
    deckCount: 40,
    finalTurnsRemaining: null,
    activeSeatId: "seat-me",
    isYourTurn: true,
    score: 0,
    history: [],
    ...overrides,
  };
}

type Facts = HanabiCardView["facts"];

const UNCLUED: Facts = {
  possibleSuits: ["red", "yellow", "green", "blue", "white"],
  possibleRanks: [1, 2, 3, 4, 5],
  positiveClues: [],
  negativeClues: [],
};

function card(overrides: Partial<HanabiCardView> = {}): HanabiCardView {
  return { id: "c1", hidden: false, suit: "red", rank: 3, facts: UNCLUED, ...overrides };
}

/** Renders TeammateCard directly with its popover forced open, and slices
 * out just the popover fragment (from `data-testid="tile-clue-popover"`
 * through the matching close of that div) so assertions can't accidentally
 * match unrelated markup elsewhere in the tile. */
function renderPopover(view: HanabiView, cardView: HanabiCardView): string {
  // disabledReasonFor's clue branch derives touch count from
  // `view.otherHands` (clueTouchCountForTarget), not from the `card` prop
  // alone — the rendered card must also appear in the view's own hand data
  // for rank/colour legality to resolve as "touches something".
  const viewWithCard: HanabiView = { ...view, otherHands: [{ seatId: "seat-2", cards: [cardView] }] };
  const markup = renderToStaticMarkup(
    createElement(TeammateCard, {
      card: cardView,
      seatId: "seat-2",
      game: viewWithCard,
      ctx: { reconnecting: false, ended: false },
      justClued: false,
      open: true,
      onToggle: () => {},
      onGiveClue: () => {},
      hintsVisible: true,
      tileColor: undefined,
    }),
  );
  const start = markup.indexOf('data-testid="tile-clue-popover"');
  expect(start).toBeGreaterThan(-1);
  // Back up to the start of that div's own opening tag.
  const tagStart = markup.lastIndexOf("<div", start);
  return markup.slice(tagStart);
}

describe("clue popover render (D-05..D-08)", () => {
  it("rainbow view, visible rainbow card: exactly five tile-clue-color-{suit} row entries in cluableColors order, no single tile-clue-color button, no Rainbow option", () => {
    const view = baseView({ variant: "rainbow" });
    const fragment = renderPopover(view, card({ suit: "rainbow", rank: 2 }));

    expect(fragment).toContain('data-testid="clue-color-row"');
    expect(fragment).not.toContain('data-testid="tile-clue-color"');
    expect(fragment).not.toContain('data-testid="tile-clue-color-rainbow"');
    expect(fragment).not.toContain("Rainbow");
    expect(fragment).not.toContain('aria-label="Give a Rainbow clue"');

    const order = ["red", "yellow", "green", "blue", "white"];
    const indices = order.map((suit) => fragment.indexOf(`data-testid="tile-clue-color-${suit}"`));
    for (const idx of indices) expect(idx).toBeGreaterThan(-1);
    for (let i = 1; i < indices.length; i++) {
      const current = indices[i];
      const previous = indices[i - 1];
      expect(current).toBeDefined();
      expect(previous).toBeDefined();
      expect(current as number).toBeGreaterThan(previous as number);
    }

    expect(fragment).toContain('aria-label="Give a Red clue"');
    expect(fragment).toContain('aria-label="Give a Yellow clue"');
    expect(fragment).toContain('aria-label="Give a Green clue"');
    expect(fragment).toContain('aria-label="Give a Blue clue"');
    expect(fragment).toContain('aria-label="Give a White clue"');

    // Rank button still follows the row, bold, unchanged.
    expect(fragment).toContain('data-testid="tile-clue-rank"');
    expect(fragment.indexOf('data-testid="clue-color-row"')).toBeLessThan(fragment.indexOf('data-testid="tile-clue-rank"'));
  });

  it("rainbow view, red card: single tile-clue-color button labelled Red, no row (D-06)", () => {
    const view = baseView({ variant: "rainbow" });
    const fragment = renderPopover(view, card({ suit: "red", rank: 3 }));

    expect(fragment).toContain('data-testid="tile-clue-color"');
    expect(fragment).not.toContain('data-testid="clue-color-row"');
    expect(fragment).toContain(">Red<");
  });

  it("black view, black card: single tile-clue-color button labelled Black (D-08)", () => {
    const view = baseView({ variant: "black" });
    const fragment = renderPopover(view, card({ suit: "black", rank: 1 }));

    expect(fragment).toContain('data-testid="tile-clue-color"');
    expect(fragment).not.toContain('data-testid="clue-color-row"');
    expect(fragment).toContain(">Black<");
  });

  it("base view, red card: popover markup unchanged from before this task (single button, same classes/style)", () => {
    const view = baseView({ variant: "base" });
    const fragment = renderPopover(view, card({ suit: "red", rank: 3 }));

    expect(fragment).not.toContain('data-testid="clue-color-row"');
    expect(fragment).toMatch(
      /<button type="button" role="menuitem" data-testid="tile-clue-color" aria-label="Give a Red clue" class="cursor-pointer rounded px-\[length:var\(--space-xs\)\] py-\[length:var\(--space-xs\)\] text-\[length:var\(--text-label\)\] transition-colors hover:bg-\[var\(--color-bg\)\] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent" style="color:var\(--color-suit-red\);line-height:var\(--text-label--line-height\)">Red<\/button>/,
    );
  });

  it("rainbow view, rainbow card, isYourTurn true and clueTokens > 0: all five row entries enabled", () => {
    const view = baseView({ variant: "rainbow", isYourTurn: true, clueTokens: 8 });
    const fragment = renderPopover(view, card({ suit: "rainbow", rank: 2 }));
    for (const suit of ["red", "yellow", "green", "blue", "white"]) {
      const buttonStart = fragment.indexOf(`data-testid="tile-clue-color-${suit}"`);
      const tagStart = fragment.lastIndexOf("<button", buttonStart);
      const tagEnd = fragment.indexOf(">", buttonStart);
      const tag = fragment.slice(tagStart, tagEnd);
      expect(tag).not.toMatch(/\sdisabled=/);
    }
    expect(fragment).not.toMatch(/reason|Not your turn|Reconnecting|ended/i);
  });

  it("rainbow view, rainbow card, isYourTurn false: all five row entries disabled, matching the rank button's own disabled state (D-07), no disabled-reason text", () => {
    const view = baseView({ variant: "rainbow", isYourTurn: false });
    const fragment = renderPopover(view, card({ suit: "rainbow", rank: 2 }));
    for (const suit of ["red", "yellow", "green", "blue", "white"]) {
      const buttonStart = fragment.indexOf(`data-testid="tile-clue-color-${suit}"`);
      const tagStart = fragment.lastIndexOf("<button", buttonStart);
      const tagEnd = fragment.indexOf(">", buttonStart);
      const tag = fragment.slice(tagStart, tagEnd);
      expect(tag).toMatch(/\sdisabled=/);
    }
    const rankTagStart = fragment.lastIndexOf("<button", fragment.indexOf('data-testid="tile-clue-rank"'));
    const rankTagEnd = fragment.indexOf(">", fragment.indexOf('data-testid="tile-clue-rank"'));
    expect(fragment.slice(rankTagStart, rankTagEnd)).toMatch(/\sdisabled=/);
    expect(fragment).not.toMatch(/Not your turn|Reconnecting|game has ended/);
  });

  it("rainbow view, rainbow card, clueTokens 0: all five row entries disabled too", () => {
    const view = baseView({ variant: "rainbow", clueTokens: 0 });
    const fragment = renderPopover(view, card({ suit: "rainbow", rank: 2 }));
    for (const suit of ["red", "yellow", "green", "blue", "white"]) {
      const buttonStart = fragment.indexOf(`data-testid="tile-clue-color-${suit}"`);
      const tagStart = fragment.lastIndexOf("<button", buttonStart);
      const tagEnd = fragment.indexOf(">", buttonStart);
      const tag = fragment.slice(tagStart, tagEnd);
      expect(tag).toMatch(/\sdisabled=/);
    }
  });
});

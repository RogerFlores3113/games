// UI-07/D-11: rainbow's identity rests on two channels — a unique glyph
// silhouette (proven in suit-visuals.test.ts) and a resolvable multicolour
// gradient fill. This file proves the gradient channel renders at every real
// call site a rainbow face appears: teammate tile, played-stack slot,
// compact discard and the discard overlay. Mirrors the existing
// *-render.test.ts files' renderToStaticMarkup + string-assertion pattern —
// fixtures are copied locally, never imported across test files.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HanabiCardView, HanabiView } from "@games/rules";
import { TeammateHand } from "../components/hanabi/Hand";
import { PlayedStack } from "../components/hanabi/PlayedStack";
import { Table } from "../components/hanabi/Table";
import { DiscardOverlay } from "../components/hanabi/DiscardOverlay";

// Copied verbatim (shape only) from own-hand-render.test.ts's baseView
// fixture — do not import across test files.
function baseView(overrides: Partial<HanabiView> = {}): HanabiView {
  return {
    variant: "rainbow",
    yourSeatId: "seat-me",
    yourHand: [],
    otherHands: [{ seatId: "seat-2", cards: [] }],
    stacks: [
      { suit: "red", topRank: 0 },
      { suit: "yellow", topRank: 0 },
      { suit: "green", topRank: 0 },
      { suit: "blue", topRank: 0 },
      { suit: "white", topRank: 0 },
      { suit: "rainbow", topRank: 0 },
    ],
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

const UNCLUED: HanabiCardView["facts"] = {
  possibleSuits: ["red", "yellow", "green", "blue", "white", "rainbow"],
  possibleRanks: [1, 2, 3, 4, 5],
  positiveClues: [],
  negativeClues: [],
};

const RAINBOW_CARD: HanabiCardView = { id: "rb1", hidden: false, suit: "rainbow", rank: 3, facts: UNCLUED };
const RED_CARD: HanabiCardView = { id: "rd1", hidden: false, suit: "red", rank: 3, facts: UNCLUED };

/** Extracts every `url(#ID)` reference and every `<linearGradient id="ID"`
 * definition in `markup`, and asserts at least one reference exists and
 * every referenced id resolves to a definition in the SAME markup — a
 * gradient fill that isn't just present in source but actually resolvable
 * in the rendered DOM. */
function assertResolvableGradient(markup: string): void {
  const refs = [...markup.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!);
  expect(refs.length).toBeGreaterThan(0);
  const defined = new Set([...markup.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]!));
  for (const ref of refs) {
    expect(defined.has(ref)).toBe(true);
  }
}

describe("rainbow-art-render (UI-07/D-11)", () => {
  it("teammate tile: TeammateHand renders a resolvable gradient for a rainbow card", () => {
    const markup = renderToStaticMarkup(
      createElement(TeammateHand, {
        hand: { seatId: "seat-2", cards: [RAINBOW_CARD] },
        label: "Alex",
        connected: true,
        variant: "rainbow",
        isActive: false,
        justCluedIds: new Set<string>(),
        game: baseView({ otherHands: [{ seatId: "seat-2", cards: [RAINBOW_CARD] }] }),
        ctx: { reconnecting: false, ended: false },
        openCardId: null,
        onToggleCard: () => {},
        onGiveClue: () => {},
      }),
    );
    expect(markup).toContain('data-testid="other-hand-card-rb1"');
    assertResolvableGradient(markup);
  });

  it("teammate tile control: a red card renders no url(# gradient reference", () => {
    const markup = renderToStaticMarkup(
      createElement(TeammateHand, {
        hand: { seatId: "seat-2", cards: [RED_CARD] },
        label: "Alex",
        connected: true,
        variant: "rainbow",
        isActive: false,
        justCluedIds: new Set<string>(),
        game: baseView({ otherHands: [{ seatId: "seat-2", cards: [RED_CARD] }] }),
        ctx: { reconnecting: false, ended: false },
        openCardId: null,
        onToggleCard: () => {},
        onGiveClue: () => {},
      }),
    );
    expect(markup).not.toContain("url(#");
  });

  it("played-stack slot: PlayedStack renders a resolvable gradient for a rainbow suit column", () => {
    const markup = renderToStaticMarkup(createElement(PlayedStack, { stack: { suit: "rainbow", topRank: 2 } }));
    assertResolvableGradient(markup);
  });

  it("played-stack slot control: a red suit column renders no url(# gradient reference", () => {
    const markup = renderToStaticMarkup(createElement(PlayedStack, { stack: { suit: "red", topRank: 2 } }));
    expect(markup).not.toContain("url(#");
  });

  it("compact discard: Table renders a resolvable gradient for a rainbow card in the discard pile", () => {
    const game = baseView({
      discard: [{ id: "disc-rb", suit: "rainbow", rank: 4 }],
      discardOrder: ["disc-rb"],
    });
    const markup = renderToStaticMarkup(createElement(Table, { game, dropStatus: null }));
    expect(markup).toContain('data-testid="discard-tile-disc-rb"');
    assertResolvableGradient(markup);
  });

  it("compact discard control: Table renders no url(# gradient reference for a red card in the discard pile", () => {
    const game = baseView({
      discard: [{ id: "disc-rd", suit: "red", rank: 4 }],
      discardOrder: ["disc-rd"],
    });
    const markup = renderToStaticMarkup(createElement(Table, { game, dropStatus: null }));
    expect(markup).toContain('data-testid="discard-tile-disc-rd"');
    expect(markup).not.toContain("url(#");
  });

  it("discard overlay: DiscardOverlay renders a resolvable gradient for a rainbow card", () => {
    const discard: HanabiView["discard"] = [{ id: "ov-rb", suit: "rainbow", rank: 5 }];
    const markup = renderToStaticMarkup(
      createElement(DiscardOverlay, { discard, variant: "rainbow", onClose: () => {} }),
    );
    expect(markup).toContain('data-testid="discard-overlay-card"');
    assertResolvableGradient(markup);
  });

  it("discard overlay control: a red card renders no url(# gradient reference", () => {
    const discard: HanabiView["discard"] = [{ id: "ov-rd", suit: "red", rank: 5 }];
    const markup = renderToStaticMarkup(
      createElement(DiscardOverlay, { discard, variant: "rainbow", onClose: () => {} }),
    );
    expect(markup).toContain('data-testid="discard-overlay-card"');
    expect(markup).not.toContain("url(#");
  });
});

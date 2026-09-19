// BOARD-05 (plan 06.2-15, UAT gap 3): render-contract guards for the
// fixed five-slot suit-column PlayedStack, replacing the deleted
// horizontal-fan contract. Mirrors firework-card-render.test.ts's
// renderToStaticMarkup + string-assertion pattern.
//
// 07-11 (UAT gap 3 round 2): stacks are represented on the wire as
// `playedRanks` (ranks in play order), not a single ascending
// progress-count number. `renderStack(count, suit, { descending })` builds
// an ascending
// [1,2,...] or descending [5,4,...] playedRanks array of the given length,
// so these tests exercise both directions through the same helper.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Rank, Suit } from "@games/rules";
import { PlayedStack } from "../components/hanabi/PlayedStack";
import { MAX_RANK, playGridHeightPx } from "./layout-budget";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const ASCENDING_ORDER: Rank[] = [1, 2, 3, 4, 5];
const DESCENDING_ORDER: Rank[] = [5, 4, 3, 2, 1];

function renderStack(
  count: 0 | 1 | 2 | 3 | 4 | 5,
  suit: Suit = "red",
  opts: { descending?: boolean; nextRank?: Rank | null } = {},
) {
  const order = opts.descending ? DESCENDING_ORDER : ASCENDING_ORDER;
  const playedRanks = order.slice(0, count);
  const nextRank = opts.nextRank !== undefined ? opts.nextRank : (order[count] ?? null);
  return renderToStaticMarkup(
    createElement(PlayedStack, { stack: { suit, playedRanks }, nextRank }),
  );
}

describe("stack-render: PlayedStack", () => {
  it("renders MAX_RANK slots (filled or empty) at 0, 3 and 5 played", () => {
    for (const count of [0, 3, 5] as const) {
      const markup = renderStack(count, "red");
      const filledCount = countOccurrences(markup, 'data-filled="true"');
      const emptyCount = countOccurrences(markup, 'data-filled="false"');
      expect(filledCount + emptyCount).toBe(MAX_RANK);
      expect(filledCount).toBe(count);
      expect(emptyCount).toBe(MAX_RANK - count);
    }
  });

  it("a stack with 3 played renders three filled FireworkCardFace slots, ranks 1, 2 and 3, each with its own testid", () => {
    const markup = renderStack(3, "red");
    expect(markup).toContain('data-testid="played-stack-red-card-1"');
    expect(markup).toContain('data-testid="played-stack-red-card-2"');
    expect(markup).toContain('data-testid="played-stack-red-card-3"');
    expect(markup).toContain('data-testid="played-slot-red-4"');
    expect(markup).toContain('data-testid="played-slot-red-5"');
  });

  it("a complete stack (5 played) renders five filled cards and keeps data-complete=true", () => {
    const markup = renderStack(5, "blue");
    for (const rank of [1, 2, 3, 4, 5]) {
      expect(markup).toContain(`data-testid="played-stack-blue-card-${rank}"`);
    }
    expect(markup).toContain('data-complete="true"');
  });

  it("an empty stack (0 played) renders five empty slots and no filled card testids", () => {
    const markup = renderStack(0, "green");
    expect(markup).not.toContain('data-testid="played-stack-green-card-');
    for (const rank of [1, 2, 3, 4, 5]) {
      expect(markup).toContain(`data-testid="played-slot-green-${rank}"`);
    }
  });

  it("a descending (Black) stack with 2 played fills slot 1 with 5 and slot 2 with 4 -- the column fills top-down in play order", () => {
    const markup = renderStack(2, "black", { descending: true });
    expect(markup).toContain('data-testid="played-stack-black-card-5"');
    expect(markup).toContain('data-testid="played-stack-black-card-4"');
    expect(markup).not.toContain('data-testid="played-stack-black-card-3"');
    expect(markup).toContain('data-testid="played-slot-black-3"');
    expect(markup).toContain('data-testid="played-slot-black-4"');
    expect(markup).toContain('data-testid="played-slot-black-5"');
    // Slot order in the markup: the 5 must appear before the 4 (top-down).
    const idx5 = markup.indexOf('data-testid="played-stack-black-card-5"');
    const idx4 = markup.indexOf('data-testid="played-stack-black-card-4"');
    expect(idx5).toBeGreaterThanOrEqual(0);
    expect(idx4).toBeGreaterThan(idx5);
  });

  it("a completed descending (Black) stack (playedRanks ending in 1) renders data-complete=true", () => {
    const markup = renderStack(5, "black", { descending: true });
    for (const rank of [5, 4, 3, 2, 1]) {
      expect(markup).toContain(`data-testid="played-stack-black-card-${rank}"`);
    }
    expect(markup).toContain('data-complete="true"');
  });

  it("the container keeps data-testid=played-stack-{suit}, data-played-count equal to playedRanks.length, and data-next-rank", () => {
    const markup = renderStack(2, "yellow");
    expect(markup).toContain('data-testid="played-stack-yellow"');
    expect(markup).toContain('data-played-count="2"');
    expect(markup).toContain('data-next-rank="3"');
  });

  it("a descending stack's data-next-rank reflects the caller-supplied nextRank, not an ascending assumption", () => {
    const markup = renderStack(2, "black", { descending: true, nextRank: 3 });
    expect(markup).toContain('data-played-count="2"');
    expect(markup).toContain('data-next-rank="3"');
  });

  it("data-next-rank is empty once the stack is complete", () => {
    const markup = renderStack(5, "blue", { nextRank: null });
    expect(markup).toContain('data-next-rank=""');
  });

  it("the root's inline style string is identical at 0 and 5 played", () => {
    const zero = renderStack(0, "white");
    const five = renderStack(5, "white");
    const styleOf = (markup: string) => markup.match(/data-testid="played-stack-white"[^>]*style="([^"]*)"/)?.[1];
    expect(styleOf(zero)).toBeDefined();
    expect(styleOf(zero)).toBe(styleOf(five));
  });

  it("the column's reserved grid height (playGridHeightPx) is included in the root's inline height at every played count", () => {
    for (const count of [0, 3, 5] as const) {
      const markup = renderStack(count, "red");
      const heightMatch = markup.match(/height:(\d+)px/);
      expect(heightMatch).not.toBeNull();
      expect(Number(heightMatch?.[1])).toBeGreaterThanOrEqual(playGridHeightPx());
    }
  });

  it("exactly one data-glyph occurrence exists per column at 0, 3 and 5 played", () => {
    for (const count of [0, 3, 5] as const) {
      const markup = renderStack(count, "red");
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
      createElement(PlayedStack, { stack: { suit: "red", playedRanks: [1] }, nextRank: 2, flashing: true }),
    );
    expect(markup).toContain("anim-stack-flash");
  });

  // UAT gap 23 (fourth owner review): "the play pile… should at rest just
  // look like a blank area… under the hood I want it to remain the same
  // grid design. But visually, there should be no indication of that."
  it("an incomplete stack renders no visible column chrome — no background fill on the column root or header, no glyph header icon — while the reserved slots still occupy their fixed geometry", () => {
    for (const count of [0, 3] as const) {
      const markup = renderStack(count, "red");
      // The column root's own inline style carries no background paint
      // (width/height only) — a filled card's own surface colour deeper in
      // the markup is unrelated content, not column chrome.
      const rootStyle = markup.match(/data-testid="played-stack-red"[^>]*style="([^"]*)"/)?.[1];
      expect(rootStyle).toBeDefined();
      expect(rootStyle).not.toContain("background");
      // The header row (the old glyph-icon slot) carries no styling beyond
      // its reserved height either.
      const headerStyle = markup.match(/data-glyph="red"[^>]*/)?.[0];
      expect(headerStyle).toBeDefined();
      expect(markup.match(/<div style="height:\d+px" data-glyph="red">/)).not.toBeNull();
      expect(markup).toContain('data-filled="false"');
    }
    // A fully empty column (nothing played yet, the true "at rest" state)
    // renders no <svg> at all — the only surviving suit signal is the
    // invisible data-glyph attribute plus its sr-only label; a filled card's
    // own burst-art <svg> only ever appears once a tile is actually played.
    const empty = renderStack(0, "red");
    expect(empty).not.toContain("<svg");
    // The reserved slot geometry survives untouched: RANK_SLOT_WIDTH_PX/
    // RANK_SLOT_HEIGHT_PX still size every empty slot (UAT gap 1/19).
    expect(empty).toMatch(/data-testid="played-slot-red-1"[^>]*style="width:\d+px;height:\d+px"/);
  });

  it("a completed stack keeps its (real game-state) glow-border hook, unaffected by gap 23's at-rest chrome removal", () => {
    const markup = renderStack(5, "blue");
    expect(markup).toContain('data-complete="true"');
  });
});

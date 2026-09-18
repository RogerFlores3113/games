// D-12/D-13 (06.1-10): render-contract guard for the full-art expanded
// discard overlay. Mirrors firework-card-render.test.ts's
// renderToStaticMarkup pattern (server-render, string-assert the DOM).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HanabiView } from "@games/rules";
import { DiscardOverlay } from "../components/hanabi/DiscardOverlay";

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("discard-overlay-render", () => {
  it("with an empty discard, renders the dialog shell and the empty-state message", () => {
    const markup = renderToStaticMarkup(
      createElement(DiscardOverlay, {
        discard: [] as HanabiView["discard"],
        variant: "base",
        onClose: () => {},
      }),
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('data-testid="discard-overlay"');
    expect(markup).toContain("Discard pile");
    // UAT gap 24 (fourth owner review): the empty-state copy stays for
    // screen readers/tests only, sr-only so nothing renders visibly.
    expect(markup).toContain('class="sr-only">No cards discarded yet');
  });

  it("renders one discard-overlay-card per card, in discard's array order when discardOrder is omitted", () => {
    const discard: HanabiView["discard"] = [
      { id: "a", suit: "red", rank: 1 },
      { id: "b", suit: "red", rank: 1 },
      { id: "c", suit: "blue", rank: 5 },
    ] as HanabiView["discard"];

    const markup = renderToStaticMarkup(
      createElement(DiscardOverlay, { discard, variant: "base", onClose: () => {} }),
    );

    expect(countOccurrences(markup, 'data-testid="discard-overlay-card"')).toBe(3);
    expect(markup.indexOf("Red")).toBeLessThan(markup.indexOf("Blue"));
  });

  it("DISC-01: with a discardOrder differing from discard's array order, the rendered tile sequence follows discardOrder", () => {
    const discard: HanabiView["discard"] = [
      { id: "a", suit: "red", rank: 1 },
      { id: "b", suit: "red", rank: 1 },
      { id: "c", suit: "blue", rank: 5 },
    ] as HanabiView["discard"];

    const markup = renderToStaticMarkup(
      createElement(DiscardOverlay, {
        discard,
        discardOrder: ["c", "a", "b"],
        variant: "base",
        onClose: () => {},
      }),
    );

    const iC = markup.indexOf("Blue");
    const iA = markup.indexOf("Red 1");
    expect(iC).toBeLessThan(iA);
    expect(countOccurrences(markup, 'data-testid="discard-overlay-card"')).toBe(3);
  });

  it("DISC-01: skips a discardOrder id with no matching discard entry, and appends a discard entry missing from discardOrder", () => {
    const discard: HanabiView["discard"] = [
      { id: "a", suit: "red", rank: 1 },
      { id: "b", suit: "blue", rank: 2 },
    ] as HanabiView["discard"];

    const markup = renderToStaticMarkup(
      createElement(DiscardOverlay, {
        discard,
        discardOrder: ["a", "unknown-id"],
        variant: "base",
        onClose: () => {},
      }),
    );

    expect(countOccurrences(markup, 'data-testid="discard-overlay-card"')).toBe(2);
    expect(markup).not.toContain("unknown-id");
  });

  it("close button carries the compact-view label and testid", () => {
    const markup = renderToStaticMarkup(
      createElement(DiscardOverlay, {
        discard: [] as HanabiView["discard"],
        variant: "base",
        onClose: () => {},
      }),
    );
    expect(markup).toContain('data-testid="discard-overlay-close"');
    expect(markup).toContain('aria-label="Show compact discard pile"');
  });

  it("UAT gap 10/DISC-01: renders the group-by-suit control with its testid and aria-label, disabled with fewer than two tiles, enabled at three", () => {
    const emptyMarkup = renderToStaticMarkup(
      createElement(DiscardOverlay, {
        discard: [] as HanabiView["discard"],
        variant: "base",
        onClose: () => {},
        onGroupDiscardBySuit: () => {},
      }),
    );
    expect(emptyMarkup).toContain('data-testid="discard-overlay-group-by-suit"');
    expect(emptyMarkup).toContain('aria-label="Group discard by suit"');
    expect(emptyMarkup).toMatch(/data-testid="discard-overlay-group-by-suit"[^>]*disabled=""/);

    const oneTile: HanabiView["discard"] = [{ id: "a", suit: "red", rank: 1 }] as HanabiView["discard"];
    const oneMarkup = renderToStaticMarkup(
      createElement(DiscardOverlay, {
        discard: oneTile,
        variant: "base",
        onClose: () => {},
        onGroupDiscardBySuit: () => {},
      }),
    );
    expect(oneMarkup).toMatch(/data-testid="discard-overlay-group-by-suit"[^>]*disabled=""/);

    const threeTiles: HanabiView["discard"] = [
      { id: "a", suit: "red", rank: 1 },
      { id: "b", suit: "blue", rank: 2 },
      { id: "c", suit: "green", rank: 3 },
    ] as HanabiView["discard"];
    const threeMarkup = renderToStaticMarkup(
      createElement(DiscardOverlay, {
        discard: threeTiles,
        variant: "base",
        onClose: () => {},
        onGroupDiscardBySuit: () => {},
      }),
    );
    const buttonMatch = threeMarkup.match(/<button[^>]*data-testid="discard-overlay-group-by-suit"[^>]*>/);
    expect(buttonMatch?.[0]).not.toMatch(/\sdisabled=""/);
  });

  it("UAT gap 10: the group-by-suit control is disabled when onGroupDiscardBySuit is absent", () => {
    const threeTiles: HanabiView["discard"] = [
      { id: "a", suit: "red", rank: 1 },
      { id: "b", suit: "blue", rank: 2 },
      { id: "c", suit: "green", rank: 3 },
    ] as HanabiView["discard"];
    const markup = renderToStaticMarkup(
      createElement(DiscardOverlay, { discard: threeTiles, variant: "base", onClose: () => {} }),
    );
    expect(markup).toMatch(/data-testid="discard-overlay-group-by-suit"[^>]*disabled=""/);
  });
});

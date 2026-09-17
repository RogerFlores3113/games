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
    expect(markup).toContain("No cards discarded yet");
  });

  it("groups discarded cards by suit (red before blue) with one discard-overlay-card per card", () => {
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
});

// D-09/D-10/D-11 (ART-01, plan 06.1-02): render-contract guards for the
// firework-burst card components. Mirrors own-hand-render.test.ts's
// renderToStaticMarkup pattern (server-render, string-assert the DOM) since
// these are the components that will sit behind the D-15 own-hand identity
// boundary once wired into the table in a later plan.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FireworkCardBack, FireworkCardFace } from "../components/hanabi/FireworkCard";

const SOURCE_PATH = fileURLToPath(new URL("../components/hanabi/FireworkCard.tsx", import.meta.url));
const source = readFileSync(SOURCE_PATH, "utf-8");

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("firework-card-render", () => {
  it("FireworkCardFace with exposeSuit renders exactly one data-glyph, rank bursts, and an accessible label with suit and rank (no visible numeral)", () => {
    const markup = renderToStaticMarkup(
      createElement(FireworkCardFace, { suit: "red", rank: 3, width: 64, height: 84, exposeSuit: true }),
    );
    expect(countOccurrences(markup, 'data-glyph="red"')).toBe(1);
    expect(countOccurrences(markup, "<svg")).toBe(3);
    // Owner override (06.1-07 Task 3): no corner numeral at any size — rank
    // reads from burst count only, plus this accessible label for
    // screen readers / e2e selectors.
    expect(markup).toContain('aria-label="Red 3"');
    expect(markup).not.toMatch(/>3</);
  });

  it("FireworkCardFace without exposeSuit emits no data-glyph and no accessible rank/suit label", () => {
    const markup = renderToStaticMarkup(
      createElement(FireworkCardFace, { suit: "blue", rank: 2, width: 64, height: 84 }),
    );
    expect(markup).not.toContain("data-glyph");
    expect(markup).not.toContain("aria-label");
    expect(markup).not.toMatch(/>2</);
  });

  it("FireworkCardFace with showBurstCount false renders exactly one burst and no visible numeral", () => {
    const markup = renderToStaticMarkup(
      createElement(FireworkCardFace, {
        suit: "green",
        rank: 5,
        width: 48,
        height: 64,
        showBurstCount: false,
      }),
    );
    expect(countOccurrences(markup, "<svg")).toBe(1);
    expect(markup).not.toMatch(/>5</);
  });

  it("every rank 1-5 renders exactly rank bursts when showBurstCount is true", () => {
    for (const rank of [1, 2, 3, 4, 5] as const) {
      const markup = renderToStaticMarkup(
        createElement(FireworkCardFace, { suit: "white", rank, width: 88, height: 112 }),
      );
      expect(countOccurrences(markup, "<svg")).toBe(rank);
    }
  });

  it("FireworkCardBack renders byte-identical markup across two renders with no identity signal", () => {
    const first = renderToStaticMarkup(createElement(FireworkCardBack, { width: 88, height: 112 }));
    const second = renderToStaticMarkup(createElement(FireworkCardBack, { width: 88, height: 112 }));
    expect(first).toBe(second);
    expect(first).not.toContain("data-glyph");
    expect(first).not.toContain("--color-suit-");
    expect(first).not.toContain("card-identity");
  });

  it("FireworkCardBack renders a flat tile fill plus a picture-frame double outline (outer edge + inset), no card-like emblem/glow", () => {
    // Owner override (06.1-07 Task 3): first "make it the outline of a
    // rectangle - this is too cardlike, it should be tilelike", then "the
    // cards have the outline, then the back has another outline inside it.
    // like a picture frame" — replaces the old unlit-shell-emblem + glow-arc
    // card back with a tile fill plus TWO concentric outlines and an empty
    // interior.
    const markup = renderToStaticMarkup(createElement(FireworkCardBack, { width: 88, height: 112 }));
    expect(countOccurrences(markup, "<path")).toBe(3);
    expect(countOccurrences(markup, 'fill-rule="evenodd"')).toBe(2);
    expect(markup).toContain("var(--color-bg)");
    expect(countOccurrences(markup, "var(--color-border)")).toBe(2);
    expect(markup).not.toContain("var(--color-card-glow)");
    expect(markup).not.toContain("var(--color-text-muted)");
  });

  it("FireworkCard.tsx source contains no hex colour literal", () => {
    const withoutComments = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    const hexMatches = withoutComments.match(/#[0-9A-Fa-f]{3,8}/g) ?? [];
    expect(hexMatches.length).toBe(0);
  });

  it("Rainbow suit renders a multicolour linearGradient fill, not a flat single-tone fill", () => {
    const markup = renderToStaticMarkup(
      createElement(FireworkCardFace, { suit: "rainbow", rank: 1, width: 64, height: 84, exposeSuit: true }),
    );
    expect(markup).toContain("<linearGradient");
    expect(countOccurrences(markup, "<stop")).toBe(5);
    expect(markup).toContain("url(#");
    // Every stop must be one of the existing suit hue tokens (D-11: no new
    // hex literals for the owner's "actually rainbow" override).
    expect(markup).not.toMatch(/#[0-9A-Fa-f]{3,8}/);
  });

  it("owner report (2026-09-19): a rank-1 burst's centre is within 1px of the tile's own content-box centre, and the identity outline is never on the same element the burst position is computed against", () => {
    // Regression for the containing-block bug: the burst wrapper span must
    // carry no border of its own (a border there would shift the absolute-
    // positioned burst's containing block by the border width, see this
    // component's own header comment) — the border lives on a separate
    // `inset: 0` overlay instead.
    const width = 50;
    const height = 65;
    const markup = renderToStaticMarkup(
      createElement(FireworkCardFace, { suit: "red", rank: 1, width, height }),
    );
    const wrapperStyle = markup.match(/^<span[^>]*style="([^"]*)"/)?.[1] ?? "";
    expect(wrapperStyle).not.toMatch(/border/);
    const overlayStyle = markup.match(/style="([^"]*border[^"]*)"/)?.[1] ?? "";
    expect(overlayStyle).toContain("border:2px solid var(--color-token-disc)");

    // Rank 1 is a single full-size burst (cx=0.5, cy=0.5, scale=1) — its
    // computed left/top must place its centre within 1px of (width/2,
    // height/2), the tile's own content-box centre.
    const burstMatch = markup.match(/<span aria-hidden="true" class="absolute" style="left:([-\d.]+)(?:px)?;top:([-\d.]+)(?:px)?"/);
    expect(burstMatch).not.toBeNull();
    const left = Number(burstMatch?.[1]);
    const top = Number(burstMatch?.[2]);
    const burstSize = Math.min(width, height); // scale 1
    const burstCenterX = left + burstSize / 2;
    const burstCenterY = top + burstSize / 2;
    expect(Math.abs(burstCenterX - width / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(burstCenterY - height / 2)).toBeLessThanOrEqual(1);
  });

  it("multiple rainbow bursts on one card get distinct gradient ids (no DOM id collision)", () => {
    // Rank 5 renders five bursts of the same suit on one card — each
    // SuitGlyph instance must mint its own gradient id via useId().
    const markup = renderToStaticMarkup(
      createElement(FireworkCardFace, { suit: "rainbow", rank: 5, width: 64, height: 84, exposeSuit: true }),
    );
    const ids = [...markup.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(5);
    expect(new Set(ids).size).toBe(5);
  });
});

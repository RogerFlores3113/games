// BOARD-02/BOARD-03 (plan 06.2-05): render-contract guards for the clue/fuse
// token art and the vertical token column. Mirrors
// firework-card-render.test.ts's renderToStaticMarkup + source-scan pattern.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClueTokenArt } from "../components/hanabi/ClueTokenArt";
import { FuseTokenArt } from "../components/hanabi/FuseTokenArt";
import { TokenColumn } from "../components/hanabi/TokenColumn";
import { MAX_CLUE_TOKENS, MAX_FUSE_TOKENS } from "./layout-budget";

const CLUE_TOKEN_ART_PATH = fileURLToPath(new URL("../components/hanabi/ClueTokenArt.tsx", import.meta.url));
const FUSE_TOKEN_ART_PATH = fileURLToPath(new URL("../components/hanabi/FuseTokenArt.tsx", import.meta.url));
const TOKEN_COLUMN_PATH = fileURLToPath(new URL("../components/hanabi/TokenColumn.tsx", import.meta.url));
const clueTokenArtSource = readFileSync(CLUE_TOKEN_ART_PATH, "utf-8");
const fuseTokenArtSource = readFileSync(FUSE_TOKEN_ART_PATH, "utf-8");
const tokenColumnSource = readFileSync(TOKEN_COLUMN_PATH, "utf-8");

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function noHexLiterals(source: string): RegExpMatchArray | null {
  const withoutComments = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return withoutComments.match(/#[0-9A-Fa-f]{3,8}/g);
}

describe("token-render: ClueTokenArt", () => {
  it("renders one svg with a disc filled from --color-token-disc and a question mark in --color-suit-blue", () => {
    const markup = renderToStaticMarkup(createElement(ClueTokenArt, { size: 16 }));
    expect(markup).toContain("<svg");
    expect(markup).toContain("var(--color-token-disc)");
    expect(markup).toContain("var(--color-suit-blue)");
  });

  it("accepts a size prop and emits width/height equal to it", () => {
    const markup = renderToStaticMarkup(createElement(ClueTokenArt, { size: 22 }));
    expect(markup).toContain('width="22"');
    expect(markup).toContain('height="22"');
  });

  it("is aria-hidden with focusable=false", () => {
    const markup = renderToStaticMarkup(createElement(ClueTokenArt, { size: 16 }));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('focusable="false"');
  });

  it("source contains no hex colour literal", () => {
    expect(noHexLiterals(clueTokenArtSource)).toBeNull();
  });

  it("carries a blue rim stroke matching the fuse token's outline treatment (UAT gap 4)", () => {
    const markup = renderToStaticMarkup(createElement(ClueTokenArt, { size: 16 }));
    expect(markup).toContain("stroke:var(--color-suit-blue)");
  });
});

describe("token-render: FuseTokenArt", () => {
  it("renders one svg with a disc filled from --color-token-disc, an explosion in --color-suit-yellow and a rim stroked with --color-token-fuse-rim", () => {
    const markup = renderToStaticMarkup(createElement(FuseTokenArt, { size: 16 }));
    expect(markup).toContain("<svg");
    expect(markup).toContain("var(--color-token-disc)");
    expect(markup).toContain("var(--color-suit-yellow)");
    expect(markup).toContain("var(--color-token-fuse-rim)");
  });

  it("accepts a size prop and emits width/height equal to it", () => {
    const markup = renderToStaticMarkup(createElement(FuseTokenArt, { size: 22 }));
    expect(markup).toContain('width="22"');
    expect(markup).toContain('height="22"');
  });

  it("is aria-hidden with focusable=false", () => {
    const markup = renderToStaticMarkup(createElement(FuseTokenArt, { size: 16 }));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('focusable="false"');
  });

  it("source contains no hex colour literal", () => {
    expect(noHexLiterals(fuseTokenArtSource)).toBeNull();
  });

  it("has an explosion silhouette distinct from every existing suit burst silhouette", () => {
    // Every SUIT_VISUALS silhouette uses spike counts 6, 8 (x2 for black),
    // 10, 12, 16 or 20 with at most a 2-value outer-radius cycle. The fuse
    // explosion below is board furniture, not a suit, so it deliberately
    // uses a 9-spike / 3-value-radius-cycle silhouette that cannot collide
    // with any SUIT_VISUALS entry.
    expect(fuseTokenArtSource).not.toMatch(/spikeCount\s*=\s*(6|8|10|12|16|20)\b/);
  });
});

describe("token-render: TokenColumn", () => {
  it("with 5 clue tokens remaining, exactly 5 clue-token artworks are in the markup", () => {
    const markup = renderToStaticMarkup(createElement(TokenColumn, { clueTokens: 5, fusesRemaining: 3 }));
    expect(countOccurrences(markup, 'data-testid="clue-token"')).toBe(5);
  });

  it("with 2 fuses remaining, exactly 2 fuse-token artworks are in the markup", () => {
    const markup = renderToStaticMarkup(createElement(TokenColumn, { clueTokens: 8, fusesRemaining: 2 }));
    expect(countOccurrences(markup, 'data-testid="fuse-token"')).toBe(2);
  });

  it("always renders exactly MAX_CLUE_TOKENS clue slots and MAX_FUSE_TOKENS fuse slots, filled or empty", () => {
    const zero = renderToStaticMarkup(createElement(TokenColumn, { clueTokens: 0, fusesRemaining: 0 }));
    const full = renderToStaticMarkup(
      createElement(TokenColumn, { clueTokens: MAX_CLUE_TOKENS, fusesRemaining: MAX_FUSE_TOKENS }),
    );
    for (const markup of [zero, full]) {
      const clueSlots =
        countOccurrences(markup, 'data-testid="clue-token"') +
        countOccurrences(markup, 'data-testid="clue-token-slot-empty"');
      const fuseSlots =
        countOccurrences(markup, 'data-testid="fuse-token"') +
        countOccurrences(markup, 'data-testid="fuse-token-slot-empty"');
      expect(clueSlots).toBe(MAX_CLUE_TOKENS);
      expect(fuseSlots).toBe(MAX_FUSE_TOKENS);
    }
  });

  it("with 0 clues and 0 fuses remaining, no token artworks render but both counts still render as sr-only text", () => {
    const markup = renderToStaticMarkup(createElement(TokenColumn, { clueTokens: 0, fusesRemaining: 0 }));
    expect(countOccurrences(markup, 'data-testid="clue-token"')).toBe(0);
    expect(countOccurrences(markup, 'data-testid="fuse-token"')).toBe(0);
    expect(markup).toContain("0 clues left");
    expect(markup).toContain("0 fuses left");
  });

  it("the text counts are always present, including at zero tokens and at max tokens", () => {
    const markup = renderToStaticMarkup(createElement(TokenColumn, { clueTokens: 8, fusesRemaining: 3 }));
    expect(markup).toContain("8 clues left");
    expect(markup).toContain("3 fuses left");
  });

  it("the count text is carried by an sr-only span, not a visible text node", () => {
    const markup = renderToStaticMarkup(createElement(TokenColumn, { clueTokens: 5, fusesRemaining: 2 }));
    expect(markup).toMatch(/<span class="sr-only">5 clues left<\/span>/);
    expect(markup).toMatch(/<span class="sr-only">2 fuses left<\/span>/);
  });

  it("the clue-tokens element exposes data-count equal to the remaining clue count, and same for fuse-tokens", () => {
    const markup = renderToStaticMarkup(createElement(TokenColumn, { clueTokens: 4, fusesRemaining: 1 }));
    expect(markup).toContain('data-testid="clue-tokens" data-count="4"');
    expect(markup).toContain('data-testid="fuse-tokens" data-count="1"');
  });

  it("spent tokens are absent from the markup, not dimmed or transparent (no opacity/dim styling path)", () => {
    const withoutComments = tokenColumnSource
      .split("\n")
      .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .join("\n");
    expect(withoutComments).not.toMatch(/opacity|dim/i);
  });

  it("token discs render at TOKEN_DISC_PX (UAT gap 20: the prior 40px size cut by roughly a third, 27px) regardless of remaining count", () => {
    const markup = renderToStaticMarkup(
      createElement(TokenColumn, { clueTokens: MAX_CLUE_TOKENS, fusesRemaining: MAX_FUSE_TOKENS }),
    );
    const widths = [...markup.matchAll(/<svg viewBox="0 0 24 24" width="([0-9.]+)"/g)].map((m) => Number(m[1]));
    expect(widths.length).toBe(MAX_CLUE_TOKENS + MAX_FUSE_TOKENS);
    for (const w of widths) {
      expect(w).toBe(27);
    }
  });

  it("the clue-tokens and fuse-tokens containers have an identical footprint at 0 remaining and at full remaining", () => {
    const zero = renderToStaticMarkup(createElement(TokenColumn, { clueTokens: 0, fusesRemaining: 0 }));
    const full = renderToStaticMarkup(
      createElement(TokenColumn, { clueTokens: MAX_CLUE_TOKENS, fusesRemaining: MAX_FUSE_TOKENS }),
    );
    const extractStyle = (markup: string, testid: string): string => {
      const match = markup.match(new RegExp(`data-testid="${testid}"[^>]*style="([^"]*)"`));
      if (!match) throw new Error(`no ${testid} element found`);
      return match[1]!;
    };
    expect(extractStyle(zero, "clue-tokens")).toBe(extractStyle(full, "clue-tokens"));
    expect(extractStyle(zero, "fuse-tokens")).toBe(extractStyle(full, "fuse-tokens"));
  });

  it("clamps filled slots to MAX_CLUE_TOKENS/MAX_FUSE_TOKENS even if given an out-of-range count (T-06.2-35)", () => {
    const markup = renderToStaticMarkup(createElement(TokenColumn, { clueTokens: 99, fusesRemaining: 99 }));
    expect(countOccurrences(markup, 'data-testid="clue-token"')).toBe(MAX_CLUE_TOKENS);
    expect(countOccurrences(markup, 'data-testid="fuse-token"')).toBe(MAX_FUSE_TOKENS);
  });

  it("renders clue tokens and fuse tokens as two runs within one right-hand token area", () => {
    const markup = renderToStaticMarkup(createElement(TokenColumn, { clueTokens: 2, fusesRemaining: 1 }));
    const clueIndex = markup.indexOf('data-testid="clue-tokens"');
    const fuseIndex = markup.indexOf('data-testid="fuse-tokens"');
    expect(clueIndex).toBeGreaterThan(-1);
    expect(fuseIndex).toBeGreaterThan(clueIndex);
  });
});

describe("token-render: id collision safety", () => {
  it("rendering several clue and fuse tokens on one page produces no duplicate SVG ids", () => {
    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(ClueTokenArt, { size: 16, key: "c1" }),
        createElement(ClueTokenArt, { size: 16, key: "c2" }),
        createElement(FuseTokenArt, { size: 16, key: "f1" }),
        createElement(FuseTokenArt, { size: 16, key: "f2" }),
      ),
    );
    const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

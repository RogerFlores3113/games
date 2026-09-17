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

const CLUE_TOKEN_ART_PATH = fileURLToPath(new URL("../components/hanabi/ClueTokenArt.tsx", import.meta.url));
const FUSE_TOKEN_ART_PATH = fileURLToPath(new URL("../components/hanabi/FuseTokenArt.tsx", import.meta.url));
const clueTokenArtSource = readFileSync(CLUE_TOKEN_ART_PATH, "utf-8");
const fuseTokenArtSource = readFileSync(FUSE_TOKEN_ART_PATH, "utf-8");

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

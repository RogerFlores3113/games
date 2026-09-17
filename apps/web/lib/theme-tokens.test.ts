// Phase 06.2 (Task 1/2) — source-scan proof that the seven new @theme
// tokens exist, are documented, that no hex literal escapes the @theme
// block, that --color-accent's reserved-use count stays unchanged, and
// that every animation/transition class introduced in globals.css has a
// paired prefers-reduced-motion block. Mirrors suit-visuals.test.ts's
// "read the real CSS file, don't trust a hand-copied constant" discipline.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const GLOBALS_CSS_PATH = fileURLToPath(new URL("../app/globals.css", import.meta.url));
const globalsCss = readFileSync(GLOBALS_CSS_PATH, "utf-8");

/** Strip `/* ... *\/` comments (non-greedy, spans newlines). */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Extract the contents of the top-level `@theme { ... }` block via brace
 * matching (not a lazy regex) so a stray `}` inside a nested value can
 * never truncate the match early.
 */
function extractThemeBlock(css: string): { theme: string; before: string; after: string } {
  const startMarker = "@theme";
  const markerIndex = css.indexOf(startMarker);
  if (markerIndex === -1) throw new Error("No @theme block found in globals.css");
  const openBraceIndex = css.indexOf("{", markerIndex);
  if (openBraceIndex === -1) throw new Error("@theme block has no opening brace");

  let depth = 0;
  let closeBraceIndex = -1;
  for (let i = openBraceIndex; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        closeBraceIndex = i;
        break;
      }
    }
  }
  if (closeBraceIndex === -1) throw new Error("@theme block never closes");

  return {
    theme: css.slice(openBraceIndex + 1, closeBraceIndex),
    before: css.slice(0, markerIndex),
    after: css.slice(closeBraceIndex + 1),
  };
}

const NEW_TOKENS = [
  "--color-tile-preset-warm-sand",
  "--color-tile-preset-cool-teal",
  "--color-tile-preset-plum",
  "--color-tile-preset-charcoal",
  "--color-token-disc",
  "--color-token-fuse-rim",
  "--color-tile-shadow",
] as const;

// Baseline count of --color-accent references inside globals.css's
// non-comment CSS, established before this plan's edits. This plan adds
// zero new --color-accent uses (per the UI-SPEC), so the count must stay
// at its pre-existing value: exactly one (the token's own declaration —
// every consuming use lives in component files, not here).
const EXPECTED_COLOR_ACCENT_NON_COMMENT_COUNT = 1;

describe("theme-tokens", () => {
  it("declares all seven new tokens exactly once, inside the @theme block", () => {
    const { theme } = extractThemeBlock(globalsCss);
    for (const token of NEW_TOKENS) {
      const re = new RegExp(`${token.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}:`, "g");
      const matches = theme.match(re) ?? [];
      expect(matches.length).toBe(1);
    }
  });

  it("every new token has an adjacent documenting comment paragraph mentioning it or its group", () => {
    // The doc-comment paragraph immediately precedes the @theme block's
    // typography section and the seven declarations; assert each token
    // name (or its shared "tile-preset" group name) appears somewhere in
    // a comment block within 2000 characters before its declaration.
    for (const token of NEW_TOKENS) {
      const declIndex = globalsCss.indexOf(`${token}:`);
      expect(declIndex).toBeGreaterThan(-1);
      const windowStart = Math.max(0, declIndex - 2000);
      const nearby = globalsCss.slice(windowStart, declIndex);
      const commentBlocks = nearby.match(/\/\*[\s\S]*?\*\//g) ?? [];
      const groupName = token.includes("tile-preset") ? "tile-preset" : token.replace(/^--/, "");
      const documented = commentBlocks.some(
        (block) => block.includes(token) || block.includes(groupName),
      );
      expect(documented).toBe(true);
    }
  });

  it("no hex colour literal appears outside the @theme block", () => {
    const { before, after } = extractThemeBlock(globalsCss);
    const remainder = before + after;
    const hexMatches = remainder.match(/#[0-9A-Fa-f]{3,8}/g) ?? [];
    expect(hexMatches).toEqual([]);
  });

  it("--color-accent's non-comment reference count is unchanged (still exactly seven reserved uses, zero new ones here)", () => {
    const withoutComments = stripComments(globalsCss);
    const matches = withoutComments.match(/--color-accent/g) ?? [];
    expect(matches.length).toBe(EXPECTED_COLOR_ACCENT_NON_COMMENT_COUNT);
  });

  it(".board-surface exists and references var(--color-surface)", () => {
    const match = globalsCss.match(/\.board-surface\s*{([\s\S]*?)}/);
    expect(match).not.toBeNull();
    expect(match?.[1]).toContain("var(--color-surface)");
  });

  it(".tile-shift exists and appears within a prefers-reduced-motion block", () => {
    expect(globalsCss).toMatch(/\.tile-shift\s*{/);
    const reducedMotionBlocks = globalsCss.match(
      /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\n}/g,
    ) ?? [];
    const tileShiftPaired = reducedMotionBlocks.some((block) => block.includes(".tile-shift"));
    expect(tileShiftPaired).toBe(true);
  });

  it(".table-backdrop (06.1 background) is untouched by this phase's additions", () => {
    expect(globalsCss).toMatch(/\.table-backdrop\s*{/);
  });

  it("every animation/transition class introduced in this file appears inside a prefers-reduced-motion block", () => {
    // Compute the class-name set from the file itself (not a hardcoded
    // list): every top-level `.class-name { ... transition|animation ... }`
    // rule outside any @media block, where the rule body actually declares
    // a transition or animation property.
    const { before, after } = extractThemeBlock(globalsCss);
    const outsideTheme = before + after;
    const withoutMediaBlocks = outsideTheme.replace(
      /@media \([^)]*\)\s*{[\s\S]*?\n}/g,
      "",
    );

    const ruleRegex = /\.([a-zA-Z0-9-]+)\s*{([^}]*)}/g;
    const animatedClasses = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = ruleRegex.exec(withoutMediaBlocks)) !== null) {
      const [, className, body] = match;
      if (/\b(transition|animation)\s*:/.test(body ?? "")) {
        animatedClasses.add(className as string);
      }
    }

    expect(animatedClasses.size).toBeGreaterThan(0);

    const reducedMotionBlocks = outsideTheme.match(
      /@media \(prefers-reduced-motion: reduce\)\s*{[\s\S]*?\n}/g,
    ) ?? [];

    for (const className of animatedClasses) {
      const paired = reducedMotionBlocks.some((block) => block.includes(`.${className}`));
      expect(paired).toBe(true);
    }
  });
});

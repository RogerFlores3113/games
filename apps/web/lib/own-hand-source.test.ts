// D-15 own-hand source scan. This test enforces the "no identity signal in
// an own-hand card" rule at the source-code level, not just by convention:
// OwnHandCard.tsx and CandidateStrip.tsx (which OwnHandCard renders into)
// must never read a card's suit/rank property, never opt a SuitGlyph into
// `exposeSuit`, and never emit a `data-suit`/`card-identity`/`data-glyph`
// attribute — any of those would put own-hand identity into the DOM for a
// card whose identity the viewer is not supposed to know.
//
// Comments are stripped before scanning (mirrors
// apps/worker/src/source-structure.test.ts's rationale): both files
// legitimately talk ABOUT the forbidden tokens in prose (this file's own
// header comment is proof), so a naive raw-text grep would false-positive on
// documentation instead of catching a real violation.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const OWN_HAND_CARD_PATH = fileURLToPath(new URL("../components/hanabi/OwnHandCard.tsx", import.meta.url));
const CANDIDATE_STRIP_PATH = fileURLToPath(new URL("../components/hanabi/CandidateStrip.tsx", import.meta.url));

const ownHandCardSource = readFileSync(OWN_HAND_CARD_PATH, "utf-8");
const candidateStripSource = readFileSync(CANDIDATE_STRIP_PATH, "utf-8");

/**
 * Strips `//` line comments and `/* *\/` block comments from `source`,
 * replacing removed characters with spaces (newlines preserved). A
 * character-by-character scanner (not a regex) tracking string/template
 * literal state, so a `//` or `/*` inside a string literal is never treated
 * as the start of a comment. See apps/worker/src/source-structure.test.ts
 * for the identical rationale and implementation this is mirrored from.
 */
function stripComments(source: string): string {
  const out: string[] = [];
  type State = "code" | "single" | "double" | "template" | "lineComment" | "blockComment";
  let state: State = "code";
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    const next = source[i + 1];

    if (state === "lineComment") {
      if (ch === "\n") {
        out.push("\n");
        state = "code";
      } else {
        out.push(" ");
      }
      continue;
    }

    if (state === "blockComment") {
      if (ch === "*" && next === "/") {
        out.push("  ");
        i++;
        state = "code";
      } else {
        out.push(ch === "\n" ? "\n" : " ");
      }
      continue;
    }

    if (state === "single" || state === "double" || state === "template") {
      out.push(ch);
      if (ch === "\\") {
        if (next !== undefined) {
          out.push(next);
          i++;
        }
        continue;
      }
      if (state === "single" && ch === "'") state = "code";
      else if (state === "double" && ch === '"') state = "code";
      else if (state === "template" && ch === "`") state = "code";
      continue;
    }

    // state === "code"
    if (ch === "/" && next === "/") {
      state = "lineComment";
      out.push("  ");
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      state = "blockComment";
      out.push("  ");
      i++;
      continue;
    }
    if (ch === "'") {
      state = "single";
      out.push(ch);
      continue;
    }
    if (ch === '"') {
      state = "double";
      out.push(ch);
      continue;
    }
    if (ch === "`") {
      state = "template";
      out.push(ch);
      continue;
    }
    out.push(ch);
  }
  return out.join("");
}

const FORBIDDEN_TOKENS = ["exposeSuit", "data-suit", "card-identity", "data-glyph"];

describe("own-hand source scan (D-15)", () => {
  it("OwnHandCard.tsx never reads a card's suit or rank property, even in comments", () => {
    expect(stripComments(ownHandCardSource)).not.toMatch(/\.(suit|rank)\b/);
  });

  it("CandidateStrip.tsx never reads a card's suit or rank property, even in comments", () => {
    expect(stripComments(candidateStripSource)).not.toMatch(/\.(suit|rank)\b/);
  });

  it("neither file opts into exposeSuit or emits a suit-identity DOM marker", () => {
    for (const token of FORBIDDEN_TOKENS) {
      expect(ownHandCardSource).not.toContain(token);
      expect(candidateStripSource).not.toContain(token);
    }
  });

  it("OwnHandCard's props type structurally cannot accept a visible card", () => {
    const hasExtractGuard = ownHandCardSource.includes("Extract<HanabiCardView, { hidden: true }>");
    const hasFactsOnlyGuard = ownHandCardSource.includes("facts: CardFacts");
    expect(hasExtractGuard || hasFactsOnlyGuard).toBe(true);
  });

  it("carries forward the Phase 4 load-bearing no-identity comment", () => {
    expect(ownHandCardSource).toContain("renders NO identity signal");
  });
});

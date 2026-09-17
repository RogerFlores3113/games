// D-15 own-hand source scan. This test enforces the "no identity signal in
// an own-hand card" rule at the source-code level, not just by convention:
// OwnHandCard.tsx and HintIndicator.tsx (which OwnHandCard renders into)
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
// 06.2-04 / HINT-04: the two automatic clue-mark pip-row components are
// deleted (the pip rows they rendered are gone); HintIndicator.tsx is their
// replacement and the D-15 source scan must cover it instead.
const HINT_INDICATOR_PATH = fileURLToPath(new URL("../components/hanabi/HintIndicator.tsx", import.meta.url));
// 06.1-11 / T-06.1-34: the note chip fills the own-hand note row and
// receives only ids (never a card object) — the D-15 source scan must cover
// this file too.
const NOTE_CHIP_PATH = fileURLToPath(new URL("../components/hanabi/NoteChip.tsx", import.meta.url));
// 06.1-12 / T-06.1-37: the drag hook tracks own-hand cards by id only (drop
// resolution and pending reorder never touch a card's suit/rank) — the D-15
// source scan must cover this file too.
const USE_HAND_DRAG_PATH = fileURLToPath(new URL("../components/hanabi/useHandDrag.ts", import.meta.url));

const ownHandCardSource = readFileSync(OWN_HAND_CARD_PATH, "utf-8");
const hintIndicatorSource = readFileSync(HINT_INDICATOR_PATH, "utf-8");
const noteChipSource = readFileSync(NOTE_CHIP_PATH, "utf-8");
const useHandDragSource = readFileSync(USE_HAND_DRAG_PATH, "utf-8");

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

// WR-06: property access in any spelling — `.suit`, `?.suit`, `. suit`, and
// bracket access `["suit"]` / `['rank']` / `` [`suit`] ``.
const PROPERTY_ACCESS = /\??\.\s*(suit|rank)\b|\[\s*["'`](suit|rank)["'`]\s*\]/;
// WR-06: destructuring suit/rank out of anything, e.g. `const { suit } = card`
// or a `({ rank }) =>` parameter.
// The prefix admits only a comma-separated binding list (`a`, `a: b`), so a
// JSX `suit={...}` attribute inside a `{cond && (...)}` block never matches.
const DESTRUCTURING = /\{\s*(?:[\w$]+\s*(?::\s*[\w$]+)?\s*,\s*)*(suit|rank)\b\s*(?:[,}:]|=(?!\{))/;

/** The source text of `export function OwnHand(` up to the end of the file
 * or the next top-level `export`, whichever comes first. */
function ownHandFunctionBody(source: string): string {
  const start = source.indexOf("export function OwnHand(");
  if (start === -1) throw new Error("OwnHand function not found in Hand.tsx");
  const nextExport = source.indexOf("\nexport ", start + 1);
  return source.slice(start, nextExport === -1 ? source.length : nextExport);
}

const HAND_PATH = fileURLToPath(new URL("../components/hanabi/Hand.tsx", import.meta.url));
const ownHandBody = stripComments(ownHandFunctionBody(readFileSync(HAND_PATH, "utf-8")));

describe("own-hand source scan (D-15)", () => {
  it("OwnHandCard.tsx code (comments stripped) never reads or destructures a suit or rank property", () => {
    const code = stripComments(ownHandCardSource);
    expect(code).not.toMatch(PROPERTY_ACCESS);
    expect(code).not.toMatch(DESTRUCTURING);
  });

  it("neither file mentions exposeSuit or a suit-identity DOM marker anywhere, comments included", () => {
    for (const token of FORBIDDEN_TOKENS) {
      expect(ownHandCardSource).not.toContain(token);
      expect(hintIndicatorSource).not.toContain(token);
    }
  });

  it("OwnHand (Hand.tsx) touches only card.id and card.facts — never identity, spreads, or bracket access", () => {
    expect(ownHandBody).not.toMatch(PROPERTY_ACCESS);
    expect(ownHandBody).not.toMatch(DESTRUCTURING);
    expect(ownHandBody).not.toMatch(/\.\.\.\s*card\b/);
    expect(ownHandBody).not.toMatch(/\bcard\s*\[/);
    for (const token of FORBIDDEN_TOKENS) {
      expect(ownHandBody).not.toContain(token);
    }
    const cardMembers = new Set([...ownHandBody.matchAll(/\bcard\s*\??\.\s*(\w+)/g)].map((m) => m[1]));
    expect([...cardMembers].sort()).toEqual(["facts", "id"]);
    // facts pass through untouched, not rebuilt from a spread/object literal.
    expect(ownHandBody).toMatch(/facts=\{card\.facts\}/);
  });

  it("carries forward the Phase 4 load-bearing no-identity comment", () => {
    expect(ownHandCardSource).toContain("renders NO identity signal");
  });

  it("HintIndicator.tsx code (comments stripped) never reads a suit or rank property", () => {
    // Destructuring is not banned here, mirroring the former pip-strip
    // component's exception: HintIndicator legitimately passes the already-CLUED suit
    // into `SuitGlyph suit={suit}` as the non-colour marker (D-04) — that
    // JSX attribute assignment trips the DESTRUCTURING regex's "{suit}"
    // shape even though it is not an object-destructure of a card. The
    // props type (asserted below) is what keeps a real card from ever
    // reaching this file.
    expect(stripComments(hintIndicatorSource)).not.toMatch(PROPERTY_ACCESS);
  });

  it("HintIndicator.tsx never mentions exposeSuit or a suit-identity DOM marker anywhere, comments included", () => {
    for (const token of FORBIDDEN_TOKENS) {
      expect(hintIndicatorSource).not.toContain(token);
    }
  });

  it("HintIndicator's props type has no card member — it takes facts only, never a card object", () => {
    expect(hintIndicatorSource).not.toMatch(/\bcard\s*:/);
    expect(hintIndicatorSource).not.toContain("HanabiCardView");
  });

  it("NoteChip.tsx code (comments stripped) never reads or destructures a suit or rank property", () => {
    const code = stripComments(noteChipSource);
    expect(code).not.toMatch(PROPERTY_ACCESS);
    expect(code).not.toMatch(DESTRUCTURING);
  });

  it("NoteChip.tsx never mentions exposeSuit or a suit-identity DOM marker anywhere, comments included", () => {
    for (const token of FORBIDDEN_TOKENS) {
      expect(noteChipSource).not.toContain(token);
    }
  });

  it("NoteChip's props type has no card member — it takes ids only, never a card object", () => {
    expect(noteChipSource).not.toMatch(/\bcard\s*:/);
    expect(noteChipSource).not.toContain("HanabiCardView");
  });

  it("useHandDrag.ts code (comments stripped) never reads or destructures a suit or rank property", () => {
    const code = stripComments(useHandDragSource);
    expect(code).not.toMatch(PROPERTY_ACCESS);
    expect(code).not.toMatch(DESTRUCTURING);
  });

  it("useHandDrag.ts never mentions exposeSuit or a suit-identity DOM marker anywhere, comments included", () => {
    for (const token of FORBIDDEN_TOKENS) {
      expect(useHandDragSource).not.toContain(token);
    }
  });

  it("useHandDrag.ts never imports HanabiCardView — it reads card ids only", () => {
    expect(useHandDragSource).not.toContain("HanabiCardView");
  });
});

// SCENE-01 (RESEARCH.md Pitfall 4): source-scan proof that phaser is never
// imported (value or type, static or via a re-exporting module) outside
// apps/web/components/expedition/phaser/**. A phaser import anywhere else
// risks webpack/Turbopack bundling it into the landing page's or Hanabi's
// shared chunk, which SCENE-01 forbids. Comments are stripped before
// scanning (mirrors game-agnostic-source.test.ts's rationale) so prose
// mentioning "phaser" in a doc comment never false-positives.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Character-by-character comment stripper (not regex) tracking
 * string/template literal state, so a `//` or `/*` inside a string literal
 * is never treated as the start of a comment. Copied verbatim from
 * game-agnostic-source.test.ts (not exported there). */
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

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SCAN_DIRS = ["app", "components", "lib"];
const PHASER_DIR = path.join(ROOT, "components/expedition/phaser");

/** Recursive file lister. Unlike game-agnostic-source.test.ts's listFiles,
 * this one INCLUDES .test.ts/.test.tsx files for assertion 1 (a test file
 * importing phaser outside the phaser dir would also break Vitest, so it
 * must be banned too), but assertion 2's static-import-resolution check
 * only cares about non-test production sources reachable at build time. */
function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function isUnderPhaserDir(file: string): boolean {
  const rel = path.relative(PHASER_DIR, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// This test file itself necessarily contains the literal strings
// `"phaser"` (in PHASER_IMPORT_RE's own regex source and in the positive
// control's example snippets below) — exclude it from the scan so it
// doesn't trip its own assertion 1.
const SELF_PATH = fileURLToPath(import.meta.url);

const ALL_FILES = SCAN_DIRS.flatMap((dir) => listFiles(path.join(ROOT, dir)));
const NON_PHASER_FILES = ALL_FILES.filter(
  (f) => !isUnderPhaserDir(f) && f !== SELF_PATH,
);

// Matches `from "phaser"`, `from "phaser/foo"`, `import("phaser")`,
// `require("phaser")` with either quote style, but not e.g. "phaserx".
const PHASER_IMPORT_RE = /(from\s+|import\s*\(\s*|require\s*\(\s*)["']phaser(\/[^"']*)?["']/;

// Static (non-dynamic) import statements only: `import ... from "<spec>"`.
// Deliberately excludes `import type` (type-only imports still trigger
// assertion 1 above via PHASER_IMPORT_RE, but assertion 2's "no static
// value import resolves to a phaser-importing file" check is about the
// runtime dependency graph, which next/dynamic is the sanctioned escape
// hatch for) and excludes `import(...)` dynamic calls.
const STATIC_IMPORT_RE = /^import\s+(?!type\s)[^;]*?\sfrom\s+["'](\.[^"']+)["']/gm;

function resolveRelativeImport(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not found, try next candidate
    }
  }
  return null;
}

describe("phaser import confinement (SCENE-01, RESEARCH Pitfall 4)", () => {
  it("no file outside components/expedition/phaser/ imports phaser (value or type)", () => {
    for (const file of NON_PHASER_FILES) {
      const code = stripComments(readFileSync(file, "utf-8"));
      expect(code, `${file} imports phaser`).not.toMatch(PHASER_IMPORT_RE);
    }
  });

  it("no file outside components/expedition/phaser/ statically imports a module that imports phaser", () => {
    // Set P: files under the phaser dir whose stripped source imports phaser.
    const phaserImportingFiles = new Set(
      ALL_FILES.filter((f) => isUnderPhaserDir(f)).filter((f) =>
        PHASER_IMPORT_RE.test(stripComments(readFileSync(f, "utf-8"))),
      ),
    );

    for (const file of NON_PHASER_FILES) {
      const code = stripComments(readFileSync(file, "utf-8"));
      const matches = code.matchAll(STATIC_IMPORT_RE);
      for (const match of matches) {
        const spec = match[1]!;
        const resolved = resolveRelativeImport(file, spec);
        if (resolved && phaserImportingFiles.has(resolved)) {
          expect.fail(
            `${file} statically imports ${resolved} (which imports phaser) via "${spec}" — use a dynamic import() instead`,
          );
        }
      }
    }
  });

  it("positive control: the regex correctly distinguishes static from dynamic phaser references", () => {
    expect(stripComments('import Phaser from "phaser";')).toMatch(PHASER_IMPORT_RE);
    expect(
      stripComments('const mod = import("./phaser/ExpeditionPhaserMount");'),
    ).not.toMatch(PHASER_IMPORT_RE);
  });
});

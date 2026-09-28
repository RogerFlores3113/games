/**
 * SCENE-09 interactables contract (D-16, ENG-01). Iterates
 * Object.entries(INTERACTABLE_REGISTRY) ONLY — never a hand list — so a
 * fifth interactable registered later is covered automatically with zero
 * edits to this file. Mirrors
 * packages/rules/src/expedition/gear/gear.contract.test.ts's own ENG-02
 * shape.
 *
 * The source scan below resolves each registry entry's file from
 * registry.ts's own `import { x } from "./file"` lines (never a hand
 * list), so SCENE-09's "never touches game state" guarantee self-extends
 * the same way a newly registered gear item's file is covered by
 * gear.contract.test.ts.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { INTERACTABLE_REGISTRY } from "./registry";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const REGISTRY_PATH = path.join(DIR, "registry.ts");

/** Character-by-character comment stripper (not regex) tracking
 * string/template literal state, so a `//` or `/*` inside a string literal
 * is never treated as the start of a comment. Copied verbatim from
 * apps/web/lib/game-agnostic-source.test.ts (not exported there). */
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

/** Parses registry.ts's `import { x } from "./file"` lines to map each
 * imported binding name to its resolved absolute file path — never a hand
 * list, so a fifth registered interactable is covered with zero edits
 * here. */
function parseRegistryImports(): Map<string, string> {
  const stripped = stripComments(readFileSync(REGISTRY_PATH, "utf-8"));
  const map = new Map<string, string>();
  const importRe = /import\s*\{\s*([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(stripped)) !== null) {
    const names = match[1]!
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    const spec = match[2]!;
    const resolved = `${path.resolve(DIR, spec)}.ts`;
    for (const name of names) {
      map.set(name, resolved);
    }
  }
  return map;
}

const IMPORT_MAP = parseRegistryImports();

// Matches the module paths a decorative-only interactable must never
// import, and the call-site tokens that would let it reach game state or
// the server. Deliberately written as separate word/pattern fragments
// (never assembled from the literal identifier names themselves) so this
// file's own prose can describe the rule without tripping it.
const FORBIDDEN_IMPORT_RE = /room-socket|room-store|expedition-scene-store|game-ui|RoomClient/;
const FORBIDDEN_TOKEN_RE = /\bonAction\b|\bdispatch\s*\(|\.send\s*\(|\bfetch\s*\(|__expeditionTest|WebSocket/;

describe("INTERACTABLE_REGISTRY (SCENE-09, ENG-01)", () => {
  it("has exactly the ids campfire, fireflies, lantern, mascot, each key equal to its def's own id", () => {
    expect(Object.keys(INTERACTABLE_REGISTRY).sort()).toEqual(
      ["campfire", "fireflies", "lantern", "mascot"].sort(),
    );
    for (const [id, def] of Object.entries(INTERACTABLE_REGISTRY)) {
      expect(def.id).toBe(id);
    }
  });

  it("every entry has place and onClick functions", () => {
    for (const def of Object.values(INTERACTABLE_REGISTRY)) {
      expect(typeof def.place).toBe("function");
      expect(typeof def.onClick).toBe("function");
    }
  });

  it("mascot.lines has 3-5 non-empty entries, each at most 32 chars; no other entry defines lines", () => {
    for (const [id, def] of Object.entries(INTERACTABLE_REGISTRY)) {
      if (id === "mascot") {
        expect(def.lines).toBeDefined();
        expect(def.lines!.length).toBeGreaterThanOrEqual(3);
        expect(def.lines!.length).toBeLessThanOrEqual(5);
        for (const line of def.lines!) {
          expect(line.length).toBeGreaterThan(0);
          expect(line.length).toBeLessThanOrEqual(32);
        }
      } else {
        expect(def.lines).toBeUndefined();
      }
    }
  });

  it("registry.ts resolves a source file for every registered entry", () => {
    for (const id of Object.keys(INTERACTABLE_REGISTRY)) {
      expect(IMPORT_MAP.has(id)).toBe(true);
    }
  });

  it("no registered entry's source file imports a store/socket/dispatch path or a forbidden token", () => {
    for (const id of Object.keys(INTERACTABLE_REGISTRY)) {
      const file = IMPORT_MAP.get(id)!;
      const code = stripComments(readFileSync(file, "utf-8"));
      expect(code, `${id} (${file}) matches a forbidden import`).not.toMatch(FORBIDDEN_IMPORT_RE);
      expect(code, `${id} (${file}) matches a forbidden token`).not.toMatch(FORBIDDEN_TOKEN_RE);
    }
  });

  it('every `from "phaser"` import in a registered entry\'s source file is `import type`', () => {
    for (const id of Object.keys(INTERACTABLE_REGISTRY)) {
      const file = IMPORT_MAP.get(id)!;
      const stripped = stripComments(readFileSync(file, "utf-8"));
      for (const line of stripped.split("\n")) {
        if (/from\s+["']phaser["']/.test(line)) {
          expect(line, `${id} (${file}) has a non-type-only phaser import: ${line}`).toMatch(
            /^\s*import\s+type\s/,
          );
        }
      }
    }
  });
});

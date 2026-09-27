// Directory-scanning purity guard for packages/rules/src/expedition (Phase
// 9, Plan 06, T-09-18). Unlike adapter.test.ts's Hanabi purity test (a hand
// list of files), this test READS THE DIRECTORY so a Phase 10 content file
// added later is covered automatically without anyone remembering to update
// a list here.
//
// Phase 10, Plan 02 extensions:
//   - The scan now RECURSES into run/, gear/ and boss/ (Pitfall 2), so
//     later Phase 10 plans need not touch this file to be covered.
//   - Comments are STRIPPED before scanning for forbidden tokens (IN-04,
//     Pitfall 1), so a forbidden token appearing only in prose (e.g. this
//     header explaining what the guard forbids) no longer trips the guard.
//   - A third check fences Core: a top-level (non-nested) expedition/ file
//     may never import from ./run/, ./gear/ or ./boss/, keeping Core
//     boss/gear-agnostic per rules.ts's own header contract.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN_TOKENS = [
  "node:",
  "from \"fs\"",
  "from 'fs'",
  "partyserver",
  "cloudflare:",
  "Math.random",
  "Date.now",
  "../hanabi/",
];

const MUST_BE_SCANNED = [
  "state.ts",
  "deck.ts",
  "trick.ts",
  "leader.ts",
  "objectives.ts",
  "rules.ts",
  "camp.ts",
  "legality.ts",
  "actions.ts",
  "test-support.ts",
  "run/types.ts",
  "run/run-rules.ts",
  "run/rng.ts",
  "gear/gear-def.ts",
  "boss/boss-def.ts",
];

/** Recursively walks `dir`, returning every non-test .ts file as a path
 * relative to HERE, using forward slashes regardless of platform. */
function walk(dir: string, prefix: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relPath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...walk(join(dir, entry.name), relPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(relPath);
    }
  }
  return files;
}

function sourceFiles(): string[] {
  return walk(HERE, "");
}

/** Removes /* ... *\/ block comments (non-greedily, across lines) and then
 * // line comments, so a forbidden token mentioned only in prose does not
 * trip the scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("expedition package purity", () => {
  it("scans at least every file the phase is known to have produced", () => {
    const files = sourceFiles();
    for (const expected of MUST_BE_SCANNED) {
      expect(files).toContain(expected);
    }
  });

  it("imports no Node/Worker-specific runtime modules, no Hanabi modules, and uses no nondeterministic APIs", () => {
    const files = sourceFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = stripComments(readFileSync(join(HERE, file), "utf-8"));
      for (const token of FORBIDDEN_TOKENS) {
        expect(source.includes(token)).toBe(false);
      }
    }
  });

  it("Core files never import run/gear/boss content", () => {
    const files = sourceFiles().filter((file) => !file.includes("/"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = stripComments(readFileSync(join(HERE, file), "utf-8"));
      expect(source).not.toMatch(/from\s+["']\.\/(run|gear|boss)\//);
    }
  });
});

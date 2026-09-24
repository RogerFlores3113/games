// Directory-scanning purity guard for packages/rules/src/expedition (Phase
// 9, Plan 06, T-09-18). Unlike adapter.test.ts's Hanabi purity test (a hand
// list of files), this test READS THE DIRECTORY so a Phase 10 content file
// added later is covered automatically without anyone remembering to update
// a list here.

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
];

function sourceFiles(): string[] {
  return readdirSync(HERE).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
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
      const source = readFileSync(join(HERE, file), "utf-8");
      for (const token of FORBIDDEN_TOKENS) {
        expect(source.includes(token)).toBe(false);
      }
    }
  });
});

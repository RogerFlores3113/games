// D-11/MGR-03 (plan 08-08): source-scan proof that the web room page
// contains no `gameId`-branching outside the `game-ui.tsx` lookup module.
// Comments are stripped before scanning (mirrors
// apps/worker/src/source-structure.test.ts's rationale, and this package's
// own own-hand-source.test.ts) so prose that legitimately talks ABOUT the
// forbidden tokens (this file's own header, doc comments) never
// false-positives a real violation.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Character-by-character comment stripper (not regex) tracking
 * string/template literal state, so a `//` or `/*` inside a string literal
 * is never treated as the start of a comment. Mirrors
 * own-hand-source.test.ts's implementation. */
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
const SCAN_DIRS = ["app/room", "components", "lib"];
// The home page and the start pages, scanned for the same gameId-branching
// bans as the room page, plus a ban on `useHydrated` (the D-17 hydration
// gate) and a quoted "hanabi" literal: they render whatever
// `GAME_CATALOG` lists, never a game they name themselves.
const LANDING_FILES = [
  "app/page.tsx",
  "app/[game]/start/page.tsx",
  "components/start/ClassicStart.tsx",
  "components/start/ExpeditionStart.tsx",
  "components/start/use-create-room.ts",
];

function listFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...listFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const SCANNED_FILES = SCAN_DIRS.flatMap((dir) => listFiles(path.join(ROOT, dir)));

const GAME_ID_BRANCH = /gameId\s*[!=]==/;

describe("game-agnostic-source (D-11)", () => {
  it("no non-test .ts/.tsx under app/room, components, lib branches on gameId or names isHanabi", () => {
    for (const file of SCANNED_FILES) {
      const code = stripComments(readFileSync(file, "utf-8"));
      expect(code, `${file} matches gameId branching`).not.toMatch(GAME_ID_BRANCH);
      expect(code, `${file} contains isHanabi`).not.toMatch(/\bisHanabi\b/);
    }
  });

  it("RoomClient.tsx contains no <HanabiBoard JSX and no HanabiBoard import", () => {
    const roomClientPath = path.join(ROOT, "app/room/[code]/RoomClient.tsx");
    const code = stripComments(readFileSync(roomClientPath, "utf-8"));
    expect(code).not.toMatch(/<HanabiBoard\b/);
    expect(code).not.toMatch(/\bHanabiBoard\b/);
  });

  it("Lobby.tsx contains no MIN_PLAYERS, MAX_PLAYERS, or its own variant-picker markup", () => {
    const lobbyPath = path.join(ROOT, "components/Lobby.tsx");
    const code = stripComments(readFileSync(lobbyPath, "utf-8"));
    expect(code).not.toMatch(/\bMIN_PLAYERS\b/);
    expect(code).not.toMatch(/\bMAX_PLAYERS\b/);
    expect(code).not.toContain("variant-picker");
  });

  it("the home and start pages have no isHanabi, gameId branching, useHydrated, or quoted \"hanabi\" literal", () => {
    for (const file of LANDING_FILES) {
      const full = path.join(ROOT, file);
      const code = stripComments(readFileSync(full, "utf-8"));
      expect(code, `${file} matches gameId branching`).not.toMatch(GAME_ID_BRANCH);
      expect(code, `${file} contains isHanabi`).not.toMatch(/\bisHanabi\b/);
      expect(code, `${file} contains useHydrated`).not.toMatch(/\buseHydrated\b/);
      expect(code, `${file} contains a quoted "hanabi" literal`).not.toMatch(/["']hanabi["']/);
    }
  });
});

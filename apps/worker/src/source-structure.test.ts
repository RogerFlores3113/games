// D-08/D-09/D-10/D-06: the structural chokepoint audit. This is the ENFORCED
// half of Phase 2's "no bypass" claim — HIDE-02 is only credible if a second
// `connection.send` (or a second `toSeatView`/`toPlayerView`/`projectSeatView`
// call site, or any call to partyserver's room-wide `broadcast`) makes the
// build fail, not merely "looks wrong in review."
//
// Why comments must be stripped before counting (RESEARCH.md Pitfall 3):
// room-do.ts's own file-header comment and its `#send`/`#viewFor` docstrings
// deliberately talk ABOUT `.send(`, `toSeatView(`, `toPlayerView(`, and
// `projectSeatView(` in prose, because documenting the invariant next to the
// code that upholds it is this codebase's established convention. A naive
// substring/grep count would tally those prose mentions right alongside the
// one real call site and either false-positive-fail the moment this phase
// touches the file, or — worse — silently accept a SECOND real call site
// later, because the comment-inflated baseline already "looked like more
// than one." `stripComments` below is a character-by-character scanner (not
// a regex) specifically so it tracks string/template-literal state and never
// treats a `//` inside a URL string literal (e.g. `origin.ts`'s allowed
// origins) as the start of a comment.
//
// Why exact counts, not "at most N": a too-high count means a bypass path
// exists (HIDE-02 broken); a too-low count means this refactor silently
// dropped a path that used to exist (e.g. an error frame that stopped being
// sent at all). Both directions are bugs this test must catch.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// `fileURLToPath` is avoided here: this project's worker tsconfig loads both
// `@cloudflare/workers-types` and `node` types, whose global `URL` and
// `node:url`'s `URL` type are not mutually assignable, so passing
// `import.meta.url`'s `URL` object into `fileURLToPath` fails to type-check.
// `.pathname` on a `file://` URL is a plain string and sidesteps that clash.
const SRC_DIR = new URL("./", import.meta.url).pathname;
// apps/worker/src -> repo root, to locate the deleted toy modules by path.
const REPO_ROOT = join(SRC_DIR, "..", "..", "..");

/**
 * Strips `//` line comments and `/* *\/` block comments from `source`,
 * replacing removed characters with spaces (newlines are preserved) so line
 * numbers in any future error output still line up with the original file.
 * Implemented as a single left-to-right character scanner — NOT regexes —
 * tracking four states: code, single-quoted string, double-quoted string,
 * and template literal. Backslash escapes inside any literal are honored so
 * an escaped quote never prematurely exits string state.
 *
 * Assumption (recorded, see RESEARCH.md A3 / Pitfall 3): none of the files
 * this test scans use a regex literal containing `//` or `/*`. Regex
 * literals are therefore NOT specially handled. A10 below guards against a
 * silently empty scan, which would be one symptom of this assumption ever
 * becoming false in a way that broke parsing badly enough to elide a whole
 * file's worth of matches.
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
        // Preserve the escaped character verbatim without inspecting it for
        // quote/backtick meaning.
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

/** Counts non-overlapping matches of a global-flagged regex in `text`. */
function countMatches(text: string, pattern: RegExp): number {
  if (!pattern.global) {
    throw new Error("countMatches requires a global-flagged RegExp");
  }
  const matches = text.match(pattern);
  return matches === null ? 0 : matches.length;
}

/** Every non-test `.ts` file directly under apps/worker/src, recursively. */
function listSourceFiles(): string[] {
  const entries = readdirSync(SRC_DIR, { recursive: true }) as string[];
  return entries
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .sort();
}

function readStripped(fileName: string): string {
  return stripComments(readFileSync(join(SRC_DIR, fileName), "utf-8"));
}

describe("D-09 helper canaries (stripComments / countMatches)", () => {
  it("keeps real code after a `//`-containing string literal", () => {
    const source = `const u = "http://x"; a.send(1)`;
    expect(stripComments(source)).toContain("a.send(1)");
  });

  it("strips a `//` line comment entirely", () => {
    const stripped = stripComments("// a.send(1)");
    expect(stripped).not.toContain(".send(");
  });

  it("strips a `/* */` block comment entirely", () => {
    const stripped = stripComments("/* a.send(1) */");
    expect(stripped).not.toContain(".send(");
  });

  it("preserves code that follows a `//` sequence inside a template literal", () => {
    const source = "const u = `http://x`;\ncode.after(1);";
    expect(stripComments(source)).toContain("code.after(1);");
  });

  it("counts exactly 2 for a fixture with two `.send(` call sites", () => {
    const source = "a.send(1);\nb.send(2);";
    expect(countMatches(source, /\.send\(/g)).toBe(2);
  });

  it("counts 0 for a `.send(` that only appears inside a comment", () => {
    const source = "// a.send(1)\nconst z = 1;";
    expect(countMatches(stripComments(source), /\.send\(/g)).toBe(0);
  });
});

describe("HIDE-02/HIDE-03/D-06 structural chokepoint audit (D-09)", () => {
  const files = listSourceFiles();
  const strippedByFile = new Map(files.map((f) => [f, readStripped(f)] as const));

  function findFilesWithMatch(pattern: RegExp): { file: string; count: number }[] {
    const hits: { file: string; count: number }[] = [];
    for (const [file, text] of strippedByFile) {
      const count = countMatches(text, pattern);
      if (count > 0) hits.push({ file, count });
    }
    return hits;
  }

  it("A10: the scanned file list includes the four load-bearing modules (guards against a silently empty scan)", () => {
    expect(files).toContain("room-do.ts");
    expect(files).toContain("room-state.ts");
    expect(files).toContain("seat-projection.ts");
    expect(files).toContain("game-registration.ts");
  });

  it("A1: `.send(` occurs exactly once across all non-test files, in room-do.ts, and room-do.ts calls connection.send(encodeServerMessage(", () => {
    const hits = findFilesWithMatch(/\.send\(/g);
    const total = hits.reduce((sum, h) => sum + h.count, 0);
    expect(total, `expected exactly 1 total .send( match, found in: ${JSON.stringify(hits)}`).toBe(1);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.file).toBe("room-do.ts");
    expect(strippedByFile.get("room-do.ts")).toContain("connection.send(encodeServerMessage(");
  });

  it("A2: `encodeServerMessage(` is called exactly once, in room-do.ts", () => {
    const hits = findFilesWithMatch(/\bencodeServerMessage\(/g);
    const total = hits.reduce((sum, h) => sum + h.count, 0);
    expect(total, `expected exactly 1 encodeServerMessage( call, found in: ${JSON.stringify(hits)}`).toBe(1);
    expect(hits[0]?.file).toBe("room-do.ts");
  });

  it("A3: room-do.ts has exactly 1 #send method definition and at least 8 this.#send( call sites", () => {
    const roomDo = strippedByFile.get("room-do.ts") ?? "";
    const defs = countMatches(roomDo, /^\s*#send\(/gm);
    expect(defs, "expected exactly 1 `#send(` method definition").toBe(1);
    const calls = countMatches(roomDo, /this\.#send\(/g);
    expect(calls, `expected at least 8 this.#send( calls, found ${calls}`).toBeGreaterThanOrEqual(8);
  });

  it("A4: toSeatView( is called exactly once (excluding its own definition), in seat-projection.ts", () => {
    const hits: { file: string; count: number }[] = [];
    for (const [file, text] of strippedByFile) {
      const total = countMatches(text, /toSeatView\(/g);
      const defs = countMatches(text, /function toSeatView\(/g);
      const calls = total - defs;
      if (calls > 0) hits.push({ file, count: calls });
    }
    const total = hits.reduce((sum, h) => sum + h.count, 0);
    expect(total, `expected exactly 1 toSeatView( call site, found in: ${JSON.stringify(hits)}`).toBe(1);
    expect(hits[0]?.file).toBe("seat-projection.ts");
  });

  it("A5: toPlayerView( is called exactly once, only inside room-state.ts's toSeatView function body", () => {
    const hits = findFilesWithMatch(/toPlayerView\(/g);
    const total = hits.reduce((sum, h) => sum + h.count, 0);
    expect(total, `expected exactly 1 toPlayerView( call, found in: ${JSON.stringify(hits)}`).toBe(1);
    expect(hits[0]?.file).toBe("room-state.ts");

    const roomState = strippedByFile.get("room-state.ts") ?? "";
    const startIdx = roomState.indexOf("function toSeatView(");
    expect(startIdx, "expected a `function toSeatView(` definition in room-state.ts").toBeGreaterThanOrEqual(0);
    const nextExportIdx = roomState.indexOf("\nexport function ", startIdx + 1);
    const slice = nextExportIdx === -1 ? roomState.slice(startIdx) : roomState.slice(startIdx, nextExportIdx);
    expect(countMatches(slice, /toPlayerView\(/g)).toBe(1);
  });

  it("A6: partyserver's room-wide broadcast( is never called", () => {
    const hits = findFilesWithMatch(/\bbroadcast\(/g);
    expect(hits, `expected zero broadcast( calls, found in: ${JSON.stringify(hits)}`).toHaveLength(0);
  });

  it("A7: projectSeatView( is called exactly once (excluding its definition), in room-do.ts; validateGameView( is called exactly once (excluding its definition), in seat-projection.ts", () => {
    const projectHits: { file: string; count: number }[] = [];
    for (const [file, text] of strippedByFile) {
      const total = countMatches(text, /projectSeatView\(/g);
      const defs = countMatches(text, /function projectSeatView\(/g);
      const calls = total - defs;
      if (calls > 0) projectHits.push({ file, count: calls });
    }
    const projectTotal = projectHits.reduce((sum, h) => sum + h.count, 0);
    expect(projectTotal, `expected exactly 1 projectSeatView( call, found in: ${JSON.stringify(projectHits)}`).toBe(1);
    expect(projectHits[0]?.file).toBe("room-do.ts");

    const validateHits: { file: string; count: number }[] = [];
    for (const [file, text] of strippedByFile) {
      const total = countMatches(text, /validateGameView\(/g);
      const defs = countMatches(text, /function validateGameView\(/g);
      const calls = total - defs;
      if (calls > 0) validateHits.push({ file, count: calls });
    }
    const validateTotal = validateHits.reduce((sum, h) => sum + h.count, 0);
    expect(
      validateTotal,
      `expected exactly 1 validateGameView( call, found in: ${JSON.stringify(validateHits)}`,
    ).toBe(1);
    expect(validateHits[0]?.file).toBe("seat-projection.ts");
  });

  it("A8 (D-10): room-do.ts has exactly 1 #viewFor method definition, exactly 1 `type: \"joined\"`, and exactly 1 `type: \"state\"` occurrence", () => {
    const roomDo = strippedByFile.get("room-do.ts") ?? "";
    expect(countMatches(roomDo, /^\s*#viewFor\(/gm)).toBe(1);
    expect(countMatches(roomDo, /type:\s*"joined"/g)).toBe(1);
    expect(countMatches(roomDo, /type:\s*"state"/g)).toBe(1);
  });

  it("A9 (D-06): hanabiGame and @games/schema/games/ appear only in game-registration.ts", () => {
    const hanabiHits = findFilesWithMatch(/hanabiGame/g);
    const registrationCount = hanabiHits.find((h) => h.file === "game-registration.ts")?.count ?? 0;
    // Non-vacuous: a future refactor that removes the identifier entirely
    // must not make this confinement assertion pass with an empty array.
    expect(registrationCount, "expected at least 1 hanabiGame occurrence in game-registration.ts").toBeGreaterThanOrEqual(1);
    expect(hanabiHits, `expected hanabiGame only in game-registration.ts, found in: ${JSON.stringify(hanabiHits)}`).toEqual([
      { file: "game-registration.ts", count: registrationCount },
    ]);

    const schemaGamesHits = findFilesWithMatch(/@games\/schema\/games\//g);
    expect(
      schemaGamesHits,
      `expected @games/schema/games/ only in game-registration.ts, found in: ${JSON.stringify(schemaGamesHits)}`,
    ).toEqual([
      { file: "game-registration.ts", count: schemaGamesHits.find((h) => h.file === "game-registration.ts")?.count ?? 0 },
    ]);
  });

  // D-01/D-03: "confined to one file" (A9 above) and "appears nowhere" (this
  // test) are different claims — silently relaxing A9 into this shape would
  // leave a test that passes vacuously against a deleted name while proving
  // nothing about the new one. Scoped to the IDENTIFIER `foreheadCardGame`,
  // never the bare word "forehead": several Hanabi engine files and
  // packages/schema/src/constants.ts legitimately cite `forehead-card.ts` in
  // comment prose as the design template they were modelled on, and that
  // historical rationale is deliberately retained.
  it("D-01/D-03: foreheadCardGame appears nowhere in the worker's non-test sources (the toy is gone, not merely unconfined)", () => {
    const hits = findFilesWithMatch(/foreheadCardGame/g);
    expect(hits, `expected zero foreheadCardGame occurrences, found in: ${JSON.stringify(hits)}`).toEqual([]);
  });

  // D-01/D-03 (04-08 T2): "the identifier is gone" (above) and "the files
  // themselves are gone" are different claims — a future revert could
  // resurrect forehead-card.ts as a file with all its `foreheadCardGame`
  // references renamed away, which would satisfy the identifier check above
  // while quietly reintroducing the toy. This check targets the FILES, by
  // path, on disk. Deliberately scoped to the identifier/file, never the
  // bare word "forehead": several packages/rules/src/hanabi/*.ts files and
  // packages/schema/src/constants.ts legitimately cite forehead-card.ts in
  // comment prose as the design template they were modelled on, and that
  // historical rationale is deliberately retained, not swept.
  it("D-01/D-03: the deleted toy modules no longer exist on disk", () => {
    const rulesToyPath = join(REPO_ROOT, "packages", "rules", "src", "forehead-card.ts");
    const schemaToyPath = join(REPO_ROOT, "packages", "schema", "src", "games", "forehead-card.ts");
    expect(existsSync(rulesToyPath), `expected ${rulesToyPath} to not exist`).toBe(false);
    expect(existsSync(schemaToyPath), `expected ${schemaToyPath} to not exist`).toBe(false);
  });
});

describe("Phase 5 heartbeat / RT-05 structural audit (D-02, D-13)", () => {
  const files = listSourceFiles();
  const strippedByFile = new Map(files.map((f) => [f, readStripped(f)] as const));

  function findFilesWithMatch(pattern: RegExp): { file: string; count: number }[] {
    const hits: { file: string; count: number }[] = [];
    for (const [file, text] of strippedByFile) {
      const count = countMatches(text, pattern);
      if (count > 0) hits.push({ file, count });
    }
    return hits;
  }

  it('P5-1 (D-02): setWebSocketAutoResponse( appears exactly once across worker non-test sources, in room-do.ts, inside onStart', () => {
    const hits = findFilesWithMatch(/setWebSocketAutoResponse\(/g);
    const total = hits.reduce((sum, h) => sum + h.count, 0);
    expect(total, `expected exactly 1 setWebSocketAutoResponse( call, found in: ${JSON.stringify(hits)}`).toBe(1);
    expect(hits[0]?.file).toBe("room-do.ts");

    const roomDo = strippedByFile.get("room-do.ts") ?? "";
    const startIdx = roomDo.indexOf("async onStart(");
    expect(startIdx, "expected an `async onStart(` definition in room-do.ts").toBeGreaterThanOrEqual(0);
    const nextIdx = roomDo.indexOf("async onConnect(", startIdx + 1);
    expect(nextIdx, "expected an `async onConnect(` definition after onStart in room-do.ts").toBeGreaterThan(startIdx);
    const onStartBody = roomDo.slice(startIdx, nextIdx);
    expect(countMatches(onStartBody, /setWebSocketAutoResponse\(/g)).toBe(1);
  });

  it("P5-2 (D-02/D-13): the #send method body and onMessage body never mention HEARTBEAT_PING, HEARTBEAT_PONG, or the literal __ping__/__pong__", () => {
    const roomDo = strippedByFile.get("room-do.ts") ?? "";
    const heartbeatPattern = /HEARTBEAT_P(ING|ONG)|__p[io]ng__/g;

    const sendDefIdx = roomDo.indexOf('#send(connection: Connection, frame: OutboundFrame)');
    expect(sendDefIdx, "expected a `#send(connection: Connection, frame: OutboundFrame)` method definition").toBeGreaterThanOrEqual(0);
    const pushStateIdx = roomDo.indexOf("async #pushState", sendDefIdx + 1);
    expect(pushStateIdx, "expected an `async #pushState` definition after #send in room-do.ts").toBeGreaterThan(sendDefIdx);
    const sendBody = roomDo.slice(sendDefIdx, pushStateIdx);
    expect(countMatches(sendBody, heartbeatPattern)).toBe(0);

    const onMessageIdx = roomDo.indexOf("async onMessage(");
    expect(onMessageIdx, "expected an `async onMessage(` definition in room-do.ts").toBeGreaterThanOrEqual(0);
    const onCloseIdx = roomDo.indexOf("async onClose(", onMessageIdx + 1);
    expect(onCloseIdx, "expected an `async onClose(` definition after onMessage in room-do.ts").toBeGreaterThan(onMessageIdx);
    const onMessageBody = roomDo.slice(onMessageIdx, onCloseIdx);
    expect(countMatches(onMessageBody, heartbeatPattern)).toBe(0);
  });

  it("P5-3 (D-13): the single-writer counts are unchanged by Phase 5", () => {
    const roomDo = strippedByFile.get("room-do.ts") ?? "";

    const sendHits = findFilesWithMatch(/\.send\(/g);
    const sendTotal = sendHits.reduce((sum, h) => sum + h.count, 0);
    expect(sendTotal, `expected exactly 1 total .send( match, found in: ${JSON.stringify(sendHits)}`).toBe(1);

    const encodeHits = findFilesWithMatch(/\bencodeServerMessage\(/g);
    const encodeTotal = encodeHits.reduce((sum, h) => sum + h.count, 0);
    expect(encodeTotal, `expected exactly 1 encodeServerMessage( call, found in: ${JSON.stringify(encodeHits)}`).toBe(1);

    expect(countMatches(roomDo, /^\s*#send\(/gm)).toBe(1);
    expect(countMatches(roomDo, /type:\s*"joined"/g)).toBe(1);
    expect(countMatches(roomDo, /type:\s*"state"/g)).toBe(1);

    const resumePattern = /type:\s*"(resume|resumed|reconnect|reconnected)"/g;
    const resumeHits = findFilesWithMatch(resumePattern);
    expect(resumeHits, `expected zero resume/reconnect frame types across worker sources, found in: ${JSON.stringify(resumeHits)}`).toEqual([]);

    const messagesSchemaPath = join(REPO_ROOT, "packages", "schema", "src", "messages.ts");
    const messagesSchemaSource = readFileSync(messagesSchemaPath, "utf-8");
    const messagesSchemaStripped = stripComments(messagesSchemaSource);
    expect(
      countMatches(messagesSchemaStripped, resumePattern),
      "expected zero resume/reconnect frame types in packages/schema/src/messages.ts",
    ).toBe(0);
  });

  it("P5-4 (D-03): exactly one setAlarm( call site remains, and computeRoomTimers( appears exactly once in room-do.ts (inside #timers)", () => {
    const roomDo = strippedByFile.get("room-do.ts") ?? "";
    expect(countMatches(roomDo, /\bsetAlarm\(/g)).toBe(1);
    expect(countMatches(roomDo, /\bcomputeRoomTimers\(/g)).toBe(1);

    const timersDefIdx = roomDo.indexOf("#timers(room: RoomState, now: number)");
    expect(timersDefIdx, "expected a `#timers(room: RoomState, now: number)` method definition").toBeGreaterThanOrEqual(0);
    const callIdx = roomDo.indexOf("computeRoomTimers(");
    expect(callIdx).toBeGreaterThanOrEqual(0);
    // The single call site must live inside #timers, i.e. after its
    // definition and before the next method definition.
    const nextMethodIdx = roomDo.indexOf("\n  #disconnectSeat(", timersDefIdx + 1);
    expect(nextMethodIdx, "expected #disconnectSeat to follow #timers").toBeGreaterThan(timersDefIdx);
    expect(callIdx).toBeGreaterThan(timersDefIdx);
    expect(callIdx).toBeLessThan(nextMethodIdx);
  });

  it('P5-5 (D-03/CR-01): markConnected( appears exactly once in room-do.ts, and both onClose and onAlarm call this.#disconnectSeat(', () => {
    const roomDo = strippedByFile.get("room-do.ts") ?? "";
    expect(countMatches(roomDo, /\bmarkConnected\(/g)).toBe(1);
    expect(countMatches(roomDo, /this\.#disconnectSeat\(/g)).toBe(2);

    const onCloseIdx = roomDo.indexOf("async onClose(");
    const onAlarmIdx = roomDo.indexOf("async onAlarm(");
    expect(onCloseIdx).toBeGreaterThanOrEqual(0);
    expect(onAlarmIdx).toBeGreaterThan(onCloseIdx);
    const onCloseBody = roomDo.slice(onCloseIdx, onAlarmIdx);
    expect(countMatches(onCloseBody, /this\.#disconnectSeat\(/g)).toBe(1);

    const onErrorIdx = roomDo.indexOf("onError(", onAlarmIdx > -1 ? 0 : onCloseIdx);
    const privateHelpersIdx = roomDo.indexOf("// Private helpers");
    const onAlarmBody = roomDo.slice(onAlarmIdx, privateHelpersIdx > -1 ? privateHelpersIdx : roomDo.length);
    expect(countMatches(onAlarmBody, /this\.#disconnectSeat\(/g)).toBe(1);
    void onErrorIdx;
  });

  it("P5-6 (D-03): getWebSocketAutoResponseTimestamp( appears exactly once across worker sources, in room-do.ts, between `async onAlarm(` and the private-helpers section", () => {
    const hits = findFilesWithMatch(/getWebSocketAutoResponseTimestamp\(/g);
    const total = hits.reduce((sum, h) => sum + h.count, 0);
    expect(total, `expected exactly 1 getWebSocketAutoResponseTimestamp( call, found in: ${JSON.stringify(hits)}`).toBe(1);
    expect(hits[0]?.file).toBe("room-do.ts");

    const roomDo = strippedByFile.get("room-do.ts") ?? "";
    const onAlarmIdx = roomDo.indexOf("async onAlarm(");
    const privateHelpersIdx = roomDo.indexOf("async #ensureRoom(");
    expect(onAlarmIdx).toBeGreaterThanOrEqual(0);
    expect(privateHelpersIdx).toBeGreaterThan(onAlarmIdx);
    const slice = roomDo.slice(onAlarmIdx, privateHelpersIdx);
    expect(countMatches(slice, /getWebSocketAutoResponseTimestamp\(/g)).toBe(1);
  });

  it("P5-7 (D-08): the onAlarm zombie_sweep branch contains no transferHost(, releaseSeat(, or applyGameAction(", () => {
    const roomDo = strippedByFile.get("room-do.ts") ?? "";
    const branchStartIdx = roomDo.indexOf('event.type === "zombie_sweep"');
    expect(branchStartIdx, 'expected an `event.type === "zombie_sweep"` branch in room-do.ts').toBeGreaterThanOrEqual(0);
    const nextElseIfIdx = roomDo.indexOf("} else if", branchStartIdx);
    const loopEndIdx = roomDo.indexOf("\n      }\n\n      const finalNow", branchStartIdx);
    const branchEndIdx = nextElseIfIdx > -1 && (loopEndIdx === -1 || nextElseIfIdx < loopEndIdx) ? nextElseIfIdx : loopEndIdx;
    expect(branchEndIdx, "expected the zombie_sweep branch to end before the next branch or loop end").toBeGreaterThan(branchStartIdx);
    const branchBody = roomDo.slice(branchStartIdx, branchEndIdx);
    expect(countMatches(branchBody, /\btransferHost\(/g)).toBe(0);
    expect(countMatches(branchBody, /\breleaseSeat\(/g)).toBe(0);
    expect(countMatches(branchBody, /\bapplyGameAction\(/g)).toBe(0);
  });
});

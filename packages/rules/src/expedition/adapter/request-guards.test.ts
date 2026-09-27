// Tests for parseRunAction (Phase 11, Plan 03, T-11-07/T-11-08). RED before
// request-guards.ts exists — every assertion here targets the exact-own-key
// discipline mirrored from hanabi/actions.ts's isPlayRequest.

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseRunAction, MAX_REQUEST_LIST_LENGTH } from "./request-guards";
import type { RunAction } from "../run/types";

const WELL_FORMED: readonly RunAction[] = [
  { type: "pick-draft", gearId: "compass" },
  { type: "set-loadout", gearIds: ["compass", "lantern"] },
  { type: "ready" },
  { type: "use-gear", gearId: "spyglass", targets: ["seat-a", "seat-b"] },
  { type: "skip-window" },
  { type: "whisper", targetSeatId: "seat-a", cardId: "card-1" },
  { type: "pick-objective", objectiveId: "obj-1" },
  { type: "play-card", cardId: "card-2" },
];

describe("parseRunAction: well-formed shapes", () => {
  for (const action of WELL_FORMED) {
    it(`parses ${action.type}`, () => {
      const parsed = parseRunAction(action);
      expect(parsed).toEqual(action);
      expect(parsed).not.toBe(action);
    });
  }

  it("returns a fresh object and fresh arrays, not the input reference", () => {
    const request = { type: "set-loadout", gearIds: ["a", "b"] };
    const parsed = parseRunAction(request) as { type: "set-loadout"; gearIds: string[] };
    expect(parsed).not.toBe(request);
    expect(parsed.gearIds).not.toBe(request.gearIds);
    expect(parsed.gearIds).toEqual(request.gearIds);
  });

  it("returns a fresh object for use-gear targets array", () => {
    const request = { type: "use-gear", gearId: "spyglass", targets: ["a", "b"] };
    const parsed = parseRunAction(request) as { type: "use-gear"; gearId: string; targets: string[] };
    expect(parsed.targets).not.toBe(request.targets);
    expect(parsed.targets).toEqual(request.targets);
  });
});

describe("parseRunAction: rejects malformed input", () => {
  const malformed: unknown[] = [
    null,
    undefined,
    42,
    "ready",
    [],
    {},
    { type: "undo" },
    { type: "play" },
    { type: "play-card", cardId: "card-2", resultingState: {} },
    { type: "ready", seatId: "seat-a" },
    { type: "pick-draft" },
    { type: "pick-draft", gearId: 42 },
    { type: "set-loadout", gearIds: "not-an-array" },
    { type: "set-loadout", gearIds: ["a", 42] },
    { type: "set-loadout", gearIds: Array.from({ length: MAX_REQUEST_LIST_LENGTH + 1 }, (_, i) => `g${i}`) },
    { type: "use-gear", gearId: "spyglass", targets: "not-an-array" },
    { type: "use-gear", gearId: "spyglass", targets: [42] },
    { type: "use-gear", gearId: "spyglass", targets: Array.from({ length: MAX_REQUEST_LIST_LENGTH + 1 }, (_, i) => `t${i}`) },
    { type: "whisper", targetSeatId: "seat-a" },
    { type: "whisper", targetSeatId: 42, cardId: "card-1" },
    { type: "pick-objective", objectiveId: 42 },
    { type: "play-card", cardId: 42 },
    { type: 42 },
    { type: { toString: () => "ready" } },
  ];

  for (const request of malformed) {
    it(`rejects ${JSON.stringify(request)}`, () => {
      expect(parseRunAction(request)).toBeNull();
    });
  }
});

describe("parseRunAction: property — never throws, exact key set on success", () => {
  const EXPECTED_KEYS: Readonly<Record<RunAction["type"], string[]>> = {
    "pick-draft": ["type", "gearId"],
    "set-loadout": ["type", "gearIds"],
    ready: ["type"],
    "use-gear": ["type", "gearId", "targets"],
    "skip-window": ["type"],
    whisper: ["type", "targetSeatId", "cardId"],
    "pick-objective": ["type", "objectiveId"],
    "play-card": ["type", "cardId"],
  };

  it("holds for arbitrary JSON values", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (payload) => {
        let parsed: RunAction | null = null;
        expect(() => {
          parsed = parseRunAction(payload);
        }).not.toThrow();
        if (parsed !== null) {
          const keys = Object.keys(parsed).sort();
          const expected = EXPECTED_KEYS[(parsed as RunAction).type].slice().sort();
          expect(keys).toEqual(expected);
        }
      }),
    );
  });
});
